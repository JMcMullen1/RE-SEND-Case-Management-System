import { resolve } from 'node:path';
import { env } from '../env';
import { LocalDiskProvider } from './local-disk';
import { S3CompatibleProvider } from './s3-compatible';
import type { StorageProvider } from './provider';

export type { StorageProvider, PutObject, GetObject } from './provider';
export { keyFor } from './provider';

let provider: StorageProvider | undefined;

/**
 * The process-wide StorageProvider, chosen once by STORAGE_PROVIDER. Callers get
 * back the interface and cannot tell which backend answers — that is the point.
 */
export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  provider = env.STORAGE_PROVIDER === 's3' ? buildS3() : buildLocal();
  return provider;
}

function buildLocal(): StorageProvider {
  return new LocalDiskProvider(resolve(process.cwd(), env.UPLOAD_DIR));
}

function buildS3(): StorageProvider {
  const missing = [
    ['S3_ENDPOINT', env.S3_ENDPOINT],
    ['S3_BUCKET', env.S3_BUCKET],
    ['S3_ACCESS_KEY_ID', env.S3_ACCESS_KEY_ID],
    ['S3_SECRET_ACCESS_KEY', env.S3_SECRET_ACCESS_KEY],
  ].filter(([, v]) => !v);
  if (missing.length > 0) {
    throw new Error(
      `STORAGE_PROVIDER=s3 requires ${missing.map(([k]) => k).join(', ')}`,
    );
  }
  return new S3CompatibleProvider({
    endpoint: env.S3_ENDPOINT!,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

/** Test seam: drop the memoised provider so env changes take effect. */
export function resetStorageProvider(): void {
  provider = undefined;
}
