import { describe, expect, it } from 'vitest';
import { parseExcludedStatuses } from '../src/domain/jqlStatuses';

const PADRAO =
  'assignee = currentUser() AND status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144) ORDER BY created DESC';

describe('situações escondidas pela JQL', () => {
  it('lê os dez ids do padrão do time', () => {
    expect(parseExcludedStatuses(PADRAO)).toEqual([
      '19653', '17600', '20403', '13141', '19738', '19774', '13145', '24901', '19772', '13144',
    ]);
  });

  it('aceita nome entre aspas, com espaço dentro', () => {
    const jql = 'assignee = currentUser() AND status not in ("Em revisão", "Aguardando Versão Testes", Entregue)';
    expect(parseExcludedStatuses(jql)).toEqual(['Em revisão', 'Aguardando Versão Testes', 'Entregue']);
  });

  it('entende status != solto', () => {
    expect(parseExcludedStatuses('assignee = currentUser() AND status != Entregue')).toEqual(['Entregue']);
  });

  it('não inventa legenda pra JQL que filtra de outro jeito', () => {
    expect(parseExcludedStatuses('assignee = currentUser() ORDER BY created DESC')).toEqual([]);
    expect(parseExcludedStatuses('assignee = currentUser() AND statusCategory != Done')).toEqual([]);
    expect(parseExcludedStatuses('assignee = currentUser() AND status in (12040)')).toEqual([]);
  });

  it('não repete id que aparece duas vezes', () => {
    expect(parseExcludedStatuses('status not in (1, 2) AND status not in (2, 3)')).toEqual(['1', '2', '3']);
  });
});
