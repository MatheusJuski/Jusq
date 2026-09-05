import type {
  ClientMessage,
  PeerId,
  RoomId,
  RTCIceCandidateInitLike,
  ServerMessage,
  SignalPayload,
} from '@jusqs/types';

import { getIceServers, getSignalingUrl } from './ice';

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

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false, // Áudio é Phase 3.
      });
    } catch (error) {
      // Cancelar o seletor de tela do browser cai aqui. Não é erro.
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      this.#handlers.onError('não foi possível capturar a tela');
      return;
    }

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

    // Remove as trilhas das conexões. Renegociação completa é Phase 3.
    for (const { pc } of this.#peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track) pc.removeTrack(sender);
      }
    }
  }

  get isSharing(): boolean {
    return this.#localStream !== null;
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
        await pc.setLocalDescription(answer);

        this.#send({
          type: 'signal',
          to: from,
          payload: { kind: 'answer', sdp: answer.sdp ?? '' },
        });

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
      if (stream) this.#handlers.onRemoteStream(peerId, stream);
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
    await pc.setLocalDescription(offer);

    this.#send({
      type: 'signal',
      to: peerId,
      payload: { kind: 'offer', sdp: offer.sdp ?? '' },
    });
  }

  #emitPeers(): void {
    this.#handlers.onPeersChange([...this.#peers.keys()]);
  }

  /* --------------------------------------------------------- diagnóstico */

  /**
   * Fotografia do estado real de cada conexão.
   *
   * Regra de leitura quando a tela está preta:
   *
   * - `inboundBytes` cresce  -> a mídia chega; o problema é renderização
   * - `inboundBytes` em zero -> a mídia não chega; olhe ICE e o par escolhido
   * - `selectedPair` nulo    -> ICE não fechou nenhum caminho
   */
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
