/**
 * Contrato de signaling do Jusq's.
 *
 * Este pacote é a única fonte de verdade sobre o formato das mensagens
 * trocadas entre `apps/web` e `apps/server`. Alterar algo aqui quebra o
 * typecheck dos dois lados de propósito.
 *
 * O servidor nunca interpreta o conteúdo de `SignalPayload` — ele apenas
 * repassa de um peer para outro. Toda a negociação WebRTC acontece nos
 * browsers.
 */

/** Identificador efêmero de um participante. Vive enquanto o socket viver. */
export type PeerId = string;

/** Identificador de uma sala. É o que vai na URL compartilhável. */
export type RoomId = string;

/* -------------------------------------------------------------------------- */
/* Payload WebRTC                                                             */
/* -------------------------------------------------------------------------- */

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInitLike };

/**
 * Espelha `RTCIceCandidateInit` do DOM.
 *
 * Declarado à mão porque o servidor roda em Node e não carrega as libs de DOM.
 */
export interface RTCIceCandidateInitLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Cliente -> Servidor                                                        */
/* -------------------------------------------------------------------------- */

export type ClientMessage =
  /** Primeira mensagem do socket. Entra na sala e recebe a lista de peers. */
  | { type: 'join'; roomId: RoomId }
  /** Encaminha um payload WebRTC para um peer específico da mesma sala. */
  | { type: 'signal'; to: PeerId; payload: SignalPayload };

/* -------------------------------------------------------------------------- */
/* Servidor -> Cliente                                                        */
/* -------------------------------------------------------------------------- */

export type ServerMessage =
  /**
   * Confirmação do join.
   *
   * `peers` contém quem JÁ estava na sala. Convenção do V0: quem chega é
   * passivo — quem já estava é que inicia a oferta. Isso evita glare
   * (dois lados ofertando ao mesmo tempo) sem precisar de perfect negotiation.
   */
  | { type: 'joined'; peerId: PeerId; roomId: RoomId; peers: PeerId[] }
  | { type: 'peer-joined'; peerId: PeerId }
  | { type: 'peer-left'; peerId: PeerId }
  | { type: 'signal'; from: PeerId; payload: SignalPayload }
  | { type: 'error'; message: string };

/* -------------------------------------------------------------------------- */
/* Limites do V0                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mesh puro: cada peer abre uma conexão com cada outro peer.
 * O custo cresce em O(n²), por isso o teto baixo.
 * Superar isso exige um SFU — Phase 3.
 */
export const MAX_PEERS_PER_ROOM = 6;

/** Descarta mensagens absurdas antes de tentar fazer parse. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
