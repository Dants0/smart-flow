import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from '../src/infra/costs';

describe('costs', () => {
  it('calcula input e output com preços distintos', () => {
    // sonnet-5: $3/M input, $15/M output
    expect(estimateCostUsd('claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(3);
    expect(estimateCostUsd('claude-sonnet-5', 0, 1_000_000)).toBeCloseTo(15);
    expect(estimateCostUsd('claude-sonnet-5', 1_000_000, 1_000_000)).toBeCloseTo(18);
  });

  it('reconhece modelo com sufixo de versão', () => {
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 1_000_000, 0)).toBeGreaterThan(0);
  });

  it('modelo desconhecido custa 0 em vez de quebrar', () => {
    expect(estimateCostUsd('modelo-que-nao-existe', 1_000_000, 1_000_000)).toBe(0);
  });

  it('zero token custa zero', () => {
    expect(estimateCostUsd('gpt-4o', 0, 0)).toBe(0);
  });
});
