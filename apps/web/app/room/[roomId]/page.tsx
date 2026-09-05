'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PeerId } from '@jusqs/types';

import {
  RoomClient,
  type ConnectionStatus,
  type PeerDiagnostics,
} from '@/lib/room-client';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'AGUARDANDO',
  connecting: 'CONECTANDO',
  connected: 'ONLINE',
  closed: 'DESCONECTADO',
  error: 'ERRO',
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  idle: 'text-lab-dim',
  connecting: 'text-lab-warn',
  connected: 'text-lab-accent',
  closed: 'text-lab-dim',
  error: 'text-lab-error',
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
  const remoteEntries = [...remoteStreams.entries()];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      {/* ---------------------------------------------------------- barra */}
      <div className="flex flex-wrap items-center justify-between gap-4 border border-lab-border bg-lab-panel px-5 py-3">
        <div className="flex items-center gap-6 text-xs tracking-widest">
          <span>
            <span className="text-lab-dim">SALA </span>
            <span className="font-bold">{roomId}</span>
          </span>
          <span className={STATUS_COLOR[status]}>● {STATUS_LABEL[status]}</span>
          <span className="text-lab-dim">PEERS {peers.length}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="cursor-pointer border border-lab-border px-4 py-2 text-xs tracking-wider transition-colors hover:border-lab-dim"
          >
            {copied ? 'COPIADO' : 'COPIAR LINK'}
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
            className={`cursor-pointer border px-4 py-2 text-xs font-bold tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isSharing
                ? 'border-lab-error text-lab-error hover:bg-lab-error hover:text-lab-bg'
                : 'border-lab-accent text-lab-accent hover:bg-lab-accent hover:text-lab-bg'
            }`}
          >
            {isSharing ? 'PARAR' : 'COMPARTILHAR TELA'}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- vídeos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <VideoPanel
          label="VOCÊ"
          active={isSharing}
          emptyHint="clique em COMPARTILHAR TELA"
        >
          {/* A key força remontar quando o stream troca, garantindo que o
              efeito que define srcObject rode de novo. */}
          {localStream && (
            <StreamVideo
              key={localStream.id}
              stream={localStream}
              onPlayError={reportError}
            />
          )}
        </VideoPanel>

        {remoteEntries.length === 0 ? (
          <VideoPanel
            label="REMOTO"
            active={false}
            emptyHint={
              peers.length === 0
                ? 'aguardando alguém entrar pelo link'
                : 'peer conectado, sem transmissão'
            }
          />
        ) : (
          remoteEntries.map(([peerId, stream]) => (
            <VideoPanel key={peerId} label={peerId.slice(0, 8)} active>
              <StreamVideo
                key={stream.id}
                stream={stream}
                onPlayError={reportError}
              />
            </VideoPanel>
          ))
        )}
      </div>

      {/* ----------------------------------------------------- diagnóstico */}
      {diagnostics.length > 0 && <DiagnosticsTable rows={diagnostics} />}

      {errors.length > 0 && (
        <div className="border border-lab-error/40 bg-lab-panel p-4 text-xs">
          <div className="mb-2 tracking-widest text-lab-error">DIAGNÓSTICO</div>
          <ul className="space-y-1 text-lab-dim">
            {errors.map((message, index) => (
              <li key={`${index}-${message}`}>! {message}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-lab-dim">
        V0 — sem TURN, sem persistência, sem reconexão. Se a conexão falhar
        entre redes diferentes, é o NAT: é exatamente esse problema que
        justifica o TURN na Phase 1.
      </p>
    </div>
  );
}

function VideoPanel({
  label,
  active,
  emptyHint,
  children,
}: {
  label: string;
  active: boolean;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-lab-border bg-lab-panel">
      <div className="flex items-center justify-between border-b border-lab-border px-3 py-1.5 text-[11px] tracking-widest">
        <span>{label}</span>
        <span className={active ? 'text-lab-accent' : 'text-lab-dim'}>
          {active ? '● LIVE' : '○ OFF'}
        </span>
      </div>

      {/* Os filhos são sempre renderizados: desmontá-los faria o <video>
          deixar de existir justamente quando o stream chega. A dica vazia
          fica por cima, não no lugar. */}
      <div className="relative flex aspect-video items-center justify-center bg-black">
        {children}
        {!active && (
          <span className="absolute px-4 text-center text-xs text-lab-dim">
            {emptyHint}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Um <video> ligado a um MediaStream.
 *
 * `srcObject` não pode ser definido via atributo JSX — precisa ser atribuído
 * ao elemento. O efeito roda depois da montagem, então o nó já existe.
 */
function StreamVideo({
  stream,
  onPlayError,
}: {
  stream: MediaStream;
  onPlayError?: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // `muted` precisa estar definido ANTES do srcObject: é ele que autoriza o
    // autoplay. Sem isso o browser barra com NotAllowedError e a tela fica
    // preta. Em V0 não há áudio (`audio: false` na captura), então silenciar
    // não perde nada — quando o áudio entrar (Phase 3) isto vira um controle
    // de mute com gesto do usuário.
    video.muted = true;
    video.srcObject = stream;

    void video.play().catch((error: unknown) => {
      if (!(error instanceof DOMException)) return;

      // O atributo autoPlay do elemento também dispara a reprodução; quando ela
      // chega primeiro, este play() é abortado. É esperado, não é falha.
      if (error.name === 'AbortError') return;

      onPlayError?.(`reprodução bloqueada (${error.name}) — clique no vídeo`);
    });

    return () => {
      video.srcObject = null;
    };
  }, [stream, onPlayError]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      // Clicar destrava o caso de autoplay bloqueado por gesto do usuário.
      onClick={() => void ref.current?.play().catch(() => undefined)}
      className="h-full w-full object-contain"
    />
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
    <div className="border border-lab-border bg-lab-panel p-4 text-xs">
      <div className="mb-3 tracking-widest text-lab-dim">WEBRTC</div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="text-lab-dim">
            <tr>
              <th className="pr-4 pb-2 font-normal">PEER</th>
              <th className="pr-4 pb-2 font-normal">CONN</th>
              <th className="pr-4 pb-2 font-normal">ICE</th>
              <th className="pr-4 pb-2 font-normal">PAR</th>
              <th className="pr-4 pb-2 font-normal">CAND ↑/↓</th>
              <th className="pr-4 pb-2 font-normal">RECEBIDO</th>
              <th className="pr-4 pb-2 font-normal">FRAMES</th>
              <th className="pr-4 pb-2 font-normal">ENVIADO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const connected = row.connectionState === 'connected';
              const receiving = row.inboundBytes > 0;

              return (
                <tr key={row.peerId} className="border-t border-lab-border">
                  <td className="py-2 pr-4">{row.peerId.slice(0, 8)}</td>
                  <td
                    className={`py-2 pr-4 ${connected ? 'text-lab-accent' : 'text-lab-warn'}`}
                  >
                    {row.connectionState}
                  </td>
                  <td className="py-2 pr-4 text-lab-dim">
                    {row.iceConnectionState}
                  </td>
                  <td className="py-2 pr-4 text-lab-dim">
                    {row.selectedPair ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-lab-dim">
                    {row.sentCandidates}/{row.receivedCandidates}
                    {row.pendingIce > 0 && ` (+${row.pendingIce})`}
                  </td>
                  <td
                    className={`py-2 pr-4 ${receiving ? 'text-lab-accent' : 'text-lab-error'}`}
                  >
                    {formatBytes(row.inboundBytes)}
                  </td>
                  <td className="py-2 pr-4 text-lab-dim">
                    {row.framesDecoded}
                    {row.resolution && ` · ${row.resolution}`}
                  </td>
                  <td className="py-2 pr-4 text-lab-dim">
                    {formatBytes(row.outboundBytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 leading-relaxed text-lab-dim">
        RECEBIDO cresce e a tela está preta → problema de renderização.
        RECEBIDO em zero → a mídia não chega; olhe CONN e PAR.
      </p>
    </div>
  );
}
