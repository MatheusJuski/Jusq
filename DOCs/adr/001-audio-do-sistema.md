# ADR-001, Áudio do sistema fica fora do escopo web

**Status:** Aceito
**Data:** setembro/2026
**Contexto do experimento:** Screen Lab (01)

---

## Contexto

O Screen Lab precisa transmitir a tela com som. Três fontes de áudio são
possíveis, e elas não são equivalentes:

| Fonte            | Mecanismo                    | Resultado |
| ---------------- | ---------------------------- | --------- |
| Aba do navegador | interno do Chrome            | funciona  |
| Microfone        | `getUserMedia`               | funciona  |
| Tela ou janela   | loopback do WASAPI (Windows) | **falha** |

A captura de áudio de tela falha com `NotReadableError: Could not start audio
source` em uma máquina Windows 11 / Chromium 152. A investigação descartou,
por medição:

- 9 formatos diferentes de pedido, incluindo `systemAudio: 'include'`,
  `windowAudio: 'system'`, `monitorTypeSurfaces`, `selfBrowserSurface`,
  `surfaceSwitching`, restrições de áudio, `suppressLocalAudioPlayback` e
  `displaySurface`, **todas as opções que a especificação oferece**
- HTTP (`localhost`) e HTTPS (produção)
- Brave e Edge, com e sem o escudo do Brave
- Microfone aberto antes e durante a captura
- Saída de áudio mantida ativa durante a captura
- **Página HTML pura**, sem React, sem Next, sem WebRTC, sem uma linha do
  projeto: `NotReadableError` idêntico. Descarta o stack da aplicação como
  causa possível

O `getDisplayMedia` rejeita **antes** de entregar qualquer trilha. O Google
Meet captura na mesma máquina, no mesmo navegador, com a mesma API, e essa
diferença permanece sem explicação.

Com **aba**, a mesma variante que falha em tela inteira captura normalmente:
`audioLabel: "Tab audio"`, `audioMuted: false`, `audioState: "live"`. A trilha
não vem muda nem encerrada, vem viva. A diferença está unicamente na
superfície escolhida.

A perna WebRTC foi verificada em separado: compartilhando uma aba, o áudio
percorre a cadeia inteira (captura, `addTrack`, Opus estéreo, transporte,
reprodução) com bytes confirmados no painel de diagnóstico. **O problema está
na captura, não na aplicação.**

O [Jitsi Meet registrou o mesmo sintoma](https://github.com/jitsi/jitsi-meet/issues/15418)
e fechou a issue como _not planned_.

O teste de controle em HTML puro é a evidência final: **nenhum código nosso
participa da falha.**

---

## Decisão

**Áudio do sistema não é objetivo do Screen Lab enquanto ele for uma aplicação
web.** As fontes suportadas são aba e microfone, e a interface diz isso de
forma explícita em vez de prometer o que não entrega.

O caminho por dispositivo de entrada (Mixagem Estéreo, cabo virtual) continua
implementado e funciona, mas **não é recomendado ao usuário**: exigir que
alguém altere as configurações de som do Windows para usar um site é fricção
que nenhum usuário comum aceita.

---

## Alternativa considerada e adiada

Empacotar o Screen Lab como aplicativo desktop com **Tauri**.

```text
Windows
   │
   ├── Captura de vídeo ──────────┐
   │                              ├──> WebRTC
   └── WASAPI Loopback ───────────┘
           │
      áudio do sistema:
      jogos, Spotify, navegador, sons do Windows
```

É assim que Discord, OBS e Teams resolvem. Um processo nativo alcança as APIs
de áudio do sistema; um site, por decisão de segurança dos navegadores, não.

Adiada porque o V0 tem outra prioridade e porque a Regra 2 vale aqui:
complexidade deve ser conquistada. Vira candidata quando "transmitir jogo com
som" for requisito real, não desejo pontual.

---

## Consequências

**Positivas**

- A interface passou a ser honesta: `áudio: da aba` em vez de `da tela`
- O microfone virou opção de primeira classe, funciona com qualquer fonte,
  inclusive janela, com um clique de permissão
- A falha degrada para vídeo em vez de cancelar a transmissão
- O painel de diagnóstico mede áudio separado do vídeo, tornando a cadeia
  inteira observável

**Negativas**

- Transmitir o som de um jogo exige narrar por microfone, ou configurar um
  dispositivo de loopback
- Quando o áudio de tela falha, um segundo seletor é aberto para o fallback,
  incômodo, mas é o que garante que a transmissão aconteça

---

## Revisão

> Não reabra esta investigação sem um dado novo. As hipóteses acima foram
> testadas e descartadas por medição, não por suposição.

Um dado novo seria, por exemplo: o mesmo erro em outra máquina (indicaria
padrão), ou a captura funcionando em alguma máquina (indicaria configuração
local como causa).
