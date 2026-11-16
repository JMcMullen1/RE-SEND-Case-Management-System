import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Unzip, UnzipInflate } from 'fflate';
import { EXPORT_TABLES, exportTableColumns } from '../repositories/export';
import {
  migrationState,
  restoreTables,
  type RestoreTable,
} from '../repositories/backup';
import { getStorageProvider } from '../storage';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupManifest,
} from '../export/zip';

/**
 * Full import: putting a full export back. In two steps, so an admin sees what
 * a backup holds before anything changes:
 *
 * 1. check — the uploaded export is saved to a temporary folder and read: its
 *    manifest, every table's rows and every file it lists must be there, and
 *    it must come from this version of the system (the same migrations).
 * 2. restore — every stored file is put back under its own storage key
 *    (encrypted under the current key), then every table is replaced with the
 *    backup's rows in one transaction (see restoreTables). Single use; the
 *    temporary copy is deleted afterwards, or after an hour if never used.
 */

export class RestoreRefused extends Error {}

/** How long a checked backup waits to be restored. */
const PENDING_MS = 60 * 60 * 1000;

interface Pending {
  id: string;
  dir: string;
  zip: string;
  manifest: BackupManifest;
  admin: string;
  timer: NodeJS.Timeout;
}
const pending = new Map<string, Pending>();
let restoring = false;

async function discard(p: Pending): Promise<void> {
  clearTimeout(p.timer);
  pending.delete(p.id);
  await fs.rm(p.dir, { recursive: true, force: true });
}

interface EntryHandler {
  data(chunk: Uint8Array): void;
  end(): Promise<void>;
}

/**
 * Read a ZIP from disk entry by entry without holding it in memory: each
 * entry the handler wants is passed on in chunks, and the reading waits for
 * the handler's work (writing a file, storing a document) to keep up.
 */
async function walkZip(
  zip: string,
  handle: (name: string) => EntryHandler | null,
): Promise<void> {
  const work: Promise<void>[] = [];
  let failure: unknown = null;
  const unzip = new Unzip((file) => {
    const handler = handle(file.name);
    if (!handler) return;
    file.ondata = (err, data, final) => {
      if (err) {
        failure = err;
        return;
      }
      handler.data(data);
      if (final)
        work.push(
          handler.end().catch((e: unknown) => {
            failure = e;
          }),
        );
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of createReadStream(zip, {
    highWaterMark: 1024 * 1024,
  })) {
    unzip.push(chunk as Uint8Array);
    while (work.length) await work.shift();
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  while (work.length) await work.shift();
  if (failure) throw failure;
}

async function lineCount(file: string): Promise<number> {
  let n = 0;
  let last = 10;
  for await (const chunk of createReadStream(file)) {
    const bytes = chunk as Buffer;
    for (const b of bytes) if (b === 10) n += 1;
    if (bytes.length) last = bytes[bytes.length - 1]!;
  }
  return last === 10 ? n : n + 1;
}

const tableFile = (dir: string, table: string) =>
  join(dir, 'tables', `${table}.ndjson`);

export interface BackupSummary {
  createdAt: string;
  createdBy: string;
  tables: number;
  rows: number;
  files: number;
}

/**
 * Step 1: save the upload and check it. Refuses (RestoreRefused, with a
 * message for the admin) anything that is not a complete full export from
 * this version of the system.
 */
export async function checkBackup(
  upload: Readable,
  admin: string,
  tooLarge: () => boolean,
): Promise<{ id: string; summary: BackupSummary }> {
  const id = randomUUID();
  const dir = await fs.mkdtemp(join(tmpdir(), 'resend-restore-'));
  const zip = join(dir, 'backup.zip');
  const cleanUp = () => fs.rm(dir, { recursive: true, force: true });
  try {
    await pipeline(upload, createWriteStream(zip));
    if (tooLarge()) throw new RestoreRefused('The file is too large.');
    await fs.mkdir(join(dir, 'tables'));

    let manifestText = '';
    const names = new Set<string>();
    const wanted = new Set(EXPORT_TABLES.map((t) => t.table));
    try {
      await walkZip(zip, (name) => {
        names.add(name);
        if (name === 'restore/manifest.json') {
          const chunks: Uint8Array[] = [];
          return {
            data: (c) => chunks.push(c),
            end: async () => {
              manifestText = Buffer.concat(chunks).toString('utf8');
            },
          };
        }
        const m = /^restore\/tables\/([a-z_]+)\.ndjson$/.exec(name);
        if (m && wanted.has(m[1]!)) {
          const out = createWriteStream(tableFile(dir, m[1]!));
          return {
            data: (c) => out.write(c),
            end: () =>
              new Promise((resolve, reject) => {
                out.end((err?: Error | null) =>
                  err ? reject(err) : resolve(),
                );
              }),
          };
        }
        return null;
      });
    } catch {
      throw new RestoreRefused(
        'This file could not be read as a ZIP. Choose a full export downloaded from Admin › Full export.',
      );
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(manifestText) as BackupManifest;
    } catch {
      throw new RestoreRefused(
        'This is not a full export from this system (it has no restore/manifest.json), or the export did not finish.',
      );
    }
    if (
      manifest.format !== BACKUP_FORMAT ||
      manifest.version !== BACKUP_VERSION
    )
      throw new RestoreRefused('This is not a full export from this system.');

    const now = await migrationState();
    if (
      manifest.schema?.count !== now.count ||
      manifest.schema?.lastHash !== now.lastHash
    )
      throw new RestoreRefused(
        manifest.schema?.count < now.count
          ? 'This backup is from an earlier version of the system, so it cannot be put back as it is. Ask for it to be brought up to date first.'
          : 'This backup is from a different version of the system, so it cannot be put back as it is.',
      );

    const listed = new Map(manifest.tables.map((t) => [t.table, t]));
    for (const { table, omit } of EXPORT_TABLES) {
      const t = listed.get(table);
      if (!t) throw new RestoreRefused(`The backup has no ${table} table.`);
      const columns = await exportTableColumns(table, omit);
      if (
        t.columns.length !== columns.length ||
        t.columns.some((c) => !columns.includes(c))
      )
        throw new RestoreRefused(
          `The backup's ${table} table does not match this version of the system.`,
        );
      let lines: number;
      try {
        lines = await lineCount(tableFile(dir, table));
      } catch {
        throw new RestoreRefused(`The backup's ${table} table is missing.`);
      }
      if (lines !== t.rows)
        throw new RestoreRefused(
          `The backup's ${table} table is incomplete (${lines} of ${t.rows} rows).`,
        );
    }
    const missing = manifest.files.filter((f) => !names.has(f.path));
    if (missing.length)
      throw new RestoreRefused(
        `${missing.length} stored file${missing.length === 1 ? ' is' : 's are'} missing from the backup.`,
      );

    const entry: Pending = {
      id,
      dir,
      zip,
      manifest,
      admin,
      timer: setTimeout(() => {
        const p = pending.get(id);
        if (p) void discard(p);
      }, PENDING_MS),
    };
    entry.timer.unref();
    pending.set(id, entry);
    return {
      id,
      summary: {
        createdAt: manifest.createdAt,
        createdBy: manifest.createdBy,
        tables: manifest.tables.length,
        rows: manifest.tables.reduce((n, t) => n + t.rows, 0),
        files: manifest.files.length,
      },
    };
  } catch (err) {
    await cleanUp();
    throw err;
  }
}

/**
 * Step 2: replace everything with the checked backup. Files first (a failure
 * there changes no records), then every table in one transaction.
 */
export async function runRestore(
  id: string,
  admin: string,
): Promise<{ rows: number; files: number }> {
  const p = pending.get(id);
  if (!p || p.admin !== admin)
    throw new RestoreRefused(
      'That checked backup has expired or was already used. Choose the file again.',
    );
  if (restoring) throw new RestoreRefused('A restore is already running.');
  restoring = true;
  try {
    const byPath = new Map(p.manifest.files.map((f) => [f.path, f.storageKey]));
    let files = 0;
    await walkZip(p.zip, (name) => {
      const key = byPath.get(name);
      if (!key) return null;
      byPath.delete(name);
      const chunks: Uint8Array[] = [];
      return {
        data: (c) => chunks.push(c),
        end: async () => {
          await getStorageProvider().put({
            key,
            body: Buffer.concat(chunks),
            contentType: 'application/octet-stream',
          });
          files += 1;
        },
      };
    });
    const tables: RestoreTable[] = p.manifest.tables.map((t) => ({
      table: t.table,
      columns: t.columns,
      file: tableFile(p.dir, t.table),
    }));
    const { rows } = await restoreTables(tables, admin, {
      backupCreatedAt: p.manifest.createdAt,
      tables: tables.length,
      files,
    });
    return { rows, files };
  } finally {
    restoring = false;
    await discard(p);
  }
}
