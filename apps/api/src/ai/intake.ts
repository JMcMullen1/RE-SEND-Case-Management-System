import { createHash, randomUUID } from 'node:crypto';
import {
  londonToday,
  type IntakeRef,
  type IntakeResult,
} from '@re-send/shared';
import { singleDocumentCorpus } from '../corpus/case-corpus';
import { extractText } from '../documents/extract';
import { getStorageProvider, type StorageProvider } from '../storage';
import { extractIntakeJob, mapExtraction } from './intake-job';
import { runAiJob, type RunDeps } from './run';

export interface IntakeInput {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  source: 'form' | 'email';
}

export interface IntakeDeps {
  storage?: StorageProvider;
  /** AI job runner overrides — used to inject a stubbed model in tests. */
  jobOverrides?: Partial<RunDeps>;
  today?: string;
}

/**
 * The smart-fill pipeline. Extract text (never page images — a labelled text
 * form gains nothing from them and costs ~10x the input tokens), read it through
 * the single-document corpus path, then run extract_intake and map the result
 * onto the add-case form. The submission bytes are stored through the storage
 * provider only after a successful extraction, so a disabled or refused job
 * leaves nothing behind; the case document is written on Create.
 */
export async function runIntakeExtraction(
  input: IntakeInput,
  deps: IntakeDeps = {},
): Promise<IntakeResult> {
  const today = deps.today ?? londonToday(new Date());
  const text = await extractIntakeText(
    input.mimeType,
    input.bytes,
    input.filename,
  );

  const storageId = randomUUID();
  const corpus = singleDocumentCorpus({
    id: storageId,
    title: input.filename,
    date: today,
    text,
  });

  const extraction = await runAiJob(
    extractIntakeJob,
    corpus.serialised,
    deps.jobOverrides,
  );

  // Only now that extraction succeeded, keep the original submission in storage.
  const storageKey = `intake/${storageId}`;
  await (deps.storage ?? getStorageProvider()).put({
    key: storageKey,
    body: input.bytes,
    contentType: input.mimeType,
  });

  const ref: IntakeRef = {
    storageKey,
    filename: input.filename,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
  };

  return mapExtraction(extraction.output, { source: input.source, today, ref });
}

// --- Text extraction for the intake formats ---------------------------------

/**
 * Pull text out of an intake upload. PDF/DOCX/plain text go through the shared
 * extractor; HTML and .eml are handled here so a JotForm HTML export or a
 * forwarded enquiry email work too.
 */
export async function extractIntakeText(
  mimeType: string,
  bytes: Buffer,
  filename: string,
): Promise<string> {
  const type = mimeType.split(';')[0]!.trim().toLowerCase();
  const name = filename.toLowerCase();

  if (type === 'text/html' || name.endsWith('.html') || name.endsWith('.htm')) {
    return stripHtml(bytes.toString('utf8'));
  }
  if (type === 'message/rfc822' || name.endsWith('.eml')) {
    return parseEml(bytes.toString('utf8'));
  }

  const out = await extractText(mimeType, bytes);
  if (out.text) return out.text;
  // Fall back to treating unknown types as UTF-8 text (e.g. a pasted body).
  return bytes.toString('utf8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseEml(raw: string): string {
  const norm = raw.replace(/\r\n/g, '\n');
  const split = norm.indexOf('\n\n');
  const headerBlock = split === -1 ? norm : norm.slice(0, split);
  let body = split === -1 ? '' : norm.slice(split + 2);
  // Keep the useful headers as context for the enquiry.
  const header = (name: string) => {
    const m = headerBlock.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
    return m ? `${name}: ${m[1]!.trim()}` : null;
  };
  const kept = [header('From'), header('Subject'), header('Date')].filter(
    Boolean,
  );
  if (/<html|<body|<div|<p[ >]/i.test(body)) body = stripHtml(body);
  return [...kept, '', body.trim()].join('\n').trim();
}
