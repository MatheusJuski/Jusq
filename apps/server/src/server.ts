import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';

import type { ServerEnv } from '@jusqs/config';
import { createLogger } from '@jusqs/logger';
import type { PeerId, ServerMessage } from '@jusqs/types';
import { MAX_MESSAGE_BYTES } from '@jusqs/types';

import { buildIceConfig } from './ice.js';
import { parseClientMessage } from './protocol.js';
import { RoomRegistry } from './rooms.js';

/**
 * Monta o servidor sem abrir porta nenhuma.
 *
 * Separado do boot de propósito: um módulo que escuta como efeito colateral do
 * `import` não pode ser testado — cada teste subiria um servidor de verdade na
 * mesma porta. Aqui o teste monta a aplicação, exercita o protocolo e derruba.
 *
 * O tipo de retorno é inferido, e não anotado como `FastifyInstance`: passar um
 * `loggerInstance` concreto especializa o tipo da instância, e a anotação
 * genérica deixaria de bater.
 */
export async function buildServer(env: ServerEnv) {
  const app = Fastify({
    loggerInstance: createLogger({ name: 'jusqs-server', level: env.LOG_LEVEL }),
  });

  const rooms = new RoomRegistry();

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(websocket, {
    options: { maxPayload: MAX_MESSAGE_BYTES },
  });

  /** Health check. Também é o que acorda o serviço em plataformas scale-to-zero. */
  app.get('/health', () => ({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    ...rooms.stats(),
  }));

  /**
   * Configuração de ICE para o cliente.
   *
   * `no-store` não é zelo: a credencial de TURN é derivada por requisição e
   * expira. Uma resposta guardada em cache entregaria credencial vencida, e o
   * sintoma seria uma conexão que falha só em rede difícil.
   */
  app.get('/ice', (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return buildIceConfig(env);
  });

  app.get('/ws', { websocket: true }, (socket) => {
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

  return app;
}

export type JusqsServer = Awaited<ReturnType<typeof buildServer>>;
