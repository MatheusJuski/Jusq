# Jusq's

> A personal playground for realtime systems, games, simulations and digital experiments.

Laboratório pessoal de desenvolvimento. Um conjunto de experimentos independentes
sobre uma mesma infraestrutura.

**Status:** `v0.1` — Phase 0 (Walking Skeleton) · Screen Lab

---

## Rodando

Requer **Node 20+** e **pnpm**.

```bash
pnpm install

cp apps/web/.env.example apps/web/.env.local
cp apps/server/.env.example apps/server/.env

pnpm dev
```

| Serviço | URL |
| ------- | --- |
| Web | http://localhost:3000 |
| Signaling | http://localhost:3001 |
| Health | http://localhost:3001/health |

Para rodar separadamente: `pnpm dev:web` e `pnpm dev:server`.

### Testando o Screen Lab

1. Abra http://localhost:3000 e clique em **CRIAR SALA**
2. Copie o link
3. Abra o link em outro navegador (ou outra máquina na mesma rede)
4. Clique em **COMPARTILHAR TELA** em um dos dois

> `getDisplayMedia` exige contexto seguro. Funciona em `localhost`, mas para
> testar entre máquinas é preciso HTTPS — ou seja, o deploy.

---

## Estrutura

```text
jusqs/
├── apps/
│   ├── web/         Next.js — interface
│   └── server/      Fastify — signaling WebSocket
├── packages/
│   └── types/       contrato de signaling compartilhado
└── DOCs/
```

---

## Scripts

| Comando | Efeito |
| ------- | ------ |
| `pnpm dev` | web + server em paralelo |
| `pnpm build` | build de todos os pacotes |
| `pnpm typecheck` | typecheck de todos os pacotes |

## Deploy

O projeto roda inteiro em free tier (R$ 0/mês).

* [`DOCs/TUTORIAL-DEPLOY.md`](DOCs/TUTORIAL-DEPLOY.md) — passo a passo
* [`DOCs/DEPLOY.md`](DOCs/DEPLOY.md) — estratégia, custos e limites

Para reproduzir o build de produção do servidor localmente:

```bash
docker build -f apps/server/Dockerfile -t jusqs-server .
docker run --rm -p 3001:8000 -e PORT=8000 jusqs-server
```

---

## Escopo do V0

O objetivo desta fase é **fazer funcionar**, não fazer bonito.

**Está dentro:**

* signaling via WebSocket
* salas em memória (`Map()`)
* WebRTC peer-to-peer, mesh de até 4 peers
* compartilhamento de tela, com áudio quando disponível
* perfis de qualidade (480p a 1080p, 30/60fps) com teto de bitrate

**Está fora — deliberadamente:**

* TURN, persistência, reconexão
* Docker, PostgreSQL, Redis, CI, testes
* autenticação, gravação, câmera, métricas de qualidade

Nada disso foi descartado; é a Phase 1 em diante. Ver
[`DOCs/DocumentaçãoV0.1.md`](DOCs/Documenta%C3%A7%C3%A3oV0.1.md) para o roadmap
e [`DOCs/DEPLOY.md`](DOCs/DEPLOY.md) para hospedagem e custos.

### Limitações conhecidas

* **Um transmissor por vez.** Dois peers compartilhando ao mesmo tempo causam
  glare na negociação. Perfect negotiation é Phase 3.
* **Malha mesh, teto de 4 peers.** Cada espectador recebe uma cópia própria, e
  quem transmite envia todas elas. A 720p30 (1,5 Mbps), três espectadores já
  custam ~4,5 Mbps de upload — é esse crescimento linear que justifica um SFU
  na Phase 3.
* **Sem TURN.** Entre redes diferentes com NAT simétrico a conexão falha. É
  esse problema que justifica o TURN na Phase 1.
* **Estado volátil.** Reiniciar o servidor derruba todas as salas.
* **Som começa desligado.** O browser só autoriza autoplay com o elemento
  `muted`; sem isso a reprodução é barrada com `NotAllowedError` e a tela fica
  preta. O painel remoto traz um botão **SOM** — o clique é o gesto que o
  browser exige para liberar o áudio.
* **Áudio só existe em algumas fontes.** Limitação da plataforma, não do
  projeto:

  | Fonte | Áudio |
  | ----- | ----- |
  | Aba do navegador | sim — marque "compartilhar áudio da guia" |
  | Janela isolada | **nunca** — nenhum browser suporta |
  | Tela inteira | teoricamente sim; na prática, ver abaixo |
  | Dispositivo de entrada | sim — caminho alternativo, sempre disponível |

  Quando a captura de áudio falha, a transmissão continua **só com vídeo** em
  vez de não acontecer: `getDisplayMedia` trata `audio: true` como obrigatório
  e derrubaria o vídeo junto.

  Para som de um programa fora do navegador (um jogo, por exemplo), o caminho
  confiável é **desacoplar as fontes**: vídeo da captura de tela, áudio de um
  dispositivo de entrada (`Mixagem Estéreo` no Windows, ou um cabo virtual).
  É isso que o seletor de fonte de áudio da sala faz.

### Áudio de tela inteira: investigação encerrada

Capturar o áudio do sistema junto da tela inteira falha com
`NotReadableError: Could not start audio source` em pelo menos uma máquina
Windows 11 / Chromium 152, e **não há correção do lado da aplicação**.

O que foi descartado por medição, não por suposição:

| Hipótese | Resultado |
| -------- | --------- |
| Formato do pedido | 5 variantes testadas — falha idêntica em todas |
| `systemAudio: 'include'` | não altera nada |
| Restrições de áudio | não alteram nada |
| HTTP vs HTTPS | falha em `localhost` e em produção |
| Versão do Chromium | 152, muito acima do 142 exigido pelo recurso |
| Navegador | falha em Brave e Edge |
| Escudo do Brave | falha com proteção desligada |

O `getDisplayMedia` rejeita **antes** de entregar qualquer trilha — a
`displaySurface` volta vazia.

O Google Meet **captura com sucesso** na mesma máquina, no mesmo navegador,
com áudio confirmado por outro participante. E usa a mesma API —
`getDisplayMedia` com `systemAudio`, disponível a partir do Chrome 142. Não
há caminho privilegiado nem origem allowlistada.

Sendo o mesmo pedido no mesmo ambiente, resta uma diferença de **estado**: no
Meet o microfone já está aberto quando a tela é compartilhada. Nossa
aplicação não toca em nenhum dispositivo de áudio antes de pedir a captura.

O [Jitsi Meet chegou ao mesmo ponto](https://github.com/jitsi/jitsi-meet/issues/15418)
e fechou a issue como *not planned*.

> Não reabra essa investigação sem um dado novo. O caminho que funciona é o
> dispositivo de entrada.


