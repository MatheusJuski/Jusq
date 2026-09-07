import type { PeerId, PeerInfo, RoomId, ServerMessage } from '@jusqs/types';
import { MAX_PEERS_PER_ROOM } from '@jusqs/types';

/**
 * Um participante conectado.
 *
 * `send` é injetado pelo transporte para que este módulo não conheça
 * WebSocket — o que o torna testável sem abrir socket nenhum.
 */
export interface Peer {
  readonly id: PeerId;
  readonly roomId: RoomId;
  /** Escolhido por quem entra, e mutável durante a sessão. */
  name: string;
  send(message: ServerMessage): void;
}

export type JoinResult =
  { ok: true; peers: PeerInfo[] } | { ok: false; reason: string };

/**
 * Registro de salas em memória.
 *
 * V0 por definição: reiniciar o processo derruba todas as salas.
 * Persistência entra na Phase 1, quando houver motivo real para ela.
 */
export class RoomRegistry {
  readonly #rooms = new Map<RoomId, Map<PeerId, Peer>>();
  readonly #peerRoom = new Map<PeerId, RoomId>();

  join(peer: Peer): JoinResult {
    if (this.#peerRoom.has(peer.id)) {
      return { ok: false, reason: 'peer já está em uma sala' };
    }

    let room = this.#rooms.get(peer.roomId);
    if (!room) {
      room = new Map();
      this.#rooms.set(peer.roomId, room);
    }

    if (room.size >= MAX_PEERS_PER_ROOM) {
      // Sala vazia recém-criada nunca cai aqui, então não há lixo a limpar.
      return { ok: false, reason: `sala cheia (máximo ${MAX_PEERS_PER_ROOM})` };
    }

    // Capturado ANTES da inserção: quem chega não deve se ver na lista.
    const existing: PeerInfo[] = [...room.values()].map((p) => ({
      id: p.id,
      name: p.name,
    }));

    room.set(peer.id, peer);
    this.#peerRoom.set(peer.id, peer.roomId);

    return { ok: true, peers: existing };
  }

  leave(peerId: PeerId): RoomId | undefined {
    const roomId = this.#peerRoom.get(peerId);
    if (roomId === undefined) return undefined;

    this.#peerRoom.delete(peerId);

    const room = this.#rooms.get(roomId);
    if (room) {
      room.delete(peerId);
      // Sala vazia é removida para o Map não virar um vazamento lento.
      if (room.size === 0) this.#rooms.delete(roomId);
    }

    return roomId;
  }

  /**
   * Troca o nome de um peer já na sala.
   *
   * Devolve a sala para quem chamou avisar os outros — o registro não fala com
   * ninguém por conta própria.
   */
  rename(peerId: PeerId, name: string): RoomId | undefined {
    const roomId = this.#peerRoom.get(peerId);
    if (roomId === undefined) return undefined;

    const peer = this.#rooms.get(roomId)?.get(peerId);
    if (!peer) return undefined;

    peer.name = name;
    return roomId;
  }

  /** Resolve um peer somente dentro da sala de quem pergunta. */
  peerInSameRoom(askerId: PeerId, targetId: PeerId): Peer | undefined {
    const roomId = this.#peerRoom.get(askerId);
    if (roomId === undefined) return undefined;
    return this.#rooms.get(roomId)?.get(targetId);
  }

  broadcast(roomId: RoomId, message: ServerMessage, exceptPeerId?: PeerId): void {
    const room = this.#rooms.get(roomId);
    if (!room) return;

    for (const peer of room.values()) {
      if (peer.id === exceptPeerId) continue;
      peer.send(message);
    }
  }

  stats(): { rooms: number; peers: number } {
    return { rooms: this.#rooms.size, peers: this.#peerRoom.size };
  }
}
