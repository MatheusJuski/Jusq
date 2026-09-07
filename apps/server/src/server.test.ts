import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import type { ServerEnv } from '@jusqs/config';
import type { ClientMessage, IceConfigResponse, ServerMessage } from '@jusqs/types';

import { buildServer, type JusqsServer } from './server.js';

/**
 * Teste de integração do signaling.
 *
 * Sobe o servidor de verdade em porta efêmera e conversa com ele por WebSocket
 * de verdade. Os testes de `rooms.ts` e `protocol.ts` cobrem as peças; o que só
 * aparece aqui é a costura entre elas — quem recebe o quê, em que ordem, e o
 * que acontece com a conexão quando a mensagem é inválida.
 */

const TEST_ENV: ServerEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  CORS_ORIGIN: ['http://localhost:3000'],
  LOG_LEVEL: 'silent',
  STUN_URLS: ['stun:stun.exemplo.com:19302'],
  TURN_TTL_SECONDS: 3600,
};

/** Estreita uma `ServerMessage` para uma variante, falhando o teste se não for. */
function expectMessage<T extends ServerMessage['type']>(
  message: ServerMessage,
  type: T,
): Extract<ServerMessage, { type: T }> {
  expect(message.type).toBe(type);
  return message as Extract<ServerMessage, { type: T }>;
}

/**
 * Cliente WebSocket com fila.
 *
 * A fila importa: sem ela, uma mensagem que chega antes do `await` se perde, e
 * o teste falha por corrida em vez de por comportamento.
 */
function createClient(url: string) {
  const socket = new WebSocket(url);
  const queue: ServerMessage[] = [];
  const waiting: ((message: ServerMessage) => void)[] = [];

  socket.on('message', (raw: Buffer) => {
    const message = JSON.parse(raw.toString('utf8')) as ServerMessage;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });

  return {
    socket,

    open(): Promise<void> {
      return new Promise((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
      });
    },

    send(message: ClientMessage): void {
      socket.send(JSON.stringify(message));
    },

    sendRaw(raw: string): void {
      socket.send(raw);
    },

    /** Próxima mensagem. Rejeita no timeout — silêncio também é resultado. */
    next(timeoutMs = 1000): Promise<ServerMessage> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timeout esperando mensagem')),
          timeoutMs,
        );
        waiting.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },

    closed(): Promise<number> {
      return new Promise((resolve) => socket.once('close', resolve));
    },

    /** Entra numa sala e devolve o próprio peerId. */
    async join(roomId: string, name = 'teste'): Promise<string> {
      this.send({ type: 'join', roomId, name });
      return expectMessage(await this.next(), 'joined').peerId;
    },
  };
}

type Client = ReturnType<typeof createClient>;

describe('servidor de signaling', () => {
  let app: JusqsServer;
  let wsUrl: string;
  let clients: Client[] = [];

  beforeEach(async () => {
    app = await buildServer(TEST_ENV);
    // Porta 0: o SO escolhe uma livre. Suítes em paralelo não colidem.
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    wsUrl = `${address.replace('http://', 'ws://')}/ws`;
    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) client.socket.close();
    clients = [];
    await app.close();
  });

  async function connect(): Promise<Client> {
    const client = createClient(wsUrl);
    clients.push(client);
    await client.open();
    return client;
  }

  async function health(): Promise<unknown> {
    return (await app.inject({ method: 'GET', url: '/health' })).json();
  }

  describe('/health', () => {
    it('responde ok e conta o que existe', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'ok', rooms: 0, peers: 0 });
    });

    it('reflete peers conectados — é assim que se vê a sala de fora', async () => {
      const client = await connect();
      await client.join('sala-1');

      expect(await health()).toMatchObject({ rooms: 1, peers: 1 });
    });
  });

  describe('/ice', () => {
    it('entrega a configuração que o cliente usa para montar o peer', async () => {
      const response = await app.inject({ method: 'GET', url: '/ice' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        iceServers: [{ urls: ['stun:stun.exemplo.com:19302'] }],
        ttl: null,
      });
    });

    it('proíbe cache — a credencial de TURN expira', async () => {
      const response = await app.inject({ method: 'GET', url: '/ice' });

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('emite credencial derivada quando há TURN configurado', async () => {
      const comTurn = await buildServer({
        ...TEST_ENV,
        TURN_URLS: ['turn:turn.exemplo.com:3478'],
        TURN_SECRET: 'segredo',
      });

      try {
        const config = (
          await comTurn.inject({ method: 'GET', url: '/ice' })
        ).json<IceConfigResponse>();

        expect(config.ttl).toBe(3600);
        expect(config.iceServers[1]).toMatchObject({
          urls: ['turn:turn.exemplo.com:3478'],
          username: expect.stringMatching(/^\d+:jusqs$/),
        });
      } finally {
        await comTurn.close();
      }
    });
  });

  describe('join', () => {
    it('devolve peerId e sala vazia para o primeiro a chegar', async () => {
      const client = await connect();

      client.send({ type: 'join', roomId: 'sala-1', name: 'teste' });
      const joined = expectMessage(await client.next(), 'joined');

      expect(joined.roomId).toBe('sala-1');
      expect(joined.peers).toEqual([]);
      expect(joined.peerId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('avisa quem já estava e entrega a lista a quem chega', async () => {
      const primeiro = await connect();
      const primeiroId = await primeiro.join('sala-1');

      const segundo = await connect();
      segundo.send({ type: 'join', roomId: 'sala-1', name: 'teste' });

      const joined = expectMessage(await segundo.next(), 'joined');
      expect(joined.peers).toEqual([{ id: primeiroId, name: 'teste' }]);

      // Quem já estava é quem inicia a oferta — por isso ele precisa do aviso.
      const aviso = expectMessage(await primeiro.next(), 'peer-joined');
      expect(aviso.peer.id).toBe(joined.peerId);
    });

    it('não vaza entre salas', async () => {
      const a = await connect();
      await a.join('sala-1');

      const b = await connect();
      await b.join('sala-2');

      await expect(a.next(200)).rejects.toThrow(/timeout/);
    });

    it('derruba join duplicado', async () => {
      const client = await connect();
      await client.join('sala-1');

      client.send({ type: 'join', roomId: 'sala-2', name: 'teste' });

      expect(expectMessage(await client.next(), 'error').message).toMatch(/duplicado/);
      expect(await client.closed()).toBe(1008);
    });
  });

  describe('signal', () => {
    it('entrega o payload ao destinatário, carimbado com a origem', async () => {
      const a = await connect();
      const aId = await a.join('sala-1');

      const b = await connect();
      const bId = await b.join('sala-1');
      await a.next(); // consome o peer-joined

      a.send({ type: 'signal', to: bId, payload: { kind: 'offer', sdp: 'v=0' } });

      const signal = expectMessage(await b.next(), 'signal');
      expect(signal.from).toBe(aId);
      expect(signal.payload).toEqual({ kind: 'offer', sdp: 'v=0' });
    });

    it('atravessa o payload sem interpretá-lo', async () => {
      const a = await connect();
      await a.join('sala-1');
      const b = await connect();
      const bId = await b.join('sala-1');
      await a.next();

      const candidate = {
        candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'abc',
      };
      a.send({ type: 'signal', to: bId, payload: { kind: 'ice', candidate } });

      expect(expectMessage(await b.next(), 'signal').payload).toEqual({
        kind: 'ice',
        candidate,
      });
    });

    it('descarta em silêncio o signal para peer de outra sala', async () => {
      const a = await connect();
      await a.join('sala-1');

      const b = await connect();
      const bId = await b.join('sala-2');

      a.send({ type: 'signal', to: bId, payload: { kind: 'offer', sdp: 'v=0' } });

      // Nem entrega, nem erro: peer que sumiu no meio da negociação é rotina,
      // e derrubar a conexão de quem ficou seria pior do que ignorar.
      await expect(b.next(200)).rejects.toThrow(/timeout/);
      await expect(a.next(200)).rejects.toThrow(/timeout/);
      expect(a.socket.readyState).toBe(WebSocket.OPEN);
    });

    it('derruba signal antes de join', async () => {
      const client = await connect();

      client.send({
        type: 'signal',
        to: 'qualquer',
        payload: { kind: 'offer', sdp: 'v=0' },
      });

      expect(expectMessage(await client.next(), 'error').message).toMatch(
        /antes de join/,
      );
      expect(await client.closed()).toBe(1008);
    });
  });

  describe('mensagem inválida', () => {
    it.each([
      ['JSON quebrado', '{'],
      ['tipo desconhecido', '{"type":"tchau"}'],
      ['join sem roomId', '{"type":"join"}'],
    ])('derruba a conexão em %s', async (_caso, raw) => {
      const client = await connect();

      client.sendRaw(raw);

      expect(expectMessage(await client.next(), 'error').message).toMatch(/inválida/);
      expect(await client.closed()).toBe(1008);
    });
  });

  describe('saída', () => {
    it('avisa a sala quando alguém desconecta', async () => {
      const a = await connect();
      await a.join('sala-1');

      const b = await connect();
      const bId = await b.join('sala-1');
      await a.next(); // consome o peer-joined

      b.socket.close();

      expect(expectMessage(await a.next(), 'peer-left').peerId).toBe(bId);
    });

    it('libera a sala quando o último sai', async () => {
      const a = await connect();
      await a.join('sala-1');

      // Um segundo peer serve de sonda: ele recebe o peer-left, e é isso que
      // marca o momento em que o servidor já processou a desconexão.
      const b = await connect();
      await b.join('sala-1');
      await a.next();

      a.socket.close();
      await b.next();
      b.socket.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(await health()).toMatchObject({ rooms: 0, peers: 0 });
    });
  });
});
