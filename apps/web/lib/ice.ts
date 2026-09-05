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

/**
 * URL do servidor de signaling.
 *
 * Valida em vez de confiar, porque os erros aqui são silenciosos e caros: uma
 * string sem esquema (`wss://`) não falha — o browser a trata como caminho
 * relativo e tenta abrir um WebSocket contra a própria página, produzindo um
 * erro que aponta para o lugar errado.
 *
 * Lança em vez de retornar um fallback: `RoomClient.connect` captura e mostra
 * a mensagem no painel de diagnóstico.
 *
 * A expressão `process.env.NEXT_PUBLIC_...` precisa aparecer inteira e literal
 * — é assim que o Next substitui o valor no build. Desestruturar quebra isso.
 */
export function getSignalingUrl(): string {
  const url = process.env.NEXT_PUBLIC_SIGNALING_URL;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_SIGNALING_URL não foi definida no build. ' +
          'Configure na Vercel e refaça o deploy — a variável é embutida no ' +
          'build, não lida em runtime.',
      );
    }
    return 'ws://localhost:3001/ws';
  }

  if (!/^wss?:\/\//.test(url)) {
    throw new Error(
      `NEXT_PUBLIC_SIGNALING_URL inválida: "${url}". ` +
        'Deve começar com wss:// (produção) ou ws:// (local) e terminar em /ws. ' +
        'Confira se o valor não foi trocado pelo nome da variável.',
    );
  }

  return url;
}
