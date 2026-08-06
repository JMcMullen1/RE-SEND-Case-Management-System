/**
 * Text extraction on upload. Pulls readable text out of PDF, DOCX and plain-text
 * files into `documents.extracted_text`, which feeds the case corpus and
 * Postgres full-text search. Best-effort: any failure returns null and the raw
 * file remains the source of truth. Nothing here is logged with file content —
 * only the mime type and an outcome.
 */

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ExtractionOutcome =
  | { text: string; status: 'extracted' }
  | { text: null; status: 'empty' | 'unsupported' | 'failed' };

export async function extractText(
  mimeType: string,
  bytes: Buffer,
): Promise<ExtractionOutcome> {
  try {
    const raw = await extractRaw(mimeType, bytes);
    if (raw === null) return { text: null, status: 'unsupported' };
    const text = normalise(raw);
    return text.length > 0
      ? { text, status: 'extracted' }
      : { text: null, status: 'empty' };
  } catch {
    // Extraction must never fail an upload; the bytes are already safe.
    return { text: null, status: 'failed' };
  }
}

async function extractRaw(
  mimeType: string,
  bytes: Buffer,
): Promise<string | null> {
  if (mimeType === 'application/pdf') return extractPdf(bytes);
  if (mimeType === DOCX_MIME) return extractDocx(bytes);
  if (isPlainText(mimeType)) return bytes.toString('utf8');
  return null;
}

function isPlainText(mimeType: string): boolean {
  const type = mimeType.split(';')[0]!.trim();
  return (
    type === 'text/plain' ||
    type === 'text/markdown' ||
    type === 'text/csv' ||
    type === 'application/json'
  );
}

async function extractPdf(bytes: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    // pdf-parse appends "-- N of M --" page separators; drop them.
    return result.text.replace(/^-- \d+ of \d+ --$/gm, '');
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

/** Collapse runs of blank lines and trailing whitespace to keep text compact. */
function normalise(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
