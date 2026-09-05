/**
 * Configuração de ICE.
 *
 * V0 usa apenas STUN público — suficiente para a maioria das redes domésticas.
 * Em NAT simétrico e redes corporativas isso falha, e é exatamente essa falha
 * que justifica adicionar TURN na Phase 1 (Regra 1: nenhuma tecnologia sem
 * motivo). Não adicione TURN antes de ver a conexão falhar.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const extra = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (!extra) return servers;

  try {
    const parsed: unknown = JSON.parse(extra);
    if (Array.isArray(parsed)) servers.push(...(parsed as RTCIceServer[]));
  } catch {
    console.warn('NEXT_PUBLIC_ICE_SERVERS não é JSON válido; ignorando.');
  }

  return servers;
}

export function getSignalingUrl(): string {
  return process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'ws://localhost:3001/ws';
}
