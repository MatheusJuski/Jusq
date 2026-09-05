import type {
  ClientMessage,
  PeerId,
  RoomId,
  RTCIceCandidateInitLike,
  ServerMessage,
  SignalPayload,
} from '@jusqs/types';

import { getIceServers, getSignalingUrl } from './ice';
import {
  AUDIO_SOURCE_NONE,
  DEFAULT_AUDIO_SOURCE,
  DEVICE_AUDIO_CONSTRAINTS,
  deviceIdOf,
} from './audio-source';
import {
  AUDIO_BITRATE,
  AUDIO_CONSTRAINTS,
  DEFAULT_QUALITY_ID,
  findPreset,
  tuneOpus,
  videoConstraints,
  type QualityPreset,
} from './quality';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export interface RoomClientHandlers {
  onStatus(status: ConnectionStatus): void;
  onPeersChange(peers: PeerId[]): void;
  onRemoteStream(peerId: PeerId, stream: MediaStream): void;
  onRemoteStreamEnded(peerId: PeerId): void;
  onLocalStream(stream: MediaStream | null): void;
  onError(message: string): void;
}

/**
 * `systemAudio` é suportado nos navegadores Chromium mas ainda não existe na
 * lib de tipos do DOM. Declarado aqui em vez de um `as any` no ponto de uso:
 * assim o campo continua sendo conferido pelo compilador.
 */
interface DisplayMediaOptions extends DisplayMediaStreamOptions {
  systemAudio?: 'include' | 'exclude';
}

/**
 * Qual superfície o usuário escolheu no seletor do browser.
 *
 * `displaySurface` existe no padrão mas ainda não está na lib de tipos. É a
 * única forma de saber se veio uma tela, uma janela ou uma aba — e a resposta
 * muda completamente o diagnóstico quando o áudio falha.
 */
function describeSurface(stream: MediaStream): string {
  const [track] = stream.getVideoTracks();
  if (!track) return 'desconhecida';

  const settings = track.getSettings() as { displaySurface?: string };

  switch (settings.displaySurface) {
    case 'monitor':
      return 'tela inteira';
    case 'window':
      return 'janela';
    case 'browser':
      return 'aba';
    default:
      return settings.displaySurface ?? 'desconhecida';
  }
}

/**
 * Estado por peer.
 *
 * `queue` serializa o tratamento dos sinais: offer/answer/ice de um mesmo peer
 * precisam ser aplicados em ordem, e as mensagens chegam por um socket que não
 * espera o processamento anterior terminar.
 *
 * `pendingIce` guarda candidatos que chegaram antes da descrição remota — o
 * `addIceCandidate` falha nesse caso, e descartar significaria perder o único
 * caminho de rede viável.
 */
interface PeerState {
  readonly pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInitLike[];
  queue: Promise<void>;
  sentCandidates: number;
  receivedCandidates: number;
}

/**
 * Leitura instantânea de uma conexão.
 *
 * Existe para responder a pergunta que o log do servidor não responde:
 * quando a tela não aparece, o problema é rede (nada chega) ou renderização
 * (chega e não desenha)? `inboundBytes` separa os dois casos.
 */
export interface PeerDiagnostics {
  peerId: PeerId;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  sentCandidates: number;
  receivedCandidates: number;
  pendingIce: number;
  /** Tipos do par escolhido, ex. "host <- host" ou "srflx <- relay". */
  selectedPair: string | null;
  inboundBytes: number;
  framesDecoded: number;
  resolution: string | null;
  outboundBytes: number;
  framesSent: number;
}

/**
 * Cliente de sala do Screen Lab.
 *
 * Mantém uma conexão de signaling (WebSocket) e uma malha de RTCPeerConnection
 * — uma por peer. A mídia trafega direto entre browsers; o servidor só carrega
 * SDP e ICE.
 *
 * ## Limitação conhecida do V0
 *
 * Assume **um transmissor por vez**. Se dois peers chamarem `startSharing()`
 * simultaneamente, as ofertas colidem (glare) e a negociação pode travar.
 * Resolver isso exige perfect negotiation — Phase 3, junto com o SFU.
 */
export class RoomClient {
  readonly #roomId: RoomId;
  readonly #handlers: RoomClientHandlers;
  readonly #peers = new Map<PeerId, PeerState>();

  #quality: QualityPreset = findPreset(DEFAULT_QUALITY_ID);
  #audioSource: string = DEFAULT_AUDIO_SOURCE;
  #socket: WebSocket | null = null;
  #selfId: PeerId | null = null;
  #localStream: MediaStream | null = null;
  #disposed = false;

  constructor(roomId: RoomId, handlers: RoomClientHandlers) {
    this.#roomId = roomId;
    this.#handlers = handlers;
  }

  /* ---------------------------------------------------------------- ciclo */

  connect(): void {
    if (this.#socket || this.#disposed) return;

    this.#handlers.onStatus('connecting');

    let url: string;
    try {
      url = getSignalingUrl();
    } catch (error) {
      // Configuração inválida não é falha de rede: sem isso o erro apareceria como "WebSocket failed" apontando para a própria página.
      this.#handlers.onStatus('error');
      this.#handlers.onError(
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener('open', () => {
      this.#send({ type: 'join', roomId: this.#roomId });
      this.#handlers.onStatus('connected');
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      this.#handleServerMessage(message);
    });

    socket.addEventListener('close', () => {
      // Reconexão automática é escopo da Phase 3.
      if (!this.#disposed) this.#handlers.onStatus('closed');
    });

    socket.addEventListener('error', () => {
      if (this.#disposed) return;
      this.#handlers.onStatus('error');
      this.#handlers.onError('não foi possível conectar ao servidor de signaling');
    });
  }

  dispose(): void {
    this.#disposed = true;
    this.stopSharing();

    for (const { pc } of this.#peers.values()) pc.close();
    this.#peers.clear();

    this.#socket?.close();
    this.#socket = null;
  }

  /* ------------------------------------------------------------- captura */

  async startSharing(): Promise<void> {
    if (this.#localStream) return;

    const stream = await this.#capture();
    if (!stream) return;

    await this.#applyCaptureProfile(stream);

    this.#localStream = stream;
    this.#handlers.onLocalStream(stream);

    // O usuário pode parar pelo botão nativo do browser, fora da nossa UI.
    const [track] = stream.getVideoTracks();
    track?.addEventListener('ended', () => this.stopSharing());

    // Oferta para todos os peers já conhecidos, cada uma na fila do seu peer.
    for (const [peerId, state] of this.#peers) {
      this.#enqueue(peerId, async () => {
        this.#attachLocalTracks(state.pc);
        await this.#makeOffer(peerId, state.pc);
      });
    }
  }

  stopSharing(): void {
    if (!this.#localStream) return;

    for (const track of this.#localStream.getTracks()) track.stop();
    this.#localStream = null;
    this.#handlers.onLocalStream(null);

    // Remover as trilhas não basta: `removeTrack` só altera o estado local. Sem uma nova offer o outro lado nunca fica sabendo, e o <video> dele congela no último quadro recebido. É a renegociação que encerra a transmissão de fato.
    for (const [peerId, state] of this.#peers) {
      const active = state.pc.getSenders().filter((s) => s.track !== null);
      if (active.length === 0) continue;

      for (const sender of active) state.pc.removeTrack(sender);
      this.#enqueue(peerId, () => this.#makeOffer(peerId, state.pc));
    }
  }

  get isSharing(): boolean {
    return this.#localStream !== null;
  }

  get quality(): QualityPreset {
    return this.#quality;
  }

  /**
   * Define de onde vem o áudio na próxima captura.
   *
   * Não afeta uma transmissão em andamento: trocar a fonte exigiria recapturar
   * e renegociar, e o usuário perderia a seleção de tela sem pedir.
   */
  setAudioSource(value: string): void {
    this.#audioSource = value;
  }

  /**
   * Troca o perfil de qualidade.
   *
   * Se já houver transmissão, aplica ao vivo — `applyConstraints` reconfigura a
   * captura sem pedir a tela de novo, e os tetos de bitrate são reaplicados.
   * Sem transmissão, vale a partir da próxima captura.
   */
  async setQuality(id: string): Promise<void> {
    this.#quality = findPreset(id);

    const stream = this.#localStream;
    if (!stream) return;

    await this.#applyCaptureProfile(stream);

    for (const state of this.#peers.values()) {
      await this.#applySenderLimits(state.pc);
    }
  }

  /**
   * Captura a tela, com áudio quando a fonte permitir.
   *
   * `getDisplayMedia` trata `audio: true` como **obrigatório**: se a fonte de
   * áudio não iniciar, ele rejeita o pedido inteiro e o vídeo morre junto. Isso
   * acontece, por exemplo, ao compartilhar uma janela isolada no Windows, onde
   * não existe captura de áudio — e o sintoma é um `NotReadableError` que não
   * deixa claro que o culpado foi só o som.
   *
   * Como não há como marcar o áudio como opcional no pedido, a segunda
   * tentativa faz esse papel: troca "nada funciona" por "funciona sem som".
   *
   * As restrições de resolução e processamento ficam de fora daqui de
   * propósito — o conjunto suportado varia entre browsers e uma restrição
   * recusada derrubaria o pedido pelo mesmo motivo. Elas entram depois, via
   * `applyConstraints`, onde cada ajuste falha isolado.
   *
   * Retorna `null` quando o usuário fecha o seletor ou quando nem o vídeo
   * sozinho é possível.
   */
  async #capture(): Promise<MediaStream | null> {
    const deviceId = deviceIdOf(this.#audioSource);

    // Áudio de um dispositivo de entrada: única forma de levar o som de um
    // jogo que roda fora do navegador, já que janela isolada nunca entrega
    // áudio pela captura de tela.
    if (deviceId) return this.#captureWithDeviceAudio(deviceId);

    if (this.#audioSource === AUDIO_SOURCE_NONE) {
      return this.#captureVideoOnly();
    }

    return this.#captureWithDisplayAudio();
  }

  /** Fecha o seletor de tela — intenção do usuário, não falha. */
  static #cancelled(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'NotAllowedError';
  }

  static #describe(error: unknown): string {
    return error instanceof DOMException
      ? `${error.name}: ${error.message}`
      : String(error);
  }

  async #captureVideoOnly(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (error) {
      if (RoomClient.#cancelled(error)) return null;
      this.#handlers.onError(
        `não foi possível capturar a tela — ${RoomClient.#describe(error)}`,
      );
      return null;
    }
  }

  /**
   * Vídeo da captura de tela + áudio de um dispositivo de entrada.
   *
   * As duas capturas são independentes: o vídeo pode vir de uma janela, que
   * nunca teria áudio próprio, e o som vem do dispositivo escolhido. Falhar no
   * áudio aqui degrada para vídeo — nunca cancela a transmissão.
   */
  async #captureWithDeviceAudio(deviceId: string): Promise<MediaStream | null> {
    const video = await this.#captureVideoOnly();
    if (!video) return null;

    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, ...DEVICE_AUDIO_CONSTRAINTS },
      });

      // Um stream só, para que `stopSharing` encerre tudo de uma vez.
      return new MediaStream([
        ...video.getVideoTracks(),
        ...audio.getAudioTracks(),
      ]);
    } catch (error) {
      this.#handlers.onError(
        'o dispositivo de áudio escolhido não abriu — transmitindo só o ' +
          `vídeo (${RoomClient.#describe(error)}).`,
      );
      return video;
    }
  }

  /**
   * Áudio junto da captura de tela.
   *
   * `getDisplayMedia` trata `audio: true` como **obrigatório**: se a fonte de
   * áudio não iniciar, ele rejeita o pedido inteiro e o vídeo morre junto.
   * Como não há como marcá-lo opcional, a segunda tentativa faz esse papel.
   */
  async #captureWithDisplayAudio(): Promise<MediaStream | null> {
    // Sem `systemAudio` o browser pode não oferecer a caixa de áudio ao
    // compartilhar a tela inteira. O padrão hoje é 'include', mas a própria
    // documentação do Chrome pede que seja declarado — depender de um padrão
    // que avisam que vai mudar é só adiar a quebra.
    const options: DisplayMediaOptions = {
      video: true,
      audio: true,
      systemAudio: 'include',
    };

    try {
      return await navigator.mediaDevices.getDisplayMedia(options);
    } catch (error) {
      if (RoomClient.#cancelled(error)) return null;

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        // O nome da exceção vem primeiro: sem ele a mensagem vira palpite, e
        // quem já tentou o caminho sugerido fica sem saída.
        // A superfície escolhida é a informação que falta para saber se o
        // problema é a fonte (janela nunca tem áudio) ou o sistema.
        this.#handlers.onError(
          `o áudio falhou (${RoomClient.#describe(error)}) — fonte escolhida: ` +
            `${describeSurface(stream)}. Transmitindo só o vídeo. Se a fonte ` +
            'foi "janela", isso é esperado: janela isolada nunca entrega ' +
            'áudio. Use tela inteira, ou selecione a "Mixagem Estéreo" como ' +
            'fonte de áudio aqui.',
        );
        return stream;
      } catch (retryError) {
        if (RoomClient.#cancelled(retryError)) return null;

        // Os dois nomes juntos: o primeiro diz por que o áudio falhou, o
        // segundo por que nem o vídeo sozinho passou.
        this.#handlers.onError(
          `não foi possível capturar a tela — ${RoomClient.#describe(retryError)} ` +
            `(com áudio: ${RoomClient.#describe(error)})`,
        );
        return null;
      }
    }
  }

  /**
   * Aplica o perfil de qualidade sobre um stream já capturado.
   *
   * Cada ajuste é tentado em separado: uma fonte que não aceita 1080p60 ainda
   * transmite na resolução que conseguir, e um áudio que não deixa desligar o
   * processamento ainda toca. Nada aqui deve impedir a transmissão de existir.
   */
  async #applyCaptureProfile(stream: MediaStream): Promise<void> {
    const preset = this.#quality;

    const [video] = stream.getVideoTracks();
    if (video) {
      video.contentHint = preset.contentHint;
      try {
        await video.applyConstraints(videoConstraints(preset));
      } catch {
        this.#handlers.onError(
          `a fonte não aceitou ${preset.label} — transmitindo no que ela permite`,
        );
      }
    }

    const [audio] = stream.getAudioTracks();
    if (audio) {
      try {
        await audio.applyConstraints(AUDIO_CONSTRAINTS);
      } catch {
        // Só significa que o processamento de voz continua ligado: o áudio
        // sai pior, mas sai. Avisar aqui seria ruído.
      }
    }
  }

  get selfId(): PeerId | null {
    return this.#selfId;
  }

  /* ------------------------------------------------------------- interno */

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(JSON.stringify(message));
  }

  /**
   * Encadeia um trabalho na fila do peer.
   *
   * Garante que offer -> answer -> ice sejam aplicados em ordem mesmo com
   * mensagens chegando mais rápido do que o processamento assíncrono.
   */
  #enqueue(peerId: PeerId, work: () => Promise<void>): void {
    const state = this.#peers.get(peerId);
    if (!state) return;

    state.queue = state.queue
      .then(work)
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.#handlers.onError(`negociação com ${peerId.slice(0, 8)}: ${detail}`);
      });
  }

  #handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'joined': {
        this.#selfId = message.peerId;
        // Quem já estava na sala é quem oferta. Aqui apenas preparamos as
        // conexões e esperamos.
        for (const peerId of message.peers) this.#ensurePeer(peerId);
        this.#emitPeers();
        return;
      }

      case 'peer-joined': {
        const state = this.#ensurePeer(message.peerId);
        this.#emitPeers();

        // Convenção do protocolo: quem já estava inicia a oferta.
        if (this.#localStream) {
          this.#enqueue(message.peerId, async () => {
            this.#attachLocalTracks(state.pc);
            await this.#makeOffer(message.peerId, state.pc);
          });
        }
        return;
      }

      case 'peer-left': {
        this.#peers.get(message.peerId)?.pc.close();
        this.#peers.delete(message.peerId);
        this.#handlers.onRemoteStreamEnded(message.peerId);
        this.#emitPeers();
        return;
      }

      case 'signal': {
        const from = message.from;
        const payload = message.payload;
        this.#ensurePeer(from);
        this.#enqueue(from, () => this.#applySignal(from, payload));
        return;
      }

      case 'error':
        this.#handlers.onError(message.message);
        return;
    }
  }

  async #applySignal(from: PeerId, payload: SignalPayload): Promise<void> {
    const state = this.#peers.get(from);
    if (!state) return;

    const { pc } = state;

    switch (payload.kind) {
      case 'offer': {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });

        // Se também estivermos transmitindo, a conexão vira bidirecional.
        if (this.#localStream) this.#attachLocalTracks(pc);

        const answer = await pc.createAnswer();
        // O ajuste precisa ir nos dois lados: `stereo=1` na answer é o que
        // declara que este peer aceita receber estéreo.
        const sdp = tuneOpus(answer.sdp ?? '', AUDIO_BITRATE);

        await pc.setLocalDescription({ type: 'answer', sdp });
        await this.#applySenderLimits(pc);

        this.#send({ type: 'signal', to: from, payload: { kind: 'answer', sdp } });

        await this.#flushPendingIce(state);
        return;
      }

      case 'answer': {
        // Uma answer fora de 'have-local-offer' é duplicata ou chegou tarde;
        // aplicá-la lançaria InvalidStateError.
        if (pc.signalingState !== 'have-local-offer') return;

        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        await this.#flushPendingIce(state);
        return;
      }

      case 'ice': {
        state.receivedCandidates++;

        // Antes da descrição remota o candidato não pode ser aplicado — e
        // descartá-lo pode custar o único caminho de rede que funcionaria.
        if (!pc.remoteDescription) {
          state.pendingIce.push(payload.candidate);
          return;
        }
        await pc.addIceCandidate(payload.candidate);
        return;
      }
    }
  }

  async #flushPendingIce(state: PeerState): Promise<void> {
    if (state.pendingIce.length === 0) return;

    const queued = state.pendingIce;
    state.pendingIce = [];

    for (const candidate of queued) {
      try {
        await state.pc.addIceCandidate(candidate);
      } catch {
        // Um candidato individual rejeitado não invalida os demais.
      }
    }
  }

  #ensurePeer(peerId: PeerId): PeerState {
    const existing = this.#peers.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    const state: PeerState = {
      pc,
      pendingIce: [],
      queue: Promise.resolve(),
      sentCandidates: 0,
      receivedCandidates: 0,
    };

    pc.addEventListener('icecandidate', (event) => {
      if (!event.candidate) return;

      // O DOM tipa `candidate` como opcional; nosso protocolo exige a string.
      // Normalizamos aqui, na fronteira, para o servidor não precisar decidir.
      const json = event.candidate.toJSON();
      if (typeof json.candidate !== 'string') return;

      state.sentCandidates++;
      this.#send({
        type: 'signal',
        to: peerId,
        payload: {
          kind: 'ice',
          candidate: {
            candidate: json.candidate,
            sdpMid: json.sdpMid ?? null,
            sdpMLineIndex: json.sdpMLineIndex ?? null,
            usernameFragment: json.usernameFragment ?? null,
          },
        },
      });
    });

    pc.addEventListener('track', (event) => {
      const [stream] = event.streams;
      if (!stream) return;

      this.#handlers.onRemoteStream(peerId, stream);

      // Quando o outro lado para de transmitir e renegocia, o browser retira a trilha deste stream. Sem tratar o evento, o painel continuaria exibindo o último quadro como se ainda houvesse transmissão.
      const dropIfEmpty = (): void => {
        if (stream.getTracks().length === 0) {
          this.#handlers.onRemoteStreamEnded(peerId);
        }
      };

      stream.addEventListener('removetrack', dropIfEmpty);
      event.track.addEventListener('ended', dropIfEmpty);
    });

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState !== 'failed') return;
      // Quase sempre significa: P2P não passou e não há TURN configurado.
      this.#handlers.onError(
        `conexão com ${peerId.slice(0, 8)} falhou — provavelmente NAT sem TURN`,
      );
    });

    this.#peers.set(peerId, state);
    return state;
  }

  #attachLocalTracks(pc: RTCPeerConnection): void {
    const stream = this.#localStream;
    if (!stream) return;

    const already = new Set(pc.getSenders().map((s) => s.track));
    for (const track of stream.getTracks()) {
      if (!already.has(track)) pc.addTrack(track, stream);
    }
  }

  async #makeOffer(peerId: PeerId, pc: RTCPeerConnection): Promise<void> {
    const offer = await pc.createOffer();
    const sdp = tuneOpus(offer.sdp ?? '', AUDIO_BITRATE);

    await pc.setLocalDescription({ type: 'offer', sdp });
    await this.#applySenderLimits(pc);

    this.#send({ type: 'signal', to: peerId, payload: { kind: 'offer', sdp } });
  }

  /**
   * Aplica os tetos de bitrate e framerate nos senders.
   *
   * Complementa as restrições de captura: elas limitam a **fonte**, isto limita
   * o que vai para a rede. Sem este teto o encoder decide sozinho quanto gastar,
   * e numa malha mesh esse número é multiplicado por espectador.
   *
   * Só vale depois de `setLocalDescription` — antes disso não há encodings.
   */
  async #applySenderLimits(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      const kind = sender.track?.kind;
      if (!kind) continue;

      const params = sender.getParameters();
      // Navegador pode devolver encodings vazio antes da negociação concluir.
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      const encoding = params.encodings[0];
      if (!encoding) continue;

      if (kind === 'video') {
        encoding.maxBitrate = this.#quality.maxVideoBitrate;
        encoding.maxFramerate = this.#quality.frameRate;
      } else {
        encoding.maxBitrate = AUDIO_BITRATE;
      }

      try {
        await sender.setParameters(params);
      } catch {
        // setParameters falha se a transação expirou (outra alteração passou
        // na frente). A próxima renegociação reaplica.
      }
    }
  }

  #emitPeers(): void {
    this.#handlers.onPeersChange([...this.#peers.keys()]);
  }

  /* --------------------------------------------------------- diagnóstico */

  async getDiagnostics(): Promise<PeerDiagnostics[]> {
    const result: PeerDiagnostics[] = [];

    for (const [peerId, state] of this.#peers) {
      const { pc } = state;

      const entry: PeerDiagnostics = {
        peerId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
        sentCandidates: state.sentCandidates,
        receivedCandidates: state.receivedCandidates,
        pendingIce: state.pendingIce.length,
        selectedPair: null,
        inboundBytes: 0,
        framesDecoded: 0,
        resolution: null,
        outboundBytes: 0,
        framesSent: 0,
      };

      try {
        const stats = await pc.getStats();
        const candidates = new Map<string, string>();
        let pair: RTCIceCandidatePairStats | null = null;

        stats.forEach((report) => {
          switch (report.type) {
            case 'local-candidate':
            case 'remote-candidate': {
              // `RTCIceCandidateStats` não existe na lib do TS; só precisamos
              // do tipo do candidato (host / srflx / relay).
              const c = report as { id: string; candidateType?: string };
              if (c.candidateType) candidates.set(c.id, c.candidateType);
              return;
            }
            case 'candidate-pair': {
              const p = report as RTCIceCandidatePairStats;
              // `nominated` é o par que o ICE de fato escolheu.
              if (p.state === 'succeeded' && p.nominated) pair = p;
              return;
            }
            case 'inbound-rtp': {
              const r = report as RTCInboundRtpStreamStats;
              if (r.kind !== 'video') return;
              entry.inboundBytes = r.bytesReceived ?? 0;
              entry.framesDecoded = r.framesDecoded ?? 0;
              if (r.frameWidth && r.frameHeight) {
                entry.resolution = `${r.frameWidth}x${r.frameHeight}`;
              }
              return;
            }
            case 'outbound-rtp': {
              const r = report as RTCOutboundRtpStreamStats;
              if (r.kind !== 'video') return;
              entry.outboundBytes = r.bytesSent ?? 0;
              entry.framesSent = r.framesSent ?? 0;
              return;
            }
          }
        });

        if (pair) {
          const p: RTCIceCandidatePairStats = pair;
          const local = candidates.get(p.localCandidateId ?? '') ?? '?';
          const remote = candidates.get(p.remoteCandidateId ?? '') ?? '?';
          entry.selectedPair = `${local} <- ${remote}`;
        }
      } catch {
        // getStats pode falhar em conexão já fechada; o resto do relatório vale.
      }

      result.push(entry);
    }

    return result;
  }
}
