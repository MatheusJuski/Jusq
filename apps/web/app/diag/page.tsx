'use client';

import { useEffect, useState } from 'react';

/**
 * Banco de testes de captura de áudio de tela.
 *
 * Existe porque `NotReadableError: Could not start audio source` não diz o que
 * a plataforma recusou, e aplicações que funcionam na mesma máquina provam que
 * o pedido — e não o sistema — é o que difere. Cada variante roda isolada, com
 * seu próprio gesto do usuário, e reporta exatamente o que voltou.
 *
 * Ferramenta de investigação: pode sair quando a causa estiver conhecida.
 */

/**
 * Opções fora da lib de tipos do DOM, mas suportadas nos navegadores Chromium.
 * O ponto do diagnóstico é justamente testá-las.
 */
interface ProbeOptions {
  video: boolean | Record<string, unknown>;
  audio: boolean | Record<string, unknown>;
  systemAudio?: 'include' | 'exclude';
}

interface Variant {
  id: string;
  label: string;
  detail: string;
  options: ProbeOptions;
}

const VARIANTS: Variant[] = [
  {
    id: 'plain',
    label: 'audio: true',
    detail: 'pedido mínimo, sem nenhuma opção extra',
    options: { video: true, audio: true },
  },
  {
    id: 'system',
    label: 'audio: true + systemAudio',
    detail: 'o que a aplicação usa hoje',
    options: { video: true, audio: true, systemAudio: 'include' },
  },
  {
    id: 'constraints',
    label: 'audio com restrições',
    detail: 'sem processamento de voz, como fazem apps de conferência',
    options: {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      systemAudio: 'include',
    },
  },
  {
    id: 'suppress',
    label: 'suppressLocalAudioPlayback: false',
    detail: 'mantém o som tocando na máquina durante a captura',
    options: {
      video: true,
      audio: { suppressLocalAudioPlayback: false },
      systemAudio: 'include',
    },
  },
  {
    id: 'monitor',
    label: 'displaySurface: monitor',
    detail: 'direciona o seletor para tela inteira',
    options: {
      video: { displaySurface: 'monitor' },
      audio: true,
      systemAudio: 'include',
    },
  },
];

interface Result {
  ok: boolean;
  surface: string;
  audioTracks: number;
  audioLabel: string;
  error: string;
}

/**
 * Contexto do ambiente.
 *
 * Quando cinco pedidos diferentes falham igual, a causa deixou de ser o pedido
 * — passa a ser a origem, o navegador ou a política do site. Estes são os
 * dados que decidem entre essas hipóteses.
 */
function useEnvironment() {
  const [env, setEnv] = useState<Record<string, string> | null>(null);

  // Só após a montagem: `window` não existe no servidor.
  useEffect(() => {
    const brands = (
      navigator as { userAgentData?: { brands?: { brand: string; version: string }[] } }
    ).userAgentData?.brands;

    setEnv({
      origem: window.location.origin,
      protocolo: window.location.protocol,
      'contexto seguro': String(window.isSecureContext),
      motor:
        brands?.map((b) => `${b.brand} ${b.version}`).join(' · ') ??
        navigator.userAgent.slice(0, 120),
    });
  }, []);

  return env;
}

export default function DiagPage() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<string | null>(null);
  const env = useEnvironment();

  async function run(variant: Variant) {
    setRunning(variant.id);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(
        variant.options as DisplayMediaStreamOptions,
      );

      const [video] = stream.getVideoTracks();
      const settings = (video?.getSettings() ?? {}) as {
        displaySurface?: string;
      };
      const audio = stream.getAudioTracks();

      setResults((prev) => ({
        ...prev,
        [variant.id]: {
          ok: audio.length > 0,
          surface: settings.displaySurface ?? '—',
          audioTracks: audio.length,
          audioLabel: audio[0]?.label ?? '—',
          error: '',
        },
      }));

      // Encerra na hora: isto é um teste, não uma transmissão.
      for (const track of stream.getTracks()) track.stop();
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [variant.id]: {
          ok: false,
          surface: '—',
          audioTracks: 0,
          audioLabel: '—',
          error:
            error instanceof DOMException
              ? `${error.name}: ${error.message}`
              : String(error),
        },
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 sm:px-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Diagnóstico de áudio
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-denim">
        Cada botão faz um pedido de captura diferente. Em todos, escolha{' '}
        <strong className="text-sky">tela inteira</strong> e marque{' '}
        <strong className="text-sky">compartilhar áudio do sistema</strong>. A
        captura é encerrada assim que o resultado é lido.
      </p>

      {env && (
        <dl className="mt-7 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 rounded-card border border-line bg-surface/70 p-5 font-mono text-[12px]">
          {Object.entries(env).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-denim/70">{key}</dt>
              <dd className="break-all text-sky/85">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {VARIANTS.map((variant) => {
          const result = results[variant.id];

          return (
            <li
              key={variant.id}
              className="rounded-card border border-line bg-surface/70 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[14px] font-medium">
                    {variant.label}
                  </div>
                  <div className="mt-0.5 text-[13px] text-denim/70">
                    {variant.detail}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={running !== null}
                  onClick={() => void run(variant)}
                  className="cursor-pointer rounded-full bg-lilac px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-lilac-soft disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {running === variant.id ? 'testando…' : 'testar'}
                </button>
              </div>

              {result && (
                <div
                  className={`mt-4 rounded-control border p-3 text-[13px] ${
                    result.ok
                      ? 'border-lilac/50 bg-lilac/10'
                      : 'border-alert/40 bg-alert/[0.06]'
                  }`}
                >
                  <div className="font-medium">
                    {result.ok ? 'ÁUDIO CAPTURADO' : 'SEM ÁUDIO'}
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[12px] text-denim">
                    <dt>superfície</dt>
                    <dd className="text-sky/80">{result.surface}</dd>
                    <dt>trilhas de áudio</dt>
                    <dd className="text-sky/80">{result.audioTracks}</dd>
                    <dt>rótulo</dt>
                    <dd className="text-sky/80">{result.audioLabel}</dd>
                    {result.error && (
                      <>
                        <dt>erro</dt>
                        <dd className="text-alert">{result.error}</dd>
                      </>
                    )}
                  </dl>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-[13px] leading-relaxed text-denim/60">
        Se alguma variante capturar áudio, é ela que a aplicação deve usar. Se
        nenhuma capturar mas o Google Meet capturar na mesma máquina e no mesmo
        navegador, a diferença está fora do pedido — provavelmente em permissões
        por site (no Brave, o escudo).
      </p>
    </div>
  );
}
