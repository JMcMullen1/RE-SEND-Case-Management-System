import { randomUUID } from 'node:crypto';
import {
  DRAFT_DOCUMENT_FOLDER,
  DRAFT_KIND_JOBS,
  DRAFT_KIND_LABELS,
  DRAFT_MAX_CORPUS_TOKENS,
  TRIBUNAL_FORMS,
  completeTribunalForm,
  groundDraft,
  londonToday,
  serialiseCorpus,
  type CorpusResult,
  type Draft,
  type DraftKind,
  type GroundedDraft,
  type PositionStatementOutput,
  type Send35Output,
  type TribunalFormOutput,
} from '@re-send/shared';
import Anthropic from '@anthropic-ai/sdk';
import { caseCorpus } from '../corpus/case-corpus';
import {
  draftPositionStatementJob,
  draftSend35Job,
  draftSend35aJob,
  draftSend45Job,
  draftSend7Job,
} from '../ai/drafting-job';
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
import { buildLogger } from '../logging/logger';

const log = buildLogger(env.LOG_LEVEL);

export class DraftingUnavailable extends Error {}

type Runner = (
  input: Anthropic.ContentBlockParam[],
  kind: DraftKind,
) => Promise<
  AiJobResult<PositionStatementOutput | Send35Output | TribunalFormOutput>
>;

const JOBS = {
  position_statement: draftPositionStatementJob,
  send35_appeal: draftSend35Job,
  send35a_appeal: draftSend35aJob,
  send7_request: draftSend7Job,
  send45_case_review: draftSend45Job,
} as const;

const defaultRunner: Runner = (input, kind) => {
  switch (kind) {
    case 'position_statement':
      return runAiJob(draftPositionStatementJob, input);
    case 'send35_appeal':
      return runAiJob(draftSend35Job, input);
    case 'send35a_appeal':
      return runAiJob(draftSend35aJob, input) as Promise<
        AiJobResult<TribunalFormOutput>
      >;
    case 'send7_request':
      return runAiJob(draftSend7Job, input) as Promise<
        AiJobResult<TribunalFormOutput>
      >;
    case 'send45_case_review':
      return runAiJob(draftSend45Job, input) as Promise<
        AiJobResult<TribunalFormOutput>
      >;
  }
};
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

function formAsk(kind: keyof typeof TRIBUNAL_FORMS): string {
  const form = TRIBUNAL_FORMS[kind];
  return `Draft the answers to the ${form.code} form (${form.version}) from the case file above.`;
}

/** The model's input: the whole case file (cached), then the request. */
const ASK: Record<DraftKind, string> = {
  position_statement:
    "Draft the appellant's position statement from the case file above.",
  send35_appeal: formAsk('send35_appeal'),
  send35a_appeal: formAsk('send35a_appeal'),
  send7_request: formAsk('send7_request'),
  send45_case_review: formAsk('send45_case_review'),
};

function buildInput(
  kind: DraftKind,
  corpus: CorpusResult,
  instructions: string | null,
  today: string,
): Anthropic.ContentBlockParam[] {
  return [
    {
      type: 'text',
      text: `<case_file>\n${serialiseCorpus(corpus.items).replace(/<\/case_file>/gi, '</case-file>')}\n</case_file>`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: [
        `Today is ${today}. ${ASK[kind]}`,
        instructions
          ? `The caseworker asks you to bear this in mind:\n<caseworker_instructions>\n${instructions.replace(/<\/caseworker_instructions>/gi, '')}\n</caseworker_instructions>`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];
}

/**
 * Ask for a draft (a position statement or SEND35 form answers). Checks run
 * up front (drafting switched on, the file not too large); then the draft is
 * recorded as "generating" and written in the background — a draft can take a
 * minute or two — and the case screen updates live when it is ready or has
 * failed.
 */
export async function requestDraft(
  caseId: string,
  kind: DraftKind,
  instructions: string | null,
  actor: string,
): Promise<string> {
  const enabled = resolveEnabled({
    globalEnabled: env.AI_ENABLED,
    flag: await getJobFlag(DRAFT_KIND_JOBS[kind]),
    definitionDefault: JOBS[kind].enabled ?? true,
  });
  if (!enabled)
    throw new DraftingUnavailable(
      'Assisted drafting is switched off. The rest of the system works as normal.',
    );
  // What a draft is drawn from — not time entries.
  const corpus = await caseCorpus(caseId, {
    include: ['case_record', 'document', 'note', 'email'],
  });
  if (corpus.items.every((i) => i.type === 'case_record'))
    throw new DraftingUnavailable(
      'There is nothing on this case to draft from yet — add notes, documents or emails first.',
    );
  if (corpus.tokenCount > DRAFT_MAX_CORPUS_TOKENS)
    throw new DraftingUnavailable(
      'This case file is too large to draft from in one go.',
    );

  const id = await createDraft(caseId, kind, instructions, actor);
  const work = generate(id, kind, caseId, corpus, instructions).finally(() =>
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

/** Hold the model's output to the file, and (for a form) add the record's facts. */
async function ground(
  kind: DraftKind,
  caseId: string,
  corpus: CorpusResult,
  instructions: string | null,
  today: string,
): Promise<GroundedDraft> {
  const input = buildInput(kind, corpus, instructions, today);
  if (kind === 'position_statement') {
    const result = await runner(input, kind);
    return groundDraft(result.output, corpus.items, randomUUID);
  }
  const output = (await runner(input, kind)).output;
  const detail = await getCaseDetail(caseId);
  if (!detail) throw new Error('case not found');
  // SEND35 reports its dates at the top level; the other forms under `dates`.
  const dates =
    kind === 'send35_appeal'
      ? {
          decisionLetter: (output as Send35Output).decisionLetter,
          mediationCertificate: (output as Send35Output).mediationCertificate,
        }
      : ((output as TribunalFormOutput).dates ?? {});
  return completeTribunalForm(kind, {
    grounded: groundDraft(
      output,
      corpus.items,
      randomUUID,
      TRIBUNAL_FORMS[kind].sections,
    ),
    dates,
    detail,
    corpus: corpus.items,
    today,
    newId: randomUUID,
  });
}

async function generate(
  draftId: string,
  kind: DraftKind,
  caseId: string,
  corpus: CorpusResult,
  instructions: string | null,
): Promise<void> {
  try {
    const content = await ground(
      kind,
      caseId,
      corpus,
      instructions,
      londonToday(new Date()),
    );
    const completed = await completeDraft(draftId, content);
    if (!completed)
      log.warn({ draftId }, 'draft finished after its time limit; discarded');
  } catch (err) {
    // Identifiers and error class only — never case content.
    log.warn(
      {
        draftId,
        error: err instanceof Error ? err.name : 'unknown',
        status: (err as { cause?: { status?: number } }).cause?.status,
      },
      'drafting failed',
    );
    // Reasons are shown to the caseworker; they never carry case content.
    const reason =
      err instanceof AiJobDisabledError
        ? 'Assisted drafting was switched off before the draft was written.'
        : err instanceof AiJobRefusalError
          ? 'The drafting model declined to write from this file. Write this one by hand.'
          : modelUnavailable(err)
            ? `The AI key this system uses does not have access to ${JOBS[kind].model}. An administrator can enable it in the Anthropic Console.`
            : 'Drafting failed. Try again in a few minutes.';
    await failDraft(draftId, reason).catch(() => {});
  }
}

/**
 * Approve a draft: lock it and file it as a Word document in the case's
 * documents, named for the case and the date. Form answers carry a
 * "before you submit" list (the warnings, the gaps still to fill and the
 * appellant's own steps), since the form cannot go until those are done.
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
    const form =
      draft.kind === 'position_statement' ? null : TRIBUNAL_FORMS[draft.kind];
    const bytes = await draftToDocx({
      title: form ? `${label} — answers` : label,
      subtitle:
        [
          subtitle,
          form
            ? `For copying into the ${form.code} form (${form.version}) — ${form.onlineUrl ? `online at ${form.onlineUrl}` : `from ${form.guidanceUrl}`}`
            : null,
        ]
          .filter(Boolean)
          .join('\n') || null,
      sections: draft.sections,
      checklist: form
        ? [
            ...draft.alerts,
            ...draft.sections.flatMap((s) =>
              s.gap ? [`${s.heading}: ${s.gap}`] : [],
            ),
            ...draft.missingInformation,
          ]
        : undefined,
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
