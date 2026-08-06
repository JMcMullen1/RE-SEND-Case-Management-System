import { createHash, createHmac } from 'node:crypto';
import type { GetObject, PutObject, StorageProvider } from './provider';

export interface S3Config {
  endpoint: string; // e.g. https://s3.eu-west-2.amazonaws.com or a MinIO URL
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * S3CompatibleProvider — the storage backend for later (AWS S3, MinIO, R2,
 * Backblaze B2, any S3 API). It signs requests with AWS Signature V4 using only
 * node:crypto, so there is no heavyweight SDK dependency. It is wired but unused
 * until STORAGE_PROVIDER=s3; validate it against the target endpoint before
 * trusting it in production.
 *
 * This is also where a pre-signed direct-to-storage upload would live:
 * getSignedUrl already produces a presigned GET; a presigned PUT is the same
 * construction with method 'PUT', and the client would upload to it directly
 * instead of streaming through the API (see the PRESIGNED-UPLOAD marker in the
 * web upload client).
 */
export class S3CompatibleProvider implements StorageProvider {
  constructor(private readonly config: S3Config) {}

  async put(object: PutObject): Promise<void> {
    const res = await this.signedFetch('PUT', object.key, {
      body: object.body,
      headers: { 'content-type': object.contentType },
    });
    if (!res.ok) throw new Error(`S3 put failed: ${res.status}`);
  }

  async get(key: string): Promise<GetObject | null> {
    const res = await this.signedFetch('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 get failed: ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    return {
      body,
      contentType:
        res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.signedFetch('DELETE', key);
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 delete failed: ${res.status}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.signedFetch('HEAD', key);
    return res.ok;
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return this.presign('GET', key, expiresInSeconds);
  }

  // --- URL + signing internals ---------------------------------------------

  private objectUrl(key: string): URL {
    const base = new URL(this.config.endpoint);
    const encodedKey = key.split('/').map(encodeRfc3986).join('/');
    if (this.config.forcePathStyle) {
      base.pathname = `/${this.config.bucket}/${encodedKey}`;
    } else {
      base.host = `${this.config.bucket}.${base.host}`;
      base.pathname = `/${encodedKey}`;
    }
    return base;
  }

  private async signedFetch(
    method: string,
    key: string,
    opts: { body?: Buffer; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const now = amzDates();
    const payloadHash = sha256Hex(opts.body ?? Buffer.alloc(0));

    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': now.amzDate,
      ...Object.fromEntries(
        Object.entries(opts.headers ?? {}).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
    };

    const { canonicalHeaders, signedHeaders } = canonicalizeHeaders(headers);
    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery(url.searchParams),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const authorization = this.authorizationHeader(
      canonicalRequest,
      signedHeaders,
      now,
    );

    return fetch(url, {
      method,
      headers: { ...headers, authorization },
      body: opts.body,
    });
  }

  private presign(
    method: string,
    key: string,
    expiresInSeconds: number,
  ): string {
    const url = this.objectUrl(key);
    const now = amzDates();
    const scope = `${now.dateStamp}/${this.config.region}/s3/aws4_request`;

    url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    url.searchParams.set(
      'X-Amz-Credential',
      `${this.config.accessKeyId}/${scope}`,
    );
    url.searchParams.set('X-Amz-Date', now.amzDate);
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    url.searchParams.set('X-Amz-SignedHeaders', 'host');

    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery(url.searchParams),
      `host:${url.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const signature = this.sign(canonicalRequest, scope, now);
    url.searchParams.set('X-Amz-Signature', signature);
    return url.toString();
  }

  private authorizationHeader(
    canonicalRequest: string,
    signedHeaders: string,
    now: AmzDates,
  ): string {
    const scope = `${now.dateStamp}/${this.config.region}/s3/aws4_request`;
    const signature = this.sign(canonicalRequest, scope, now);
    return (
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`
    );
  }

  private sign(canonicalRequest: string, scope: string, now: AmzDates): string {
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      now.amzDate,
      scope,
      sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');

    const kDate = hmac(
      Buffer.from(`AWS4${this.config.secretAccessKey}`, 'utf8'),
      now.dateStamp,
    );
    const kRegion = hmac(kDate, this.config.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    return hmac(kSigning, stringToSign).toString('hex');
  }
}

// --- SigV4 primitives -------------------------------------------------------

interface AmzDates {
  amzDate: string; // 20240101T000000Z
  dateStamp: string; // 20240101
}

function amzDates(): AmzDates {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** RFC 3986 encoding: encodeURIComponent plus the characters it leaves alone. */
function encodeRfc3986(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalizeHeaders(headers: Record<string, string>): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const names = Object.keys(headers)
    .map((n) => n.toLowerCase())
    .sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${headers[n]!.trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  return { canonicalHeaders, signedHeaders: names.join(';') };
}

function canonicalQuery(params: URLSearchParams): string {
  const pairs: [string, string][] = [];
  for (const [k, v] of params) pairs.push([k, v]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join('&');
}
