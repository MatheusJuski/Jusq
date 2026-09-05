/**
 * Escolha da fonte de áudio da transmissão.
 *
 * `getDisplayMedia` só entrega áudio junto da tela em alguns casos — nunca ao
 * compartilhar uma janela isolada, que é justamente o caso de um jogo. A saída
 * é desacoplar: o vídeo continua vindo da captura de tela, e o áudio pode vir
 * de um dispositivo de **entrada** capturado com `getUserMedia`.
 *
 * São mecanismos distintos, e vale não confundi-los:
 *
 * - **áudio da superfície** — o que `getDisplayMedia` associa à tela, janela ou
 *   aba compartilhada, negociado por `systemAudio` e `windowAudio`
 * - **dispositivo de entrada** — "Mixagem Estéreo" ou um cabo virtual, que o
 *   Windows expõe como entrada capturando o que sai pelo dispositivo de saída
 *
 * O segundo não substitui o primeiro conceitualmente; ele apenas oferece um
 * caminho alternativo quando o primeiro não está disponível.
 */

export const AUDIO_SOURCE_DISPLAY = 'display';
export const AUDIO_SOURCE_NONE = 'none';

/**
 * Microfone padrão do sistema.
 *
 * Opção de primeira classe, e não mais um item da lista de dispositivos: é o
 * único caminho de áudio que funciona em qualquer fonte — inclusive janela —
 * sem o usuário configurar nada. Um clique de permissão e pronto.
 */
export const AUDIO_SOURCE_MICROPHONE = 'microphone';

/** Prefixo que distingue um deviceId das opções fixas dentro do `<select>`. */
const DEVICE_PREFIX = 'device:';

export const DEFAULT_AUDIO_SOURCE = AUDIO_SOURCE_DISPLAY;

export function deviceValue(deviceId: string): string {
  return `${DEVICE_PREFIX}${deviceId}`;
}

/** Extrai o deviceId, ou `null` quando o valor é uma das opções fixas. */
export function deviceIdOf(value: string): string | null {
  if (!value.startsWith(DEVICE_PREFIX)) return null;

  const id = value.slice(DEVICE_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * Restrições do áudio capturado de um dispositivo.
 *
 * Sem processamento, pelo mesmo motivo do áudio de tela: o alvo aqui é som de
 * jogo, música ou vídeo, e os filtros de voz destroem esse material. Para um
 * microfone de locução o ideal seria o contrário — mas isso é escolha de outro
 * experimento, não do Screen Lab.
 */
export const DEVICE_AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

/**
 * Restrições do microfone.
 *
 * Aqui o processamento é bem-vindo, ao contrário do áudio de sistema: a
 * finalidade é voz, e supressão de ruído e ganho automático existem
 * exatamente para isso. Deixar o padrão do navegador é a escolha certa.
 */
export const MICROPHONE_CONSTRAINTS = true;

/**
 * Lista os dispositivos de entrada de áudio disponíveis.
 *
 * Os rótulos só existem depois que a página recebe permissão de áudio — antes
 * disso o browser devolve entradas anônimas, inúteis para o usuário escolher.
 * Por isso a permissão é pedida quando necessário, e o stream de sondagem é
 * encerrado no mesmo instante.
 */
export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const inputs = async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput',
    );

  let devices = await inputs();

  if (devices.length === 0 || devices.every((d) => d.label === '')) {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of probe.getTracks()) track.stop();
    devices = await inputs();
  }

  return devices.filter((d) => d.deviceId.length > 0);
}
