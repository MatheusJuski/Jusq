import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IceConfigResponse } from '@jusqs/types';

import { fetchIceServers, getIceEndpoint } from './ice';

/**
 * `getSignalingUrl` cai no padrão de desenvolvimento quando
 * `NEXT_PUBLIC_SIGNALING_URL` não está definida, e é assim que o teste roda,
 * sem depender de variável de ambiente nenhuma.
 */
const PADRAO = 'http://localhost:3001/ice';

const STUN_PUBLICO = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function stubFetch(implementation: () => Promise<unknown>): void {
  vi.stubGlobal('fetch', vi.fn(implementation));
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Sem isto, o `stubEnv` de um teste decide a URL do próximo.
  vi.unstubAllEnvs();
});

describe('getIceEndpoint', () => {
  it('deriva o endpoint da URL de signaling', () => {
    expect(getIceEndpoint()).toBe(PADRAO);
  });

  it.each([
    ['ws://localhost:3001/ws', 'http://localhost:3001/ice'],
    ['wss://jusqs.onrender.com/ws', 'https://jusqs.onrender.com/ice'],
    // Sem o sufixo /ws: o endpoint ainda tem que sair no lugar certo.
    ['wss://jusqs.onrender.com/', 'https://jusqs.onrender.com/ice'],
  ])('%s → %s', (signaling, esperado) => {
    vi.stubEnv('NEXT_PUBLIC_SIGNALING_URL', signaling);

    expect(getIceEndpoint()).toBe(esperado);
  });

  it('wss vira https, página HTTPS não pode buscar em HTTP', () => {
    vi.stubEnv('NEXT_PUBLIC_SIGNALING_URL', 'wss://jusqs.onrender.com/ws');

    // Conteúdo misto seria bloqueado pelo browser, e o erro reportado não
    // diria que a causa foi o esquema.
    expect(getIceEndpoint()).toMatch(/^https:/);
  });
});

describe('fetchIceServers', () => {
  it('devolve o que o servidor mandou', async () => {
    const config: IceConfigResponse = {
      iceServers: [
        { urls: ['stun:stun.exemplo.com:19302'] },
        {
          urls: ['turn:turn.exemplo.com:3478'],
          username: '123:jusqs',
          credential: 'x',
        },
      ],
      ttl: 3600,
    };
    stubFetch(() => Promise.resolve(jsonResponse(config)));

    expect(await fetchIceServers()).toEqual(config.iceServers);
  });

  it('busca sem cache, a credencial expira', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ iceServers: [{ urls: ['stun:x'] }], ttl: null })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchIceServers();

    expect(fetchMock).toHaveBeenCalledWith(PADRAO, { cache: 'no-store' });
  });

  describe('cai no STUN público em vez de falhar', () => {
    // Perder o TURN degrada a conexão em rede difícil. Perder a sala porque um
    // fetch falhou seria pior, e é o que aconteceria se isto rejeitasse.

    it('quando a rede falha', async () => {
      stubFetch(() => Promise.reject(new Error('offline')));

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });

    it('quando o servidor responde erro', async () => {
      stubFetch(() => Promise.resolve(jsonResponse({}, false)));

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });

    it('quando a resposta não é JSON', async () => {
      stubFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('unexpected token')),
        } as Response),
      );

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });

    it('quando a lista vem vazia', async () => {
      stubFetch(() => Promise.resolve(jsonResponse({ iceServers: [], ttl: null })));

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });

    it('quando a resposta tem outro formato, servidor antigo', async () => {
      stubFetch(() => Promise.resolve(jsonResponse({ servers: 'nenhum' })));

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });

    it('quando a URL de signaling é inválida', async () => {
      vi.stubEnv('NEXT_PUBLIC_SIGNALING_URL', 'localhost:3001');
      stubFetch(() => Promise.reject(new Error('não deveria ser chamado')));

      expect(await fetchIceServers()).toEqual(STUN_PUBLICO);
    });
  });
});
