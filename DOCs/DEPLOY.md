# Jusq's — Deploy & Custos

> **Veredito: R$ 0,00/mês.** O Jusq's roda inteiro em free tier, incluindo a parte
> historicamente cara (WebRTC / TURN).

**Verificado em:** setembro/2026
**Status:** free tier muda com frequência — revalidar antes de cada mudança de infra.

---

## 💰 Resumo de custo

| Item | Custo |
| ---- | ----- |
| Infraestrutura mensal | **R$ 0,00** |
| Domínio próprio (opcional) | ~R$ 40,00 / ano (`.com.br` no Registro.br) |
| Conforto (VPS, opcional) | ~R$ 30,00 / mês |

O projeto **não precisa de cartão de crédito** para começar.

---

## 🎯 Setup A — Recomendado para começar

Zero configuração de servidor. Deploy no mesmo dia.

| Componente | Serviço | Limite relevante |
| ---------- | ------- | ---------------- |
| Web (Next.js) | Vercel Hobby | Grátis — **uso não-comercial** |
| Server (Fastify + WS) | **Koyeb** free | 1 serviço, WebSocket OK, sem cartão — **dorme** |
| PostgreSQL | **Neon** free | 0,5 GB storage, 5 GB transfer/mês, acorda em <500ms |
| TURN + SFU | Cloudflare Realtime | 1 TB/mês grátis, depois $0,05/GB |
| Storage / R2 | Cloudflare R2 | 10 GB, **egress zero** |
| CI/CD | GitHub Actions | Ilimitado em repositório público |
| Domínio | `*.vercel.app` | Grátis |

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
      │    Koyeb    │
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

**Trade-off:** o Koyeb usa *scale-to-zero*. O serviço dorme sem uso e acorda sob
demanda — quem abrir o link espera o cold start. Chato para uma demo realtime,
mas não impeditivo.

---

## 🖥️ Setup B — R$ 0/mês, sem dormir

Uma VM **Oracle Cloud Always Free** rodando Fastify + Postgres + coturn via
Docker Compose. Vercel continua servindo o front.

* 2 OCPU ARM / 12 GB RAM / **10 TB de egress** — always free
* Sem sleep, sem cold start
* É exatamente o que o roadmap quer exercitar: Docker, infra, observabilidade

**Ressalvas honestas:**

* A Oracle **cortou esse tier pela metade em junho/2026** (era 4 OCPU / 24 GB),
  sem anúncio público.
* Capacidade ARM é disputada em algumas regiões.
* Existe política de *idle reclaim* — instância ociosa pode ser recuperada.
* Você vira o sysadmin.

---

## 💳 Setup C — Quando cansar (~R$ 30/mês)

VPS Hetzner CX22 (~€4/mês) ou equivalente.

Sem sleep, sem loteria de capacidade, sem drama. É o preço de parar de brigar
com free tier.

---

## 🚫 O que NÃO usar

Erros comuns em tutoriais desatualizados:

| Serviço | Problema |
| ------- | -------- |
| **Render** (free) | **WebSocket só em plano pago.** Inviabiliza o Jusq's inteiro |
| **Fly.io** (free) | Free tier acabou. Hoje é trial de 2h de VM ou 7 dias |
| **Supabase** (free) | **Pausa o projeto após 1 semana de inatividade** e derruba a Auth API junto — a demo do portfólio quebra toda vez |

O Neon foi escolhido no lugar do Supabase justamente por isso: ele suspende, mas
retoma na próxima query.

---

## ⚠️ Limites — e quando eles quebram

| Limite | Quando vira problema |
| ------ | -------------------- |
| Vercel Hobby proíbe uso comercial | No dia em que o projeto monetizar |
| Neon: 5 GB transfer/mês por projeto | É o teto que aperta primeiro |
| Neon: 0,5 GB de storage | Muito tempo longe, exceto se guardar blobs no PG (não guarde — use R2) |
| Cloudflare: 1 TB/mês | **Compartilhado entre TURN e SFU** — não são dois tetos |

### Dimensionamento do TURN

```text
Screen share @ ~3 Mbps   ≈ 1,3 GB / hora (relayed)
TURN só entra em          ≈ 15-20% das conexões (NAT simétrico, rede corporativa)
Teto grátis               = 1.000 GB / mês
```

Seriam necessárias centenas de horas de demo por mês para encostar no limite.

---

## 🛡️ Regras de proteção

1. **Não cadastrar cartão** onde não for exigido (Koyeb e Neon não pedem).
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

* [ ] Repositório público no GitHub
* [ ] Conta Vercel (login via GitHub)
* [ ] Conta Koyeb (sem cartão)
* [ ] Conta Neon (sem cartão) + connection string
* [ ] Conta Cloudflare + credenciais TURN
* [ ] Bucket R2 criado
* [ ] Deploy do `apps/web` na Vercel
* [ ] Deploy do `apps/server` no Koyeb
* [ ] Variáveis de ambiente configuradas nos dois
* [ ] WebSocket conectando de ponta a ponta em produção
* [ ] GitHub Actions rodando lint + typecheck

> Deployar cedo. Projeto não deployado é projeto que morre.

---

## 🔗 Fontes

* [Fly.io Free Tier 2026](https://www.saaspricepulse.com/blog/flyio-free-tier-2026)
* [Platforms with a real free tier for developers in 2026 (Render)](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)
* [Koyeb Free Tier 2026](https://www.srvrlss.io/provider/koyeb/)
* [Cloudflare Realtime — SFU/TURN pricing](https://developers.cloudflare.com/realtime/sfu/pricing)
* [Oracle Quietly Halves Free Tier Ampere A1 Compute Limits (InfoQ)](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
* [Oracle Always Free Resources (docs oficiais)](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
* [Database Free Tier Comparison 2026](https://agentdeals.dev/database-free-tier-comparison-2026)
* [Neon vs Supabase 2026](https://layerbase.com/blog/neon-vs-supabase)
