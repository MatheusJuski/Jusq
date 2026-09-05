import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import type { PeerId, ServerMessage } from '@jusqs/types';
import { MAX_MESSAGE_BYTES } from '@jusqs/types';

import { parseClientMessage } from './protocol.js';
import { RoomRegistry } from './rooms.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const CORS_ORIGIN = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Configuração do transport de log.
 *
 * `pino-pretty` é devDependency e **não existe** no bundle de produção. Pedir
 * o transport sem que o módulo esteja instalável derruba o Fastify no boot
 * (`unable to determine transport target`), antes de qualquer log útil.
 *
 * Por isso a decisão é por disponibilidade, não só por `NODE_ENV`: o Render
 * não define `NODE_ENV` em serviços Docker, e um deploy não deveria depender
 * de alguém lembrar de configurar uma variável para o processo subir.
 */
function logTransport(): { target: string; options: object } | undefined {
  if (process.env['NODE_ENV'] === 'production') return undefined;

  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } };
  } catch {
    // Rodando a partir do bundle, sem node_modules: JSON puro serve.
    return undefined;
  }
}

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'info',
    transport: logTransport(),
  },
});

const rooms = new RoomRegistry();

await app.register(cors, { origin: CORS_ORIGIN });
await app.register(websocket, {
  options: { maxPayload: MAX_MESSAGE_BYTES },
});

/** Health check. Também é o que acorda o serviço em plataformas scale-to-zero. */
app.get('/health', () => ({
  status: 'ok',
  uptime: Math.floor(process.uptime()),
  ...rooms.stats(),
}));

app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket) => {
    const peerId: PeerId = randomUUID();
    let joined = false;

    const send = (message: ServerMessage): void => {
      // readyState 1 = OPEN. Escrever em socket fechando lança exceção.
      if (socket.readyState !== 1) return;
      socket.send(JSON.stringify(message));
    };

    const fail = (message: string): void => {
      send({ type: 'error', message });
      socket.close(1008, message);
    };

    socket.on('message', (raw: Buffer) => {
      if (raw.byteLength > MAX_MESSAGE_BYTES) {
        fail('mensagem grande demais');
        return;
      }

      const message = parseClientMessage(raw.toString('utf8'));
      if (!message) {
        fail('mensagem inválida');
        return;
      }

      switch (message.type) {
        case 'join': {
          if (joined) {
            fail('join duplicado');
            return;
          }

          const result = rooms.join({
            id: peerId,
            roomId: message.roomId,
            send,
          });

          if (!result.ok) {
            fail(result.reason);
            return;
          }

          joined = true;
          app.log.info({ peerId, roomId: message.roomId }, 'peer entrou');

          send({
            type: 'joined',
            peerId,
            roomId: message.roomId,
            peers: result.peers,
          });

          // Quem já estava é notificado e — por convenção do protocolo —
          // é quem inicia a oferta. Evita glare sem perfect negotiation.
          rooms.broadcast(message.roomId, { type: 'peer-joined', peerId }, peerId);
          return;
        }

        case 'signal': {
          if (!joined) {
            fail('signal antes de join');
            return;
          }

          const target = rooms.peerInSameRoom(peerId, message.to);
          // Peer que saiu no meio da negociação é comum, não é erro:
          // descartar em silêncio evita derrubar a conexão de quem ficou.
          if (!target) return;

          // LOG_LEVEL=debug mostra a negociação inteira. É a primeira coisa a
          // olhar quando a tela não aparece: sem offer/answer aqui, o problema
          // é no cliente; com eles, o problema é ICE/rede.
          app.log.debug(
            { from: peerId, to: message.to, kind: message.payload.kind },
            'signal',
          );

          target.send({ type: 'signal', from: peerId, payload: message.payload });
          return;
        }
      }
    });

    socket.on('close', () => {
      const roomId = rooms.leave(peerId);
      if (roomId === undefined) return;

      app.log.info({ peerId, roomId }, 'peer saiu');
      rooms.broadcast(roomId, { type: 'peer-left', peerId });
    });

    socket.on('error', (error: Error) => {
      app.log.warn({ peerId, err: error.message }, 'erro no socket');
    });
  });
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
