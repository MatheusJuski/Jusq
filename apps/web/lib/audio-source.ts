/**
 * Escolha da fonte de áudio da transmissão.
 *
 * `getDisplayMedia` só entrega áudio junto da tela em alguns casos — nunca ao
 * compartilhar uma janela isolada, que é justamente o caso de um jogo. A saída
 * é desacoplar: o vídeo continua vindo da captura de tela, e o áudio pode vir
 * de um dispositivo de **entrada** capturado com `getUserMedia`.
 *
 * No Windows, o "Mixagem Estéreo" (Stereo Mix) ou um cabo virtual (VB-CABLE,
 * VoiceMeeter) aparecem como entrada e carregam o som do sistema. É assim que
 * se transmite o áudio de um jogo que roda fora do navegador.
 */

export const AUDIO_SOURCE_DISPLAY = 'display';
export const AUDIO_SOURCE_NONE = 'none';

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
