import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  getJobFlag,
  getSpendByJob,
  listJobFlags,
  recordAiJobRun,
  setJobFlag,
} from '../repositories/ai-jobs';
import type { MessagesClient } from './client';
import { defineAiJob } from './definition';
import { runAiJob } from './run';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;

run('AI job accounting + flags', () => {
  it('records a run and rolls it up in the spend view', async () => {
    const jobName = `test-record-${Date.now()}`;
    await recordAiJobRun({
      jobName,
      model: 'claude-opus-5',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 1234,
      outcome: 'success',
      costUsd: 0.01,
    });
    const spend = await getSpendByJob();
    const row = spend.find((s) => s.jobName === jobName);
    expect(row).toBeTruthy();
    expect(row!.runs).toBe(1);
    expect(row!.successes).toBe(1);
    expect(Number(row!.costUsd)).toBeCloseTo(0.01, 6);
  });

  it('toggles a per-job flag at runtime', async () => {
    const jobName = `test-flag-${Date.now()}`;
    expect(await getJobFlag(jobName)).toBeNull();
    await setJobFlag(jobName, false);
    expect(await getJobFlag(jobName)).toBe(false);
    await setJobFlag(jobName, true);
    expect(await getJobFlag(jobName)).toBe(true);
    const flags = await listJobFlags();
    expect(flags.some((f) => f.jobName === jobName)).toBe(true);
  });

  it('runs end to end with a stubbed model, writing a real accounting row', async () => {
    const jobName = `test-e2e-${Date.now()}`;
    const job = defineAiJob({
      name: jobName,
      model: 'claude-opus-5',
      outputSchema: z.object({ summary: z.string() }),
      systemPrompt: 'Summarise.',
    });
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: `record_${jobName.replace(/[^a-z0-9]+/gi, '_')}`.toLowerCase(),
              input: { summary: 'done' },
            },
          ],
          usage: {
            input_tokens: 500,
            output_tokens: 10,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        }),
      },
    } as unknown as MessagesClient;

    const result = await runAiJob(job, 'text', {
      client,
      globalEnabled: true,
    });
    expect(result.output.summary).toBe('done');

    const spend = await getSpendByJob();
    const row = spend.find((s) => s.jobName === jobName);
    expect(row?.successes).toBe(1);
    expect(row!.inputTokens).toBe(500);
  });
});
