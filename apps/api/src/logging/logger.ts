import { Writable } from 'node:stream';
import pino from 'pino';
import { redactLine } from './redact';

/**
 * A pass-through stream that redacts every log line before it reaches the real
 * destination. pino writes one complete JSON object per `write`, so redacting
 * per chunk redacts per line. This is the single choke point every log line
 * passes through — nothing is written un-redacted.
 */
export function redactingStream(dest: NodeJS.WritableStream): Writable {
  return new Writable({
    write(chunk: Buffer, _enc, cb) {
      dest.write(redactLine(chunk.toString('utf8')));
      cb();
    },
  });
}

/**
 * The application logger: structured JSON, one object per line, with the log's
 * own timestamp as an epoch number (so it is never mistaken for a date of birth
 * and redacted). Fastify attaches a request id to every request-scoped child
 * logger, so each line already carries `reqId`.
 */
export function buildLogger(level = process.env.LOG_LEVEL ?? 'info') {
  return pino(
    {
      level,
      base: { service: 'resend-api' },
      timestamp: pino.stdTimeFunctions.epochTime,
    },
    redactingStream(process.stdout),
  );
}
