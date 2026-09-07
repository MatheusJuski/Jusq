# Jusq's — Deploy & Custos

> **Veredito: R$ 0,00/mês.** O Jusq's roda inteiro em free tier, incluindo a parte
> historicamente cara (WebRTC / TURN).

> Para o passo a passo executável, ver
> [`TUTORIAL-DEPLOY.md`](./TUTORIAL-DEPLOY.md). Este documento é a estratégia:
> custos, limites e por que cada serviço foi escolhido.

**Verificado em:** setembro/2026
**Status:** free tier muda com frequência — revalidar antes de cada mudança de infra.

---

## 💰 Resumo de custo

| Item                       | Custo                                      |
| -------------------------- | ------------------------------------------ |
| Infraestrutura mensal      | **R$ 0,00**                                |
| Domínio próprio (opcional) | ~R$ 40,00 / ano (`.com.br` no Registro.br) |
| Conforto (VPS, opcional)   | ~R$ 30,00 / mês                            |

O projeto **não precisa de cartão de crédito** para começar.

---

## 🎯 Setup A — Recomendado para começar

Zero configuração de servidor. Deploy no mesmo dia.

| Componente            | Serviço             | Limite relevante                                      |
| --------------------- | ------------------- | ----------------------------------------------------- |
| Web (Next.js)         | Vercel Hobby        | Grátis — **uso não-comercial**                        |
| Server (Fastify + WS) | **Render** free     | Docker + WebSocket, 750 h/mês — **dorme após 15 min** |
| PostgreSQL            | **Neon** free       | 0,5 GB storage, 5 GB transfer/mês, acorda em <500ms   |
| TURN + SFU            | Cloudflare Realtime | 1 TB/mês grátis, depois $0,05/GB                      |
| Storage / R2          | Cloudflare R2       | 10 GB, **egress zero**                                |
| CI/CD                 | GitHub Actions      | Ilimitado em repositório público                      |
| Domínio               | `*.vercel.app`      | Grátis                                                |

```text
                        INTERNET
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      ┌─────────────┐            ┌──────────────┐
      │   Vercel    │            │  Cloudflare  │
      │  Next.js    │            │  TURN / SFU  │
      └──────┬──────┘            └──────┬───────┘
             │                          │
     HTTPS / WebSocket              WebRTC media
             │                          │
             ▼                          ▼
      ┌─────────────┐              Client A ←→ B
      │   Render    │
      │   Fastify   │
      │  WS + Sign. │
      └──────┬──────┘
             │
      ┌──────┴──────┐
      ▼             ▼
   ┌──────┐     ┌──────┐
   │ Neon │     │  R2  │
   │  PG  │     │ Files│
   └──────┘     └──────┘
```

**Trade-off:** o Render dorme após **15 minutos sem tráfego** (HTTP ou mensagem
WebSocket) e leva **~1 minuto** para acordar. Quem abrir o link com o serviço
frio espera esse minuto. Chato para uma demo realtime, mas não impeditivo.

> Uma sessão já estabelecida **não cai** se o serviço dormir: depois do ICE, a
> mídia é peer-to-peer e não passa pelo servidor. O que falha é alguém novo
> tentar entrar enquanto ele acorda.

---

## 🖥️ Setup B — R$ 0/mês, sem dormir

Uma VM **Oracle Cloud Always Free** rodando Fastify + Postgres + coturn via
Docker Compose. Vercel continua servindo o front.

- 2 OCPU ARM / 12 GB RAM / **10 TB de egress** — always free
- Sem sleep, sem cold start
- É exatamente o que o roadmap quer exercitar: Docker, infra, observabilidade

**Ressalvas honestas:**

- A Oracle **cortou esse tier pela metade em junho/2026** (era 4 OCPU / 24 GB),
  sem anúncio público.
- Capacidade ARM é disputada em algumas regiões.
- Existe política de _idle reclaim_ — instância ociosa pode ser recuperada.
- Você vira o sysadmin.

---

## 💳 Setup C — Quando cansar (~R$ 30/mês)

VPS Hetzner CX22 (~€4/mês) ou equivalente.

Sem sleep, sem loteria de capacidade, sem drama. É o preço de parar de brigar
com free tier.

---

## 🚫 O que NÃO usar

Erros comuns em tutoriais desatualizados:

| Serviço                              | Problema                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Koyeb** (free)                     | **Acabou.** Adquirido pela Mistral em fev/2026; o plano Starter gratuito foi removido e novos usuários precisam assinar |
| **Fly.io** (free)                    | Free tier acabou. Hoje é trial de 2h de VM ou 7 dias                                                                    |
| **Vercel / Netlify** (para o server) | Não sustentam processo vivo — sem WebSocket. Servem só o front                                                          |
| **Supabase** (free)                  | **Pausa o projeto após 1 semana de inatividade** e derruba a Auth API junto — a demo do portfólio quebra toda vez       |

O Neon foi escolhido no lugar do Supabase justamente por isso: ele suspende, mas
retoma na próxima query.

---

## ⚠️ Limites — e quando eles quebram

| Limite                              | Quando vira problema                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Vercel Hobby proíbe uso comercial   | No dia em que o projeto monetizar                                      |
| Neon: 5 GB transfer/mês por projeto | É o teto que aperta primeiro                                           |
| Neon: 0,5 GB de storage             | Muito tempo longe, exceto se guardar blobs no PG (não guarde — use R2) |
| Cloudflare: 1 TB/mês                | **Compartilhado entre TURN e SFU** — não são dois tetos                |

### Dimensionamento do TURN

```text
Screen share @ ~3 Mbps   ≈ 1,3 GB / hora (relayed)
TURN só entra em          ≈ 15-20% das conexões (NAT simétrico, rede corporativa)
Teto grátis               = 1.000 GB / mês
```

Seriam necessárias centenas de horas de demo por mês para encostar no limite.

### Como o TURN é configurado

O provedor **não está escolhido**, e o código não depende disso. O servidor de
signaling monta a configuração de ICE e serve em `GET /ice`; o cliente pergunta
em vez de carregar embutido. Trocar de provedor é mudar variável de ambiente.

| Variável                          | Efeito                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| `TURN_URLS`                       | servidores TURN, separados por vírgula. Vazio = só STUN         |
| `TURN_SECRET`                     | segredo compartilhado — o servidor deriva credencial que expira |
| `TURN_TTL_SECONDS`                | validade da credencial derivada (padrão 3600)                   |
| `TURN_USERNAME` / `TURN_PASSWORD` | credencial fixa, para provedor sem segredo compartilhado        |

Os dois modos são mutuamente exclusivos, e o boot recusa a combinação — assim
como recusa servidor sem credencial e credencial sem servidor.

**Prefira o segredo compartilhado.** É o TURN REST API que o coturn implementa:
a credencial expira, então uma que vaze não vira banda paga indefinidamente.
Isso cobre o caminho do Setup B (coturn na VM Oracle) sem código novo.

Para o **Cloudflare Realtime**, a emissão de credencial passa pela API deles, e
não por segredo compartilhado — é uma terceira estratégia em
[`apps/server/src/ice.ts`](../apps/server/src/ice.ts), a escrever no dia em que
o provedor for escolhido. Enquanto isso, credencial fixa funciona.

> O que **não** existe mais: `NEXT_PUBLIC_ICE_SERVERS`. Variável `NEXT_PUBLIC_*`
> vira texto literal no bundle, e usuário e senha de TURN ficariam legíveis para
> quem abrisse o DevTools — gastando a banda da sua conta.

---

## 🛡️ Regras de proteção

1. **Não cadastrar cartão** onde não for exigido (Render e Neon não pedem).
   É a proteção mais eficaz contra cobrança inesperada.
2. **Manter o repositório público** — GitHub Actions fica ilimitado.
3. **Definir spend limit** em qualquer serviço que exija cartão.
4. **Nunca subir blob para o Postgres.** Arquivo vai para o R2.
5. Revalidar este documento antes de qualquer migração de infra.

---

## 📋 Caminho de evolução

```text
Setup A (grátis, dorme)
        │
        │  cold start começou a incomodar
        ▼
Setup B (grátis, VM própria)   ──ou──   Setup C (~R$30/mês, sem dor)
```

**Recomendação:** começar pelo **Setup A**. Ele tira o projeto do zero hoje —
coerente com a Regra 2 do README ("complexidade deve ser conquistada").

Não começar pela VM. São duas semanas configurando Linux em vez de escrever
signaling.

---

## ✅ Checklist — Phase 0

- [ ] Repositório público no GitHub
- [ ] Conta Vercel (login via GitHub)
- [ ] Conta Render (sem cartão)
- [ ] Conta Neon (sem cartão) + connection string
- [ ] Conta Cloudflare + credenciais TURN
- [ ] Bucket R2 criado
- [ ] Deploy do `apps/server` no Render _(primeiro — a Vercel precisa da URL)_
- [ ] Deploy do `apps/web` na Vercel
- [ ] Variáveis de ambiente configuradas nos dois
- [ ] WebSocket conectando de ponta a ponta em produção
- [ ] GitHub Actions rodando lint + typecheck

> Deployar cedo. Projeto não deployado é projeto que morre.

---

## 🔗 Fontes

- [Fly.io Free Tier 2026](https://www.saaspricepulse.com/blog/flyio-free-tier-2026)
- [Platforms with a real free tier for developers in 2026 (Render)](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
- [Render — Free instance limits (docs oficiais)](https://render.com/docs/free)
- [Mistral AI buys Koyeb (TechCrunch, fev/2026)](https://techcrunch.com/2026/02/17/mistral-ai-buys-koyeb-in-first-acquisition-to-back-its-cloud-ambitions/)
- [Cloudflare Realtime — SFU/TURN pricing](https://developers.cloudflare.com/realtime/sfu/pricing)
- [Oracle Quietly Halves Free Tier Ampere A1 Compute Limits (InfoQ)](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [Oracle Always Free Resources (docs oficiais)](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Database Free Tier Comparison 2026](https://agentdeals.dev/database-free-tier-comparison-2026)
- [Neon vs Supabase 2026](https://layerbase.com/blog/neon-vs-supabase)
