'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Gera um id de sala curto e legível.
 *
 * Não é seguro por obscuridade — qualquer um com o link entra. Controle de
 * acesso é Phase 2, junto com autenticação.
 */
function newRoomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export default function HomePage() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-20">
      <div>
        <h1 className="text-4xl font-bold tracking-[0.3em]">JUSQ&apos;S</h1>
        <p className="mt-3 text-sm text-lab-dim">
          Laboratório de experimentos em sistemas realtime.
        </p>
      </div>

      <section className="border border-lab-border bg-lab-panel p-6">
        <div className="mb-1 text-xs tracking-widest text-lab-accent">
          EXPERIMENTO 01
        </div>
        <h2 className="text-xl font-bold">Screen Lab</h2>
        <p className="mt-2 text-sm text-lab-dim">
          Compartilhamento de tela peer-to-peer via WebRTC. A mídia trafega
          direto entre os navegadores — o servidor só intermedia a negociação.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push(`/room/${newRoomId()}`)}
            className="cursor-pointer border border-lab-accent px-5 py-2.5 text-sm font-bold tracking-wider text-lab-accent transition-colors hover:bg-lab-accent hover:text-lab-bg"
          >
            CRIAR SALA
          </button>

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
              className="min-w-0 flex-1 border border-lab-border bg-lab-bg px-3 py-2.5 text-sm outline-none placeholder:text-lab-dim focus:border-lab-dim"
            />
            <button
              type="submit"
              disabled={!joinId.trim()}
              className="cursor-pointer border border-lab-border px-4 py-2.5 text-sm tracking-wider transition-colors hover:border-lab-dim disabled:cursor-not-allowed disabled:opacity-40"
            >
              ENTRAR
            </button>
          </form>
        </div>
      </section>

      <section className="text-xs leading-relaxed text-lab-dim">
        <div className="mb-2 tracking-widest">PRÓXIMOS EXPERIMENTOS</div>
        <ul className="space-y-1">
          <li>◌ Draw Lab — desenho colaborativo realtime</li>
          <li>◌ GitHub RPG — atividade do GitHub como RPG</li>
          <li>◌ RPG Lab — geração procedural de mundos</li>
          <li>◌ Simulation Lab — ecossistema artificial</li>
        </ul>
      </section>
    </div>
  );
}
