import { describe, expect, it } from 'vitest';

import { ConfigError, loadServerEnv } from './env.js';

describe('loadServerEnv', () => {
  it('sobe com ambiente vazio, clone novo do repositório roda com pnpm dev', () => {
    expect(loadServerEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      HOST: '0.0.0.0',
      CORS_ORIGIN: ['http://localhost:3000'],
      LOG_LEVEL: 'info',
      STUN_URLS: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      TURN_TTL_SECONDS: 3600,
    });
  });

  it('trata variável em branco como não definida', () => {
    // É assim que um .env copiado do .env.example chega: as chaves existem,
    // os valores estão vazios.
    const env = loadServerEnv({
      PORT: '',
      CORS_ORIGIN: '',
      LOG_LEVEL: '',
      DATABASE_URL: '',
    });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      HOST: '0.0.0.0',
      CORS_ORIGIN: ['http://localhost:3000'],
      LOG_LEVEL: 'info',
      STUN_URLS: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      TURN_TTL_SECONDS: 3600,
    });
  });

  describe('PORT', () => {
    it('converte a string do ambiente em número', () => {
      expect(loadServerEnv({ PORT: '10000' }).PORT).toBe(10000);
    });

    it.each([
      ['não numérica', 'abc'],
      ['zero', '0'],
      ['fora da faixa', '70000'],
      ['fracionária', '3001.5'],
    ])('recusa porta %s', (_caso, PORT) => {
      expect(() => loadServerEnv({ PORT })).toThrow(ConfigError);
    });

    it('nomeia a variável culpada na mensagem', () => {
      // O valor de uma mensagem de erro de config está inteiro em dizer o que
      // consertar. "Invalid input" sozinho custa uma tarde de bisect.
      expect(() => loadServerEnv({ PORT: 'abc' })).toThrow(/PORT/);
    });
  });

  describe('CORS_ORIGIN', () => {
    it('quebra em lista e tolera espaço e vírgula sobrando', () => {
      const env = loadServerEnv({
        CORS_ORIGIN: 'https://a.vercel.app, https://b.com ,',
      });

      expect(env.CORS_ORIGIN).toEqual(['https://a.vercel.app', 'https://b.com']);
    });

    it('recusa lista que só tem separadores', () => {
      expect(() => loadServerEnv({ CORS_ORIGIN: ' , , ' })).toThrow(ConfigError);
    });
  });

  describe('LOG_LEVEL', () => {
    it('aceita um nível do pino', () => {
      expect(loadServerEnv({ LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug');
    });

    it('recusa nível inventado', () => {
      expect(() => loadServerEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
    });
  });

  describe('DATABASE_URL', () => {
    it('é opcional, ausente significa salas só em memória', () => {
      expect(loadServerEnv({}).DATABASE_URL).toBeUndefined();
    });

    it.each([
      'postgresql://user:pass@host.neon.tech/jusqs?sslmode=require',
      'postgres://user:pass@localhost:5432/jusqs',
    ])('aceita %s', (url) => {
      expect(loadServerEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
    });

    it.each([
      ['sem esquema', 'host:5432'],
      ['esquema errado', 'mysql://user@host/db'],
      ['só o esquema', 'postgres://'],
    ])('recusa %s', (_caso, DATABASE_URL) => {
      // Uma string qualquer aqui só falha quando o driver tenta conectar,
      // longe do boot e longe da causa.
      expect(() => loadServerEnv({ DATABASE_URL })).toThrow(/DATABASE_URL/);
    });
  });

  describe('TURN', () => {
    const URLS = 'turn:turn.exemplo.com:3478';

    it('é opcional, sem nada configurado, sobra só STUN', () => {
      const env = loadServerEnv({});

      expect(env.TURN_URLS).toBeUndefined();
      expect(env.STUN_URLS).toEqual([
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ]);
    });

    it('aceita segredo compartilhado', () => {
      const env = loadServerEnv({ TURN_URLS: URLS, TURN_SECRET: 'segredo' });

      expect(env.TURN_URLS).toEqual([URLS]);
      expect(env.TURN_TTL_SECONDS).toBe(3600);
    });

    it('aceita credencial fixa', () => {
      const env = loadServerEnv({
        TURN_URLS: URLS,
        TURN_USERNAME: 'u',
        TURN_PASSWORD: 'p',
      });

      expect(env.TURN_USERNAME).toBe('u');
    });

    it('recusa servidor sem credencial, não autenticaria', () => {
      expect(() => loadServerEnv({ TURN_URLS: URLS })).toThrow(/TURN_URLS/);
    });

    it('recusa credencial sem servidor, não faria nada', () => {
      // O pior tipo de configuração errada: a que parece certa.
      expect(() => loadServerEnv({ TURN_SECRET: 'segredo' })).toThrow(/TURN_URLS/);
    });

    it('recusa meia credencial fixa', () => {
      expect(() => loadServerEnv({ TURN_URLS: URLS, TURN_USERNAME: 'u' })).toThrow(
        /TURN_USERNAME/,
      );
    });

    it('recusa os dois modos ao mesmo tempo', () => {
      expect(() =>
        loadServerEnv({
          TURN_URLS: URLS,
          TURN_SECRET: 'segredo',
          TURN_USERNAME: 'u',
          TURN_PASSWORD: 'p',
        }),
      ).toThrow(/TURN_SECRET/);
    });

    it.each([
      ['abaixo do mínimo', '30'],
      ['acima de um dia', '90000'],
      ['não numérico', 'uma hora'],
    ])('recusa TTL %s', (_caso, TURN_TTL_SECONDS) => {
      expect(() =>
        loadServerEnv({ TURN_URLS: URLS, TURN_SECRET: 's', TURN_TTL_SECONDS }),
      ).toThrow(/TURN_TTL_SECONDS/);
    });
  });

  it('acumula todos os problemas em vez de reportar só o primeiro', () => {
    // Corrigir uma variável, subir, descobrir a próxima, subir de novo é o
    // ciclo que a validação deveria eliminar.
    try {
      loadServerEnv({ PORT: 'abc', LOG_LEVEL: 'verbose' });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).issues).toHaveLength(2);
    }
  });
});
