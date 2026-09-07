# ADR-003, Postgres não entra na Phase 1

**Status:** Aceito
**Data:** setembro/2026
**Fase:** Phase 1 (base concreta)

---

## Contexto

A Phase 1 foi escrita com três itens de persistência:

- PostgreSQL (Neon)
- Persistência de salas
- Docker Compose (ambiente local)

Eles foram listados **antes** de existir uma resposta para a pergunta que os
justifica. A resposta veio ao começar a fase:

> A sala não precisa sobreviver. Ela dura até a última pessoa sair.

Isso não é uma limitação aceita a contragosto, é o comportamento correto de
uma sala de transmissão. Uma sala vazia não tem o que guardar: não há histórico,
não há dono, não há convite pendente, não há nada que alguém volte para buscar.
O link é gerado no cliente e a sala nasce quando o primeiro peer entra.

E é exatamente isso que `RoomRegistry` já faz, inclusive apagando a sala quando
ela esvazia, com teste cobrindo esse caso.

O terceiro item cai por consequência. O próprio `DEPLOY.md` já registrava a
condição:

> Docker entra aqui apenas como formato de deploy do servidor; como ambiente
> local, só quando houver banco para orquestrar.

Sem banco, um `docker-compose.yml` orquestraria dois processos que `pnpm dev` já
sobe em um comando.

## Decisão

Adiar os três. Nenhum é descartado; nenhum é construído agora.

O que **fica** é a variável `DATABASE_URL`, validada em `packages/config` e
documentada no `.env.example`. Ela é a costura, não a implementação: não existe
driver, schema nem leitura.

## Gatilho

Este ADR se reabre quando aparecer dado que precise sobreviver ao processo. Não
é hipotético, o roadmap já tem três candidatos:

| Fase                | O que passa a precisar de banco                                                       |
| ------------------- | ------------------------------------------------------------------------------------- |
| Phase 4, Draw Lab   | histórico de traços e replay: o desenho é o produto, e ele não pode morrer no restart |
| Phase 5, GitHub RPG | perfil, XP e conquistas: dado de usuário, acumulado ao longo do tempo                 |
| Phase 6, RPG Lab    | mundos gerados e suas seeds                                                           |

O Draw Lab é o primeiro. Quando ele chegar, os requisitos do schema serão
conhecidos, que é a condição que a Regra 5 pede.

## Consequências

- A Phase 1 termina sem banco. O que ela entrega é o que faz o projeto
  continuar funcionando: lint, testes, log estruturado, validação de ambiente,
  CI e o endpoint de ICE.
- O estado continua morrendo no restart do servidor. Com o Render dormindo após
  15 minutos, isso acontece com frequência, e não custa nada, porque o que
  morre junto é uma sala que já estava vazia.
- Quando o banco entrar, entrará com um schema que resolve um problema real, e
  não com as sete tabelas que a documentação inicial imaginou.

## Alternativa considerada

**Construir o Postgres mesmo assim, "para deixar pronto".** Rejeitada pela
Regra 5 do próprio projeto: estrutura construída antes de existir o requisito é
estrutura adivinhada. O custo não é o dia de trabalho, é o schema errado que
depois precisa de migração para virar o certo.
