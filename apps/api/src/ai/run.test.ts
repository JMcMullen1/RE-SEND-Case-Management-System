import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AiJobRunRecord } from '../repositories/ai-jobs';
import type { MessagesClient } from './client';
import { defineAiJob } from './definition';
import { AiJobDisabledError, AiJobError, AiJobRefusalError } from './errors';
import { resolveEnabled, runAiJob, type RunDeps } from './run';

const schema = z.object({ label: z.enum(['a', 'b']), score: z.number() });
const job = defineAiJob({
  name: 'Test Classify',
  model: 'claude-opus-5',
  outputSchema: schema,
  systemPrompt: 'Classify the input.',
});
const TOOL = 'record_test_classify';

function message(overrides: Record<string, unknown>) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

function clientReturning(msg: unknown): MessagesClient {
  return {
    messages: { create: vi.fn().mockResolvedValue(msg) },
  } as unknown as MessagesClient;
}

function harness(client: MessagesClient, overrides: Partial<RunDeps> = {}) {
  const records: AiJobRunRecord[] = [];
  const deps: Partial<RunDeps> = {
    client,
    record: async (e) => {
      records.push(e);
    },
    getFlag: async () => null,
    globalEnabled: true,
    ...overrides,
  };
  return { records, deps };
}

describe('resolveEnabled', () => {
  it('global off beats everything', () => {
    expect(
      resolveEnabled({
        globalEnabled: false,
        flag: true,
        definitionDefault: true,
      }),
    ).toBe(false);
  });
  it('a runtime flag overrides the definition default', () => {
    expect(
      resolveEnabled({
        globalEnabled: true,
        flag: false,
        definitionDefault: true,
      }),
    ).toBe(false);
    expect(
      resolveEnabled({
        globalEnabled: true,
        flag: true,
        definitionDefault: false,
      }),
    ).toBe(true);
  });
  it('falls back to the definition default with no flag', () => {
    expect(
      resolveEnabled({
        globalEnabled: true,
        flag: null,
        definitionDefault: true,
      }),
    ).toBe(true);
  });
});

describe('runAiJob', () => {
  it('returns validated output from the forced tool call and records success', async () => {
    const client = clientReturning(
      message({
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: TOOL,
            input: { label: 'a', score: 0.9 },
          },
        ],
      }),
    );
    const { records, deps } = harness(client);
    const result = await runAiJob(job, 'hello', deps);

    expect(result.output).toEqual({ label: 'a', score: 0.9 });
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBe('success');
    expect(records[0]!.inputTokens).toBe(100);
    expect(records[0]!.outputTokens).toBe(20);
    expect(records[0]!.costUsd).toBeGreaterThan(0);
  });

  it('forwards structured content blocks (a native PDF) as the user turn', async () => {
    const client = clientReturning(
      message({
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: TOOL,
            input: { label: 'a', score: 1 },
          },
        ],
      }),
    );
    const { deps } = harness(client);
    const blocks = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: 'JVBERi0xLjc=',
        },
        title: 'order.pdf',
      },
      { type: 'text', text: 'numbered corpus text' },
    ] as const;

    await runAiJob(job, blocks as never, deps);

    const create = client.messages.create as unknown as ReturnType<
      typeof vi.fn
    >;
    const request = create.mock.calls[0]![0] as { messages: unknown[] };
    expect(request.messages).toEqual([{ role: 'user', content: blocks }]);
  });

  it('throws AiJobDisabledError without calling the model, and records disabled', async () => {
    const client = clientReturning(message({}));
    const { records, deps } = harness(client, { globalEnabled: false });
    await expect(runAiJob(job, 'hi', deps)).rejects.toBeInstanceOf(
      AiJobDisabledError,
    );
    expect(
      client.messages.create as unknown as ReturnType<typeof vi.fn>,
    ).not.toHaveBeenCalled();
    expect(records[0]!.outcome).toBe('disabled');
  });

  it('is disabled by a runtime flag of false', async () => {
    const client = clientReturning(message({}));
    const { deps } = harness(client, { getFlag: async () => false });
    await expect(runAiJob(job, 'hi', deps)).rejects.toBeInstanceOf(
      AiJobDisabledError,
    );
  });

  it('surfaces a refusal rather than returning empty', async () => {
    const client = clientReturning(
      message({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber' },
        content: [],
      }),
    );
    const { records, deps } = harness(client);
    await expect(runAiJob(job, 'x', deps)).rejects.toBeInstanceOf(
      AiJobRefusalError,
    );
    expect(records[0]!.outcome).toBe('refusal');
  });

  it('errors clearly when the output is truncated at max_tokens', async () => {
    // A partial tool call from a max_tokens stop must fail with a clear reason,
    // not fall through to an opaque schema-validation error.
    const client = clientReturning(
      message({
        stop_reason: 'max_tokens',
        content: [
          { type: 'tool_use', id: 't1', name: TOOL, input: { label: 'a' } },
        ],
      }),
    );
    const { records, deps } = harness(client);
    await expect(runAiJob(job, 'x', deps)).rejects.toThrow(/max_tokens/);
    expect(records[0]!.outcome).toBe('error');
  });

  it('errors when the model does not call the output tool', async () => {
    const client = clientReturning(
      message({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'no tool' }],
      }),
    );
    const { records, deps } = harness(client);
    await expect(runAiJob(job, 'x', deps)).rejects.toBeInstanceOf(AiJobError);
    expect(records[0]!.outcome).toBe('error');
  });

  it('errors when the tool output fails schema validation', async () => {
    const client = clientReturning(
      message({
        content: [
          { type: 'tool_use', id: 't1', name: TOOL, input: { label: 'x' } },
        ],
      }),
    );
    const { records, deps } = harness(client);
    await expect(runAiJob(job, 'x', deps)).rejects.toBeInstanceOf(AiJobError);
    expect(records[0]!.outcome).toBe('error');
  });

  it('records error and rethrows on a transport failure', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('network down')),
      },
    } as unknown as MessagesClient;
    const { records, deps } = harness(client);
    await expect(runAiJob(job, 'x', deps)).rejects.toBeInstanceOf(AiJobError);
    expect(records[0]!.outcome).toBe('error');
  });
});
