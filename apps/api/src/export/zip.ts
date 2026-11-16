import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { PRODUCT_NAME } from '@re-send/shared';
import {
  EXPORT_TABLES,
  exportTableColumns,
  exportTablePage,
} from '../repositories/export';
import { withBackupSnapshot } from '../repositories/backup';
import { getStorageProvider } from '../storage';

/** Identifies a full export a restore can read. */
export const BACKUP_FORMAT = 'resend-backup';
export const BACKUP_VERSION = 1;

/** restore/manifest.json: what a restore needs to put everything back. */
export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  createdBy: string;
  /** The migrations the database had run (a restore needs the same). */
  schema: { count: number; lastHash: string | null };
  /** Each table: its columns, rows, and the SHA-256 of its JSON lines. */
  tables: {
    table: string;
    columns: string[];
    rows: number;
    bytes: number;
    sha256: string;
  }[];
  /** Each stored file: its storage key, where it is here, size and SHA-256. */
  files: { storageKey: string; path: string; bytes: number; sha256: string }[];
}

/** UTF-8 byte-order mark, so spreadsheet software reads the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
/** Rows read and written per page of a table. */
const PAGE_ROWS = 2000;
/** Size of each slice of a document pushed into the archive. */
const SLICE_BYTES = 1024 * 1024;

/**
 * One CSV cell: dates as ISO, structures as JSON, quoted when needed. Text
 * that a spreadsheet would run as a formula (starting = + - @, tab or CR —
 * an email subject from outside could) is prefixed with an apostrophe so it
 * opens as plain text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLines(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  return rows
    .map((row) => `${columns.map((c) => csvCell(row[c])).join(',')}\r\n`)
    .join('');
}

/** A whole CSV (used for small tables and tests). */
export function toCsv(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  return `${BOM}${columns.map(csvCell).join(',')}\r\n${csvLines(columns, rows)}`;
}

/** One path segment safe in a ZIP on every platform: no separators, no "..". */
export function safeSegment(name: string): string {
  const cleaned = [...name]
    .map((ch) =>
      ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch,
    )
    .join('')
    .trim();
  return !cleaned || /^\.+$/.test(cleaned) ? 'file' : cleaned;
}

/** Insert a suffix before the extension: ("report.pdf", " (v2)") → "report (v2).pdf". */
export function withSuffix(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0
    ? `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`
    : `${filename}${suffix}`;
}

/**
 * A unique path in a folder, compared without case (so "Report.pdf" and
 * "report.pdf" do not overwrite each other on Windows or macOS).
 */
export function uniquePath(
  folder: string,
  filename: string,
  used: Set<string>,
): string {
  let path = `${folder}/${filename}`;
  for (let n = 2; used.has(path.toLowerCase()); n += 1)
    path = `${folder}/${withSuffix(filename, ` [${n}]`)}`;
  used.add(path.toLowerCase());
  return path;
}

const README = (when: string, by: string) => `${PRODUCT_NAME} — full data export

Exported ${when} by ${by}.

This archive holds every record in the system and every stored document, so
the charity can keep, inspect or move its data at any time. It contains
special category personal data about children: store it encrypted, share it
only as your data protection policy allows, and delete it when it is no
longer needed.

data/        One CSV file per table (UTF-8, comma-separated, first row is the
             column names). Dates and times are ISO 8601 in UTC. Columns
             holding structured values (lists, JSON) contain JSON text. Text
             that a spreadsheet would treat as a formula starts with an
             apostrophe. Rows deleted in the system are included, with
             deleted_at set. Records refer to one another by id columns (for
             example case_notes.case_id is cases.id).
documents/   Every stored file, in a folder per case reference, under its
             original filename. Earlier versions carry "(vN)"; files deleted
             in the system are under documents/_deleted/. The documents CSV
             maps each file to its record.
emails/      The original email files (.eml / .msg) filed on each case, and
             any waiting in "Emails to file". The emails CSV holds each email's
             details and text; its attachments are under documents/.
restore/     The same data for Admin › Full import to put back exactly: every
             table as JSON lines (restore/tables/) and restore/manifest.json,
             which maps each stored file to its place in this archive. Leave
             it as it is if this export is your backup.
MANIFEST.txt Written last: row counts per table, the number of files, and
             any file missing from storage. If it is absent, the export did
             not finish — download it again.

Withheld: each person's calendar feed token (a credential, not data).
`;

export interface ExportSummary {
  tables: number;
  rows: number;
  files: number;
  missingFiles: number;
}

/**
 * Stream the full export as a ZIP. Memory stays bounded however large the
 * data: tables are read a page at a time, documents one at a time and pushed
 * in slices, and the writer waits whenever the download falls behind. If the
 * download is abandoned, the export stops.
 */
export function streamExport(by: string): {
  stream: PassThrough;
  done: Promise<ExportSummary>;
} {
  const out = new PassThrough();
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err);
      return;
    }
    if (!out.destroyed) out.write(chunk);
    if (final) out.end();
  });
  const stopped = () => out.destroyed;
  /** Let the download catch up before producing more. */
  const drain = async () => {
    if (out.writableNeedDrain && !out.destroyed)
      await Promise.race([once(out, 'drain'), once(out, 'close')]);
  };

  const addText = async (path: string, text: string) => {
    const file = new ZipDeflate(path, { level: 6 });
    zip.add(file);
    file.push(strToU8(text), true);
    await drain();
  };

  const done = (async (): Promise<ExportSummary> => {
    await addText('README.txt', README(new Date().toISOString(), by));
    const counts: string[] = [];
    let rows = 0;
    for (const { table, omit } of EXPORT_TABLES) {
      if (stopped()) throw new Error('export abandoned');
      const columns = await exportTableColumns(table, omit);
      const file = new ZipDeflate(`data/${table}.csv`, { level: 6 });
      zip.add(file);
      file.push(strToU8(`${BOM}${columns.map(csvCell).join(',')}\r\n`));
      let tableRows = 0;
      for (let offset = 0; ; offset += PAGE_ROWS) {
        const page = await exportTablePage(table, columns, offset, PAGE_ROWS);
        const last = page.length < PAGE_ROWS;
        file.push(strToU8(csvLines(columns, page)), last);
        tableRows += page.length;
        await drain();
        if (stopped()) throw new Error('export abandoned');
        if (last) break;
      }
      rows += tableRows;
      counts.push(`${table}: ${tableRows} rows`);
    }

    // The same tables as JSON lines, exactly as stored, for a restore — read,
    // with the files, from one consistent snapshot.
    let written = 0;
    const missing: string[] = [];
    const manifest = await withBackupSnapshot(async (snapshot) => {
      const tablesForRestore: BackupManifest['tables'] = [];
      for (const { table, omit } of EXPORT_TABLES) {
        if (stopped()) throw new Error('export abandoned');
        const columns = await exportTableColumns(table, omit);
        const file = new ZipDeflate(`restore/tables/${table}.ndjson`, {
          level: 6,
        });
        zip.add(file);
        let tableRows = 0;
        let bytes = 0;
        const hash = createHash('sha256');
        for (let offset = 0; ; offset += PAGE_ROWS) {
          const page = await snapshot.page(table, columns, offset, PAGE_ROWS);
          const last = page.length < PAGE_ROWS;
          const chunk = strToU8(
            page.map((r) => `${JSON.stringify(r)}\n`).join(''),
          );
          hash.update(chunk);
          bytes += chunk.length;
          file.push(chunk, last);
          tableRows += page.length;
          await drain();
          if (stopped()) throw new Error('export abandoned');
          if (last) break;
        }
        tablesForRestore.push({
          table,
          columns,
          rows: tableRows,
          bytes,
          sha256: hash.digest('hex'),
        });
      }

      const files = await snapshot.documentFiles();
      const stored: BackupManifest['files'] = [];
      const storedKeys = new Set<string>();
      const used = new Set<string>();
      for (const f of files) {
        if (stopped()) throw new Error('export abandoned');
        // One copy of each stored file (two records can share one).
        if (storedKeys.has(f.storageKey)) continue;
        const folder = `${f.email ? 'emails' : 'documents'}/${f.deleted ? '_deleted/' : ''}${safeSegment(f.caseReference)}`;
        const name = safeSegment(
          f.version > 1
            ? withSuffix(f.filename, ` (v${f.version})`)
            : f.filename,
        );
        let object: Awaited<
          ReturnType<ReturnType<typeof getStorageProvider>['get']>
        >;
        try {
          object = await getStorageProvider().get(f.storageKey);
        } catch {
          // E.g. encrypted with a key no longer configured: listed, not fatal.
          missing.push(
            `${folder}/${name} (document id ${f.id}, could not be read or decrypted)`,
          );
          continue;
        }
        if (!object) {
          missing.push(`${folder}/${name} (document id ${f.id})`);
          continue;
        }
        // Mostly compressed already (PDF, DOCX, images): stored, not deflated.
        const path = uniquePath(folder, name, used);
        const entry = new ZipPassThrough(path);
        zip.add(entry);
        const body = new Uint8Array(object.body);
        for (let at = 0; at < body.length || at === 0; at += SLICE_BYTES) {
          const end = Math.min(at + SLICE_BYTES, body.length);
          entry.push(body.subarray(at, end), end >= body.length);
          await drain();
          if (end >= body.length) break;
        }
        written += 1;
        storedKeys.add(f.storageKey);
        stored.push({
          storageKey: f.storageKey,
          path,
          bytes: body.length,
          sha256: createHash('sha256').update(body).digest('hex'),
        });
      }

      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        createdBy: by,
        schema: await snapshot.migrationState(),
        tables: tablesForRestore,
        files: stored,
      } satisfies BackupManifest;
    });
    await addText('restore/manifest.json', JSON.stringify(manifest));

    await addText(
      'MANIFEST.txt',
      [
        `Export complete: ${new Date().toISOString()}`,
        '',
        ...counts,
        '',
        `Document files: ${written}`,
        `Missing from storage: ${missing.length}`,
        ...missing.map((m) => `  ${m}`),
        '',
      ].join('\n'),
    );
    zip.end();
    return {
      tables: EXPORT_TABLES.length,
      rows,
      files: written,
      missingFiles: missing.length,
    };
  })();
  done.catch((err: unknown) => {
    if (!out.destroyed) out.destroy(err as Error);
  });
  return { stream: out, done };
}
