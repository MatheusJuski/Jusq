'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Card, SectionTitle, Tag } from '@/components/ui';
import { findExperiment } from '@/lib/experiments';

/**
 * Página do Screen Lab.
 *
 * O que antes era a home do site: criar sala e entrar em uma. Com o catálogo
 * na raiz, este conteúdo passa a viver sob a rota do próprio experimento, e a
 * home volta a falar do Jusq's.
 */

/**
 * Gera um id de sala curto e legível.
 *
 * Não é seguro por obscuridade, qualquer um com o link entra. Controle de
 * acesso exigiria autenticação, que o projeto não tem por escolha.
 *
 * O alfabeto omite `i`, `l`, `o` e `0`: o código é lido em voz alta e digitado
 * à mão, e esses quatro se confundem entre si.
 */
function newRoomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export default function ScreenLabPage() {
  const router = useRouter();
  const [joinId, setJoinId] = useState('');

  const experiment = findExperiment('screen-lab');

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-6 pb-20 sm:px-10">
      <section className="max-w-2xl">
        <h1 className="text-[2.5rem] leading-[1.05] font-semibold tracking-tight sm:text-5xl">
          Screen Lab
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-denim">
          {experiment?.about}
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {experiment?.tech.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </div>
      </section>

      <Card className="mt-10 p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="primary"
            size="md"
            onClick={() => router.push(`/screen-lab/${newRoomId()}`)}
          >
            Criar sala
          </Button>

          <span className="text-[13px] text-denim/60 sm:px-2">ou entre em uma</span>

          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const id = joinId.trim();
              if (id) router.push(`/screen-lab/${id}`);
            }}
          >
            <input
              value={joinId}
              onChange={(event) => setJoinId(event.target.value)}
              placeholder="código da sala"
              aria-label="Código da sala"
              className="min-w-0 flex-1 rounded-control border border-line bg-ink px-4 py-3.5 font-mono text-[14px] outline-none transition-colors placeholder:font-sans placeholder:text-denim/50 focus:border-lilac/60"
            />
            <Button type="submit" size="md" disabled={!joinId.trim()}>
              Entrar
            </Button>
          </form>
        </div>
      </Card>

      <section className="mt-12 max-w-2xl">
        <SectionTitle>O que ele explora</SectionTitle>
        <p className="mt-4 text-[14px] leading-relaxed text-denim">
          {experiment?.learns}.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-denim/70">
          O áudio acompanha a transmissão ao compartilhar uma aba do navegador. Para
          tela inteira ou janela, use o microfone como fonte, a captura de áudio do
          sistema depende da plataforma e falha com frequência.
        </p>

        <Link
          href="/"
          className="mt-6 inline-block text-[13px] text-denim transition-colors hover:text-sky"
        >
          ← todos os experimentos
        </Link>
      </section>
    </div>
  );
}
