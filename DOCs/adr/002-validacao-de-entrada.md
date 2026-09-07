# ADR-002 — zod entra pelo ambiente, não pelo protocolo

**Status:** Aceito
**Data:** setembro/2026
**Fase:** Phase 1 (base concreta)

---

## Contexto

O V0 recusou zod explicitamente. O comentário em `apps/server/src/protocol.ts`
registra o motivo:

> Sem zod no V0 de propósito (Regra 1: nenhuma tecnologia sem motivo).
> O protocolo tem duas mensagens — uma biblioteca de schema aqui seria peso
> morto.

A Phase 1 traz um segundo lugar que precisa validar entrada: o **ambiente**.
E ele não se parece com o protocolo.

|                                    | Protocolo                          | Ambiente                                       |
| ---------------------------------- | ---------------------------------- | ---------------------------------------------- |
| Frequência                         | toda mensagem, milhares por sessão | uma vez, no boot                               |
| Origem                             | rede hostil                        | operador do deploy                             |
| Formas                             | 2 mensagens, 3 payloads            | 6 variáveis, com coerção, padrão, lista e enum |
| Custo do erro                      | descartar a mensagem               | processo torto por horas                       |
| O que a validação precisa devolver | `sim` ou `não`                     | **o nome da variável errada**                  |

O parser do protocolo responde uma pergunta binária num caminho quente. A
validação de ambiente precisa converter tipos (`"3001"` → `3001`), aplicar
padrões, quebrar listas e — o ponto que decide — **acumular todos os problemas
e nomear cada um**. Escrito à mão, isso não são vinte linhas: são os mesmos
combinadores que uma biblioteca de schema já traz, com menos testes.

## Decisão

Adotar **zod** em `packages/config`, para validação de ambiente.

**Manter** a validação manual em `apps/server/src/protocol.ts`. Ela está
correta, é o caminho quente, tem 30 testes cobrindo o lado hostil, e trocá-la
não resolveria problema nenhum.

O critério de quando isso muda está escrito no próprio `protocol.ts`: "se ele
crescer, a troca é local a este arquivo". Continua valendo. O gatilho é o
protocolo ganhar mensagens, não zod já estar no repositório.

## Consequências

- Uma dependência nova, no servidor. Ela é empacotada pelo esbuild junto com o
  resto — não muda o formato do deploy.
- O ambiente falha no boot, com o nome da variável, e acumulando os problemas
  em vez de reportar um por vez.
- O contorno registrado: **variável em branco vale como não definida**. Um
  `.env` copiado do `.env.example` chega com as chaves presentes e os valores
  vazios; sem essa normalização, seguir o arquivo de exemplo derrubaria o boot.
- Passa a existir um lugar óbvio para validar entrada quando a REST API chegar
  (Phase 2). É a dependência que a Regra 2 chama de complexidade conquistada,
  não adivinhada.

## Alternativas consideradas

**Escrever os combinadores à mão.** Rejeitada: o resultado seria um zod pequeno
e sem testes. É exatamente o erro contra o qual a Regra 1 não protege — evitar a
dependência construindo uma pior.

**Reescrever o protocolo com zod, por consistência.** Rejeitada: consistência
não é motivo. O parser manual já funciona, já está testado, e está no caminho
por onde passa toda mensagem de signaling.
