import { describe, expect, it } from 'vitest';

import type { PeerId, RoomId, ServerMessage } from '@jusqs/types';
import { MAX_PEERS_PER_ROOM } from '@jusqs/types';

import { RoomRegistry, type Peer } from './rooms.js';

/**
 * Peer de teste.
 *
 * `RoomRegistry` recebe `send` injetado justamente para que o teste não
 * precise abrir socket nenhum — a caixa de mensagens abaixo é todo o
 * transporte de que estes testes precisam.
 */
function fakePeer(id: PeerId, roomId: RoomId): Peer & { inbox: ServerMessage[] } {
  const inbox: ServerMessage[] = [];
  return {
    id,
    roomId,
    inbox,
    send: (message) => inbox.push(message),
  };
}

describe('RoomRegistry', () => {
  it('aceita o primeiro peer e entrega uma sala vazia', () => {
    const rooms = new RoomRegistry();

    const result = rooms.join(fakePeer('a', 'sala-1'));

    expect(result).toEqual({ ok: true, peers: [] });
    expect(rooms.stats()).toEqual({ rooms: 1, peers: 1 });
  });

  it('entrega a quem chega a lista de quem já estava, sem incluir ele mesmo', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));
    rooms.join(fakePeer('b', 'sala-1'));

    const result = rooms.join(fakePeer('c', 'sala-1'));

    expect(result).toEqual({ ok: true, peers: ['a', 'b'] });
  });

  it('recusa o mesmo peer entrando duas vezes', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));

    const result = rooms.join(fakePeer('a', 'sala-2'));

    expect(result.ok).toBe(false);
    expect(rooms.stats()).toEqual({ rooms: 1, peers: 1 });
  });

  it('recusa quando a sala está cheia, sem afetar quem já está dentro', () => {
    const rooms = new RoomRegistry();
    for (let i = 0; i < MAX_PEERS_PER_ROOM; i++) {
      expect(rooms.join(fakePeer(`p${i}`, 'sala-1')).ok).toBe(true);
    }

    const result = rooms.join(fakePeer('excedente', 'sala-1'));

    expect(result).toEqual({
      ok: false,
      reason: `sala cheia (máximo ${MAX_PEERS_PER_ROOM})`,
    });
    expect(rooms.stats()).toEqual({ rooms: 1, peers: MAX_PEERS_PER_ROOM });
  });

  it('salas diferentes não se enxergam', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));

    const result = rooms.join(fakePeer('b', 'sala-2'));

    expect(result).toEqual({ ok: true, peers: [] });
    expect(rooms.stats()).toEqual({ rooms: 2, peers: 2 });
  });

  it('leave devolve a sala de origem', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));
    rooms.join(fakePeer('b', 'sala-1'));

    expect(rooms.leave('a')).toBe('sala-1');
    expect(rooms.stats()).toEqual({ rooms: 1, peers: 1 });
  });

  it('leave de peer desconhecido é silencioso', () => {
    const rooms = new RoomRegistry();

    expect(rooms.leave('fantasma')).toBeUndefined();
  });

  it('sala vazia é removida — o Map não pode virar vazamento lento', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));
    rooms.leave('a');

    expect(rooms.stats()).toEqual({ rooms: 0, peers: 0 });
  });

  it('peer que saiu pode entrar de novo', () => {
    const rooms = new RoomRegistry();
    rooms.join(fakePeer('a', 'sala-1'));
    rooms.leave('a');

    expect(rooms.join(fakePeer('a', 'sala-2')).ok).toBe(true);
  });

  describe('peerInSameRoom', () => {
    it('resolve um peer da mesma sala', () => {
      const rooms = new RoomRegistry();
      rooms.join(fakePeer('a', 'sala-1'));
      rooms.join(fakePeer('b', 'sala-1'));

      expect(rooms.peerInSameRoom('a', 'b')?.id).toBe('b');
    });

    it('não atravessa a fronteira da sala', () => {
      const rooms = new RoomRegistry();
      rooms.join(fakePeer('a', 'sala-1'));
      rooms.join(fakePeer('b', 'sala-2'));

      expect(rooms.peerInSameRoom('a', 'b')).toBeUndefined();
    });

    it('não resolve nada para quem não entrou', () => {
      const rooms = new RoomRegistry();
      rooms.join(fakePeer('b', 'sala-1'));

      expect(rooms.peerInSameRoom('fantasma', 'b')).toBeUndefined();
    });
  });

  describe('broadcast', () => {
    it('entrega a todos da sala', () => {
      const rooms = new RoomRegistry();
      const a = fakePeer('a', 'sala-1');
      const b = fakePeer('b', 'sala-1');
      rooms.join(a);
      rooms.join(b);

      rooms.broadcast('sala-1', { type: 'peer-left', peerId: 'z' });

      expect(a.inbox).toEqual([{ type: 'peer-left', peerId: 'z' }]);
      expect(b.inbox).toEqual([{ type: 'peer-left', peerId: 'z' }]);
    });

    it('pula o peer excluído — quem entra não é avisado da própria entrada', () => {
      const rooms = new RoomRegistry();
      const a = fakePeer('a', 'sala-1');
      const b = fakePeer('b', 'sala-1');
      rooms.join(a);
      rooms.join(b);

      rooms.broadcast('sala-1', { type: 'peer-joined', peerId: 'b' }, 'b');

      expect(a.inbox).toHaveLength(1);
      expect(b.inbox).toHaveLength(0);
    });

    it('não vaza para outra sala', () => {
      const rooms = new RoomRegistry();
      const a = fakePeer('a', 'sala-1');
      const b = fakePeer('b', 'sala-2');
      rooms.join(a);
      rooms.join(b);

      rooms.broadcast('sala-1', { type: 'peer-left', peerId: 'z' });

      expect(b.inbox).toHaveLength(0);
    });

    it('sala inexistente é no-op', () => {
      const rooms = new RoomRegistry();

      expect(() =>
        rooms.broadcast('nao-existe', { type: 'peer-left', peerId: 'z' }),
      ).not.toThrow();
    });
  });
});
