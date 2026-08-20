import { describe, expect, it } from 'vitest';
import { classifyPath, parseDiffTargets, resolveInside } from '../src/infra/workspace';

const GIT_STYLE = `--- a/ws_objects/atende50/w_atende.srw
+++ b/ws_objects/atende50/w_atende.srw
@@ -10,7 +10,7 @@
-old
+new
`;

describe('parseDiffTargets', () => {
  it('lê os arquivos do diff com prefixo a/ b/ (strip 1)', () => {
    expect(parseDiffTargets(GIT_STYLE, 1)).toEqual(['ws_objects/atende50/w_atende.srw']);
  });

  it('respeita o nível de strip', () => {
    expect(parseDiffTargets(GIT_STYLE, 0)).toEqual(['b/ws_objects/atende50/w_atende.srw']);
  });

  it('ignora /dev/null (arquivo removido pelo diff)', () => {
    const diff = '--- a/x.srw\n+++ /dev/null\n';
    expect(parseDiffTargets(diff, 1)).toEqual([]);
  });

  it('descarta o timestamp que alguns diffs trazem depois do caminho', () => {
    const diff = '+++ b/ws_objects/x.srw\t2026-08-20 10:00:00.000\n';
    expect(parseDiffTargets(diff, 1)).toEqual(['ws_objects/x.srw']);
  });

  it('não repete arquivo tocado por mais de um hunk', () => {
    expect(parseDiffTargets(GIT_STYLE + GIT_STYLE, 1)).toHaveLength(1);
  });
});

describe('resolveInside', () => {
  const root = '/smart_desktop';

  it('aceita caminho relativo dentro da raiz', () => {
    expect(resolveInside(root, 'ws_objects/x.srw')).toContain('ws_objects');
  });

  it('recusa escapar da raiz com ..', () => {
    // o diff é texto gerado por LLM a partir de um chamado colado por humano:
    // isto é a barreira que impede escrever fora do working copy
    expect(resolveInside(root, '../etc/passwd')).toBeNull();
    expect(resolveInside(root, 'ws_objects/../../etc/passwd')).toBeNull();
  });

  it('recusa caminho absoluto', () => {
    expect(resolveInside(root, '/etc/hosts')).toBeNull();
  });

  it('recusa a própria raiz como alvo', () => {
    expect(resolveInside(root, '.')).toBeNull();
  });
});

describe('classifyPath — regra de commit do SMART Desktop', () => {
  it('artefato de build é proibido', () => {
    expect(classifyPath('agenda50/agenda50.pbl')).toBe('proibido');
    expect(classifyPath('smart.pbw')).toBe('proibido');
    expect(classifyPath('aplgen50/aplg50_1.pbd')).toBe('proibido');
  });

  it('não confunde a PASTA .pbl.src com o binário .pbl', () => {
    // é o caso mais comum do repo: o fonte mora dentro de "<lib>.pbl.src/"
    expect(classifyPath('ws_objects/Audit50/audit50.pbl.src/d_aud01tab.srd')).toBe('fonte');
  });

  it('fontes exportados são o que sobe', () => {
    expect(classifyPath('ws_objects/x/u_nv_cabecalho_t.sru')).toBe('fonte');
    expect(classifyPath('ws_objects/x/audit.sra')).toBe('fonte');
    expect(classifyPath('ws_objects/x/w_atende.srw')).toBe('fonte');
  });

  it('ignora caixa da extensão', () => {
    expect(classifyPath('AGENDA50/AGENDA50.PBL')).toBe('proibido');
    expect(classifyPath('ws_objects/X/W_ATENDE.SRW')).toBe('fonte');
  });

  it('o resto fica como "outro" — decisão explícita de quem monta o commit', () => {
    // .pbr aparece em commit real do repo, então bloquear seria errado
    expect(classifyPath('ocup50/ocup50.pbr')).toBe('outro');
    expect(classifyPath('README.md')).toBe('outro');
  });
});
