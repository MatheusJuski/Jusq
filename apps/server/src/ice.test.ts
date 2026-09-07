import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ServerEnv } from '@jusqs/config';

import { buildIceConfig } from './ice.js';

const BASE: ServerEnv = {
  NODE_ENV: 'test',
  PORT: 3001,
  HOST: '0.0.0.0',
  CORS_ORIGIN: ['http://localhost:3000'],
  LOG_LEVEL: 'silent',
  STUN_URLS: ['stun:stun.exemplo.com:19302'],
  TURN_TTL_SECONDS: 3600,
};

/** Instante fixo: credencial derivada precisa ser verificável, não aproximada. */
const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
const NOW_SECONDS = Math.floor(NOW / 1000);

describe('buildIceConfig', () => {
  describe('sem TURN', () => {
    it('serve só o STUN configurado', () => {
      expect(buildIceConfig(BASE, NOW)).toEqual({
        iceServers: [{ urls: ['stun:stun.exemplo.com:19302'] }],
        ttl: null,
      });
    });

    it('não inventa credencial', () => {
      const [stun] = buildIceConfig(BASE, NOW).iceServers;

      expect(stun).not.toHaveProperty('username');
      expect(stun).not.toHaveProperty('credential');
    });
  });

  describe('credencial derivada (TURN_SECRET)', () => {
    const env: ServerEnv = {
      ...BASE,
      TURN_URLS: ['turn:turn.exemplo.com:3478?transport=udp'],
      TURN_SECRET: 'segredo-de-teste',
    };

    it('mantém o STUN e acrescenta o TURN', () => {
      const { iceServers } = buildIceConfig(env, NOW);

      expect(iceServers).toHaveLength(2);
      expect(iceServers[0]).toEqual({ urls: ['stun:stun.exemplo.com:19302'] });
      expect(iceServers[1]?.urls).toEqual(['turn:turn.exemplo.com:3478?transport=udp']);
    });

    it('usa o formato do TURN REST API: <expiração>:<nome>', () => {
      const turn = buildIceConfig(env, NOW).iceServers[1];

      expect(turn?.username).toBe(`${NOW_SECONDS + 3600}:jusqs`);
    });

    it('deriva a senha como HMAC-SHA1 do usuário, em base64', () => {
      // O coturn recalcula exatamente isto para validar. Hex passaria pelo
      // nosso código e falharia a autenticação no servidor TURN.
      const turn = buildIceConfig(env, NOW).iceServers[1];
      const esperado = createHmac('sha1', 'segredo-de-teste')
        .update(`${NOW_SECONDS + 3600}:jusqs`)
        .digest('base64');

      expect(turn?.credential).toBe(esperado);
    });

    it('a expiração acompanha o relógio', () => {
      const depois = buildIceConfig(env, NOW + 60_000).iceServers[1];

      expect(depois?.username).toBe(`${NOW_SECONDS + 60 + 3600}:jusqs`);
    });

    it('respeita o TTL configurado e o informa ao cliente', () => {
      const curto = { ...env, TURN_TTL_SECONDS: 300 };
      const config = buildIceConfig(curto, NOW);

      expect(config.ttl).toBe(300);
      expect(config.iceServers[1]?.username).toBe(`${NOW_SECONDS + 300}:jusqs`);
    });

    it('senhas de segredos diferentes não colidem', () => {
      const outro = buildIceConfig({ ...env, TURN_SECRET: 'outro' }, NOW);

      expect(outro.iceServers[1]?.credential).not.toBe(
        buildIceConfig(env, NOW).iceServers[1]?.credential,
      );
    });
  });

  describe('credencial fixa', () => {
    const env: ServerEnv = {
      ...BASE,
      TURN_URLS: ['turns:turn.exemplo.com:5349'],
      TURN_USERNAME: 'usuario',
      TURN_PASSWORD: 'senha',
    };

    it('repassa usuário e senha como vieram', () => {
      expect(buildIceConfig(env, NOW).iceServers[1]).toEqual({
        urls: ['turns:turn.exemplo.com:5349'],
        username: 'usuario',
        credential: 'senha',
      });
    });

    it('não anuncia validade — esta credencial não expira', () => {
      expect(buildIceConfig(env, NOW).ttl).toBeNull();
    });
  });

  it('preserva a ordem e a quantidade de URLs de TURN', () => {
    const urls = ['turn:a.exemplo.com:3478', 'turns:b.exemplo.com:5349'];
    const config = buildIceConfig({ ...BASE, TURN_URLS: urls, TURN_SECRET: 's' }, NOW);

    expect(config.iceServers[1]?.urls).toEqual(urls);
  });
});
