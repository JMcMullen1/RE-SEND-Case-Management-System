import { desc, eq } from 'drizzle-orm';
import type { AiJobOutcome } from '@re-send/shared';
import { getDb } from '../db/client';
import { aiJobFlags, aiJobRuns, aiSpendByJob } from '../db/schema';

export interface AiJobRunRecord {
  jobName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  outcome: AiJobOutcome;
  costUsd: number;
}

/**
 * Append one row to the cost-accounting log. Records what ran and what it cost —
 * never the prompt or the response.
 */
export async function recordAiJobRun(entry: AiJobRunRecord): Promise<void> {
  await getDb()
    .insert(aiJobRuns)
    .values({
      jobName: entry.jobName,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheWriteTokens: entry.cacheWriteTokens,
      latencyMs: entry.latencyMs,
      outcome: entry.outcome,
      costUsd: entry.costUsd.toFixed(6),
    });
}

/** The runtime per-job flag: true/false if a row exists, null if it doesn't. */
export async function getJobFlag(jobName: string): Promise<boolean | null> {
  const [row] = await getDb()
    .select({ enabled: aiJobFlags.enabled })
    .from(aiJobFlags)
    .where(eq(aiJobFlags.jobName, jobName));
  return row ? row.enabled : null;
}

/**
 * Turn a job on or off at runtime, without a deploy. Upserts by job name and
 * returns the flag row id (for auditing).
 */
export async function setJobFlag(
  jobName: string,
  enabled: boolean,
): Promise<string> {
  const [row] = await getDb()
    .insert(aiJobFlags)
    .values({ jobName, enabled })
    .onConflictDoUpdate({
      target: aiJobFlags.jobName,
      set: { enabled, updatedAt: new Date() },
    })
    .returning({ id: aiJobFlags.id });
  return row!.id;
}

export interface JobFlag {
  jobName: string;
  enabled: boolean;
}

export async function listJobFlags(): Promise<JobFlag[]> {
  const rows = await getDb()
    .select({ jobName: aiJobFlags.jobName, enabled: aiJobFlags.enabled })
    .from(aiJobFlags)
    .orderBy(aiJobFlags.jobName);
  return rows;
}

export interface SpendByJob {
  jobName: string;
  model: string;
  runs: number;
  successes: number;
  refusals: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: string;
  lastRunAt: string;
}

/** Spend and usage per job type and model, over all time. */
export async function getSpendByJob(): Promise<SpendByJob[]> {
  const rows = await getDb()
    .select()
    .from(aiSpendByJob)
    .orderBy(desc(aiSpendByJob.costUsd));
  return rows.map((r) => ({
    jobName: r.jobName ?? '',
    model: r.model ?? '',
    runs: r.runs ?? 0,
    successes: r.successes ?? 0,
    refusals: r.refusals ?? 0,
    errors: r.errors ?? 0,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    cacheReadTokens: r.cacheReadTokens ?? 0,
    cacheWriteTokens: r.cacheWriteTokens ?? 0,
    costUsd: r.costUsd ?? '0',
    lastRunAt: r.lastRunAt ?? '',
  }));
}
