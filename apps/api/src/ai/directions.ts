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
import { runAiJob, type RunDeps } from './run';

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

  // 2. Extract text (paragraph numbering preserved) and read via the corpus.
  const extraction = await extractText(input.mimeType, input.bytes);
  const text = extraction.text ?? input.bytes.toString('utf8');
  const corpus = singleDocumentCorpus({
    id: documentId,
    title: input.filename,
    date: today,
    text,
  });

  // 3. Run the job, then resolve relative deadlines authoritatively.
  const job = await runAiJob(
    extractDirectionsJob,
    corpus.serialised,
    deps.jobOverrides,
  );
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
