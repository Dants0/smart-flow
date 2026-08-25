import { describe, expect, it } from 'vitest';
import { decodeAttachmentText, stripNulls } from '../src/domain/attachmentText';

/** Linha real do trace que derrubou a criação do card do SMART-51229. */
const LINHA = '/*---- PBTrace v2 ---- base cliente ----*/\r\nSELECT * FROM pac WHERE cod = 1;\n';

const utf16le = (s: string, bom = true) =>
  Buffer.concat([bom ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0), Buffer.from(s, 'utf16le')]);

const utf16be = (s: string, bom = true) => {
  const corpo = Buffer.from(s, 'utf16le');
  corpo.swap16();
  return Buffer.concat([bom ? Buffer.from([0xfe, 0xff]) : Buffer.alloc(0), corpo]);
};

describe('decodificação de anexo de texto', () => {
  it('UTF-16LE com BOM: é o trace do PowerBuilder, e não sobra NUL nenhum', () => {
    const texto = decodeAttachmentText(utf16le(LINHA));
    expect(texto).toBe(LINHA);
    expect(texto).not.toContain('\u0000');
  });

  it('UTF-16BE com BOM', () => {
    expect(decodeAttachmentText(utf16be(LINHA))).toBe(LINHA);
  });

  it('UTF-16 sem BOM é reconhecido pelo padrão dos bytes zero', () => {
    expect(decodeAttachmentText(utf16le(LINHA, false))).toBe(LINHA);
    expect(decodeAttachmentText(utf16be(LINHA, false))).toBe(LINHA);
  });

  it('UTF-8 continua intacto, com acento e tudo', () => {
    const texto = 'Atenção: orçamento não gravado — código 51229\n';
    expect(decodeAttachmentText(Buffer.from(texto, 'utf-8'))).toBe(texto);
  });

  it('BOM de UTF-8 não vaza pro texto', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('linha 1', 'utf-8')]);
    expect(decodeAttachmentText(bytes)).toBe('linha 1');
  });

  it('anexo vazio vira string vazia, não erro', () => {
    expect(decodeAttachmentText(Buffer.alloc(0))).toBe('');
  });

  it('NUL solto em arquivo UTF-8 sai fora — é o que o Postgres recusa (22P05)', () => {
    const bytes = Buffer.from('antes\u0000depois', 'utf-8');
    expect(decodeAttachmentText(bytes)).toBe('antesdepois');
  });
});

describe('stripNulls', () => {
  it('tira todo NUL e preserva o resto', () => {
    expect(stripNulls('a\u0000b\u0000\u0000c')).toBe('abc');
  });

  it('texto sem NUL volta idêntico', () => {
    expect(stripNulls('nada a fazer')).toBe('nada a fazer');
  });
});
