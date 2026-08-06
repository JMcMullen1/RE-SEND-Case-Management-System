import type { CorpusResult } from '@re-send/shared';

/**
 * In-process cache of assembled corpora, keyed by case and by the options used
 * to assemble it. Invalidated per case whenever a constituent row changes — the
 * realtime dispatcher calls `invalidateCorpus(caseId)` for cases, notes and
 * documents, so a cached corpus never outlives the data it was built from.
 *
 * This is per-instance. A multi-instance deployment would move it behind a
 * shared cache; the invalidation hook (already driven by Postgres NOTIFY) is the
 * same in either case.
 */
const cache = new Map<string, Map<string, CorpusResult>>();

export function getCachedCorpus(
  caseId: string,
  optionsKey: string,
): CorpusResult | undefined {
  return cache.get(caseId)?.get(optionsKey);
}

export function setCachedCorpus(
  caseId: string,
  optionsKey: string,
  value: CorpusResult,
): void {
  let byOptions = cache.get(caseId);
  if (!byOptions) {
    byOptions = new Map();
    cache.set(caseId, byOptions);
  }
  byOptions.set(optionsKey, value);
}

/** Drop every cached corpus for a case. */
export function invalidateCorpus(caseId: string): void {
  cache.delete(caseId);
}

/** Test seam. */
export function clearCorpusCache(): void {
  cache.clear();
}
