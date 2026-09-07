'use client';

import { useEffect, useState } from 'react';

import { getSignalingUrl } from '@/lib/ice';
import { StatusDot } from '@/components/ui';

/**
 * Estado do servidor de signaling.
 *
 * Consome o `GET /health` que já existia — o item "Status do sistema" do
 * roadmap não pedia infraestrutura nova, só mostrar o que o servidor já
 * responde.
 *
 * Os números são **instantâneos**: reiniciou, zerou. Histórico exigiria banco,
 * e a decisão de adiá-lo está no ADR-003, com este painel como um dos gatilhos
 * de reabertura.
 */

interface Health {
  status: string;
  uptime: number;
  rooms: number;
  peers: number;
}

/** Deriva a URL HTTP a partir da de WebSocket — é o mesmo servidor. */
function healthUrl(): string {
  return getSignalingUrl().replace(/^ws/, 'http').replace(/\/ws$/, '') + '/health';
}

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    // Silencioso de propósito: o painel some quando o servidor não responde.
    // Uma home que exibe erro de infraestrutura para o visitante troca uma
    // informação secundária por um ruído que ele não pode resolver.
    fetch(healthUrl(), { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Health>) : null))
      .then(setHealth)
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  if (!health) return null;

  const busy = health.peers > 0;

  return (
    <span className="flex items-center gap-2 text-[12px] text-denim/70">
      <StatusDot className={busy ? 'bg-lilac-soft' : 'bg-denim/50'} />
      {busy
        ? `${health.rooms} ${health.rooms === 1 ? 'sala ativa' : 'salas ativas'} · ${health.peers} online`
        : 'servidor online'}
    </span>
  );
}
