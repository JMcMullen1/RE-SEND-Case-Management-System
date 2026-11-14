import { randomUUID } from 'node:crypto';
import {
  DRAFT_DOCUMENT_FOLDER,
  DRAFT_KIND_LABELS,
  DRAFT_MAX_CORPUS_TOKENS,
  DRAFT_POSITION_STATEMENT_JOB,
  groundDraft,
  londonToday,
  serialiseCorpus,
  type CorpusResult,
  type Draft,
  type PositionStatementOutput,
} from '@re-send/shared';
import Anthropic from '@anthropic-ai/sdk';
import { caseCorpus } from '../corpus/case-corpus';
import { draftPositionStatementJob } from '../ai/drafting-job';
import { AiJobDisabledError, AiJobRefusalError } from '../ai/errors';
import { resolveEnabled, runAiJob, type AiJobResult } from '../ai/run';
import { env } from '../env';
import { getJobFlag } from '../repositories/ai-jobs';
import { getCaseDetail } from '../repositories/case-detail';
import { createDocument } from '../repositories/documents';
import {
  approveDraft,
  completeDraft,
  createDraft,
  failDraft,
} from '../repositories/drafts';
import { draftToDocx } from './docx';

export class DraftingUnavailable extends Error {}

type Runner = (
  input: Anthropic.ContentBlockParam[],
) => Promise<AiJobResult<PositionStatementOutput>>;

const defaultRunner: Runner = (input) =>
  runAiJob(draftPositionStatementJob, input);
let runner: Runner = defaultRunner;

/** Test seam: replace the model call (never used outside tests). */
export function setDraftRunnerForTests(fn: Runner | null): void {
  runner = fn ?? defaultRunner;
}

/** Background work in flight, so tests (and shutdown) can wait for it. */
const inFlight = new Set<Promise<void>>();
export async function settleDrafting(): Promise<void> {
  await Promise.all([...inFlight]);
}

/** The model's input: the whole case file (cached), then the request. */
function buildInput(
  corpus: CorpusResult,
  instructions: string | null,
  today: string,
): Anthropic.ContentBlockParam[] {
  return [
    {
      type: 'text',
      text: `<case_file>\n${serialiseCorpus(corpus.items)}\n</case_file>`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: [
        `Today is ${today}. Draft the appellant's position statement from the case file above.`,
        instructions
          ? `The caseworker asks you to bear this in mind:\n<caseworker_instructions>\n${instructions}\n</caseworker_instructions>`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

/**
 * Ask for a position statement. Checks run up front (drafting switched on, the
 * file not too large); then the draft is recorded as "generating" and written
 * in the background — a draft can take a minute or two — and the case screen
 * updates live when it is ready or has failed.
 */
export async function requestPositionStatement(
  caseId: string,
  instructions: string | null,
  actor: string,
): Promise<string> {
  const enabled = resolveEnabled({
    globalEnabled: env.AI_ENABLED,
    flag: await getJobFlag(DRAFT_POSITION_STATEMENT_JOB),
    definitionDefault: draftPositionStatementJob.enabled ?? true,
  });
  if (!enabled)
    throw new DraftingUnavailable(
      'Assisted drafting is switched off. The rest of the system works as normal.',
    );
  const corpus = await caseCorpus(caseId);
  if (corpus.items.every((i) => i.type === 'case_record'))
    throw new DraftingUnavailable(
      'There is nothing on this case to draft from yet — add notes, documents or emails first.',
    );
  if (corpus.tokenCount > DRAFT_MAX_CORPUS_TOKENS)
    throw new DraftingUnavailable(
      'This case file is too large to draft from in one go.',
    );

  const id = await createDraft(
    caseId,
    'position_statement',
    instructions,
    actor,
  );
  const work = generate(id, corpus, instructions).finally(() =>
    inFlight.delete(work),
  );
  inFlight.add(work);
  return id;
}

/** The API key cannot use the drafting model (not found / not permitted). */
function modelUnavailable(err: unknown): boolean {
  const cause = (err as { cause?: unknown }).cause;
  return (
    cause instanceof Anthropic.NotFoundError ||
    cause instanceof Anthropic.PermissionDeniedError
  );
}

async function generate(
  draftId: string,
  corpus: CorpusResult,
  instructions: string | null,
): Promise<void> {
  try {
    const result = await runner(
      buildInput(corpus, instructions, londonToday(new Date())),
    );
    await completeDraft(
      draftId,
      groundDraft(result.output, corpus.items, randomUUID),
    );
  } catch (err) {
    // Reasons are shown to the caseworker; they never carry case content.
    const reason =
      err instanceof AiJobDisabledError
        ? 'Assisted drafting was switched off before the draft was written.'
        : err instanceof AiJobRefusalError
          ? 'The drafting model declined to write from this file. Write this one by hand.'
          : modelUnavailable(err)
            ? `The AI key this system uses does not have access to ${draftPositionStatementJob.model}. An administrator can enable it in the Anthropic Console.`
            : 'Drafting failed. Try again in a few minutes.';
    await failDraft(draftId, reason).catch(() => {});
  }
}

/**
 * Approve a draft: lock it and file the statement as a Word document in the
 * case's documents, named for the case and the date.
 */
export async function approveAndFile(
  draftId: string,
  actor: string,
): Promise<Draft> {
  return approveDraft(draftId, actor, async (draft) => {
    const detail = await getCaseDetail(draft.caseId);
    const today = londonToday(new Date());
    const label = DRAFT_KIND_LABELS[draft.kind];
    const subtitle = [
      detail?.child?.fullName ? `Child: ${detail.child.fullName}` : null,
      detail?.appealNumber ? `Appeal number: ${detail.appealNumber}` : null,
      detail ? `Case ${detail.caseReference}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const bytes = await draftToDocx({
      title: label,
      subtitle: subtitle || null,
      sections: draft.sections,
    });
    const filed = await createDocument(
      draft.caseId,
      {
        filename: `${label} ${detail?.caseReference ?? ''} ${today}.docx`
          .replace(/\s+/g, ' ')
          .trim(),
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes,
        category: DRAFT_DOCUMENT_FOLDER,
      },
      actor,
      { versioning: false },
    );
    return filed.document.id;
  });
}
