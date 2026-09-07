/**
 * Contrato de signaling do Jusq's.
 *
 * Este pacote é a única fonte de verdade sobre o formato das mensagens
 * trocadas entre `apps/web` e `apps/server`. Alterar algo aqui quebra o
 * typecheck dos dois lados de propósito.
 *
 * O servidor nunca interpreta o conteúdo de `SignalPayload`, ele apenas
 * repassa de um peer para outro. Toda a negociação WebRTC acontece nos
 * browsers.
 */

/** Identificador efêmero de um participante. Vive enquanto o socket viver. */
export type PeerId = string;

/** Identificador de uma sala. É o que vai na URL compartilhável. */
export type RoomId = string;

/**
 * Um participante como os outros o veem.
 *
 * O `id` é do servidor e não muda; o `name` é escolhido por quem entra e pode
 * mudar a qualquer momento. Os dois andam juntos porque o nome sozinho não
 * identifica, duas pessoas podem escolher o mesmo.
 */
export interface PeerInfo {
  id: PeerId;
  name: string;
}

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
  | { type: 'join'; roomId: RoomId; name: string }
  /** Troca o nome durante a sessão, sem reconectar. */
  | { type: 'rename'; name: string }
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
   * passivo, quem já estava é que inicia a oferta. Isso evita glare
   * (dois lados ofertando ao mesmo tempo) sem precisar de perfect negotiation.
   */
  | { type: 'joined'; peerId: PeerId; roomId: RoomId; peers: PeerInfo[] }
  | { type: 'peer-joined'; peer: PeerInfo }
  | { type: 'peer-left'; peerId: PeerId }
  | { type: 'peer-renamed'; peerId: PeerId; name: string }
  | { type: 'signal'; from: PeerId; payload: SignalPayload }
  | { type: 'error'; message: string };

/* -------------------------------------------------------------------------- */
/* Limites do V0                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mesh puro: cada peer abre uma conexão com cada outro peer.
 * O custo cresce em O(n²), por isso o teto baixo.
 * Superar isso exige um SFU, Phase 3.
 */
export const MAX_PEERS_PER_ROOM = 6;

/** Descarta mensagens absurdas antes de tentar fazer parse. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Limite do nome exibido.
 *
 * Curto de propósito: o nome aparece no cabeçalho de um painel de vídeo, ao
 * lado dos controles. Um nome longo não é só feio, ele empurra os botões de
 * som e tela cheia para fora da tela.
 */
export const MAX_PEER_NAME_LENGTH = 24;

/** Nome de quem não escolheu nenhum. */
export const DEFAULT_PEER_NAME = 'anônimo';

/* -------------------------------------------------------------------------- */
/* Configuração de ICE                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Um servidor ICE, no formato que o `RTCPeerConnection` aceita.
 *
 * Declarado aqui e não importado do DOM porque o servidor é quem monta isto,
 * e ele roda em Node, sem `RTCIceServer`.
 */
export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * Resposta de `GET /ice`.
 *
 * O cliente pede esta configuração ao servidor em vez de carregá-la embutida
 * no bundle. O motivo é credencial: TURN exige usuário e senha, e qualquer
 * coisa embutida no JavaScript da página é pública por definição.
 */
export interface IceConfigResponse {
  iceServers: IceServerConfig[];
  /** Segundos até a credencial expirar. `null` quando não expira. */
  ttl: number | null;
}
