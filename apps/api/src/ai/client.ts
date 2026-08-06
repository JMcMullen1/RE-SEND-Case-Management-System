import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

let client: Anthropic | undefined;

/**
 * The process-wide Anthropic client. The API key comes from the environment and
 * never leaves the server. `maxRetries` gives transient failures (429, 5xx,
 * connection errors) exponential-backoff retries; hard failures still throw.
 */
export function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  client ??= new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: env.AI_MAX_RETRIES,
  });
  return client;
}

/** The subset of the Anthropic client the job runner uses (for test doubles). */
export interface MessagesClient {
  messages: {
    create: Anthropic['messages']['create'];
  };
}

/** Test seam: drop the memoised client. */
export function resetAnthropic(): void {
  client = undefined;
}
