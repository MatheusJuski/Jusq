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
* compartilhamento de tela

**Está fora — deliberadamente:**

* TURN, persistência, reconexão
* Docker, PostgreSQL, Redis, CI, testes
* autenticação, áudio, gravação, métricas

Nada disso foi descartado; é a Phase 1 em diante. Ver
[`DOCs/DocumentaçãoV0.1.md`](DOCs/Documenta%C3%A7%C3%A3oV0.1.md) para o roadmap
e [`DOCs/DEPLOY.md`](DOCs/DEPLOY.md) para hospedagem e custos.

### Limitações conhecidas

* **Um transmissor por vez.** Dois peers compartilhando ao mesmo tempo causam
  glare na negociação. Perfect negotiation é Phase 3.
* **Sem TURN.** Entre redes diferentes com NAT simétrico a conexão falha. É
  esse problema que justifica o TURN na Phase 1.
* **Estado volátil.** Reiniciar o servidor derruba todas as salas.
* **Vídeo sempre mudo.** A captura é `audio: false`, e o elemento `<video>`
  precisa estar `muted` para o browser autorizar o autoplay — sem isso a
  reprodução é barrada com `NotAllowedError` e a tela fica preta. Quando o
  áudio entrar (Phase 3), isso vira um controle de mute acionado por gesto do
  usuário.

---

## Licença

A definir.
