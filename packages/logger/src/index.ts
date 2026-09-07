import { createRequire } from 'node:module';

import pino, { type Logger, type LoggerOptions } from 'pino';

import type { LogLevel } from '@jusqs/config';

export type { Logger } from 'pino';

export interface CreateLoggerOptions {
  /** Aparece em todo registro como `service`. Use o nome do app. */
  name: string;
  level?: LogLevel;
  /**
   * Saída legível por humano em vez de JSON.
   * Omitido = decide sozinho (ver `resolveTransport`).
   */
  pretty?: boolean;
}

/**
 * Campos que nunca devem chegar ao log.
 *
 * Redação acontece no pino, não no ponto de chamada: depender de todo mundo
 * lembrar de omitir o header de autorização é o mesmo que não redigir nada.
 */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'DATABASE_URL',
  '*.password',
  '*.token',
  '*.credential',
];

/**
 * Escolhe o transport por **disponibilidade**, não por `NODE_ENV`.
 *
 * `pino-pretty` é devDependency e não existe no bundle de produção. Pedir o
 * transport sem que o módulo seja resolvível derruba o processo no boot
 * (`unable to determine transport target`), antes de qualquer log que
 * explicasse o motivo.
 *
 * `NODE_ENV` sozinho não serve como critério: o Render não define a variável
 * em serviços Docker, e um deploy não deveria depender de alguém lembrar de
 * configurá-la para o processo subir.
 */
function resolveTransport(pretty: boolean | undefined): LoggerOptions['transport'] {
  if (pretty === false) return undefined;
  if (pretty === undefined) {
    // Produção: JSON puro, que é o que a plataforma agrega.
    if (process.env['NODE_ENV'] === 'production') return undefined;
    // Teste: o transport do pino roda numa worker thread, e uma por suíte
    // atrasa o encerramento sem entregar nada, ninguém lê log de teste.
    if (process.env['NODE_ENV'] === 'test') return undefined;
  }

  try {
    // Caminho absoluto, e não o nome do pacote: quem carrega o transport é
    // uma worker thread do pino, com resolução própria. Resolver aqui, onde a
    // dependência é declarada, tira a dúvida de qual node_modules vale.
    const target = createRequire(import.meta.url).resolve('pino-pretty');
    return {
      target,
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    };
  } catch {
    // Rodando do bundle, sem node_modules: JSON puro serve.
    return undefined;
  }
}

/**
 * Logger estruturado do Jusq's.
 *
 * Estruturado e não texto porque a Phase 1 existe para tornar o sistema
 * observável: `app.log.info({ peerId, roomId }, 'peer entrou')` é consultável;
 * a mesma frase interpolada numa string não é.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  return pino({
    level: options.level ?? 'info',
    base: { service: options.name },
    redact: { paths: REDACT, censor: '[redigido]' },
    transport: resolveTransport(options.pretty),
  });
}
