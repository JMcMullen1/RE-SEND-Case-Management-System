import type Anthropic from '@anthropic-ai/sdk';
import {
  diffDirections,
  loadBankHolidays,
  londonToday,
  resolveDirections,
  type DirectionsReview,
} from '@re-send/shared';
import { singleDocumentCorpus } from '../corpus/case-corpus';
import { extractText } from '../documents/extract';
import { createDocument } from '../repositories/documents';
import { liveKeyDates } from '../repositories/directions';
import { extractDirectionsJob } from './directions-job';
import { runAiJob, type AiJobInput, type RunDeps } from './run';

const PDF_MIME = 'application/pdf';

function isPdf(input: DirectionsInput): boolean {
  return (
    input.mimeType === PDF_MIME || input.filename.toLowerCase().endsWith('.pdf')
  );
}

export interface DirectionsInput {
  caseId: string;
  bytes: Buffer;
  filename: string;
  mimeType: string;
}

export interface DirectionsDeps {
  jobOverrides?: Partial<RunDeps>;
  today?: string;
  /** Bank-holiday loader override, for deterministic tests. */
  loadHolidays?: typeof loadBankHolidays;
}

/**
 * The directions-ingestion pipeline, up to (but not including) the calendar.
 *
 * 1. Store the dropped order as a case document (a Tribunal Order) — the order
 *    is a genuine document whether or not its dates are applied.
 * 2. Extract its text, preserving the paragraph numbering staff cite, and read
 *    it through the single-document corpus path.
 * 3. Run extract_directions, then resolve any relative deadline with the
 *    working-day utility, carrying the explanation through.
 * 4. Diff the resolved dates against the case's live key dates.
 *
 * Nothing here writes a key date; the review screen confirms the diff and the
 * apply step (a separate repository call) is the only thing that touches the
 * calendar.
 */
export async function runDirectionsExtraction(
  input: DirectionsInput,
  actor: string | null,
  deps: DirectionsDeps = {},
): Promise<DirectionsReview> {
  const today = deps.today ?? londonToday(new Date());

  // 1. Store the order as a document first (step 1 of the spec).
  const upload = await createDocument(
    input.caseId,
    {
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      category: 'Tribunal Order',
    },
    actor,
  );
  const documentId = upload.document.id;

  // 2. Build Claude's input. A PDF is handed to the model natively so it reads
  //    the full order — layout, tables and all — not just text we managed to
  //    pull out (which is empty for a scanned order). We still extract text and
  //    include it alongside when we have it, so the model has the paragraph
  //    numbering staff cite. Anything else (DOCX, plain text) is read as text.
  const extraction = await extractText(input.mimeType, input.bytes);
  const jobInput = buildJobInput(input, documentId, today, extraction.text);

  // 3. Run the job, then resolve relative deadlines authoritatively.
  const job = await runAiJob(extractDirectionsJob, jobInput, deps.jobOverrides);
  const { holidays } = await (deps.loadHolidays ?? loadBankHolidays)();
  const resolved = resolveDirections(job.output, holidays);

  // 4. Diff against the live calendar.
  const existing = await liveKeyDates(input.caseId);
  const diff = diffDirections(existing, resolved);

  return {
    documentId,
    filename: input.filename,
    orderDate: job.output.orderDate,
    summary: diff.summary,
    counts: diff.counts,
    rows: diff.rows,
  };
}

/**
 * Assemble the user turn for the extraction job.
 *
 * - PDF: a native document block so Claude reads the whole order (a scanned
 *   order has no extractable text at all); the paragraph-numbered text is added
 *   as a second block when we have it, so paragraph citations stay accurate.
 * - Anything else: the extracted text as a numbered corpus item.
 */
function buildJobInput(
  input: DirectionsInput,
  documentId: string,
  today: string,
  extractedText: string | null,
): AiJobInput {
  if (isPdf(input)) {
    const blocks: Anthropic.ContentBlockParam[] = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: PDF_MIME,
          data: input.bytes.toString('base64'),
        },
        title: input.filename,
      },
    ];
    if (extractedText) {
      const corpus = singleDocumentCorpus({
        id: documentId,
        title: input.filename,
        date: today,
        text: extractedText,
      });
      blocks.push({ type: 'text', text: corpus.serialised });
    }
    return blocks;
  }

  const corpus = singleDocumentCorpus({
    id: documentId,
    title: input.filename,
    date: today,
    text: extractedText ?? input.bytes.toString('utf8'),
  });
  return corpus.serialised;
}
