import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { env } from '../env';
import { getJobFlag, recordAiJobRun } from '../repositories/ai-jobs';
import type { AiJobRunRecord } from '../repositories/ai-jobs';
import { getAnthropic, type MessagesClient } from './client';
import { type AiJobDefinition, toolNameFor } from './definition';
import { AiJobDisabledError, AiJobError, AiJobRefusalError } from './errors';
import {
  CLAUDE_MODELS,
  estimateCostUsd,
  type ClaudeModel,
  type TokenUsage,
} from './models';
import { schemaToJsonSchema, schemaToTool } from './zod-tool';

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
/**
 * A job's user turn: either plain text, or structured content blocks so a job
 * can hand Claude a document (a PDF read natively) rather than only text we
 * extracted ourselves.
 */
export type AiJobInput = string | Anthropic.ContentBlockParam[];

export async function runAiJob<TSchema extends z.ZodTypeAny>(
  definition: AiJobDefinition<TSchema>,
  input: AiJobInput,
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
  if (definition.outputMode === 'structured_output') {
    return runStructured(definition, input, client, deps, (m, o, u, ms) =>
      deps.record({
        jobName: name,
        model: m,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        cacheWriteTokens: u.cacheWriteTokens,
        latencyMs: ms,
        outcome: o,
        costUsd: estimateCostUsd(m, u),
      }),
    );
  }
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

    // Truncation: the model hit max_tokens before completing the tool call, so
    // the structured output is incomplete. Fail with a clear reason rather than
    // letting the partial JSON surface as an opaque schema-validation error.
    if (response.stop_reason === 'max_tokens') {
      await record('error', usage, latencyMs);
      throw new AiJobError(
        name,
        'output was truncated at max_tokens before completion',
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

type Recorder = (
  outcome: AiJobRunRecord['outcome'],
  usage: TokenUsage,
  ms: number,
) => Promise<void>;

type ModelRecorder = (
  model: ClaudeModel,
  outcome: AiJobRunRecord['outcome'],
  usage: TokenUsage,
  ms: number,
) => Promise<void>;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * The `structured_output` path: the schema is the response format, thinking is
 * adaptive (the model decides how much to reason), and the call is streamed so
 * a long draft never meets an HTTP timeout. Same accounting, kill switch and
 * failure semantics as the forced-tool path.
 */
async function runStructured<TSchema extends z.ZodTypeAny>(
  definition: AiJobDefinition<TSchema>,
  input: AiJobInput,
  client: MessagesClient,
  deps: RunDeps,
  recordAs: ModelRecorder,
): Promise<AiJobResult<z.infer<TSchema>>> {
  const { name, model } = definition;
  let record: Recorder = (o, u, ms) => recordAs(model, o, u, ms);
  if (!client.beta) throw new AiJobError(name, 'client has no streaming API');
  let usage = ZERO_USAGE;
  let latencyMs = 0;
  try {
    const start = deps.now();
    const response = await client.beta.messages
      .stream(
        {
          model,
          max_tokens: definition.maxTokens ?? 32000,
          system: buildSystem(definition),
          output_config: {
            ...(definition.effort ? { effort: definition.effort } : {}),
            format: {
              type: 'json_schema',
              schema: schemaToJsonSchema(name, definition.outputSchema),
            },
          },
          messages: [{ role: 'user', content: input }],
          ...(definition.refusalFallback
            ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const }
            : {}),
        },
        {
          ...(definition.requestTimeoutMs !== undefined
            ? { timeout: definition.requestTimeoutMs }
            : {}),
          ...(definition.maxRetries !== undefined
            ? { maxRetries: definition.maxRetries }
            : {}),
        },
      )
      .finalMessage();
    latencyMs = deps.now() - start;
    usage = extractUsage(response as unknown as Anthropic.Message);
    // After a fallback the response names the model that actually answered;
    // account against that model so spend reflects what ran.
    const served = (CLAUDE_MODELS as readonly string[]).includes(response.model)
      ? (response.model as ClaudeModel)
      : model;
    record = (o, u, ms) => recordAs(served, o, u, ms);

    if (response.stop_reason === 'refusal') {
      await record('refusal', usage, latencyMs);
      throw new AiJobRefusalError(
        name,
        response.stop_details?.category ?? null,
      );
    }
    if (response.stop_reason === 'max_tokens') {
      await record('error', usage, latencyMs);
      throw new AiJobError(
        name,
        'output was truncated at max_tokens before completion',
      );
    }

    // With fallbacks, the answer is the text after the last switch point.
    const texts = response.content.filter(
      (b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text',
    );
    const text = texts[texts.length - 1]?.text;
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const parsed = definition.outputSchema.safeParse(json);
    if (!parsed.success) {
      await record('error', usage, latencyMs);
      throw new AiJobError(name, 'output failed schema validation');
    }

    await record('success', usage, latencyMs);
    return {
      output: parsed.data as z.infer<TSchema>,
      model: served,
      usage,
      latencyMs,
      costUsd: estimateCostUsd(served, usage),
    };
  } catch (err) {
    if (err instanceof AiJobRefusalError || err instanceof AiJobError)
      throw err;
    await record('error', usage, latencyMs).catch(() => {});
    throw new AiJobError(name, messageOf(err), { cause: err });
  }
}

function buildRequest(
  definition: AiJobDefinition<z.ZodTypeAny>,
  toolName: string,
  input: AiJobInput,
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
