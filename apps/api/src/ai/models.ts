/**
 * Claude models the AI job layer knows about, and their prices. Kept here — not
 * in shared config — because this is server-only implementation detail that must
 * never reach the browser, and because it is provider pricing, not a domain
 * vocabulary.
 *
 * Prices are US dollars per million tokens (Anthropic first-party rates). Cache
 * reads are ~0.1x the input rate; cache writes ~1.25x for the 5-minute TTL. The
 * cost we record is an estimate for spend visibility, not an invoice.
 */

export const CLAUDE_MODELS = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-fable-5',
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

interface ModelPricing {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

const PRICING: Record<ClaudeModel, ModelPricing> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Estimate the USD cost of a call from its token usage. Unknown models cost 0
 * (recorded, but not priced) so a new model never crashes accounting.
 */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const pricing = PRICING[model as ClaudeModel];
  if (!pricing) return 0;
  const perToken = pricing.input / 1_000_000;
  const outPerToken = pricing.output / 1_000_000;
  const cost =
    usage.inputTokens * perToken +
    usage.outputTokens * outPerToken +
    usage.cacheReadTokens * perToken * CACHE_READ_MULTIPLIER +
    usage.cacheWriteTokens * perToken * CACHE_WRITE_MULTIPLIER;
  // Round to 6 dp — the precision of the cost_usd column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
