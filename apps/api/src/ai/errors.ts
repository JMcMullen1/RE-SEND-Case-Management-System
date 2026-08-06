/**
 * Errors surfaced by the AI job layer. Hard failures throw one of these rather
 * than returning silently empty, so a caller must handle them and a user sees a
 * real outcome. None of these carry the prompt or the response.
 */

/** The job was switched off (global AI_ENABLED, or its per-job flag). */
export class AiJobDisabledError extends Error {
  constructor(public readonly jobName: string) {
    super(`AI job "${jobName}" is disabled`);
    this.name = 'AiJobDisabledError';
  }
}

/** The model's safety classifiers declined the request. */
export class AiJobRefusalError extends Error {
  constructor(
    public readonly jobName: string,
    public readonly category: string | null,
  ) {
    super(`AI job "${jobName}" was refused${category ? ` (${category})` : ''}`);
    this.name = 'AiJobRefusalError';
  }
}

/** The call failed (transport, or the model never produced valid output). */
export class AiJobError extends Error {
  constructor(
    public readonly jobName: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`AI job "${jobName}" failed: ${message}`, options);
    this.name = 'AiJobError';
  }
}
