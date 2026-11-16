import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import yauzl from 'yauzl';
import { EXPORT_TABLES, exportTableColumns } from '../repositories/export';
import {
  migrationState,
  recordRestoreEvent,
  restoreTables,
  type RestoreTable,
} from '../repositories/backup';
import { getStorageProvider } from '../storage';
import { disconnectAll, disconnectUser } from '../realtime';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupManifest,
} from '../export/zip';

/**
 * Full import: putting a full export back. In two steps, so an admin sees what
 * a backup holds before anything changes:
 *
 * 1. check — the uploaded export is saved to a temporary folder and read
 *    through its central directory (never by scanning, so a Word document,
 *    itself a ZIP, is read as one file). Its manifest, every table (parsed
 *    line by line, checksum matched) and every file (size and checksum
 *    matched) must be there, from this version of the system.
 * 2. restore — runs in the background, one at a time: every stored file is
 *    put back under its own key (encrypted under the current key), then every
 *    table is replaced with the backup's rows in one transaction (see
 *    restoreTables). Its start, outcome and failure are audited.
 *
 * Only one checked backup waits at a time, for at most an hour; the temporary
 * copy is deleted afterwards, and any left by a crash at the next start.
 */

export class RestoreRefused extends Error {}

/** How long a checked backup waits to be restored. */
const PENDING_MS = 60 * 60 * 1000;
/** The largest table file, and all of them together, once unpacked. */
const MAX_TABLE_BYTES = 4 * 1024 ** 3;
const MAX_TABLES_BYTES = 8 * 1024 ** 3;
/** The largest single stored file (held in memory while it is stored). */
const MAX_FILE_BYTES = 512 * 1024 ** 2;
const MAX_MANIFEST_BYTES = 64 * 1024 ** 2;
const TEMP_PREFIX = 'resend-restore-';

interface Pending {
  id: string;
  dir: string;
  zip: string;
  manifest: BackupManifest;
  admin: string;
  timer: NodeJS.Timeout;
}
let pending: Pending | null = null;

export type RestoreStatus =
  | { state: 'idle' }
  | { state: 'running'; startedAt: string }
  | { state: 'done'; rows: number; files: number; finishedAt: string }
  | { state: 'failed'; message: string; finishedAt: string };
let status: RestoreStatus = { state: 'idle' };
let statusAdmin: string | null = null;

/** Where the latest restore stands, for the admin who started it. */
export function restoreStatus(admin: string): RestoreStatus {
  return statusAdmin === admin || status.state === 'running'
    ? status
    : { state: 'idle' };
}

async function discard(p: Pending): Promise<void> {
  clearTimeout(p.timer);
  if (pending === p) pending = null;
  await fs.rm(p.dir, { recursive: true, force: true });
}

/** Remove temporary copies left behind by a crash or restart. */
export async function sweepRestoreLeftovers(): Promise<void> {
  const base = tmpdir();
  for (const name of await fs.readdir(base).catch(() => [] as string[]))
    if (name.startsWith(TEMP_PREFIX))
      await fs.rm(join(base, name), { recursive: true, force: true });
}

class NotAZip extends Error {}

/** Open a ZIP by its central directory: every entry, by its exact name. */
async function openZip(
  file: string,
): Promise<{ zip: yauzl.ZipFile; entries: Map<string, yauzl.Entry> }> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(
      file,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true },
      (err, z) => (err || !z ? reject(new NotAZip()) : resolve(z)),
    ),
  );
  const entries = new Map<string, yauzl.Entry>();
  try {
    await new Promise<void>((resolve, reject) => {
      zip.on('entry', (entry: yauzl.Entry) => {
        if (entries.has(entry.fileName)) {
          reject(new RestoreRefused('The backup lists a file twice.'));
          return;
        }
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve());
      zip.on('error', () => reject(new NotAZip()));
      zip.readEntry();
    });
  } catch (err) {
    zip.close();
    throw err;
  }
  return { zip, entries };
}

function entryStream(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Readable> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) =>
      err || !stream
        ? reject(err ?? new Error('unreadable entry'))
        : resolve(stream),
    ),
  );
}

/** Pass bytes through while counting and hashing them, stopping at a limit. */
function measure(limit: number) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      if (bytes > limit) {
        done(new RestoreRefused('A file in the backup is too large.'));
        return;
      }
      hash.update(chunk);
      done(null, chunk);
    },
  });
  return { stream, result: () => ({ bytes, sha256: hash.digest('hex') }) };
}

async function readEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  limit: number,
): Promise<{ body: Buffer; sha256: string }> {
  if (entry.uncompressedSize > limit)
    throw new RestoreRefused('A file in the backup is too large.');
  const m = measure(limit);
  const chunks: Buffer[] = [];
  await pipeline(await entryStream(zip, entry), m.stream, async (source) => {
    for await (const c of source) chunks.push(c as Buffer);
  });
  return { body: Buffer.concat(chunks), sha256: m.result().sha256 };
}

const tableFile = (dir: string, table: string) =>
  join(dir, 'tables', `${table}.ndjson`);

/** A storage key a backup may write to: plain segments, nothing climbing out. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const isSafeKey = (key: unknown): key is string =>
  typeof key === 'string' &&
  key.length <= 512 &&
  SAFE_KEY.test(key) &&
  !key.split('/').some((s) => s === '..' || s === '.');

export interface BackupSummary {
  createdAt: string;
  createdBy: string;
  tables: number;
  rows: number;
  files: number;
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  a.every((x) => b.includes(x));

/**
 * Step 1: save the upload and check it. Refuses (RestoreRefused, with a
 * message for the admin) anything that is not a complete, unaltered full
 * export from this version of the system.
 */
export async function checkBackup(
  upload: Readable,
  admin: string,
  tooLarge: () => boolean,
): Promise<{ id: string; summary: BackupSummary }> {
  if (status.state === 'running')
    throw new RestoreRefused('A restore is already running.');
  const id = randomUUID();
  const dir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX));
  const zipPath = join(dir, 'backup.zip');
  let opened: yauzl.ZipFile | null = null;
  try {
    await pipeline(upload, createWriteStream(zipPath));
    if (tooLarge()) throw new RestoreRefused('The file is too large.');
    await fs.mkdir(join(dir, 'tables'));

    let zip: yauzl.ZipFile;
    let entries: Map<string, yauzl.Entry>;
    try {
      ({ zip, entries } = await openZip(zipPath));
    } catch (err) {
      if (err instanceof NotAZip)
        throw new RestoreRefused(
          'This file could not be read as a ZIP. Choose a full export downloaded from Admin › Full export.',
        );
      throw err;
    }
    opened = zip;

    const manifestEntry = entries.get('restore/manifest.json');
    if (!manifestEntry)
      throw new RestoreRefused(
        'This is not a full export from this system (it has no restore/manifest.json), or the export did not finish.',
      );
    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(
        (await readEntry(zip, manifestEntry, MAX_MANIFEST_BYTES)).body.toString(
          'utf8',
        ),
      ) as BackupManifest;
    } catch (err) {
      if (err instanceof RestoreRefused) throw err;
      throw new RestoreRefused('This is not a full export from this system.');
    }
    if (
      manifest?.format !== BACKUP_FORMAT ||
      manifest.version !== BACKUP_VERSION ||
      !Array.isArray(manifest.tables) ||
      !Array.isArray(manifest.files)
    )
      throw new RestoreRefused('This is not a full export from this system.');

    const now = await migrationState();
    if (
      manifest.schema?.count !== now.count ||
      manifest.schema?.lastHash !== now.lastHash
    )
      throw new RestoreRefused(
        (manifest.schema?.count ?? 0) < now.count
          ? 'This backup is from an earlier version of the system, so it cannot be put back as it is. Ask for it to be brought up to date first.'
          : 'This backup is from a different version of the system, so it cannot be put back as it is.',
      );

    // Exactly the tables this system exports, each once, with its columns.
    if (
      !sameSet(
        manifest.tables.map((t) => t.table),
        EXPORT_TABLES.map((t) => t.table),
      )
    )
      throw new RestoreRefused(
        'The backup’s tables do not match this version of the system.',
      );
    const declared = manifest.tables.reduce((n, t) => n + (t.bytes ?? 0), 0);
    if (declared > MAX_TABLES_BYTES)
      throw new RestoreRefused('The backup is too large to put back.');

    const keysInRows = new Set<string>();
    let rows = 0;
    for (const { table, omit } of EXPORT_TABLES) {
      const t = manifest.tables.find((x) => x.table === table)!;
      const columns = await exportTableColumns(table, omit);
      if (!Array.isArray(t.columns) || !sameSet(t.columns, columns))
        throw new RestoreRefused(
          `The backup’s ${table} table does not match this version of the system.`,
        );
      const entry = entries.get(`restore/tables/${table}.ndjson`);
      if (!entry)
        throw new RestoreRefused(`The backup’s ${table} table is missing.`);
      if (entry.uncompressedSize > MAX_TABLE_BYTES)
        throw new RestoreRefused('The backup is too large to put back.');
      const m = measure(MAX_TABLE_BYTES);
      await pipeline(
        await entryStream(zip, entry),
        m.stream,
        createWriteStream(tableFile(dir, table)),
      );
      const { bytes, sha256 } = m.result();
      if (bytes !== t.bytes || sha256 !== t.sha256)
        throw new RestoreRefused(
          `The backup’s ${table} table has been changed or damaged since it was exported.`,
        );
      // Every line must be a row; the stored files' keys are gathered.
      let lines = 0;
      const withFiles = table === 'documents' || table === 'email_inbox';
      for await (const line of createInterface({
        input: createReadStream(tableFile(dir, table), 'utf8'),
        crlfDelay: Infinity,
      })) {
        if (!line) continue;
        let row: unknown;
        try {
          row = JSON.parse(line);
        } catch {
          row = null;
        }
        if (!row || typeof row !== 'object' || Array.isArray(row))
          throw new RestoreRefused(
            `The backup’s ${table} table could not be read.`,
          );
        if (withFiles) {
          const key = (row as Record<string, unknown>).storage_key;
          if (typeof key === 'string') keysInRows.add(key);
        }
        lines += 1;
      }
      if (lines !== t.rows)
        throw new RestoreRefused(
          `The backup’s ${table} table is incomplete (${lines} of ${t.rows} rows).`,
        );
      rows += lines;
    }

    // Every stored file: one of the backup's own documents, there in full.
    const paths = new Set<string>();
    const keys = new Set<string>();
    for (const f of manifest.files) {
      if (
        !isSafeKey(f?.storageKey) ||
        !keysInRows.has(f.storageKey) ||
        keys.has(f.storageKey) ||
        typeof f.path !== 'string' ||
        paths.has(f.path)
      )
        throw new RestoreRefused(
          'The backup’s list of files does not match its records.',
        );
      keys.add(f.storageKey);
      paths.add(f.path);
      const entry = entries.get(f.path);
      if (!entry)
        throw new RestoreRefused('A stored file is missing from the backup.');
      if (entry.uncompressedSize > MAX_FILE_BYTES)
        throw new RestoreRefused('A file in the backup is too large.');
      const { body, sha256 } = await readEntry(zip, entry, MAX_FILE_BYTES);
      if (body.length !== f.bytes || sha256 !== f.sha256)
        throw new RestoreRefused(
          'A stored file in the backup has been changed or damaged since it was exported.',
        );
    }

    // Only the latest check waits.
    if (pending) await discard(pending);
    const entry: Pending = {
      id,
      dir,
      zip: zipPath,
      manifest,
      admin,
      timer: setTimeout(() => {
        if (pending?.id === id) void discard(pending);
      }, PENDING_MS),
    };
    entry.timer.unref();
    pending = entry;
    await recordRestoreEvent(admin, 'system.restore.check', {
      backupCreatedAt: manifest.createdAt,
      rows,
      files: manifest.files.length,
    });
    return {
      id,
      summary: {
        createdAt: manifest.createdAt,
        createdBy: manifest.createdBy,
        tables: manifest.tables.length,
        rows,
        files: manifest.files.length,
      },
    };
  } catch (err) {
    await fs.rm(dir, { recursive: true, force: true });
    throw err;
  } finally {
    opened?.close();
  }
}

/**
 * Step 2: start replacing everything with the checked backup, in the
 * background. Refused unless this admin's checked backup is waiting and no
 * restore is running.
 */
export function startRestore(id: string, admin: string): void {
  if (status.state === 'running')
    throw new RestoreRefused('A restore is already running.');
  const p = pending;
  if (!p || p.id !== id || p.admin !== admin)
    throw new RestoreRefused(
      'That checked backup has expired or was already used. Choose the file again.',
    );
  // Taken now: the hour's timer can no longer remove it mid-restore.
  clearTimeout(p.timer);
  pending = null;
  status = { state: 'running', startedAt: new Date().toISOString() };
  statusAdmin = admin;
  void runRestore(p).then(
    (result) => {
      status = {
        state: 'done',
        ...result,
        finishedAt: new Date().toISOString(),
      };
    },
    () => {
      status = {
        state: 'failed',
        message:
          'The restore did not finish, and the records have not been changed. To try again, choose the file again; ask for help if it fails a second time.',
        finishedAt: new Date().toISOString(),
      };
    },
  );
}

async function runRestore(
  p: Pending,
): Promise<{ rows: number; files: number }> {
  let opened: yauzl.ZipFile | null = null;
  try {
    await recordRestoreEvent(p.admin, 'system.restore.started', {
      backupCreatedAt: p.manifest.createdAt,
    });
    // Files first: a failure here changes no records. Each is checked again
    // as it is read.
    const { zip, entries } = await openZip(p.zip);
    opened = zip;
    const put: string[] = [];
    for (const f of p.manifest.files) {
      const { body, sha256 } = await readEntry(
        zip,
        entries.get(f.path)!,
        MAX_FILE_BYTES,
      );
      if (sha256 !== f.sha256) throw new Error('file changed since checking');
      await getStorageProvider().put({
        key: f.storageKey,
        body,
        contentType: 'application/octet-stream',
      });
      put.push(f.storageKey);
    }
    const tables: RestoreTable[] = EXPORT_TABLES.map(({ table }) => ({
      table,
      columns: p.manifest.tables.find((t) => t.table === table)!.columns,
      file: tableFile(p.dir, table),
    }));
    const { rows, signedOut } = await restoreTables(tables, p.admin, put, {
      backupCreatedAt: p.manifest.createdAt,
      tables: tables.length,
      files: put.length,
    });
    // Everyone's screens refresh; anyone no longer allowed in is let go.
    for (const user of signedOut) disconnectUser(user);
    disconnectAll();
    return { rows, files: put.length };
  } catch (err) {
    // The outcome only: a database error can quote a record's values.
    await recordRestoreEvent(p.admin, 'system.restore.failed', {
      backupCreatedAt: p.manifest.createdAt,
      reason:
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'error',
    }).catch(() => undefined);
    throw err;
  } finally {
    opened?.close();
    await discard(p);
  }
}
