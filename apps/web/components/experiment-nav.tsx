'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { EXPERIMENTS, findExperiment } from '@/lib/experiments';

/**
 * Onde você está, dentro de qual experimento.
 *
 * Sai do registro em vez de ser escrito à mão: adicionar um experimento é
 * acrescentar uma entrada em `experiments.ts`, e a navegação acompanha sozinha.
 *
 * Cliente porque depende da rota atual. É o único pedaço do cabeçalho que
 * precisa disso, o resto do layout continua servido do servidor.
 */
export function ExperimentNav() {
  const pathname = usePathname();

  // `/screen-lab/abc123` → `screen-lab`. O segundo segmento é da sala, e o
  // cabeçalho fala do experimento, não de onde dentro dele você está.
  const slug = pathname.split('/')[1] ?? '';
  const current = findExperiment(slug);

  if (!current) {
    return (
      <span className="text-[12px] text-denim/60">
        {EXPERIMENTS.length} experimentos
      </span>
    );
  }

  return (
    <nav className="flex items-center gap-2 text-[12px]">
      <Link
        href={`/${current.id}`}
        className="rounded-full border border-line px-3 py-1 font-medium text-denim transition-colors hover:border-denim/60 hover:text-sky"
      >
        {current.name}
      </Link>
      <span className="font-mono text-denim/50">{current.number}</span>
    </nav>
  );
}
