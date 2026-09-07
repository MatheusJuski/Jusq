# ADR-004, Credencial de TURN sai do bundle

**Status:** Aceito
**Data:** setembro/2026
**Fase:** Phase 1 (base concreta)

---

## Contexto

O V0 lia a configuração de ICE de uma variável de build:

```bash
NEXT_PUBLIC_ICE_SERVERS=   # JSON com os servidores extras
```

Para STUN isso é inofensivo, STUN é público e não autentica. Para TURN, não:
TURN exige usuário e senha, e um servidor TURN **retransmite mídia**, ou seja,
consome banda que alguém paga.

`NEXT_PUBLIC_*` não é uma variável lida em runtime. O Next a substitui por
**texto literal** durante o build. A credencial estaria no JavaScript servido a
qualquer visitante, legível com o DevTools aberto, sem expirar nunca.

Havia ainda um segundo problema, menor e mais chato: escolher o provedor virava
uma decisão de código. A Phase 1 chegou com o provedor ainda em aberto,
Cloudflare Realtime ou um coturn na VM Oracle do Setup B.

## Decisão

O servidor de signaling monta a configuração de ICE e a serve em `GET /ice`.
O cliente pergunta ao entrar na sala, em paralelo com o handshake do WebSocket.

Dois modos de credencial, escolhidos por variável de ambiente:

| Modo                                  | Variáveis                         | Comportamento                                                                                                         |
| ------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Segredo compartilhado** (preferido) | `TURN_SECRET`, `TURN_TTL_SECONDS` | usuário é `<expiração>:jusqs`, senha é `base64(HMAC-SHA1(usuário, segredo))`, o TURN REST API que o coturn implementa |
| **Credencial fixa**                   | `TURN_USERNAME`, `TURN_PASSWORD`  | repassada como veio; não expira                                                                                       |

Nenhum provedor está codificado. Trocar de Cloudflare para coturn, ou o
contrário, é mudança de ambiente.

## Consequências

- Credencial de TURN nunca chega ao bundle. No modo preferido ela também
  expira, então uma que vaze tem prazo.
- O boot recusa configuração ambígua ou inútil: os dois modos juntos, meia
  credencial fixa, servidor sem credencial, credencial sem servidor. Cada um
  desses falharia em silêncio, e o sintoma seria uma conexão que só quebra em
  rede difícil, meses depois, sem ninguém conseguir reproduzir.
- O cliente ganhou um `fetch` no caminho de entrada na sala. Ele corre em
  paralelo com a abertura do WebSocket, e **nunca rejeita**: qualquer falha cai
  no STUN público, que é o comportamento que a Phase 0 já tinha. Perder o TURN
  degrada a conexão em rede difícil; perder a sala seria pior.
- O `join` passou a esperar essa resposta. É deliberado: o `joined` já traz a
  lista de peers, e cada peer vira um `RTCPeerConnection` imediatamente. Entrar
  antes da configuração chegar criaria as primeiras conexões sem TURN.
- `NEXT_PUBLIC_ICE_SERVERS` deixou de existir.

## O que falta

O Cloudflare Realtime não usa segredo compartilhado: as credenciais saem de uma
chamada à API deles, autenticada por token. É uma terceira estratégia em
`apps/server/src/ice.ts`, a escrever no dia em que o provedor for escolhido, e
não antes. Enquanto isso, o modo de credencial fixa funciona com ele.

## Alternativa considerada

**Manter a credencial no cliente e proteger o TURN por origem.** Rejeitada:
servidor TURN não valida `Origin`, quem tem usuário e senha usa o relay de
onde quiser. A proteção que existe é a credencial expirar.
