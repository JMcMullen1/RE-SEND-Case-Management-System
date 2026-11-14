import { PassThrough } from 'node:stream';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { PRODUCT_NAME } from '@re-send/shared';
import {
  EXPORT_TABLES,
  exportDocumentFiles,
  exportTableRows,
} from '../repositories/export';
import { getStorageProvider } from '../storage';

/** UTF-8 byte-order mark, so spreadsheet software reads the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** One CSV cell: dates as ISO, structures as JSON, quoted when needed. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows)
    lines.push(columns.map((c) => csvCell(row[c])).join(','));
  // A byte-order mark so spreadsheet software reads it as UTF-8.
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** A filename safe in a ZIP on every platform. */
function safe(name: string): string {
  const cleaned = [...name]
    .map((ch) =>
      ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch,
    )
    .join('');
  return cleaned.trim() || 'file';
}

/** Add a version suffix before the extension: "report.pdf" → "report (v2).pdf". */
function versioned(filename: string, version: number): string {
  if (version <= 1) return filename;
  const dot = filename.lastIndexOf('.');
  return dot > 0
    ? `${filename.slice(0, dot)} (v${version})${filename.slice(dot)}`
    : `${filename} (v${version})`;
}

const README = (when: string, by: string) => `${PRODUCT_NAME} — full data export

Exported ${when} by ${by}.

This archive holds every record in the system and every stored document, so
the charity can keep, inspect or move its data at any time. It contains
special category personal data about children: store it encrypted, share it
only as your data protection policy allows, and delete it when it is no
longer needed.

data/       One CSV file per table (UTF-8, comma-separated, first row is the
            column names). Dates and times are ISO 8601 in UTC. Columns holding
            structured values (lists, JSON) contain JSON text. Rows that were
            deleted in the system are included, with their deleted_at set.
            Records refer to one another by their id columns (for example
            case_notes.case_id is cases.id).
documents/  Every stored file, in a folder per case reference, under its
            original filename. Earlier versions carry "(vN)"; files deleted in
            the system are under documents/_deleted/. The documents CSV maps
            each file to its record.

Withheld: each person's calendar feed token (a credential, not data).
`;

/**
 * Stream the full export as a ZIP. Tables are written one at a time and
 * documents read from storage one at a time, so memory stays bounded however
 * large the library. Returns the stream and a promise of what was written.
 */
export function streamExport(by: string): {
  stream: PassThrough;
  done: Promise<{ tables: number; rows: number; files: number }>;
} {
  const out = new PassThrough();
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err);
      return;
    }
    out.write(chunk);
    if (final) out.end();
  });

  const addText = (path: string, text: string) => {
    const file = new ZipDeflate(path, { level: 6 });
    zip.add(file);
    file.push(strToU8(text), true);
  };

  const done = (async () => {
    addText('README.txt', README(new Date().toISOString(), by));
    let rows = 0;
    for (const { table, omit } of EXPORT_TABLES) {
      const data = await exportTableRows(table, omit);
      rows += data.rows.length;
      addText(`data/${table}.csv`, toCsv(data.columns, data.rows));
    }
    const files = await exportDocumentFiles();
    const used = new Set<string>();
    let written = 0;
    for (const f of files) {
      const object = await getStorageProvider().get(f.storageKey);
      if (!object) continue;
      const folder = `documents/${f.deleted ? '_deleted/' : ''}${safe(f.caseReference)}`;
      let path = `${folder}/${safe(versioned(f.filename, f.version))}`;
      // Two files with the same name and version (e.g. same-named email
      // attachments) both survive.
      for (let n = 2; used.has(path); n += 1)
        path = `${folder}/${safe(versioned(f.filename, f.version))} [${n}]`;
      used.add(path);
      // Documents are mostly compressed already (PDF, DOCX, images): store.
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      entry.push(new Uint8Array(object.body), true);
      written += 1;
    }
    zip.end();
    return { tables: EXPORT_TABLES.length, rows, files: written };
  })();
  done.catch((err: unknown) => out.destroy(err as Error));
  return { stream: out, done };
}
