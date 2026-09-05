# Tutorial — Subindo o Jusq's

Passo a passo para colocar o Screen Lab no ar. Custo: **R$ 0,00**.

Para a estratégia de hospedagem, limites e comparação de plataformas, ver
[`DEPLOY.md`](./DEPLOY.md). Este documento é só a execução.

**Tempo estimado:** 30 a 45 minutos na primeira vez.

---

## O resultado final

```text
        github.com/<voce>/jusqs
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
   ┌─────────┐        ┌──────────┐
   │ Vercel  │        │  Render  │
   │  Next   │───ws──▶│ Fastify  │
   └─────────┘        └──────────┘
        │
        ▼
  https://jusqs.vercel.app/room/abc123
```

Um link que você manda para qualquer pessoa e ela vê sua tela.

---

## Por que o deploy faz parte da Phase 0

Não é polimento — é o que torna a fase verificável.

`getDisplayMedia` só funciona em **contexto seguro**. Em `localhost` o browser
abre uma exceção, mas entre duas máquinas é preciso HTTPS. Sem deploy, o
critério de conclusão da Phase 0 (dois PCs em redes diferentes) é impossível de
testar.

---

## Pré-requisitos

* Conta no GitHub
* O projeto commitado localmente
* Nenhum cartão de crédito

---

## Parte 1 — Código no GitHub

O Render e a Vercel puxam direto do repositório.

1. Crie um repositório em <https://github.com/new>
   * Nome: `jusqs`
   * Visibilidade: **público** (o GitHub Actions fica ilimitado assim)
   * **Não** marque nada em "Initialize this repository"

2. No terminal, na raiz do projeto:

```bash
git remote add origin https://github.com/<seu-usuario>/jusqs.git
git push -u origin main
```

> Se já existir um remote `origin`, use `git remote set-url origin <url>`.

3. Confirme que `node_modules/` **não** subiu. Se subiu, o `.gitignore` não foi
   commitado antes dos arquivos.

---

## Parte 2 — Servidor no Render

O servidor precisa ser um processo vivo por causa do WebSocket. Vercel Functions
não servem para isso — daí a separação.

> **Por que Render e não Koyeb:** o Koyeb foi adquirido pela Mistral em
> fevereiro de 2026 e o plano gratuito foi removido para novos usuários. O
> Render free suporta Docker e WebSocket, e não pede cartão.

### 2.1 Criar o serviço

1. Entre em <https://render.com> e crie a conta com GitHub
2. **New** → **Web Service**
3. Conecte o repositório `jusqs`

### 2.2 Configurar

Esta é a parte que erra fácil. Há **duas opções** — o campo `Language` decide
qual formulário aparece.

Ambas foram testadas e produzem o mesmo binário. Escolha uma.

#### Opção A — Docker *(recomendada)*

| Campo | Valor |
| ----- | ----- |
| Name | `jusqs-server` |
| **Language** | **Docker** |
| Branch | `main` |
| Region | qualquer |
| Root Directory | *(vazio)* |
| **Dockerfile Path** | `./apps/server/Dockerfile` |
| **Docker Build Context Directory** | `.` |
| Instance Type | **Free** ($0, 0.1 CPU, 512 MB) |
| Health Check Path | `/health` |

> **Build Context precisa ser `.` (a raiz do repo).** O Dockerfile depende de
> `pnpm-lock.yaml`, `pnpm-workspace.yaml` e `packages/types`, que ficam fora de
> `apps/server`. Apontar o contexto para `apps/server` quebra o build.

Vantagem: é o mesmo build que roda na sua máquina, então dá para reproduzir
qualquer falha localmente (ver o fim deste documento).

#### Opção B — Node

Se o formulário mostrar **Build Command** e **Start Command**, o `Language`
está como Node. Nesse caso use:

| Campo | Valor |
| ----- | ----- |
| Name | `jusqs-server` |
| **Language** | **Node** |
| Branch | `main` |
| Region | qualquer |
| Root Directory | *(vazio)* |
| **Build Command** | `pnpm install --frozen-lockfile --filter @jusqs/server... && pnpm --filter @jusqs/server build` |
| **Start Command** | `node apps/server/dist/index.js` |
| Instance Type | **Free** ($0, 0.1 CPU, 512 MB) |
| Health Check Path | `/health` |

Três detalhes que importam:

* **Root Directory vazio.** Apontar para `apps/server` esconde o
  `pnpm-workspace.yaml` e o `packages/types`, e o build quebra.
* **`--filter @jusqs/server...`** — as reticências não são erro de digitação.
  Elas mandam o pnpm instalar o servidor **e suas dependências de workspace**
  (`packages/types`), pulando o Next.js e o app web.
* O Start Command padrão sugerido pelo Render (`yarn start`) **não serve** —
  este projeto usa pnpm e o entrypoint está em `apps/server/dist/`.

### 2.3 Porta e variáveis de ambiente

Aqui há uma armadilha: **o Render não injeta `PORT` automaticamente.** Ele
espera que o serviço escute na porta **10000** por padrão. O código usa `3001`
como padrão local, então sem configurar nada a plataforma não encontra o
processo.

Em **Environment Variables**, adicione:

| Name | Value | Quando |
| ---- | ----- | ------ |
| `PORT` | `10000` | **sempre** |
| `CORS_ORIGIN` | `https://<seu-app>.vercel.app` | só na Parte 4 |

Sobre `NODE_ENV`: **não precisa configurar**.

* Na Opção A (Docker), o próprio Dockerfile define `NODE_ENV=production` — o
  Render *não* define isso para serviços Docker.
* Na Opção B (Node), o Render define automaticamente.
* E o servidor sobe corretamente mesmo sem a variável: ele decide o formato de
  log por disponibilidade do `pino-pretty`, não por `NODE_ENV`.

> Esse último ponto existe porque a versão anterior **quebrava no boot** sem
> `NODE_ENV=production` — o `pino-pretty` é devDependency e não está no bundle,
> e o Fastify morria com `unable to determine transport target`. Um deploy não
> deve depender de alguém lembrar de uma variável para o processo subir.

### 2.4 Deploy

Clique em **Create Web Service** e espere (3 a 6 minutos na primeira vez).

Ao final você recebe uma URL:

```text
https://jusqs-server.onrender.com
```

**Anote — você vai precisar dela na Parte 3.**

### 2.5 Verificar

```bash
curl https://jusqs-server.onrender.com/health
```

Resposta esperada:

```json
{ "status": "ok", "uptime": 12, "rooms": 0, "peers": 0 }
```

Se o serviço estiver dormindo, a primeira chamada demora ~1 minuto. Isso é
normal no plano free.

---

## Parte 3 — Web na Vercel

1. Entre em <https://vercel.com> e crie a conta com GitHub
2. **Add New** → **Project** → importe `jusqs`

### 3.1 Configurar

| Campo | Valor |
| ----- | ----- |
| Framework Preset | Next.js *(detectado)* |
| **Root Directory** | **`apps/web`** |
| Build / Install Command | *(deixe o padrão)* |

> **Root Directory é o campo crítico.** Sem ele a Vercel tenta buildar a raiz do
> monorepo e falha. Ao definir `apps/web`, ela ainda instala a partir da raiz —
> é isso que faz `@jusqs/types` resolver.

### 3.2 Variável de ambiente

Antes de clicar em Deploy, abra **Environment Variables**:

| Name | Value |
| ---- | ----- |
| `NEXT_PUBLIC_SIGNALING_URL` | `wss://jusqs-server.onrender.com/ws` |

Três detalhes que quebram silenciosamente:

* **`wss://`**, não `ws://` — página HTTPS não abre WebSocket inseguro
* o sufixo **`/ws`** é obrigatório, é a rota do servidor
* variáveis `NEXT_PUBLIC_*` são embutidas **no build**; mudar depois exige
  redeploy

### 3.3 Deploy

Clique em **Deploy**. Ao final você recebe:

```text
https://jusqs-<algo>.vercel.app
```

---

## Parte 4 — Fechar o círculo

Cada lado precisa da URL do outro, então há uma ordem obrigatória: Render
primeiro (Parte 2), Vercel depois (Parte 3), e agora voltamos ao Render.

No Render, em **Environment** → **Add Environment Variable**, adicione:

| Name | Value |
| ---- | ----- |
| `CORS_ORIGIN` | `https://jusqs-<algo>.vercel.app` |

Redeploy o serviço.

> **Isso não afeta o WebSocket.** O browser não aplica CORS ao handshake de
> WebSocket — o Screen Lab funciona mesmo sem essa variável. Ela existe para as
> rotas HTTP (hoje só `/health`) e para quando a REST API chegar. Configurar
> agora evita um bug confuso na Phase 1.

---

## Parte 5 — Testar

1. Abra `https://jusqs-<algo>.vercel.app`
2. **CRIAR SALA**
3. **COPIAR LINK**
4. Mande o link para outra pessoa, em **outra rede** (celular no 4G serve)
5. Um dos dois clica em **COMPARTILHAR TELA**

### Se funcionar

A Phase 0 está concluída. O critério era exatamente esse.

### Se não funcionar

Olhe a tabela **WEBRTC** na página. Ela responde qual é o problema:

| Sintoma na tabela | Significado | O que fazer |
| ----------------- | ----------- | ----------- |
| `RECEBIDO` cresce, tela preta | mídia chega, não desenha | clique no vídeo (autoplay) |
| `CONN` = `failed`, `PAR` = `—` | ICE não achou caminho | **é NAT — precisa de TURN** |
| `CONN` = `connected`, `RECEBIDO` = 0 | negociou, ninguém envia | os dois transmitindo? (glare) |
| `PEERS 0` | signaling não conectou | veja "Problemas comuns" |

---

## O NAT vai aparecer

Entre redes diferentes, uma parte das conexões falha: NAT simétrico, rede
corporativa, CGNAT de operadora. O sintoma é `CONN: failed` com `PAR: —`.

**Isso não é bug.** É o problema que justifica o TURN, e a Phase 0 foi
desenhada para você encontrá-lo antes de adicionar a solução (Regra 1:
nenhuma tecnologia sem motivo).

A solução — Cloudflare Realtime, 1 TB/mês grátis — é a Phase 1. Quando chegar
lá, basta preencher `NEXT_PUBLIC_ICE_SERVERS` na Vercel; o código já lê essa
variável em [`apps/web/lib/ice.ts`](../apps/web/lib/ice.ts).

---

## Problemas comuns

### Build falha no Render com `ERR_PNPM_IGNORED_BUILDS`

O `allowBuilds` do `pnpm-workspace.yaml` não chegou no container. Confirme que o
arquivo está commitado e que a chave é **`allowBuilds`** (mapa de pacote →
booleano). O antigo `onlyBuiltDependencies` foi removido no pnpm 11 e é
ignorado **em silêncio** — passa local e quebra em container limpo.

### Build falha com `Cannot find module` ou `packages/types`

O **Docker Build Context Directory** não está como `.`. O contexto tem que ser
a raiz do repo, não `apps/server`.

### Render builda mas o serviço nunca fica "Live"

Faltou `PORT=10000` nas variáveis de ambiente. O Render procura o processo na
porta 10000; o padrão do código é 3001, e ele não encontra nada.

### Vercel: `Module not found: @jusqs/types`

Root Directory não está como `apps/web`, ou a opção de incluir arquivos fora do
root foi desativada.

### `PEERS 0` — signaling não conecta

Abra o console do browser (F12). Erro de WebSocket costuma ser:

* `ws://` no lugar de `wss://`
* falta do `/ws` no fim da URL
* a variável foi criada **depois** do build (`NEXT_PUBLIC_*` é embutida no
  build — refaça o deploy)

### Primeira conexão demora ~1 minuto

O plano free do Render dorme após **15 minutos sem tráfego** e leva cerca de um
minuto para acordar. Esperado.

Uma sessão já estabelecida não cai se isso acontecer no meio: depois do ICE a
mídia é peer-to-peer e não passa pelo servidor. O que falha é alguém novo
tentar entrar enquanto ele acorda.

Sair disso é o Setup B ou C do [`DEPLOY.md`](./DEPLOY.md).

### `getDisplayMedia is not a function`

A página não está em HTTPS, ou está sendo aberta pelo IP da máquina em vez do
domínio. Captura de tela exige contexto seguro.

---

## Redeploys

Ambas as plataformas observam o `main`:

```bash
git push
```

* Vercel: redeploy automático
* Render: redeploy automático

Mudou uma variável `NEXT_PUBLIC_*`? **Precisa de redeploy** — ela é embutida no
build, não lida em runtime.

---

## Testando a imagem localmente

Antes de culpar o Render, dá para reproduzir o build exato na sua máquina:

```bash
docker build -f apps/server/Dockerfile -t jusqs-server .

docker run --rm -p 3001:8000 -e PORT=8000 jusqs-server

curl http://localhost:3001/health
```

Se funciona aqui e falha no Render, o problema é configuração da plataforma —
não o código.
