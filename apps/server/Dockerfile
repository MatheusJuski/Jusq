# Servidor de signaling do Jusq's.
#
# O build empacota tudo num único arquivo (incluindo @jusqs/types, que é
# publicado como TypeScript cru). Por isso a imagem final não carrega
# node_modules nem o monorepo, só o Node e um bundle.
#
# Contexto de build: a RAIZ do monorepo, não esta pasta.
#   docker build -f apps/server/Dockerfile -t jusqs-server .

# ---------------------------------------------------------------- builder
FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /repo

# Manifests primeiro: o cache do Docker só invalida quando as dependências
# mudam, não a cada alteração de código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/types/package.json ./packages/types/

RUN pnpm install --frozen-lockfile --filter @jusqs/server...

COPY packages/config ./packages/config
COPY packages/logger ./packages/logger
COPY packages/types ./packages/types
COPY apps/server ./apps/server

RUN pnpm --filter @jusqs/server build

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Não rodar como root.
USER node

COPY --from=builder --chown=node:node /repo/apps/server/dist/index.js ./index.js

# ATENCAO: o Render NAO injeta PORT automaticamente e espera a porta 10000 por
# padrao. Defina PORT=10000 nas variaveis de ambiente do servico, ou a
# plataforma nao encontra o processo. 3001 e apenas o padrao local.
ENV PORT=3001
EXPOSE 3001

CMD ["node", "index.js"]
