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
      // A query string can carry what someone searched for (a child's name,
      // say), which the redaction rules cannot recognise: log the path only.
      serializers: { req: serializeRequest, err: serializeError },
      hooks: {
        // Fastify logs a failed request with the error's message as the line's
        // text: for a validation error that quotes what was sent, so replace it.
        logMethod(args, method) {
          const first = args[0] as { err?: { code?: string } } | undefined;
          if (first?.err?.code === 'FST_ERR_VALIDATION' && args.length > 1)
            args[1] = 'Request failed validation';
          return method.apply(this, args);
        },
      },
    },
    redactingStream(process.stdout),
  );
}

/** A request as logged: method and path, never the query string. */
export function serializeRequest(req: {
  method?: string;
  url?: string;
  hostname?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
}) {
  return {
    method: req.method,
    url: req.url?.split('?')[0],
    hostname: req.hostname,
    remoteAddress: req.ip ?? req.socket?.remoteAddress,
  };
}

/**
 * An error as logged. A request that fails validation is logged with what was
 * wrong but not what was sent: a validation message can quote the value
 * (Zod's "received": ...), which may be a name someone typed.
 */
export function serializeError(err: unknown) {
  const e = err as {
    name?: string;
    message?: string;
    stack?: string;
    code?: string;
    statusCode?: number;
    validationContext?: string;
    validation?: {
      instancePath?: string;
      keyword?: string;
      params?: unknown;
    }[];
  };
  if (!e || typeof e !== 'object') return err;
  if (e.code === 'FST_ERR_VALIDATION')
    return {
      type: e.name,
      code: e.code,
      statusCode: e.statusCode,
      validationContext: e.validationContext,
      message: 'Request failed validation',
    };
  return pino.stdSerializers.err(err as Error);
}
