import { describe, expect, it } from 'vitest';

import { parseClientMessage } from './protocol.js';

/**
 * O parser é a fronteira do servidor com a rede: tudo que chega passa por
 * aqui antes de virar `ClientMessage`. Os testes cobrem o lado hostil,
 * entrada malformada precisa virar `null`, nunca exceção e nunca objeto
 * parcialmente válido.
 */
describe('parseClientMessage', () => {
  describe('entrada malformada', () => {
    it.each([
      ['JSON inválido', '{'],
      ['string vazia', ''],
      ['null', 'null'],
      ['número', '42'],
      ['array', '[]'],
      ['string JSON', '"join"'],
      ['sem type', '{"roomId":"x"}'],
      ['type desconhecido', '{"type":"tchau"}'],
    ])('recusa %s', (_caso, raw) => {
      expect(parseClientMessage(raw)).toBeNull();
    });
  });

  describe('join', () => {
    it('aceita roomId não vazio', () => {
      expect(
        parseClientMessage('{"type":"join","roomId":"sala-1","name":"Ana"}'),
      ).toEqual({ type: 'join', roomId: 'sala-1', name: 'Ana' });
    });

    it('entra sem nome, nome ruim nunca impede o acesso à sala', () => {
      expect(parseClientMessage('{"type":"join","roomId":"sala-1"}')).toEqual({
        type: 'join',
        roomId: 'sala-1',
        name: 'anônimo',
      });
    });

    it.each([
      ['roomId ausente', '{"type":"join"}'],
      ['roomId vazio', '{"type":"join","roomId":""}'],
      ['roomId numérico', '{"type":"join","roomId":1}'],
      ['roomId nulo', '{"type":"join","roomId":null}'],
    ])('recusa %s', (_caso, raw) => {
      expect(parseClientMessage(raw)).toBeNull();
    });

    it('descarta campos extras em vez de repassá-los', () => {
      const parsed = parseClientMessage('{"type":"join","roomId":"x","admin":true}');

      expect(parsed).toEqual({ type: 'join', roomId: 'x', name: 'anônimo' });
    });
  });

  describe('nome exibido', () => {
    /**
     * O nome é o único campo do protocolo que vai direto para a tela de outra
     * pessoa. A mensagem é montada com `JSON.stringify` de propósito: escrever
     * o JSON à mão exigiria escapar controles duas vezes, e um escape errado
     * viraria um teste que passa pelo motivo errado.
     */
    const nameOf = (name: unknown): string | null => {
      const parsed = parseClientMessage(JSON.stringify({ type: 'rename', name }));
      return parsed?.type === 'rename' ? parsed.name : null;
    };

    it('aceita um nome comum', () => {
      expect(nameOf('Matheus')).toBe('Matheus');
    });

    it.each([
      ['ausente', undefined],
      ['vazio', ''],
      ['só espaços', '   '],
      ['numérico', 42],
      ['nulo', null],
      ['objeto', { nome: 'x' }],
    ])('cai no padrão quando o nome é %s', (_caso, valor) => {
      expect(nameOf(valor)).toBe('anônimo');
    });

    it('remove quebra de linha, o nome vive numa linha só', () => {
      // `fromCharCode` em vez de escape: num teste sobre controles, o código
      // do caractere é a informação, e evita depender de escape correto.
      expect(nameOf('a' + String.fromCharCode(10) + 'b')).toBe('ab');
    });

    it('remove caracteres de controle', () => {
      expect(nameOf('a' + String.fromCharCode(0, 31, 127) + 'b')).toBe('ab');
    });

    it('remove invisíveis usados para fabricar nome "vazio"', () => {
      expect(nameOf(String.fromCharCode(0x200b, 0x200c, 0xfeff))).toBe('anônimo');
    });

    it('corta no limite', () => {
      expect(nameOf('x'.repeat(100))).toHaveLength(24);
    });

    it('corta por code point, não por unidade UTF-16', () => {
      // Um slice cru partiria o emoji ao meio e produziria lixo na tela.
      const nome = nameOf('🎮'.repeat(40)) ?? '';

      expect([...nome]).toHaveLength(24);
      expect(nome).not.toContain(String.fromCharCode(0xfffd));
    });

    it('preserva acento e espaço interno', () => {
      expect(nameOf('João da Silva')).toBe('João da Silva');
    });

    it('recusa JSON inválido antes de sanear', () => {
      expect(parseClientMessage('{"type":"rename","name":')).toBeNull();
    });
  });

  describe('signal', () => {
    it.each(['offer', 'answer'] as const)('aceita %s com sdp', (kind) => {
      const raw = JSON.stringify({
        type: 'signal',
        to: 'peer-b',
        payload: { kind, sdp: 'v=0' },
      });

      expect(parseClientMessage(raw)).toEqual({
        type: 'signal',
        to: 'peer-b',
        payload: { kind, sdp: 'v=0' },
      });
    });

    it.each([
      [
        'destinatário ausente',
        { type: 'signal', payload: { kind: 'offer', sdp: 'v=0' } },
      ],
      [
        'destinatário vazio',
        { type: 'signal', to: '', payload: { kind: 'offer', sdp: 'v=0' } },
      ],
      ['payload ausente', { type: 'signal', to: 'b' }],
      ['payload não-objeto', { type: 'signal', to: 'b', payload: 'offer' }],
      ['kind desconhecido', { type: 'signal', to: 'b', payload: { kind: 'bye' } }],
      ['offer sem sdp', { type: 'signal', to: 'b', payload: { kind: 'offer' } }],
      ['sdp vazio', { type: 'signal', to: 'b', payload: { kind: 'offer', sdp: '' } }],
    ])('recusa %s', (_caso, message) => {
      expect(parseClientMessage(JSON.stringify(message))).toBeNull();
    });

    describe('ice', () => {
      it('preserva os campos opcionais quando vêm preenchidos', () => {
        const raw = JSON.stringify({
          type: 'signal',
          to: 'b',
          payload: {
            kind: 'ice',
            candidate: {
              candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
              sdpMid: '0',
              sdpMLineIndex: 0,
              usernameFragment: 'abc',
            },
          },
        });

        expect(parseClientMessage(raw)).toEqual({
          type: 'signal',
          to: 'b',
          payload: {
            kind: 'ice',
            candidate: {
              candidate: 'candidate:1 1 udp 2130706431 10.0.0.1 54321 typ host',
              sdpMid: '0',
              sdpMLineIndex: 0,
              usernameFragment: 'abc',
            },
          },
        });
      });

      it('normaliza opcionais ausentes para null em vez de omiti-los', () => {
        const raw = JSON.stringify({
          type: 'signal',
          to: 'b',
          payload: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp' } },
        });

        expect(parseClientMessage(raw)).toEqual({
          type: 'signal',
          to: 'b',
          payload: {
            kind: 'ice',
            candidate: {
              candidate: 'candidate:1 1 udp',
              sdpMid: null,
              sdpMLineIndex: null,
              usernameFragment: null,
            },
          },
        });
      });

      it('aceita candidato vazio, é o sinal de fim de coleta do ICE', () => {
        const raw = JSON.stringify({
          type: 'signal',
          to: 'b',
          payload: { kind: 'ice', candidate: { candidate: '' } },
        });

        expect(parseClientMessage(raw)).not.toBeNull();
      });

      it.each([
        ['candidate ausente', { kind: 'ice', candidate: {} }],
        ['candidate não-string', { kind: 'ice', candidate: { candidate: 1 } }],
        ['candidate não-objeto', { kind: 'ice', candidate: 'host' }],
        ['candidate nulo', { kind: 'ice', candidate: null }],
      ])('recusa %s', (_caso, payload) => {
        const raw = JSON.stringify({ type: 'signal', to: 'b', payload });

        expect(parseClientMessage(raw)).toBeNull();
      });
    });
  });
});
