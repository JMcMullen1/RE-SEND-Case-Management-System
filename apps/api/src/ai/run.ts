import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { env } from '../env';
import { getJobFlag, recordAiJobRun } from '../repositories/ai-jobs';
import type { AiJobRunRecord } from '../repositories/ai-jobs';
import { getAnthropic, type MessagesClient } from './client';
import { type AiJobDefinition, toolNameFor } from './definition';
import { AiJobDisabledError, AiJobError, AiJobRefusalError } from './errors';
import { estimateCostUsd, type ClaudeModel, type TokenUsage } from './models';
import { schemaToTool } from './zod-tool';

export interface AiJobResult<T> {
  output: T;
  model: ClaudeModel;
  usage: TokenUsage;
  latencyMs: number;
  costUsd: number;
}

/** Injectable dependencies — real implementations by default, doubles in tests. */
export interface RunDeps {
  client?: MessagesClient;
  record: (entry: AiJobRunRecord) => Promise<void>;
  getFlag: (jobName: string) => Promise<boolean | null>;
  globalEnabled: boolean;
  now: () => number;
}

/**
 * Resolve whether a job may run: the global switch wins, then a runtime per-job
 * flag, then the definition's own default.
 */
export function resolveEnabled(opts: {
  globalEnabled: boolean;
  flag: boolean | null;
  definitionDefault: boolean;
}): boolean {
  if (!opts.globalEnabled) return false;
  if (opts.flag !== null) return opts.flag;
  return opts.definitionDefault;
}

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * Run an AI job. This is the single path every Claude call in the system takes.
 *
 * - The output schema becomes a tool the model is forced to call, so the result
 *   is structurally guaranteed, not parsed from prose.
 * - Transient failures are retried with backoff by the SDK; a hard failure
 *   throws (never returns empty), and a switched-off job throws
 *   AiJobDisabledError.
 * - Every invocation is recorded — job, model, token counts, latency, outcome —
 *   and never the prompt or the response.
 */
export async function runAiJob<TSchema extends z.ZodTypeAny>(
  definition: AiJobDefinition<TSchema>,
  input: string,
  overrides: Partial<RunDeps> = {},
): Promise<AiJobResult<z.infer<TSchema>>> {
  const deps: RunDeps = {
    record: overrides.record ?? recordAiJobRun,
    getFlag: overrides.getFlag ?? getJobFlag,
    globalEnabled: overrides.globalEnabled ?? env.AI_ENABLED,
    now: overrides.now ?? Date.now,
    client: overrides.client,
  };
  const { name, model } = definition;

  const record = (
    outcome: AiJobRunRecord['outcome'],
    usage: TokenUsage,
    ms: number,
  ) =>
    deps.record({
      jobName: name,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      latencyMs: ms,
      outcome,
      costUsd: estimateCostUsd(model, usage),
    });

  // --- Enabled? ------------------------------------------------------------
  const flag = await deps.getFlag(name);
  const enabled = resolveEnabled({
    globalEnabled: deps.globalEnabled,
    flag,
    definitionDefault: definition.enabled ?? true,
  });
  if (!enabled) {
    await record('disabled', ZERO_USAGE, 0);
    throw new AiJobDisabledError(name);
  }

  const client = deps.client ?? getAnthropic();
  const toolName = toolNameFor(definition);
  const request = buildRequest(definition, toolName, input);

  let usage = ZERO_USAGE;
  let latencyMs = 0;
  try {
    const start = deps.now();
    const response = (await client.messages.create(
      request,
    )) as Anthropic.Message;
    latencyMs = deps.now() - start;
    usage = extractUsage(response);

    if (response.stop_reason === 'refusal') {
      await record('refusal', usage, latencyMs);
      throw new AiJobRefusalError(
        name,
        response.stop_details?.category ?? null,
      );
    }

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === toolName,
    );
    if (!block) {
      await record('error', usage, latencyMs);
      throw new AiJobError(name, 'model did not return the output tool');
    }

    const parsed = definition.outputSchema.safeParse(block.input);
    if (!parsed.success) {
      await record('error', usage, latencyMs);
      throw new AiJobError(name, 'output failed schema validation');
    }

    await record('success', usage, latencyMs);
    return {
      output: parsed.data as z.infer<TSchema>,
      model,
      usage,
      latencyMs,
      costUsd: estimateCostUsd(model, usage),
    };
  } catch (err) {
    // Already-recorded, already-typed failures pass straight through.
    if (err instanceof AiJobRefusalError || err instanceof AiJobError)
      throw err;
    // Transport or unknown failure after the SDK's retries — record and surface.
    await record('error', usage, latencyMs).catch(() => {});
    throw new AiJobError(name, messageOf(err), { cause: err });
  }
}

function buildRequest(
  definition: AiJobDefinition<z.ZodTypeAny>,
  toolName: string,
  input: string,
): Anthropic.MessageCreateParamsNonStreaming {
  const tool = schemaToTool(
    toolName,
    definition.toolDescription ??
      `Record the structured result for ${definition.name}.`,
    definition.outputSchema,
  );
  return {
    model: definition.model,
    max_tokens: definition.maxTokens ?? 4096,
    system: buildSystem(definition),
    // Forced tool use is reliable with thinking off, and keeps output deterministic.
    thinking: { type: 'disabled' },
    tools: [tool],
    tool_choice: {
      type: 'tool',
      name: toolName,
      disable_parallel_tool_use: true,
    },
    messages: [{ role: 'user', content: input }],
  };
}

function buildSystem(
  definition: AiJobDefinition<z.ZodTypeAny>,
): Anthropic.MessageCreateParams['system'] {
  if (!definition.cache?.enabled) return definition.systemPrompt;
  // Prompt caching is wired but off by default; when on, mark the (stable)
  // system prompt cacheable at the chosen TTL.
  const cache_control =
    definition.cache.ttl === '1h'
      ? ({ type: 'ephemeral', ttl: '1h' } as const)
      : ({ type: 'ephemeral' } as const);
  return [{ type: 'text', text: definition.systemPrompt, cache_control }];
}

function extractUsage(response: Anthropic.Message): TokenUsage {
  const u = response.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}
