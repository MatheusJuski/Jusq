import type {
  ClientMessage,
  RTCIceCandidateInitLike,
  SignalPayload,
} from '@jusqs/types';

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
        ? { type: 'join', roomId: msg['roomId'] }
        : null;

    case 'signal': {
      if (!isNonEmptyString(msg['to'])) return null;
      const payload = parseSignalPayload(msg['payload']);
      return payload ? { type: 'signal', to: msg['to'], payload } : null;
    }

    default:
      return null;
  }
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
