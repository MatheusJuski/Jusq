/**
 * Perfis de qualidade da transmissão e ajuste de codec.
 *
 * Sem limites explícitos, o `getDisplayMedia` captura na resolução nativa do
 * monitor e o WebRTC decide o bitrate sozinho o que numa tela 1440p vira
 * vários Mbps por espectador. Como o V0 é mesh (cada peer recebe uma cópia
 * própria), o custo de upload cresce linearmente e o teto é a banda de quem
 * transmite.
 */

export interface QualityPreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  /** Teto de bitrate do vídeo, em bits por segundo. */
  readonly maxVideoBitrate: number;
  /**
   * Dica de conteúdo para o encoder.
   *
   * `detail` preserva nitidez de texto sacrificando fluidez bom para código
   * e documentos. `motion` faz o oposto, e é o único que faz sentido a 60fps:
   * pedir 60 quadros e depois mandar o encoder priorizar nitidez estática é
   * contraditório.
   */
  readonly contentHint: 'detail' | 'motion';
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  {
    id: '480p30',
    label: '480p · 30fps',
    width: 854,
    height: 480,
    frameRate: 30,
    maxVideoBitrate: 800_000,
    contentHint: 'detail',
  },
  {
    id: '720p30',
    label: '720p · 30fps',
    width: 1280,
    height: 720,
    frameRate: 30,
    maxVideoBitrate: 1_500_000,
    contentHint: 'detail',
  },
  {
    id: '720p60',
    label: '720p · 60fps',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxVideoBitrate: 2_500_000,
    contentHint: 'motion',
  },
  {
    id: '1080p30',
    label: '1080p · 30fps',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxVideoBitrate: 3_000_000,
    contentHint: 'detail',
  },
  {
    id: '1080p60',
    label: '1080p · 60fps',
    width: 1920,
    height: 1080,
    frameRate: 60,
    maxVideoBitrate: 5_000_000,
    contentHint: 'motion',
  },
];

export const DEFAULT_QUALITY_ID = '720p30';

/**
 * Bitrate do áudio, em bits por segundo.
 *
 * O padrão do WebRTC para Opus fica na casa dos 32 kbps mono — dimensionado
 * para voz em chamada. 128 kbps estéreo é o patamar em que música e áudio de
 * jogo deixam de soar metálicos, e é irrelevante perto do vídeo.
 */
export const AUDIO_BITRATE = 128_000;

export function findPreset(id: string): QualityPreset {
  return (
    QUALITY_PRESETS.find((p) => p.id === id) ??
    QUALITY_PRESETS.find((p) => p.id === DEFAULT_QUALITY_ID) ??
    // A lista é constante e não-vazia; isto existe só para o tipo fechar.
    (QUALITY_PRESETS[0] as QualityPreset)
  );
}

/** Restrições de captura para um perfil. */
export function videoConstraints(preset: QualityPreset): MediaTrackConstraints {
  return {
    width: { ideal: preset.width, max: preset.width },
    height: { ideal: preset.height, max: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
  };
}

/**
 * Restrições de captura do áudio.
 *
 * Os três processamentos são pensados para microfone em call e **estragam**
 * áudio de sistema: o cancelamento de eco remove partes do sinal, a supressão
 * de ruído corta faixas inteiras achando que é chiado, e o ganho automático
 * bombeia o volume em trechos silenciosos.
 */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/* -------------------------------------------------------------------------- */
/* Ajuste do Opus via SDP                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Habilita estéreo e eleva o bitrate do Opus editando o SDP.
 *
 * Não existe API para isso: `RTCRtpSender.setParameters` controla bitrate, mas
 * **não** liga estéreo — `stereo=1` só é negociável pela linha `a=fmtp` do
 * codec. Editar SDP é feio e é a forma padrão de fazer isso em WebRTC.
 *
 * - `stereo=1` — aceito receber estéreo
 * - `sprop-stereo=1` — vou enviar estéreo
 * - `maxaveragebitrate` — teto que o encoder pode usar
 * - `useinbandfec=1` — correção de erro embutida, ajuda com perda de pacote
 *
 * Parâmetros já presentes (ex. `minptime`) são preservados. SDP sem Opus volta
 * intacto.
 */
export function tuneOpus(sdp: string, bitrate: number): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(eol);

  const rtpmapIndex = lines.findIndex((line) =>
    /^a=rtpmap:\d+\s+opus\/48000/i.test(line),
  );
  if (rtpmapIndex === -1) return sdp;

  const payloadType = lines[rtpmapIndex]?.slice('a=rtpmap:'.length).split(' ')[0];
  if (!payloadType) return sdp;

  const desired: Record<string, string> = {
    stereo: '1',
    'sprop-stereo': '1',
    maxaveragebitrate: String(bitrate),
    useinbandfec: '1',
  };

  const prefix = `a=fmtp:${payloadType} `;
  const fmtpIndex = lines.findIndex((line) => line.startsWith(prefix));

  if (fmtpIndex === -1) {
    // Sem linha fmtp: cria uma logo após o rtpmap, onde o SDP a espera.
    const params = Object.entries(desired)
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
    lines.splice(rtpmapIndex + 1, 0, `${prefix}${params}`);
    return lines.join(eol);
  }

  const existing = new Map<string, string>();
  for (const part of (lines[fmtpIndex] ?? '').slice(prefix.length).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) existing.set(trimmed, '');
    else existing.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }

  for (const [key, value] of Object.entries(desired)) existing.set(key, value);

  const merged = [...existing.entries()]
    .map(([k, v]) => (v === '' ? k : `${k}=${v}`))
    .join(';');

  lines[fmtpIndex] = `${prefix}${merged}`;
  return lines.join(eol);
}
