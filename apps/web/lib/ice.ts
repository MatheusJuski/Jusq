import type { IceConfigResponse } from '@jusqs/types';

/**
 * STUN público. É o que resta quando o servidor não responde.
 *
 * Suficiente na maioria das redes domésticas; falha em NAT simétrico e em rede
 * corporativa, que é o problema que o TURN resolve.
 */
const FALLBACK_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Busca a configuração de ICE no servidor de signaling.
 *
 * ## Por que não vem do ambiente do build
 *
 * Até a Phase 1 isto era `NEXT_PUBLIC_ICE_SERVERS`, um JSON embutido no bundle.
 * Para STUN, tudo bem. Para TURN, não: `NEXT_PUBLIC_*` é substituído como texto
 * literal no JavaScript da página, e usuário e senha de TURN ficariam legíveis
 * para qualquer pessoa que abrisse o DevTools, usando banda paga.
 *
 * O servidor monta a lista, e as credenciais que ele emite expiram.
 *
 * ## Por que nunca rejeita
 *
 * Perder o TURN degrada a conexão em rede difícil. Perder a sala inteira porque
 * um `fetch` falhou seria pior. Qualquer falha aqui cai no STUN público, que é
 * o comportamento que a Phase 0 já tinha.
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  let endpoint: string;
  try {
    endpoint = getIceEndpoint();
  } catch {
    return FALLBACK_STUN;
  }

  try {
    const response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) return FALLBACK_STUN;

    const config = (await response.json()) as IceConfigResponse;
    const servers = config.iceServers;

    // Resposta vazia ou de formato inesperado é indistinguível de servidor
    // antigo. Em qualquer um dos casos o STUN público serve.
    if (!Array.isArray(servers) || servers.length === 0) return FALLBACK_STUN;

    // `IceServerConfig` é estruturalmente um `RTCIceServer`: sem conversão.
    return servers;
  } catch {
    return FALLBACK_STUN;
  }
}

/**
 * Deriva `.../ice` a partir da URL de signaling.
 *
 * Uma variável só, e não duas: separar `NEXT_PUBLIC_SIGNALING_URL` de uma
 * `NEXT_PUBLIC_API_URL` cria a chance de apontarem para servidores diferentes,
 * e o sintoma disso é credencial de TURN de um servidor sendo usada contra
 * outro, meses depois, em rede que ninguém consegue reproduzir.
 */
export function getIceEndpoint(): string {
  const url = new URL(getSignalingUrl());
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';

  // As duas trocas são necessárias: tirar o `/ws` deixa a raiz como `/`, e
  // concatenar `/ice` nela produziria `//ice`, que o Fastify serve como 404.
  const base = url.pathname.replace(/\/ws\/?$/, '').replace(/\/+$/, '');
  url.pathname = `${base}/ice`;

  return url.toString();
}

/**
 * URL do servidor de signaling.
 *
 * Valida em vez de confiar, porque os erros aqui são silenciosos e caros: uma
 * string sem esquema (`wss://`) não falha, o browser a trata como caminho
 * relativo e tenta abrir um WebSocket contra a própria página, produzindo um
 * erro que aponta para o lugar errado.
 *
 * Lança em vez de retornar um fallback: `RoomClient.connect` captura e mostra
 * a mensagem no painel de diagnóstico.
 *
 * A expressão `process.env.NEXT_PUBLIC_...` precisa aparecer inteira e literal,
 * é assim que o Next substitui o valor no build. Desestruturar quebra isso.
 */
export function getSignalingUrl(): string {
  const url = process.env.NEXT_PUBLIC_SIGNALING_URL;

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'NEXT_PUBLIC_SIGNALING_URL não foi definida no build. ' +
          'Configure na Vercel e refaça o deploy, a variável é embutida no ' +
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

  // Página HTTPS não abre WebSocket inseguro: o browser bloqueia como conteúdo
  // misto, e o erro que ele reporta não diz que a causa foi o esquema.
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('ws://')
  ) {
    throw new Error(
      `NEXT_PUBLIC_SIGNALING_URL usa ws:// numa página HTTPS: "${url}". ` +
        'O browser bloqueia conteúdo misto, troque para wss:// (só o "s").',
    );
  }

  return url;
}
