import { describe, expect, it } from 'vitest';
import {
  COMMENTS_HEADER,
  MAX_COMMENT_CHARS,
  MAX_COMMENTS_TOTAL_CHARS,
  formatTicketComments,
} from '../src/domain/ticketComments';
import { buildSupportComment } from '../src/domain/jiraComment';
import type { Card } from '../src/domain/card';

const n8n = {
  author: { displayName: 'Automação n8n', name: 'n8n' },
  body: 'Análise prévia: provável falha em u_nv_gera_os ao validar item em conjunto.',
  created: '2026-09-15T10:32:11.000-0300',
};

describe('formatTicketComments', () => {
  it('sem comentário não gera seção nenhuma', () => {
    expect(formatTicketComments([])).toBe('');
    expect(formatTicketComments([{ body: '   ' }])).toBe('');
  });

  it('traz autor, data e corpo, na ordem em que foram escritos', () => {
    const texto = formatTicketComments([
      { author: { displayName: 'Suporte' }, body: 'Reproduz só na base Oracle.', created: '2026-09-14T08:00:00.000-0300' },
      n8n,
    ]);
    expect(texto.startsWith(COMMENTS_HEADER)).toBe(true);
    expect(texto).toContain('[Automação n8n — 2026-09-15 10:32]');
    expect(texto.indexOf('Reproduz só na base Oracle')).toBeLessThan(texto.indexOf('Análise prévia'));
  });

  it('deixa de fora a entrega que a própria plataforma publicou', () => {
    const card = { module: 'smartdesktop', images: [] } as unknown as Card;
    const texto = formatTicketComments([{ body: buildSupportComment(card, 'Refazer o cadastro.') }, n8n]);
    expect(texto).not.toContain('ORIENTAÇÃO');
    expect(texto).toContain('Análise prévia');
  });

  it('corta comentário gigante', () => {
    const texto = formatTicketComments([{ body: 'x'.repeat(MAX_COMMENT_CHARS + 500) }]);
    expect(texto).toContain('comentário cortado');
  });

  it('estourando o total, mantém os mais recentes e avisa quantos saíram', () => {
    const antigos = Array.from({ length: 10 }, (_, i) => ({ body: `antigo ${i} ` + 'y'.repeat(4000) }));
    const texto = formatTicketComments([...antigos, n8n]);
    expect(texto).toContain('Análise prévia');
    expect(texto).not.toContain('antigo 0 ');
    expect(texto).toMatch(/\d+ comentário\(s\) mais antigo\(s\) omitido\(s\)/);
    expect(texto.length).toBeLessThan(MAX_COMMENTS_TOTAL_CHARS + 1000);
  });
});
