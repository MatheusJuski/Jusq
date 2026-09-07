import type {
  ClientMessage,
  RTCIceCandidateInitLike,
  SignalPayload,
} from '@jusqs/types';
import { DEFAULT_PEER_NAME, MAX_PEER_NAME_LENGTH } from '@jusqs/types';

/**
 * Validação manual do protocolo.
 *
 * Sem zod no V0 de propósito (Regra 1: nenhuma tecnologia sem motivo).
 * O protocolo tem duas mensagens — uma biblioteca de schema aqui seria
 * peso morto. Se ele crescer, a troca é local a este arquivo.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;
  const msg = value as Record<string, unknown>;

  switch (msg['type']) {
    case 'join':
      return isNonEmptyString(msg['roomId'])
        ? { type: 'join', roomId: msg['roomId'], name: parseName(msg['name']) }
        : null;

    case 'rename':
      return { type: 'rename', name: parseName(msg['name']) };

    case 'signal': {
      if (!isNonEmptyString(msg['to'])) return null;
      const payload = parseSignalPayload(msg['payload']);
      return payload ? { type: 'signal', to: msg['to'], payload } : null;
    }

    default:
      return null;
  }
}

/**
 * Sanea o nome exibido.
 *
 * Este é o único campo do protocolo que vai **direto para a tela de outra
 * pessoa**, então ele não é só validado — é reescrito para uma forma segura.
 * Nunca falha: nome ruim vira o padrão, e ninguém fica sem entrar na sala por
 * causa de um apelido.
 *
 * O corte por *code points* e não por `length` importa: `slice` em JavaScript
 * conta unidades UTF-16, e cortar no meio de um emoji produz um caractere
 * inválido na tela de todo mundo.
 */
function parseName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PEER_NAME;

  const cleaned = [...value]
    // Controles incluem quebra de linha e os bytes que quebram um layout de
    // uma linha; os zero-width (U+200B a U+200D) e o BOM (U+FEFF) sao
    // invisiveis e serviriam para fabricar um nome 'vazio' que ocupa espaco.
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
      if (code >= 0x200b && code <= 0x200d) return false;
      return code !== 0xfeff;
    })
    .slice(0, MAX_PEER_NAME_LENGTH)
    .join('')
    .trim();

  return cleaned.length > 0 ? cleaned : DEFAULT_PEER_NAME;
}

function parseSignalPayload(value: unknown): SignalPayload | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;

  switch (p['kind']) {
    case 'offer':
      return isNonEmptyString(p['sdp']) ? { kind: 'offer', sdp: p['sdp'] } : null;

    case 'answer':
      return isNonEmptyString(p['sdp']) ? { kind: 'answer', sdp: p['sdp'] } : null;

    case 'ice': {
      const candidate = parseIceCandidate(p['candidate']);
      return candidate ? { kind: 'ice', candidate } : null;
    }

    default:
      return null;
  }
}

/**
 * Valida apenas o que o repasse exige. O servidor não interpreta ICE —
 * quem julga a validade do candidato é o browser do outro lado.
 */
function parseIceCandidate(value: unknown): RTCIceCandidateInitLike | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;

  if (typeof c['candidate'] !== 'string') return null;

  return {
    candidate: c['candidate'],
    sdpMid: typeof c['sdpMid'] === 'string' ? c['sdpMid'] : null,
    sdpMLineIndex: typeof c['sdpMLineIndex'] === 'number' ? c['sdpMLineIndex'] : null,
    usernameFragment:
      typeof c['usernameFragment'] === 'string' ? c['usernameFragment'] : null,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
