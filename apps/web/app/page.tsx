'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Gera um id de sala curto e legível.
 *
 * Não é seguro por obscuridade - qualquer um com o link entra. Controle de
 * acesso é Phase 2, junto com autenticação.
 */
function newRoomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const UPCOMING = [
  { name: 'Draw Lab', about: 'desenho colaborativo realtime' },
  { name: 'GitHub RPG', about: 'atividade do GitHub como RPG' },
  { name: 'RPG Lab', about: 'geração procedural de mundos' },
  { name: 'Simulation Lab', about: 'ecossistema artificial' },
];

export default function HomePage() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-10 pb-20 sm:px-10">
      <section className="max-w-2xl">
        <h1 className="text-[2.75rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          Compartilhe sua tela
          <br />
          <span className="text-lilac-soft">sem intermediários.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-denim">
          O vídeo vai direto de um navegador ao outro por WebRTC. O servidor só
          apresenta os dois e sai do caminho.
        </p>
      </section>

      <section className="mt-12 rounded-card border border-line bg-surface/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-lilac/15 px-3 py-1 text-[11px] font-medium text-lilac-soft">
            Experimento 01
          </span>
          <span className="text-[13px] text-denim/80">
            WebRTC · WebSocket · mesh P2P
          </span>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => router.push(`/room/${newRoomId()}`)}
            className="cursor-pointer rounded-full bg-lilac px-7 py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-lilac-soft"
          >
            Criar sala
          </button>

          <div className="flex items-center gap-3 text-[13px] text-denim/60 sm:px-2">
            <span className="h-px w-8 bg-line sm:hidden" />
            ou entre em uma
            <span className="h-px flex-1 bg-line sm:hidden" />
          </div>

          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const id = joinId.trim();
              if (id) router.push(`/room/${id}`);
            }}
          >
            <input
              value={joinId}
              onChange={(event) => setJoinId(event.target.value)}
              placeholder="código da sala"
              className="min-w-0 flex-1 rounded-control border border-line bg-ink px-4 py-3.5 font-mono text-[14px] outline-none transition-colors placeholder:font-sans placeholder:text-denim/50 focus:border-lilac/60"
            />
            <button
              type="submit"
              disabled={!joinId.trim()}
              className="cursor-pointer rounded-control border border-line px-5 py-3.5 text-[14px] font-medium transition-colors hover:border-denim/60 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Entrar
            </button>
          </form>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-[11px] font-medium tracking-[0.18em] text-denim/60 uppercase">
          Próximos experimentos
        </h2>

        <ul className="mt-5 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
          {UPCOMING.map((item) => (
            <li
              key={item.name}
              className="flex items-baseline gap-3 bg-surface/70 px-5 py-4"
            >
              <span className="text-[14px] font-medium">{item.name}</span>
              <span className="text-[13px] text-denim/70">{item.about}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
