import type { z } from 'zod';
import type { ClaudeModel } from './models';

/**
 * An AI job definition — the single place a Claude call's conventions live, so
 * every caller shares them. Moving a job between models is a change here, not in
 * code. Output is a Zod schema, which becomes a tool the model must call, so the
 * result is structurally guaranteed rather than parsed out of prose.
 */
export interface AiJobDefinition<TSchema extends z.ZodTypeAny> {
  /** Stable identifier — the key for accounting, flags and logs. */
  name: string;
  /** Per-job model. This is configuration, never a code change. */
  model: ClaudeModel;
  /** The shape of the output: a forced tool's input, or the response format. */
  outputSchema: TSchema;
  /** System prompt. Never logged — it may reference case content. */
  systemPrompt: string;
  /** Hard output ceiling. Defaults to 4096. */
  maxTokens?: number;
  /**
   * How the structured result is obtained.
   * - `forced_tool` (default): the schema becomes a tool the model is forced to
   *   call, with thinking off. For models that accept forced tool use.
   * - `structured_output`: the schema is the response format
   *   (`output_config.format`), with adaptive thinking, streamed. For models
   *   that do not accept forced tool use (e.g. Claude Opus 5.5) and for long,
   *   judgement-heavy outputs such as drafting.
   */
  outputMode?: 'forced_tool' | 'structured_output';
  /** Effort for `structured_output` jobs (thinking depth and token spend). */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /**
   * On a safety refusal, re-run on the model's server-defined fallback in the
   * same call (`structured_output` jobs; beta). A refusal by the whole chain
   * still surfaces as a refusal.
   */
  refusalFallback?: boolean;
  /**
   * Per-attempt time limit and retry count for `structured_output` jobs, so a
   * job's worst case is bounded (attempts × timeout). Default: SDK settings.
   */
  requestTimeoutMs?: number;
  maxRetries?: number;
  /** Name of the generated tool. Defaults to a slug of the job name. */
  toolName?: string;
  /** Description shown to the model for the generated tool. */
  toolDescription?: string;
  /**
   * Prompt caching. Wired but unused for now — leave off (the default). When
   * enabled, the system prompt is marked cacheable at the chosen TTL.
   */
  cache?: { enabled: boolean; ttl?: '5m' | '1h' };
  /**
   * Per-job default on/off. A runtime ai_job_flags row overrides this, and the
   * global AI_ENABLED env var overrides everything. Defaults to enabled.
   */
  enabled?: boolean;
}

/** Identity helper that pins the generic so callers get typed output. */
export function defineAiJob<TSchema extends z.ZodTypeAny>(
  def: AiJobDefinition<TSchema>,
): AiJobDefinition<TSchema> {
  return def;
}

/** The tool name for a job: explicit, or a snake_case slug of the job name. */
export function toolNameFor(def: AiJobDefinition<z.ZodTypeAny>): string {
  if (def.toolName) return def.toolName;
  const slug = def.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `record_${slug || 'output'}`.toLowerCase();
}
