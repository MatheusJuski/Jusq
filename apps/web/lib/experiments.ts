/**
 * Registro dos experimentos.
 *
 * Até aqui o Screen Lab **era** o site: a home falava dele, a rota era
 * `/room/:id`, e a lista de "próximos" era um array decorativo que não levava
 * a lugar nenhum. Isto inverte a relação — o Jusq's passa a ser o contêiner, e
 * cada experimento vira um inquilino com identidade e subárvore próprias.
 *
 * A diferença aparece na Phase 4: com registro, o Draw Lab é **adicionado**
 * (uma entrada aqui e uma pasta de rota); sem ele, seria enxertado por cima de
 * uma home que fala de outra coisa.
 *
 * O campo `learns` não é enfeite: a Regra 3 do projeto diz que todo
 * experimento precisa ensinar algo. Deixá-lo obrigatório no tipo faz o
 * compilador cobrar a regra na hora de adicionar o próximo.
 */

export type ExperimentStatus = 'ativo' | 'planejado';

export interface Experiment {
  /** Slug e rota: `/screen-lab`. */
  readonly id: string;
  /** Ordem de nascimento, não prioridade. */
  readonly number: string;
  readonly name: string;
  /** Uma linha, para o cartão do catálogo. */
  readonly tagline: string;
  /** Um parágrafo, para a página do próprio experimento. */
  readonly about: string;
  readonly status: ExperimentStatus;
  readonly tech: readonly string[];
  /** O conceito técnico que ele existe para explorar (Regra 3). */
  readonly learns: string;
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'screen-lab',
    number: '01',
    name: 'Screen Lab',
    tagline: 'compartilhamento de tela peer-to-peer',
    about:
      'Transmissão de tela entre navegadores por WebRTC. O vídeo vai direto ' +
      'de uma máquina à outra — o servidor apresenta os dois e sai do caminho.',
    status: 'ativo',
    tech: ['WebRTC', 'WebSocket', 'mesh P2P', 'Opus'],
    learns: 'negociação WebRTC, ICE e transporte de mídia em tempo real',
  },
  {
    id: 'draw-lab',
    number: '02',
    name: 'Draw Lab',
    tagline: 'desenho colaborativo em tempo real',
    about:
      'Um canvas compartilhado onde os traços de todo mundo aparecem na hora, ' +
      'com histórico e replay do que foi desenhado.',
    status: 'planejado',
    tech: ['Canvas', 'WebSocket', 'CRDT'],
    learns: 'sincronização de estado e resolução de conflito entre clientes',
  },
  {
    id: 'github-rpg',
    number: '03',
    name: 'GitHub RPG',
    tagline: 'sua atividade no GitHub como ficha de personagem',
    about:
      'Commits, linguagens e repositórios viram atributos, níveis e conquistas. ' +
      'Um ETL com cara de RPG.',
    status: 'planejado',
    tech: ['GitHub API', 'OAuth', 'ETL'],
    learns: 'consumo de API externa, limites de taxa e processamento de dados',
  },
  {
    id: 'rpg-lab',
    number: '04',
    name: 'RPG Lab',
    tagline: 'geração procedural de mundos',
    about:
      'Reinos, cidades, facções e histórias gerados a partir de uma seed — a ' +
      'mesma seed reconstrói o mesmo mundo, sempre.',
    status: 'planejado',
    tech: ['geração procedural', 'seeds'],
    learns: 'determinismo, ruído e composição de sistemas gerativos',
  },
  {
    id: 'simulation-lab',
    number: '05',
    name: 'Simulation Lab',
    tagline: 'ecossistema artificial que evolui sozinho',
    about:
      'Criaturas com genes procuram comida, fogem, reproduzem e sofrem ' +
      'mutação. Ao longo de milhares de gerações, o comportamento emerge.',
    status: 'planejado',
    tech: ['simulação', 'algoritmos genéticos', 'Canvas'],
    learns: 'laço de simulação, emergência e desempenho sob muitas entidades',
  },
];

export function findExperiment(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

/** Só os que dá para abrir hoje. */
export function activeExperiments(): readonly Experiment[] {
  return EXPERIMENTS.filter((e) => e.status === 'ativo');
}
