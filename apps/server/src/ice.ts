import { createHmac } from 'node:crypto';

import type { ServerEnv } from '@jusqs/config';
import type { IceConfigResponse, IceServerConfig } from '@jusqs/types';

/**
 * Montagem da configuração de ICE.
 *
 * ## Por que isto mora no servidor
 *
 * STUN é público e poderia perfeitamente viver no cliente. TURN não: ele exige
 * usuário e senha, e um servidor TURN é banda paga. Credencial embutida no
 * bundle do Next (`NEXT_PUBLIC_*`) é credencial publicada — qualquer pessoa
 * abre o DevTools e passa a usar o relay por conta da sua fatura.
 *
 * Por isso o cliente pergunta, e o servidor responde.
 *
 * ## Dois modos de credencial
 *
 * **Segredo compartilhado** (`TURN_SECRET`) é o preferido. É o TURN REST API
 * que o coturn implementa: usuário é `<expiração>:<nome>`, senha é o HMAC
 * disso com o segredo. O servidor TURN valida sem consultar banco nenhum,
 * porque a senha é derivável a partir do próprio usuário. Credencial vazada
 * vale até expirar, e só.
 *
 * **Credencial fixa** (`TURN_USERNAME` / `TURN_PASSWORD`) existe para provedor
 * que não oferece segredo compartilhado. Funciona e não expira — o que é
 * exatamente o problema.
 *
 * Nenhum provedor está codificado aqui. Trocar de Cloudflare para um coturn
 * numa VPS, ou o contrário, é mudança de variável de ambiente.
 */

/** Identifica o serviço no usuário derivado. Só ajuda a ler log de TURN. */
const CREDENTIAL_LABEL = 'jusqs';

export function buildIceConfig(
  env: ServerEnv,
  now: number = Date.now(),
): IceConfigResponse {
  const iceServers: IceServerConfig[] = [{ urls: [...env.STUN_URLS] }];

  if (!env.TURN_URLS) {
    return { iceServers, ttl: null };
  }

  const urls = [...env.TURN_URLS];

  if (env.TURN_SECRET) {
    const expiresAt = Math.floor(now / 1000) + env.TURN_TTL_SECONDS;
    const username = `${expiresAt}:${CREDENTIAL_LABEL}`;

    iceServers.push({
      urls,
      username,
      // Base64 de HMAC-SHA1, e não hex: é o que o TURN REST API especifica e o
      // que o coturn espera. Hex seria aceito como senha e falharia a auth.
      credential: createHmac('sha1', env.TURN_SECRET).update(username).digest('base64'),
    });

    return { iceServers, ttl: env.TURN_TTL_SECONDS };
  }

  if (env.TURN_USERNAME && env.TURN_PASSWORD) {
    iceServers.push({
      urls,
      username: env.TURN_USERNAME,
      credential: env.TURN_PASSWORD,
    });

    return { iceServers, ttl: null };
  }

  // Inalcançável: a validação de ambiente recusa TURN_URLS sem credencial.
  // Se chegar aqui, é melhor servir só STUN do que um TURN que não autentica.
  return { iceServers, ttl: null };
}
