import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from './models';

describe('estimateCostUsd', () => {
  it('prices input and output tokens per the model rate', () => {
    // Opus 5: $5/1M input, $25/1M output.
    const cost = estimateCostUsd('claude-opus-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(cost).toBeCloseTo(30, 6);
  });

  it('prices cache reads at 0.1x and writes at 1.25x of input', () => {
    const cost = estimateCostUsd('claude-opus-5', {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    // 5*0.1 + 5*1.25 = 0.5 + 6.25
    expect(cost).toBeCloseTo(6.75, 6);
  });

  it('returns 0 for an unknown model rather than throwing', () => {
    expect(
      estimateCostUsd('some-future-model', {
        inputTokens: 1000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(0);
  });
});
