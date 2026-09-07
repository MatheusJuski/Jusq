import { ConfigError, loadServerEnv, type ServerEnv } from '@jusqs/config';

import { buildServer } from './server.js';

/**
 * Ponto de entrada do servidor de signaling.
 *
 * Só três coisas acontecem aqui: validar o ambiente, montar a aplicação e
 * escutar. Tudo que tem lógica mora em `server.ts`, onde o teste alcança.
 */

/**
 * Ambiente primeiro, tudo o mais depois.
 *
 * Se a configuração estiver errada, o processo morre aqui, com o nome da
 * variável na mensagem e sem porta aberta. Um servidor que sobe com
 * `CORS_ORIGIN` torto aceita o WebSocket e falha no handshake, e o sintoma que
 * chega ao usuário ("a sala não abre") não aponta para a causa.
 */
function loadEnvOrExit(): ServerEnv {
  try {
    return loadServerEnv();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // O logger ainda não existe, ele depende justamente do que falhou.
    console.error(error.message);
    process.exit(1);
  }
}

const env = loadEnvOrExit();
const app = await buildServer(env);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
