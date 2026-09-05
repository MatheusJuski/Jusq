'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

/* -------------------------------------------------------------------------- */
/* Hooks de exibição                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Tela cheia sobre um elemento qualquer.
 *
 * Vai no painel inteiro, não no `<video>`: em fullscreen do elemento de vídeo o
 * browser assume o controle e a nossa barra (som, mini, LIVE) desaparece.
 */
function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  // Só depois da montagem: no servidor não existe `document`, e checar durante
  // a renderização causaria divergência de hidratação.
  useEffect(() => setSupported(document.fullscreenEnabled), []);

  useEffect(() => {
    // O usuário pode sair com ESC, sem passar pelo nosso botão.
    const sync = () => setActive(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const toggle = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    if (document.fullscreenElement === element) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, [ref]);

  return { active, supported, toggle };
}

/**
 * Picture-in-Picture: a janelinha flutuante que sobrevive fora do browser.
 *
 * Firefox tem PiP próprio, acionado pela UI dele, e não expõe esta API — daí a
 * checagem de suporte em vez de assumir.
 */
function usePictureInPicture(ref: RefObject<HTMLVideoElement | null>) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => setSupported(document.pictureInPictureEnabled), []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // A janela pode ser fechada pelo controle do próprio sistema.
    const enter = () => setActive(true);
    const leave = () => setActive(false);

    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', leave);
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', leave);
    };
  }, [ref]);

  const toggle = useCallback(() => {
    const video = ref.current;
    if (!video) return;

    if (document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else {
      // Falha se o vídeo ainda não tem metadados carregados; nesse caso não há
      // o que fazer além de ignorar e deixar o usuário tentar de novo.
      void video.requestPictureInPicture().catch(() => undefined);
    }
  }, [ref]);

  return { active, supported, toggle };
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

function ControlButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-lilac/70 bg-lilac/15 text-lilac-soft'
          : 'border-line text-denim hover:border-denim/60 hover:text-sky'
      }`}
    >
      {children}
    </button>
  );
}

export function VideoPanel({
  label,
  active,
  emptyHint,
  action,
  panelRef,
  children,
}: {
  label: string;
  active: boolean;
  emptyHint?: string;
  /** Controles no cabeçalho: som, mini, tela cheia. */
  action?: React.ReactNode;
  /** Alvo do fullscreen. */
  panelRef?: RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
}) {
  return (
    <div
      ref={panelRef}
      className="overflow-hidden rounded-card border border-line bg-surface/70"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="shrink-0 font-mono text-[12px] text-denim">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {action}
          <span
            className={`flex items-center gap-1.5 text-[11px] font-medium ${
              active ? 'text-lilac-soft' : 'text-denim/60'
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                active ? 'bg-lilac-soft' : 'bg-denim/50'
              }`}
            />
            {active ? 'ao vivo' : 'parado'}
          </span>
        </div>
      </div>

      {/* Os filhos são sempre renderizados: desmontá-los faria o <video> deixar
          de existir justamente quando o stream chega. A dica vazia fica por
          cima, não no lugar.

          `data-panel-body` é o gancho do CSS que troca o 16:9 por altura total
          quando o painel está em tela cheia. */}
      <div
        data-panel-body
        className="relative flex aspect-video items-center justify-center bg-ink"
      >
        {children}
        {!active && (
          <span className="absolute px-6 text-center text-[13px] text-denim/60">
            {emptyHint}
          </span>
        )}
      </div>
    </div>
  );
}

export function StreamVideo({
  stream,
  muted,
  videoRef,
  onPlayError,
}: {
  stream: MediaStream;
  muted: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  onPlayError?: (message: string) => void;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;

  // Declarado ANTES do efeito do stream de propósito: efeitos rodam na ordem de
  // declaração, e `muted` precisa valer antes do srcObject — é ele que autoriza
  // o autoplay. Sem isso o browser barra com NotAllowedError e a tela fica
  // preta. Também é o que aplica o clique em SOM, permitido apenas porque parte
  // de um gesto do usuário.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted, ref]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.srcObject = stream;

    void video.play().catch((error: unknown) => {
      if (!(error instanceof DOMException)) return;

      // O atributo autoPlay também dispara a reprodução; quando ela chega
      // primeiro, este play() é abortado. É esperado, não é falha.
      if (error.name === 'AbortError') return;

      onPlayError?.(`reprodução bloqueada (${error.name}) — clique no vídeo`);
    });

    return () => {
      video.srcObject = null;
    };
  }, [stream, ref, onPlayError]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      // Clicar destrava o caso de autoplay bloqueado por gesto do usuário.
      onClick={() => void ref.current?.play().catch(() => undefined)}
      className="h-full w-full object-contain"
    />
  );
}

/**
 * Painel de um peer remoto: vídeo, som, mini e tela cheia.
 *
 * Os controles de exibição existem só aqui, não no painel local: dar tela cheia
 * à própria transmissão gera o efeito de espelho infinito, que parece defeito.
 */
export function RemoteStreamPanel({
  label,
  stream,
  audioOn,
  onToggleAudio,
  onPlayError,
}: {
  label: string;
  stream: MediaStream;
  audioOn: boolean;
  onToggleAudio: () => void;
  onPlayError?: (message: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fullscreen = useFullscreen(panelRef);
  const pip = usePictureInPicture(videoRef);

  const hasAudio = stream.getAudioTracks().length > 0;

  return (
    <VideoPanel
      label={label}
      active
      panelRef={panelRef}
      action={
        <>
          {hasAudio ? (
            <ControlButton
              onClick={onToggleAudio}
              active={audioOn}
              title={audioOn ? 'Silenciar' : 'Ativar som'}
            >
              {audioOn ? 'som' : 'mudo'}
            </ControlButton>
          ) : (
            <span className="text-[11px] text-denim/60">sem áudio</span>
          )}

          {pip.supported && (
            <ControlButton
              onClick={pip.toggle}
              active={pip.active}
              title="Miniplayer flutuante (fica por cima de outras janelas)"
            >
              mini
            </ControlButton>
          )}

          {fullscreen.supported && (
            <ControlButton
              onClick={fullscreen.toggle}
              active={fullscreen.active}
              title={fullscreen.active ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {fullscreen.active ? 'sair' : 'tela cheia'}
            </ControlButton>
          )}
        </>
      }
    >
      <StreamVideo
        key={stream.id}
        stream={stream}
        muted={!audioOn}
        videoRef={videoRef}
        onPlayError={onPlayError}
      />
    </VideoPanel>
  );
}
