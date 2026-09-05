# Jusq's

> A personal playground for realtime systems, games, simulations and digital experiments.

Jusq's é um laboratório pessoal de desenvolvimento criado para experimentar ideias, tecnologias e conceitos de engenharia de software através de projetos interativos.

O projeto não possui uma finalidade única e não tem como objetivo ser "finalizado".

Novos experimentos podem ser adicionados continuamente conforme novas ideias surgem ou novos problemas técnicos precisam ser explorados.

---

## 🧪 Conceito

O Jusq's funciona como um conjunto de experimentos independentes compartilhando uma mesma infraestrutura.

A ideia é transformar:
> "Seria legal fazer isso..."

em:

> "Vou descobrir como fazer."

Cada experimento deve explorar algum conceito técnico ou criativo diferente.

```text
                        JUSQ'S
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     Realtime          Simulation        Creative
          │                │                │
          ▼                ▼                ▼
    Screen Lab        RPG Lab          Draw Lab
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
                    Shared Platform
````

---

# 🎯 Objetivos

## Principal

Criar um projeto de desenvolvimento contínuo que permita explorar:

* sistemas realtime;
* WebRTC;
* WebSockets;
* comunicação distribuída;

* simulações;
* geração procedural;
* computação gráfica;
* APIs externas;
* processamento de dados;
* performance;
* observabilidade;
* arquitetura de software;
* infraestrutura;
* experimentação.

## Secundários

* criar experiências visualmente interessantes;
* testar tecnologias novas;
* transformar ideias em protótipos funcionais;
* documentar problemas e soluções;
* experimentar diferentes arquiteturas;
* criar projetos que possam evoluir durante anos.

---

# 🧠 Filosofia

O Jusq's não deve ser tratado como um produto tradicional.

Não existe um conjunto definitivo de funcionalidades.

A evolução segue:

```text
IDEIA
  ↓
EXPERIMENTO
  ↓
PROTÓTIPO
  ↓
USO
  ↓
PROBLEMA
  ↓
SOLUÇÃO
  ↓
MELHORIA
  ↓
NOVO EXPERIMENTO
```

## Regras

### 1. Nenhuma tecnologia sem motivo

Uma tecnologia só deve ser adicionada quando resolver um problema real ou possibilitar um experimento interessante.

Não utilizar tecnologias apenas para aumentar a quantidade de ferramentas do projeto.

---

### 2. Complexidade deve ser conquistada

O projeto não deve começar com microservices, Kubernetes, Kafka, Redis e outras ferramentas complexas.

A arquitetura deve evoluir conforme os problemas aparecem.

```text
Problema
   ↓
Solução simples
   ↓
Problema maior
   ↓
Solução mais complexa
```

---

### 3. Cada experimento deve ensinar alguma coisa

Exemplos:

| Experimento    | Principal objetivo       |
| -------------- | ------------------------ |
| Screen Lab     | WebRTC / streaming       |
| Draw Lab       | Realtime synchronization |
| RPG Lab        | Procedural generation    |
| Simulation Lab | Algorithms / simulation  |
| GitHub RPG     | APIs / data processing   |

---

### 4. O projeto deve continuar divertido

Uma feature não precisa necessariamente ter valor comercial.

Se for tecnicamente interessante ou simplesmente divertida de construir, ela pode fazer parte do Jusq's.

---

### 5. Funcionar antes de estruturar

Cada fase deve começar por um **esqueleto funcional** — a menor coisa que roda de
ponta a ponta — e só depois receber a base concreta.

```text
FUNCIONA (feio, em memória, sem teste)
   ↓
ENTÃO estrutura (banco, logger, CI, testes)
   ↓
ENTÃO evolui
```

Estrutura construída antes de existir algo rodando é estrutura adivinhada.
Depois que o experimento funciona, os requisitos reais aparecem sozinhos.

> Corolário: se após duas semanas de projeto ainda não houver nada abrindo no
> navegador, a ordem está errada.

---

# 🏗️ Arquitetura

A arquitetura inicial será um **monólito modular**, com possibilidade de evolução futura.

Não serão utilizados microservices inicialmente.

## V0 — Esqueleto funcional

A primeira versão não possui banco, cache nem storage.
O estado vive em memória e desaparece no restart — e isso é aceitável.

```text
   Browser A                    Browser B
       │                            │
       └─────────────┬──────────────┘
                     │  WebSocket (signaling)
                     ▼
           ┌──────────────────┐
           │   Jusq's Server  │
           │   Fastify + WS   │
           │   rooms: Map()   │
           └──────────────────┘

   Browser A ◄──── WebRTC (mídia) ────► Browser B
```

## V1+ — Base concreta

Persistência e infraestrutura entram **depois** que o V0 funciona em produção.

```text
                         INTERNET
                            │
                            ▼
                       ┌─────────┐
                       │ Browser │
                       └────┬────┘
                            │
                   HTTPS / WebSocket
                            │
                            ▼
                  ┌──────────────────┐
                  │   Jusq's Server  │
                  │                  │
                  │ Fastify          │
                  │ REST API         │
                  │ WebSocket        │
                  │ WebRTC Signaling │
                  │ Experiment Logic │
                  └────────┬─────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        PostgreSQL       Redis          R2
```

---

# 🧩 Estrutura

O projeto será organizado como um monorepo (pnpm workspaces).

## V0 — Estrutura inicial

Apenas o necessário para o Screen Lab funcionar:

```text
jusqs/
│
├── apps/
│   │
│   ├── web/
│   │   └── Next.js — página do Screen Lab
│   │
│   └── server/
│       └── Fastify + WebSocket signaling
│
├── packages/
│   │
│   └── types/
│       └── mensagens de signaling compartilhadas
│
├── DOCs/
├── package.json
└── pnpm-workspace.yaml
```

Sem Docker, sem banco, sem CI, sem Redis.

## Estrutura alvo

Para onde o monorepo cresce conforme as fases avançam:

```text
jusqs/
│
├── apps/
│   │
│   ├── web/
│   │   └── Next.js application
│   │
│   └── server/
│       └── Fastify application
│
├── packages/
│   │
│   ├── types/
│   ├── config/
│   ├── database/
│   ├── logger/
│   └── realtime/
│
├── experiments/
│   │
│   ├── screen-lab/
│   ├── draw-lab/
│   ├── rpg-lab/
│   ├── simulation-lab/
│   └── github-rpg/
│
├── infrastructure/
│   │
│   ├── docker/
│   └── compose/
│
├── docs/
│
├── .github/
│   └── workflows/
│
├── docker-compose.yml
├── package.json
├── README.md
└── LICENSE
```

---

# 💻 Stack

## Linguagem

### TypeScript

TypeScript será a principal linguagem do projeto.

Motivos:

* tipagem estática;
* compartilhamento de tipos entre frontend e backend;
* excelente suporte para aplicações realtime;
* integração com Node.js;
* bom suporte para aplicações web;
* facilidade de manutenção conforme o projeto cresce.

---

# 🌐 Frontend

## Next.js

Responsável pela aplicação web principal.

Utilizado para:

* interface;
* routing;
* páginas;
* gerenciamento da aplicação;
* integração com APIs;
* autenticação;
* experiências interativas.

## React

Utilizado para construção dos componentes e interfaces.

## Tailwind CSS

Utilizado para desenvolvimento do design system e estilização.

## Canvas API

Utilizado principalmente em:

* Draw Lab;
* RPG Lab;
* Simulation Lab.

## WebGL

Será introduzido posteriormente caso os experimentos exijam renderização gráfica mais avançada.

---

# ⚙️ Backend

## Node.js

Runtime principal do backend.

## Fastify

Framework HTTP principal.

Responsabilidades:

* REST API;
* autenticação;
* gerenciamento de sessões;
* WebSocket;
* WebRTC signaling;
* integração com banco;
* gerenciamento dos experimentos.

Arquitetura:

```text
Fastify
│
├── HTTP
│   └── REST API
│
├── WebSocket
│   └── Realtime
│
├── WebRTC
│   └── Signaling
│
└── Experiments
    ├── Screen Lab
    ├── Draw Lab
    ├── RPG Lab
    ├── Simulation Lab
    └── GitHub RPG
```

---

# 🔌 Comunicação

O Jusq's utilizará diferentes protocolos dependendo da necessidade.

## HTTP

Utilizado para operações tradicionais.

Exemplos:

```http
GET /api/experiments
GET /api/worlds
POST /api/worlds
GET /api/github/profile
```

---

## WebSocket

Utilizado para comunicação realtime.

```text
Client A ─────┐
              │
Client B ─────┼── WebSocket Server
              │
Client C ─────┘
```

Casos de uso:

* desenho colaborativo;
* presença;
* eventos;
* notificações;
* salas;
* simulações realtime.

---

## WebRTC

Utilizado principalmente para transmissão de mídia.

```text
                Signaling Server
                    /       \
                   /         \
                  ▼           ▼
              Client A ←──→ Client B
                    WebRTC
```

Casos de uso:

* compartilhamento de tela;
* áudio;
* vídeo;
* comunicação peer-to-peer.

---

# 🗄️ Banco de dados

> **Quando entra:** Phase 1. O V0 mantém as salas em memória (`Map()`).
> O banco só entra quando existir algo que precise sobreviver a um restart.

## PostgreSQL

Banco de dados principal.

Possíveis entidades:

```text
users
experiments
rooms
drawings
worlds
characters
github_profiles
events
```

O schema deve evoluir conforme os experimentos forem desenvolvidos.

---

# ⚡ Redis

Redis não fará parte obrigatoriamente da primeira versão.

Será introduzido quando existir uma necessidade real.

Possíveis usos:

* cache;
* presença;
* sessões;
* rate limiting;
* pub/sub;
* estado temporário;
* comunicação entre processos.

---

# ☁️ Storage

## Cloudflare R2

Utilizado para armazenamento de arquivos e artefatos.

Estrutura possível:

```text
/jusqs
│
├── avatars/
├── drawings/
├── screenshots/
├── worlds/
├── exports/
└── replays/
```

Possíveis arquivos:

* imagens;
* desenhos;
* screenshots;
* mapas;
* replays;
* exports;
* arquivos gerados pelos experimentos.

---

# 🧪 Experimentos

## 01 — Screen Lab

Experimento focado em transmissão de tela realtime.

### V1

Compartilhamento de tela entre dois navegadores.

```text
Browser A
    │
    │ WebRTC
    ▼
Browser B
```

### V2

Adicionar:

* áudio;
* câmera;
* mute;
* seleção de dispositivo.

### V3

Adicionar métricas:

```text
Resolution: 1920x1080
FPS: 60
Bitrate: 5.8 Mbps
RTT: 38 ms
Packet Loss: 0.2%
```

### V4

Adicionar:

* gravação;
* screenshots;
* controle de qualidade.

### V5

Adicionar múltiplos usuários.

### V6

Experimentar:

* bitrate adaptativo;
* reconexão;
* congestion control;
* diferentes codecs;
* diferentes resoluções;
* diferentes limites de banda.

---

# 🎨 02 — Draw Lab

Ferramenta de desenho colaborativo realtime.

## V1

Canvas básico.

```text
Mouse
  ↓
Canvas
```

## V2

Sincronização:

```text
Client A
   ↓
WebSocket
   ↓
Server
   ↓
Clients
```

## Funcionalidades

* brush;
* eraser;
* cores;
* tamanho;
* undo;
* redo;
* layers;
* usuários;
* cursores realtime.

---

## Replay

Todas as ações podem ser armazenadas como eventos.

```text
09:31:02 DRAW
09:31:03 DRAW
09:31:04 DRAW
09:31:08 ERASE
09:31:10 DRAW
```

Posteriormente o desenho pode ser reconstruído:

```text
PLAY REPLAY

00:00 ─────────────────── 02:37
       ↑
       Drawing in progress
```

---

# 🎲 03 — RPG Lab

Experimentos relacionados a RPG.

## Character Generator

Gerar personagens com:

* raça;
* classe;
* origem;
* personalidade;
* atributos;
* background;
* facção;
* relações.

Exemplo:

```text
CHARACTER

Name: Aldren
Race: Human
Class: Ranger
Level: 12

STR  14
DEX  18
INT  11
WIS  16

Faction:
The Northern Wardens
```

---

## World Generator

Gerar mundos proceduralmente.

```text
World
│
├── Kingdoms
│
├── Cities
│
├── Factions
│
├── NPCs
│
├── Dungeons
│
├── History
│
└── Events
```

Cada mundo recebe uma seed.

```text
Seed: 1847291
```

A mesma seed deve permitir reproduzir o mundo.

---

# 🧬 04 — Simulation Lab

Laboratório para simulações.

Primeiro experimento:

## Artificial Ecosystem

Criaturas possuem características:

```text
speed
vision
energy
health
age
aggression
```

O ambiente possui:

```text
food
predators
resources
temperature
terrain
```

As criaturas podem:

* procurar comida;
* fugir;
* caçar;
* reproduzir;
* morrer;
* sofrer mutações.

---

## Evolução

```text
Generation 1
      ↓
Generation 10
      ↓
Generation 100
      ↓
Generation 1,000
      ↓
Generation 10,000
```

Estatísticas:

```text
Population
Average Speed
Average Vision
Mutation Rate
Species
Extinction Rate
```

---

# 🐙 05 — GitHub RPG

Transformar atividade do GitHub em uma experiência de RPG.

O sistema coleta:

* repositories;
* commits;
* linguagens;
* pull requests;
* issues;
* atividade;
* releases.

E transforma os dados em atributos.

Exemplo:

```text
DEVELOPER

LEVEL 27
XP 72,420

Backend      ████████░░
Frontend     ██████░░░░
Cloud        █████░░░░░
Automation   ████████░░
Testing      █████░░░░░
```

---

## Achievements

Exemplos:

```text
🏆 First Repository
🏆 100 Commits
🏆 1,000 Commits
🏆 10 Repositories
🏆 Bug Slayer
🏆 Open Source Contributor
🏆 Night Owl
```

---

# 📡 Event System

Conforme o projeto evoluir, eventos serão utilizados para desacoplar componentes.

Exemplos:

```text
USER_JOINED_ROOM
USER_LEFT_ROOM

SCREEN_STARTED
SCREEN_STOPPED

DRAW_CREATED
DRAW_DELETED

WORLD_GENERATED

NPC_BORN
NPC_DIED

GITHUB_SYNC_STARTED
GITHUB_SYNC_COMPLETED
```

Exemplo:

```text
WORLD_GENERATED
       │
       ├── Logger
       │
       ├── Statistics
       │
       └── Notification
```

Posteriormente, o sistema poderá evoluir para uma arquitetura mais orientada a eventos.

---

# 📊 Observabilidade

Observabilidade será uma parte importante do projeto.

## Logs

Exemplo:

```text
INFO  websocket connection
INFO  room created
WARN  packet loss above threshold
ERROR database connection failed
```

---

## Métricas

Possíveis métricas:

```text
HTTP Requests
WebSocket Connections
Active Rooms
WebRTC Sessions
Average Latency
Error Rate
CPU Usage
Memory Usage
```

---

## Tracing

Fluxos complexos poderão ser rastreados.

```text
Request
   ↓
API
   ↓
Database
   ↓
Worker
   ↓
External API
```

Objetivo:

identificar onde uma operação está consumindo tempo ou falhando.

---

# 🧪 Testes

Os testes devem priorizar comportamento.

Exemplo:

```text
Room

✓ User can join
✓ User receives existing participants
✓ User receives disconnect event
✓ Room closes when empty
✓ Invalid message is rejected
```

Simulation:

```text
✓ Creature loses energy
✓ Creature reproduces
✓ Mutation changes DNA
✓ Dead creature is removed
```

Tipos de testes:

* unitários;
* integração;
* API;
* realtime;
* posteriormente E2E.

---

# 🐳 Infraestrutura

> **Quando entra:** Phase 1. O V0 roda com `pnpm dev` e faz deploy direto em
> Vercel + Render. Docker entra aqui apenas como formato de deploy do
> servidor; como ambiente local, só quando houver banco para orquestrar.

## Docker

Ambiente local a partir da Phase 1:

```text
docker compose
```

Serviços:

```text
jusqs-web
jusqs-server
postgres
```

Posteriormente:

```text
jusqs-web
jusqs-server
jusqs-worker
postgres
redis
```

## Deploy

Estratégia de hospedagem, custos e limites de free tier estão documentados em
[`DEPLOY.md`](./DEPLOY.md).

Resumo: o projeto roda integralmente em free tier (R$ 0/mês).

---

# 🚀 CI/CD

GitHub Actions:

```text
Push
  ↓
Lint
  ↓
Typecheck
  ↓
Unit Tests
  ↓
Build
  ↓
Docker Build
  ↓
Deploy
```

Posteriormente:

```text
Pull Request
  ↓
Tests
  ↓
Preview Environment
  ↓
Review
  ↓
Production
```

---

# 🗺️ Roadmap

O roadmap segue a Regra 5: **funcionar antes de estruturar**.

```text
Phase 0   esqueleto funcional      → tela compartilhando
Phase 1   base concreta            → banco, testes, CI, logger
Phase 2   plataforma               → layout, navegação, experimentos
Phase 3+  evolução dos experimentos
```

---

## Phase 0 — Walking Skeleton `v0.1`

O menor caminho até algo que funciona. Sem banco, sem Docker, sem CI.

* [ ] Monorepo (pnpm workspaces)
* [ ] TypeScript
* [ ] `apps/web` — Next.js
* [ ] `apps/server` — Fastify
* [ ] `packages/types` — mensagens de signaling
* [ ] WebSocket connection
* [ ] Salas em memória (`Map()`)
* [ ] WebRTC signaling
* [ ] Criar sala + link compartilhável
* [ ] Compartilhar tela entre dois browsers
* [ ] Deploy do web (Vercel)
* [ ] Deploy do server (Render)

### Critério de conclusão

```text
Dois PCs, em redes diferentes, um vendo a tela do outro
através de uma URL pública.
```

Feio é aceitável. Estado que some no restart é aceitável.
**Não funcionar não é.**

> Esta fase é onde a dor real do WebRTC aparece: em `localhost` e na LAN tudo
> funciona. É ao testar de outra rede que se descobre por que TURN existe.
> Deixe essa descoberta acontecer — ela justifica a Phase 1.

---

## Phase 1 — Base concreta

Só começa depois que a Phase 0 estiver no ar.

Agora os requisitos são conhecidos, não adivinhados.

* [ ] ESLint + Prettier
* [ ] Type checking
* [ ] Test framework
* [ ] Logger estruturado
* [ ] Validação de env / config
* [ ] PostgreSQL (Neon)
* [ ] Persistência de salas
* [ ] TURN (Cloudflare Realtime)
* [ ] Docker Compose (ambiente local)
* [ ] GitHub Actions (lint + typecheck + test)

---

## Phase 2 — Jusq's Core

A plataforma que hospeda os demais experimentos.

* [ ] Layout principal
* [ ] Design system base
* [ ] Sistema de experimentos
* [ ] Navegação
* [ ] Status do sistema
* [ ] Perfil
* [ ] Sistema de logs

---

## Phase 3 — Screen Lab completo

Retomada do Screen Lab a partir do V2.

* [ ] Áudio
* [ ] Câmera
* [ ] Mute
* [ ] Seleção de dispositivo
* [ ] Métricas WebRTC
* [ ] Gravação
* [ ] Screenshots
* [ ] Controle de qualidade
* [ ] Múltiplos usuários (SFU)
* [ ] Bitrate adaptativo
* [ ] Reconexão
* [ ] Congestion control

---

## Phase 4 — Draw Lab

* [ ] Canvas
* [ ] Brush
* [ ] Eraser
* [ ] Cores
* [ ] Undo / Redo
* [ ] WebSocket synchronization
* [ ] Multiplayer
* [ ] Cursors
* [ ] Layers
* [ ] Histórico
* [ ] Replay
* [ ] Exportação

---

## Phase 5 — GitHub RPG

* [ ] GitHub OAuth
* [ ] Importar perfil
* [ ] Importar repositories
* [ ] Importar linguagens
* [ ] Importar commits
* [ ] Sistema de XP
* [ ] Levels
* [ ] Attributes
* [ ] Achievements
* [ ] Histórico de evolução

---

## Phase 6 — RPG Lab

* [ ] Character Generator
* [ ] Character Editor
* [ ] World Generator
* [ ] Seeds
* [ ] Kingdom Generator
* [ ] City Generator
* [ ] NPC Generator
* [ ] Factions
* [ ] Lore
* [ ] World History
* [ ] World Export

---

## Phase 7 — Simulation Lab

* [ ] Artificial creatures
* [ ] Environment
* [ ] Food system
* [ ] Energy system
* [ ] Reproduction
* [ ] Mutation
* [ ] Predators
* [ ] Generations
* [ ] Statistics
* [ ] Visualization
* [ ] Save/Load simulation
* [ ] Simulation replay

---

# 🎨 Design

## Conceito visual

O Jusq's deve parecer uma mistura de:

* laboratório experimental;
* software técnico;
* interface de jogo;
* sistema operacional;
* ferramenta científica.

Evitar uma estética SaaS tradicional.

---

## Layout

```text
┌─────────────────────────────────────────────────┐
│ JUSQ'S                              SYSTEM ONLINE│
├──────────────┬──────────────────────────────────┤
│              │                                  │
│ EXPERIMENTS  │                                  │
│              │             J U S Q ' S          │
│ ◉ Screen     │                                  │
│ ◉ Draw       │       DIGITAL EXPERIMENTS        │
│ ◉ RPG        │                                  │
│ ◉ Simulation │                                  │
│ ◉ GitHub     │                                  │
│              │                                  │
├──────────────┴──────────────────────────────────┤
│ CPU 12%   MEM 41%   WS 3   LAT 32ms             │
└─────────────────────────────────────────────────┘
```

---

# 🧱 Design System

Componentes compartilhados:

```text
NexusWindow
NexusPanel
NexusButton
NexusTerminal
NexusGraph
NexusTimeline
NexusMetric
NexusStatus
NexusConsole
```

Os nomes dos componentes poderão ser ajustados para refletir a identidade final do Jusq's.

---

# 🔐 Segurança

O projeto deve considerar:

* autenticação;
* autorização;
* validação de inputs;
* rate limiting;
* proteção contra abuso;
* sanitização;
* gerenciamento seguro de tokens;
* controle de permissões;
* segurança de WebSocket;
* segurança de WebRTC signaling.

---

# 📈 Performance

Performance será tratada como parte dos experimentos.

Possíveis métricas:

```text
API Response Time
WebSocket Latency
WebRTC RTT
Packet Loss
Database Query Time
Memory Usage
CPU Usage
Rendering FPS
```

Problemas de performance devem ser medidos antes de serem otimizados.

---

# 📝 Documentação

Cada experimento deverá possuir documentação própria.

Exemplo:

```text
docs/
│
├── architecture/
│   ├── overview.md
│   ├── realtime.md
│   └── decisions.md
│
├── experiments/
│   ├── screen-lab.md
│   ├── draw-lab.md
│   ├── rpg-lab.md
│   ├── simulation-lab.md
│   └── github-rpg.md
│
└── adr/
    ├── 001-monorepo.md
    ├── 002-websocket.md
    └── 003-webrtc.md
```

---

# 📚 Architecture Decision Records

Decisões importantes devem ser documentadas.

Exemplo:

```text
ADR-001

Title:
Use TypeScript as the primary language

Status:
Accepted

Context:
The project contains frontend, backend and realtime
components that benefit from shared types.

Decision:
Use TypeScript across the project.

Consequences:
+ Shared types
+ Better tooling
+ Safer refactoring
- Additional type complexity
```

---

# 🔄 Versionamento

O projeto utilizará Semantic Versioning quando apropriado.

```text
v0.1.0
v0.2.0
v0.3.0
v1.0.0
```

Versões não representam necessariamente um produto final.

Um experimento pode evoluir independentemente.

---

# 📌 Primeiro objetivo

O primeiro milestone do Jusq's será:

## `v0.1 — Screen Lab`

O objetivo é conseguir:

```text
PC A
  ↓
Jusq's
  ↓
Screen Lab
  ↓
Create Room
  ↓
Share Link
  ↓
PC B
  ↓
Screen
```

Com o mínimo necessário:

* Next.js;
* TypeScript;
* Fastify;
* WebSocket;
* WebRTC.

Explicitamente **fora** do primeiro milestone:

* Docker;
* PostgreSQL;
* Redis;
* CI;
* testes;
* autenticação;
* design system.

Nada disso está descartado — apenas não é pré-requisito para a tela aparecer do
outro lado. Tudo entra na Phase 1, quando os requisitos forem reais.

O objetivo inicial não é criar uma solução perfeita.

É **fazer funcionar e começar a experimentar**.

---

# 🚧 Futuro

O roadmap não é fechado.

Novos experimentos podem ser adicionados a qualquer momento.

Possibilidades:

```text
[06] Music Lab
[07] Physics Lab
[08] AI Lab
[09] Game Engine
[10] Procedural Dungeon
[11] Virtual OS
[12] ???
```

O único requisito é:

> **Ser interessante o suficiente para querer descobrir como construir.**

---

# 📜 License

A definir.

```

Eu faria uma pequena alteração em relação à documentação anterior: **começaria o desenvolvimento pelo Screen Lab**, porque ele te força a sair da sua zona de conforto técnica imediatamente — WebRTC, realtime, métricas, conexão entre clientes e problemas de rede — enquanto o restante do Jusq's pode nascer aos poucos em volta dele.
```
