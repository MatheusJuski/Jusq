import Link from 'next/link';

import { Card, SectionTitle, StatusDot, Tag } from '@/components/ui';
import { SystemStatus } from '@/components/system-status';
import { EXPERIMENTS } from '@/lib/experiments';

/**
 * Catálogo dos experimentos.
 *
 * Componente de servidor: o conteúdo vem do registro, que é estático, e nada
 * aqui depende do navegador. Só o painel de status é cliente, porque ele
 * consulta o servidor de signaling.
 */
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 pt-10 pb-20 sm:px-10">
      <section className="max-w-2xl">
        <h1 className="text-[2.75rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          Um laboratório de
          <br />
          <span className="text-lilac-soft">experimentos digitais.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-denim">
          Cada experimento aqui existe para explorar um problema técnico diferente,
          sistemas realtime, simulação, geração procedural. Nenhum deles precisa ter
          valor comercial.
        </p>
      </section>

      <section className="mt-12">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <SectionTitle>Experimentos</SectionTitle>
          <SystemStatus />
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPERIMENTS.map((experiment) => {
            const active = experiment.status === 'ativo';

            const body = (
              <Card
                className={`flex h-full flex-col gap-3 p-5 transition-colors ${
                  active ? 'hover:border-lilac/50' : 'opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] text-denim/70">
                    {experiment.number}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 text-[11px] font-medium ${
                      active ? 'text-lilac-soft' : 'text-denim/60'
                    }`}
                  >
                    <StatusDot className={active ? 'bg-lilac-soft' : 'bg-denim/50'} />
                    {experiment.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight">
                    {experiment.name}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-denim/80">
                    {experiment.tagline}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {experiment.tech.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </div>
              </Card>
            );

            return (
              <li key={experiment.id}>
                {/* Só o que existe vira link. Um cartão clicável que não leva a
                    lugar nenhum é pior que um cartão apagado. */}
                {active ? (
                  <Link href={`/${experiment.id}`} className="block h-full">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-14 max-w-2xl">
        <SectionTitle>Por que</SectionTitle>
        <p className="mt-4 text-[14px] leading-relaxed text-denim">
          O Jusq&apos;s não tem uma finalidade única e não pretende ser finalizado. A
          ideia é transformar{' '}
          <span className="text-sky">&ldquo;seria legal fazer isso&rdquo;</span> em{' '}
          <span className="text-sky">&ldquo;vou descobrir como&rdquo;</span>, e
          documentar o que quebrou no caminho.
        </p>
      </section>
    </div>
  );
}
