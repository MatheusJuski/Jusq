import { z } from 'zod';

/**
 * Validação de ambiente do Jusq's.
 *
 * O problema que isto resolve apareceu de verdade na Phase 0: uma variável
 * errada não falha no boot — ela falha depois, longe da causa. `PORT` vazia
 * vira `NaN`, `CORS_ORIGIN` com espaço sobrando derruba o handshake, e o
 * sintoma que chega é "a sala não abre".
 *
 * A regra aqui é **falhar no boot, com o nome da variável na mensagem**.
 * Um processo que não sobe é um problema de trinta segundos; um processo que
 * sobe torto é um problema de uma tarde.
 *
 * ## Por que só o servidor
 *
 * O `apps/web` não usa este módulo, e não é esquecimento. O Next substitui
 * `process.env.NEXT_PUBLIC_*` por texto literal em tempo de build — não existe
 * objeto `process.env` no browser para validar em runtime, e qualquer acesso
 * dinâmico (desestruturação, índice) quebra a substituição. A validação do web
 * mora em `apps/web/lib/ice.ts`, onde o acesso literal é preservado.
 */

/** Níveis do pino, do mais grave ao mais verboso. */
export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Lista separada por vírgula, tolerante a espaços e vírgula sobrando. */
const commaList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)).min(1, 'lista vazia'));

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // As mensagens são explícitas porque o padrão do zod, aplicado a uma
    // variável de ambiente, sai como "expected number, received NaN" — que
    // descreve o que aconteceu depois da coerção, não o que a pessoa escreveu.
    PORT: z.coerce
      .number({ error: 'deve ser um número de porta' })
      .int('deve ser um número inteiro')
      .min(1, 'porta válida começa em 1')
      .max(65535, 'porta válida vai até 65535')
      .default(3001),

    /**
     * `0.0.0.0` e não `localhost`: dentro de um container, escutar só no
     * loopback esconde o processo da plataforma, que conclui que ele não subiu.
     */
    HOST: z.string().min(1).default('0.0.0.0'),

    CORS_ORIGIN: commaList.default(['http://localhost:3000']),

    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

    /**
     * Ausente = salas só em memória, o comportamento da Phase 0 — que é também o
     * comportamento correto: a sala vive até a última pessoa sair, e nada nela
     * precisa sobreviver a um restart. Ver `adr/003-postgres-adiado.md`.
     *
     * A variável continua validada porque o `.env.example` e o `DEPLOY.md` a
     * citam. O que não existe ainda é quem a leia.
     */
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\/\S+$/, 'deve ser uma URL postgres:// ou postgresql://')
      .optional(),

    /* ------------------------------------------------------------------ ICE */

    STUN_URLS: commaList.default([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ]),

    /**
     * Servidores TURN. Vazio = só STUN, que é o suficiente na maioria das redes
     * domésticas e falha em NAT simétrico.
     */
    TURN_URLS: commaList.optional(),

    /**
     * Segredo compartilhado do TURN REST API (coturn e compatíveis).
     *
     * Este é o caminho preferido: o servidor deriva um usuário e uma senha que
     * expiram em `TURN_TTL_SECONDS`. Credencial vazada vale por uma hora, não
     * para sempre.
     */
    TURN_SECRET: z.string().min(1).optional(),

    /**
     * Credencial fixa, para provedor que não oferece segredo compartilhado.
     * Funciona, mas não expira — por isso não é o padrão.
     */
    TURN_USERNAME: z.string().min(1).optional(),
    TURN_PASSWORD: z.string().min(1).optional(),

    /** Validade da credencial derivada, em segundos. Padrão: uma hora. */
    TURN_TTL_SECONDS: z.coerce
      .number({ error: 'deve ser um número de segundos' })
      .int('deve ser um número inteiro')
      .min(60, 'credencial válida por menos de um minuto é inútil')
      .max(86400, 'no máximo 24 horas — o ponto da credencial derivada é expirar')
      .default(3600),
  })
  .superRefine((env, ctx) => {
    const hasStatic = Boolean(env.TURN_USERNAME ?? env.TURN_PASSWORD);
    const hasSecret = Boolean(env.TURN_SECRET);

    // Metade de uma credencial estática não é credencial nenhuma, e o sintoma
    // seria uma conexão que só falha em rede difícil — meses depois.
    if (Boolean(env.TURN_USERNAME) !== Boolean(env.TURN_PASSWORD)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_USERNAME'],
        message: 'TURN_USERNAME e TURN_PASSWORD andam juntos: defina os dois ou nenhum',
      });
    }

    if (hasSecret && hasStatic) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_SECRET'],
        message:
          'escolha um modo: TURN_SECRET (credencial que expira) ou ' +
          'TURN_USERNAME/TURN_PASSWORD (fixa) — não os dois',
      });
    }

    if (env.TURN_URLS && !hasSecret && !hasStatic) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_URLS'],
        message:
          'TURN sem credencial não autentica: defina TURN_SECRET ou ' +
          'TURN_USERNAME/TURN_PASSWORD',
      });
    }

    // Credencial sem servidor é configuração que não faz nada — e que a pessoa
    // acredita estar fazendo alguma coisa.
    if (!env.TURN_URLS && (hasSecret || hasStatic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_URLS'],
        message: 'há credencial de TURN configurada, mas nenhum servidor em TURN_URLS',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Erro de configuração: já vem com o relatório pronto para o stderr. */
export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      ['Configuração de ambiente inválida:', ...issues.map((i) => `  · ${i}`)].join(
        '\n',
      ),
    );
    this.name = 'ConfigError';
  }
}

/**
 * Lê e valida o ambiente do servidor.
 *
 * `source` é injetável para que o teste não precise sujar `process.env` — o
 * que, num runner que roda arquivos em paralelo, vaza de um teste para o outro.
 */
export function loadServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = serverEnvSchema.safeParse(withoutBlanks(source));

  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => {
        const name = issue.path.join('.') || '(raiz)';
        return `${name}: ${issue.message}`;
      }),
    );
  }

  return result.data;
}

/**
 * Variável em branco vale como não definida.
 *
 * Um `.env.example` documenta as opções deixando os valores vazios, e é isso
 * que a pessoa copia. Sem esta normalização, `DATABASE_URL=` derruba o boot
 * com "deve ser uma URL postgres://" — punindo exatamente quem seguiu o
 * arquivo de exemplo.
 */
function withoutBlanks(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value?.trim() !== ''),
  );
}
