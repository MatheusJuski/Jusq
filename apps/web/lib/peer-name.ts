import { DEFAULT_PEER_NAME, MAX_PEER_NAME_LENGTH } from '@jusqs/types';

/**
 * Nome exibido, lembrado entre visitas.
 *
 * Fica em `localStorage` e não em cookie ou banco: é preferência de uma pessoa
 * num navegador, ninguém precisa dela do outro lado, e o servidor já recebe o
 * nome em cada `join`. Guardar isso remotamente exigiria identidade, que o
 * projeto deliberadamente não tem (as salas são anônimas por design).
 *
 * O saneamento acontece no servidor, que é onde importa; aqui o corte serve só
 * para o campo não aceitar mais do que será enviado.
 */

const STORAGE_KEY = 'jusqs:peer-name';

/**
 * Lê o nome salvo.
 *
 * `localStorage` lança em contexto restrito, janela anônima com cookies
 * bloqueados, iframe de terceiro, navegador com dados de site desativados.
 * Falhar aqui não pode impedir alguém de entrar numa sala.
 */
export function readStoredName(): string {
  try {
    return normalizeName(window.localStorage.getItem(STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

export function storeName(name: string): void {
  try {
    const clean = normalizeName(name);
    if (clean) window.localStorage.setItem(STORAGE_KEY, clean);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sem armazenamento a sessão continua: o nome vale enquanto a aba viver.
  }

  for (const listener of listeners) listener();
}

/* -------------------------------------------------------------------------- */
/* Assinatura                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O nome salvo é estado **externo** ao React: mora no `localStorage`.
 *
 * Expor isso como store permite que a página use `useSyncExternalStore`, que
 * dá um snapshot para o servidor (string vazia, porque lá não existe
 * armazenamento) e outro para o cliente. A alternativa, `useState` mais um
 * `useEffect` que lê e chama `setState`, funciona, mas provoca um render em
 * cascata a cada montagem e é o padrão que o lint do projeto sinaliza.
 */
const listeners = new Set<() => void>();

export function subscribeToName(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot para o servidor: lá não há `localStorage`, e ninguém tem nome. */
export function serverName(): string {
  return '';
}

/**
 * Recorta e limpa o que o campo aceita.
 *
 * Corta por *code point* pelo mesmo motivo do servidor: `slice` conta unidades
 * UTF-16 e partiria um emoji ao meio.
 */
export function normalizeName(value: string): string {
  return [...value].slice(0, MAX_PEER_NAME_LENGTH).join('').trim();
}

/** O que enviar quando a pessoa não escolheu nada. */
export function nameOrDefault(value: string): string {
  return normalizeName(value) || DEFAULT_PEER_NAME;
}
