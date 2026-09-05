'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PeerId } from '@jusqs/types';

import { RoomClient, type ConnectionStatus } from '@/lib/room-client';
import { DEFAULT_QUALITY_ID, QUALITY_PRESETS } from '@/lib/quality';
import {
  AUDIO_SOURCE_DISPLAY,
  AUDIO_SOURCE_MICROPHONE,
  AUDIO_SOURCE_NONE,
  DEFAULT_AUDIO_SOURCE,
  deviceValue,
  listAudioInputs,
} from '@/lib/audio-source';
import {
  RemoteStreamPanel,
  StreamVideo,
  VideoPanel,
} from '@/components/stream-panel';

/** Valor sentinela do `<select>`: aciona a busca em vez de virar seleção. */
const DETECT_DEVICES = '__detect__';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'aguardando',
  connecting: 'conectando',
  connected: 'online',
  closed: 'desconectado',
  error: 'erro',
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  idle: 'text-denim/60',
  connecting: 'text-denim',
  connected: 'text-lilac-soft',
  closed: 'text-denim/60',
  error: 'text-alert',
};

const STATUS_DOT: Record<ConnectionStatus, string> = {
  idle: 'bg-denim/50',
  connecting: 'bg-denim animate-pulse',
  connected: 'bg-lilac-soft',
  closed: 'bg-denim/50',
  error: 'bg-alert',
};

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const clientRef = useRef<RoomClient | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [peers, setPeers] = useState<PeerId[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<PeerId, MediaStream>>(
    new Map(),
  );
  const [copied, setCopied] = useState(false);

  // Som começa desligado por peer: o autoplay só é autorizado com o elemento
  // mudo. Ligar exige um clique - que é justamente o gesto que o browser pede.
  const [audioOn, setAudioOn] = useState<Set<PeerId>>(new Set());
  const [quality, setQuality] = useState(DEFAULT_QUALITY_ID);
  const [audioSource, setAudioSource] = useState(DEFAULT_AUDIO_SOURCE);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  const toggleAudio = useCallback((peerId: PeerId) => {
    setAudioOn((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }, []);

  /**
   * Erros vão para o console, não para a tela.
   *
   * A maior parte deles é técnica demais para o usuário — nomes de exceção do
   * WebRTC, estados de ICE — e poluía a interface. O estado que interessa a
   * quem usa continua visível nos painéis: "sem áudio", "aguardando alguém",
   * "parado".
   */
  const reportError = useCallback((message: string) => {
    console.error('[jusqs]', message);
  }, []);

  /**
   * Carrega os dispositivos de entrada.
   *
   * Sob demanda, e não na montagem: listar exige permissão de áudio, e pedir
   * o microfone assim que a página abre seria assustador sem motivo.
   */
  const loadAudioDevices = useCallback(async () => {
    try {
      setAudioDevices(await listAudioInputs());
    } catch {
      reportError(
        'não foi possível listar os dispositivos de áudio — a permissão de ' +
          'microfone foi negada.',
      );
    }
  }, [reportError]);

  useEffect(() => {
    if (!roomId) return;

    const client = new RoomClient(roomId, {
      onStatus: setStatus,
      onPeersChange: setPeers,
      onLocalStream: setLocalStream,
      onError: reportError,
      onRemoteStream: (peerId, stream) =>
        setRemoteStreams((prev) => new Map(prev).set(peerId, stream)),
      onRemoteStreamEnded: (peerId) =>
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        }),
    });

    clientRef.current = client;
    client.connect();

    // Em desenvolvimento, o cliente fica ao alcance do console:
    //
    //   await jusqs.getDiagnostics()
    //
    // A telemetria saiu da tela, mas continua disponível para quem estiver
    // depurando — sem poluir a interface de quem só quer transmitir.
    if (process.env.NODE_ENV === 'development') {
      (window as unknown as { jusqs?: RoomClient }).jusqs = client;
    }

    return () => {
      client.dispose();
      clientRef.current = null;
      delete (window as unknown as { jusqs?: RoomClient }).jusqs;
    };
  }, [roomId, reportError]);

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const isSharing = localStream !== null;
  const sendingAudio = (localStream?.getAudioTracks().length ?? 0) > 0;
  const remoteEntries = [...remoteStreams.entries()];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pb-16 sm:px-10">
      {/* ---------------------------------------------------------- barra */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-card border border-line bg-surface/70 px-5 py-4">
        <div className="flex items-center gap-5 text-[13px]">
          <span className="flex items-baseline gap-2">
            <span className="text-denim/70">sala</span>
            <span className="font-mono font-medium">{roomId}</span>
          </span>

          <span className="h-4 w-px bg-line" />

          <span className={`flex items-center gap-2 ${STATUS_COLOR[status]}`}>
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
            />
            {STATUS_LABEL[status]}
          </span>

          <span className="text-denim/70">
            {peers.length} {peers.length === 1 ? 'peer' : 'peers'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={audioSource}
            aria-label="Fonte de áudio"
            title={
              'da aba: o áudio vem junto da captura. Funciona ao ' +
              'compartilhar uma aba do navegador; em tela ou janela ' +
              'depende do sistema e falha com frequência. ' +
              'microfone: funciona com qualquer fonte, inclusive janela — ' +
              'basta conceder a permissão.'
            }
            onChange={(event) => {
              const value = event.target.value;

              // Item de ação, não de valor: dispara a permissão e repovoa a
              // lista sem alterar a seleção atual.
              if (value === DETECT_DEVICES) {
                void loadAudioDevices();
                return;
              }

              setAudioSource(value);
              clientRef.current?.setAudioSource(value);
            }}
            className="cursor-pointer rounded-full border border-line bg-ink px-4 py-2.5 text-[13px] outline-none transition-colors hover:border-denim/60 focus:border-lilac/60"
          >
            <option value={AUDIO_SOURCE_DISPLAY}>áudio: da aba</option>
            <option value={AUDIO_SOURCE_MICROPHONE}>áudio: microfone</option>
            <option value={AUDIO_SOURCE_NONE}>áudio: nenhum</option>
            {audioDevices.map((device) => (
              <option key={device.deviceId} value={deviceValue(device.deviceId)}>
                áudio: {device.label || 'dispositivo sem nome'}
              </option>
            ))}
            <option value={DETECT_DEVICES}>
              {audioDevices.length > 0
                ? 'atualizar dispositivos…'
                : 'procurar dispositivos…'}
            </option>
          </select>

          <select
            value={quality}
            aria-label="Qualidade da transmissão"
            onChange={(event) => {
              const id = event.target.value;
              setQuality(id);
              // Aplica ao vivo se já estiver transmitindo; caso contrário
              // vale a partir da próxima captura.
              void clientRef.current?.setQuality(id);
            }}
            className="cursor-pointer rounded-full border border-line bg-ink px-4 py-2.5 text-[13px] outline-none transition-colors hover:border-denim/60 focus:border-lilac/60"
          >
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={copyLink}
            className="cursor-pointer rounded-full border border-line px-4 py-2.5 text-[13px] font-medium transition-colors hover:border-denim/60"
          >
            {copied ? 'link copiado' : 'copiar link'}
          </button>

          <button
            type="button"
            disabled={status !== 'connected'}
            onClick={() => {
              const client = clientRef.current;
              if (!client) return;
              if (client.isSharing) client.stopSharing();
              else void client.startSharing();
            }}
            className={`cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
              isSharing
                ? 'border border-line text-sky hover:border-alert/70 hover:text-alert'
                : 'bg-lilac text-white hover:bg-lilac-soft'
            }`}
          >
            {isSharing ? 'parar transmissão' : 'compartilhar tela'}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- vídeos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <VideoPanel
          label="você"
          active={isSharing}
          emptyHint="clique em compartilhar tela para começar"
          action={
            isSharing ? (
              <span
                className={`text-[11px] ${sendingAudio ? 'text-lilac-soft' : 'text-denim/60'}`}
              >
                {sendingAudio ? 'enviando áudio' : 'sem áudio'}
              </span>
            ) : undefined
          }
        >
          {/* A key força remontar quando o stream troca, garantindo que o
              efeito que define srcObject rode de novo. */}
          {localStream && (
            <StreamVideo
              key={localStream.id}
              stream={localStream}
              /* Sempre mudo: ouvir o próprio áudio capturado gera eco. */
              muted
              onPlayError={reportError}
            />
          )}
        </VideoPanel>

        {remoteEntries.length === 0 ? (
          <VideoPanel
            label="remoto"
            active={false}
            emptyHint={
              peers.length === 0
                ? 'aguardando alguém entrar pelo link'
                : 'peer conectado, sem transmissão'
            }
          />
        ) : (
          remoteEntries.map(([peerId, stream]) => (
            <RemoteStreamPanel
              key={peerId}
              label={peerId.slice(0, 8)}
              stream={stream}
              audioOn={audioOn.has(peerId)}
              onToggleAudio={() => toggleAudio(peerId)}
              onPlayError={reportError}
            />
          ))
        )}
      </div>

      <p className="max-w-2xl text-[12px] leading-relaxed text-denim/60">
        V0 sem TURN, sem persistência, sem reconexão. Se a conexão falhar
        entre redes diferentes, é o NAT: é exatamente esse problema que
        justifica o TURN na Phase 1.
      </p>
    </div>
  );
}
