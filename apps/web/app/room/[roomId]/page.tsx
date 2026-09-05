'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PeerId } from '@jusqs/types';

import {
  RoomClient,
  type ConnectionStatus,
  type PeerDiagnostics,
} from '@/lib/room-client';
import { DEFAULT_QUALITY_ID, QUALITY_PRESETS } from '@/lib/quality';
import {
  RemoteStreamPanel,
  StreamVideo,
  VideoPanel,
} from '@/components/stream-panel';

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
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PeerDiagnostics[]>([]);

  // Som começa desligado por peer: o autoplay só é autorizado com o elemento
  // mudo. Ligar exige um clique - que é justamente o gesto que o browser pede.
  const [audioOn, setAudioOn] = useState<Set<PeerId>>(new Set());
  const [quality, setQuality] = useState(DEFAULT_QUALITY_ID);

  const toggleAudio = useCallback((peerId: PeerId) => {
    setAudioOn((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }, []);

  const reportError = useCallback((message: string) => {
    // Mantém só as últimas ocorrências: o painel é diagnóstico, não log.
    setErrors((prev) =>
      prev[prev.length - 1] === message ? prev : [...prev.slice(-4), message],
    );
  }, []);

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

    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, [roomId, reportError]);

  // Polling de 1s: getStats é assíncrono e barato, e é a única forma de ver
  // se a mídia está de fato trafegando.
  useEffect(() => {
    if (peers.length === 0) {
      setDiagnostics([]);
      return;
    }

    let cancelled = false;
    const tick = () => {
      void clientRef.current?.getDiagnostics().then((rows) => {
        if (!cancelled) setDiagnostics(rows);
      });
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [peers.length]);

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

      {/* ----------------------------------------------------- diagnóstico */}
      {diagnostics.length > 0 && <DiagnosticsTable rows={diagnostics} />}

      {errors.length > 0 && (
        <div className="rounded-card border border-alert/35 bg-alert/[0.06] p-5">
          <div className="mb-2.5 text-[11px] font-medium tracking-[0.18em] text-alert uppercase">
            Diagnóstico
          </div>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-sky/85">
            {errors.map((message, index) => (
              <li key={`${index}-${message}`} className="flex gap-2.5">
                <span aria-hidden className="text-alert/70">
                  ·
                </span>
                {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="max-w-2xl text-[12px] leading-relaxed text-denim/60">
        V0 sem TURN, sem persistência, sem reconexão. Se a conexão falhar
        entre redes diferentes, é o NAT: é exatamente esse problema que
        justifica o TURN na Phase 1.
      </p>
    </div>
  );
}

/** Formata bytes em algo legível numa tabela estreita. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DiagnosticsTable({ rows }: { rows: PeerDiagnostics[] }) {
  return (
    <div className="rounded-card border border-line bg-surface/70 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[11px] font-medium tracking-[0.18em] text-denim/70 uppercase">
          WebRTC
        </h2>
        <span className="text-[12px] text-denim/50">atualiza a cada 1s</span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-collapse text-left text-[13px] whitespace-nowrap">
          <thead>
            <tr className="text-[11px] font-medium text-denim/60">
              <th className="pr-6 pb-3 font-medium">peer</th>
              <th className="pr-6 pb-3 font-medium">conexão</th>
              <th className="pr-6 pb-3 font-medium">ice</th>
              <th className="pr-6 pb-3 font-medium">par</th>
              <th className="pr-6 pb-3 font-medium">cand ↑/↓</th>
              <th className="pr-6 pb-3 font-medium">recebido</th>
              <th className="pr-6 pb-3 font-medium">frames</th>
              <th className="pb-3 font-medium">enviado</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((row) => {
              const connected = row.connectionState === 'connected';
              const receiving = row.inboundBytes > 0;

              return (
                <tr key={row.peerId} className="border-t border-line/70">
                  <td className="py-3 pr-6">{row.peerId.slice(0, 8)}</td>
                  <td className="py-3 pr-6">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] ${
                        connected
                          ? 'bg-lilac/15 text-lilac-soft'
                          : 'bg-denim/10 text-denim'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${
                          connected ? 'bg-lilac-soft' : 'bg-denim/60'
                        }`}
                      />
                      {row.connectionState}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-denim">
                    {row.iceConnectionState}
                  </td>
                  <td className="py-3 pr-6 text-denim">
                    {row.selectedPair ?? '—'}
                  </td>
                  <td className="py-3 pr-6 text-denim">
                    {row.sentCandidates}/{row.receivedCandidates}
                    {row.pendingIce > 0 && ` (+${row.pendingIce})`}
                  </td>
                  <td
                    className={`py-3 pr-6 ${receiving ? 'text-sky' : 'text-alert'}`}
                  >
                    {formatBytes(row.inboundBytes)}
                  </td>
                  <td className="py-3 pr-6 text-denim">
                    {row.framesDecoded}
                    {row.resolution && ` · ${row.resolution}`}
                  </td>
                  <td className="py-3 text-denim">
                    {formatBytes(row.outboundBytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-denim/60">
        <span className="text-sky/80">recebido</span> crescendo com a tela preta
        indica problema de renderização. Em zero, a mídia não está chegando —
        olhe <span className="text-sky/80">conexão</span> e{' '}
        <span className="text-sky/80">par</span>.
      </p>
    </div>
  );
}
