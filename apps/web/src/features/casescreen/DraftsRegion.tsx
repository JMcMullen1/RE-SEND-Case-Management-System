import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DRAFT_KIND_DESCRIPTIONS,
  DRAFT_KIND_LABELS,
  TRIBUNAL_FORMS,
  TRIBUNAL_FORM_GROUPS,
  TRIBUNAL_FORM_KINDS,
  canDraft,
  formatCivilDate,
  type Draft,
  type DraftKind,
  type DraftSection,
  type DraftSource,
} from '@re-send/shared';
import { documentContentUrl } from '../../api/documents';
import {
  approveDraft,
  discardDraft,
  fetchDrafts,
  requestDraft,
  saveDraft,
} from '../../api/drafts';
import { useMe } from '../../hooks/useCaseData';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

/** An example focus for each kind, shown in the request box. */
const INSTRUCTION_EXAMPLES: Partial<Record<DraftKind, string>> = {
  position_statement:
    "e.g. The LA disputes the need for a specialist placement; emphasise the EP's findings on anxiety.",
  send35_appeal:
    'e.g. The appeal is about Sections B, F and I of the final plan issued in March; mediation was declined.',
  send35a_appeal:
    'e.g. The LA refused to assess in its letter of 3 March; the school says she is not making progress despite SEN support.',
  send7_request:
    'e.g. Ask for 14 more days to file the EP report; the LA was emailed about it on 2 November.',
  send45_case_review:
    'e.g. Section B is now agreed; Section F hours and the placement are still in dispute.',
};

/** What the reviewer is told a draft is, and must confirm on approval. */
const REVIEW_COPY: Record<
  DraftKind,
  { notFinished: string; confirm: string; gapLabel: string }
> = {
  position_statement: {
    notFinished: 'A draft for you to check, not a finished statement.',
    confirm:
      'I have read the whole statement and checked it against its sources.',
    gapLabel: 'Not in the file: ',
  },
  ...Object.fromEntries(
    TRIBUNAL_FORM_KINDS.map((kind) => [
      kind,
      {
        notFinished:
          'Draft answers for you to check with the family, not a finished form.',
        confirm:
          'I have read every answer, checked it against its sources, and the family has agreed them.',
        gapLabel: 'Check: ',
      },
    ]),
  ),
} as Record<
  DraftKind,
  { notFinished: string; confirm: string; gapLabel: string }
>;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  case_record: 'Case record',
  document: 'Document',
  note: 'Note',
  email: 'Email',
  time_entry: 'Time',
};

/**
 * Assisted drafting on a case. The model writes a first draft from the case
 * file — every paragraph tied to the items it rests on — and a caseworker
 * reads, edits and approves it. Nothing is filed until it is approved.
 */
export function DraftsRegion({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const role = useMe().data?.role;
  const mayDraft = canDraft(role);
  const drafts = useQuery({
    queryKey: ['drafts', caseId],
    queryFn: () => fetchDrafts(caseId),
    // While one is being written, check now and then as a fallback to the
    // live update (e.g. if the live connection is down).
    refetchInterval: (q) =>
      q.state.data?.drafts.some((d) => d.status === 'generating')
        ? 15_000
        : false,
  });
  // What is being asked for: a kind, or 'form' while no form is chosen yet.
  const [asking, setAsking] = useState<DraftKind | 'form' | null>(null);
  const [formQuery, setFormQuery] = useState('');
  const chosen: DraftKind | null =
    asking === null || asking === 'form' ? null : asking;
  const [instructions, setInstructions] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (kind: DraftKind) =>
      requestDraft(caseId, kind, instructions.trim() || null),
    onSuccess: (draft) => {
      setAsking(null);
      setInstructions('');
      setOpenId(draft.id);
      void qc.invalidateQueries({ queryKey: ['drafts', caseId] });
    },
  });

  const list = drafts.data?.drafts ?? [];
  // A draft opens for review once it is written; until then (or if it fails)
  // its row in the list shows where it is.
  const open =
    list.find(
      (d) =>
        d.id === openId && (d.status === 'ready' || d.status === 'approved'),
    ) ?? null;

  if (open) {
    return (
      <DraftView
        key={open.id}
        draft={open}
        mayDraft={mayDraft}
        onBack={() => setOpenId(null)}
        onChanged={() =>
          void qc.invalidateQueries({ queryKey: ['drafts', caseId] })
        }
        onSaved={(saved) =>
          qc.setQueryData<{ drafts: Draft[] }>(['drafts', caseId], (old) =>
            old
              ? {
                  drafts: old.drafts.map((d) =>
                    d.id === saved.id ? saved : d,
                  ),
                }
              : old,
          )
        }
        onFiled={() =>
          void qc.invalidateQueries({ queryKey: ['documents', caseId] })
        }
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-gray-600">
        The drafting assistant writes a first draft from this case’s documents,
        emails and notes — a position statement, or the answers to any of the
        Tribunal’s forms for parents and young people. Every paragraph shows the
        items it is drawn from, and where the file gives no basis the draft says
        so instead of guessing. You read, edit and approve it — nothing is filed
        until you do.
      </p>

      {mayDraft &&
        (asking ? (
          <div className="rounded-lg border border-resend-purple p-4">
            {asking === 'position_statement' ? (
              <>
                <p className="text-sm font-semibold text-resend-ink">
                  {DRAFT_KIND_LABELS[asking]}
                </p>
                <p className="mb-3 text-sm text-gray-600">
                  {DRAFT_KIND_DESCRIPTIONS[asking]}
                </p>
              </>
            ) : (
              <fieldset className="mb-3">
                <legend className="text-sm font-semibold text-resend-ink">
                  Which form?
                </legend>
                <label className="mt-1 block text-sm text-gray-600">
                  Find a form
                  <input
                    type="search"
                    value={formQuery}
                    onChange={(e) => setFormQuery(e.target.value)}
                    placeholder="e.g. SEND7, expenses, exclusion"
                    className="mt-0.5 block w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  />
                </label>
                <div className="mt-2 space-y-2">
                  {TRIBUNAL_FORM_GROUPS.map((group) => {
                    const q = formQuery.trim().toLowerCase();
                    const kinds = TRIBUNAL_FORM_KINDS.filter(
                      (k) =>
                        TRIBUNAL_FORMS[k].group === group.id &&
                        (!q ||
                          `${DRAFT_KIND_LABELS[k]} ${DRAFT_KIND_DESCRIPTIONS[k]}`
                            .toLowerCase()
                            .includes(q)),
                    );
                    if (kinds.length === 0) return null;
                    return (
                      <details
                        // Re-opened as the search changes: every match shown.
                        key={`${group.id}:${q ? 'search' : 'browse'}`}
                        open={
                          Boolean(q) ||
                          group.id === 'appeal' ||
                          kinds.some((k) => k === chosen)
                        }
                      >
                        <summary className="mb-1 cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {group.label} ({kinds.length})
                        </summary>
                        <div className="space-y-1">
                          {kinds.map((kind) => (
                            <label
                              key={kind}
                              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                                asking === kind
                                  ? 'border-resend-purple bg-gray-50'
                                  : 'border-gray-200'
                              }`}
                            >
                              <input
                                type="radio"
                                name="form-kind"
                                value={kind}
                                checked={asking === kind}
                                onChange={() => {
                                  ask.reset();
                                  setAsking(kind);
                                }}
                                aria-labelledby={`kind-${kind}`}
                                aria-describedby={`kind-${kind}-about`}
                                className="mt-0.5 h-4 w-4 accent-resend-purple focus:ring-resend-purple"
                              />
                              <span>
                                <span
                                  id={`kind-${kind}`}
                                  className="font-medium text-resend-ink"
                                >
                                  {DRAFT_KIND_LABELS[kind]}
                                </span>
                                <span
                                  id={`kind-${kind}-about`}
                                  className="block text-gray-600"
                                >
                                  {DRAFT_KIND_DESCRIPTIONS[kind]}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <label className="block text-sm font-medium text-resend-ink">
              Anything the draft should focus on? (optional)
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={
                  chosen
                    ? (INSTRUCTION_EXAMPLES[chosen] ??
                      'e.g. Anything the file does not make clear, or what to emphasise.')
                    : 'Choose a form first.'
                }
                className="mt-1 block w-full rounded-md border border-gray-200 p-2 text-sm font-normal focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              />
            </label>
            {ask.isError && (
              <p role="alert" className="mt-2 text-sm text-status-amber-text">
                {errorText(ask.error)}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  ask.reset();
                  setAsking(null);
                }}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={ask.isPending || !chosen}
                onClick={() => chosen && ask.mutate(chosen)}
                className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {ask.isPending ? 'Starting…' : 'Start drafting'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['position_statement', 'Draft a position statement'],
                ['form', 'Fill in a Tribunal form'],
              ] as const
            ).map(([kind, text]) => (
              <button
                key={kind}
                type="button"
                onClick={() => setAsking(kind)}
                className="rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {text}
              </button>
            ))}
          </div>
        ))}

      {drafts.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {!drafts.isLoading && list.length === 0 && (
        <p className="text-sm text-gray-500">No drafts on this case yet.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {list.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-resend-ink">
                {DRAFT_KIND_LABELS[d.kind]}
                <StatusChip draft={d} />
              </p>
              <p className="text-xs text-gray-600">
                Asked for by {d.createdByName ?? 'Unknown'} ·{' '}
                {when(d.createdAt)}
                {d.approvedAt &&
                  ` · approved by ${d.approvedByName ?? 'Unknown'} ${when(d.approvedAt)}`}
              </p>
              {d.status === 'generating' && (
                <p className="text-xs text-gray-600">
                  Drafting — usually a minute or two. You can carry on working;
                  it appears here when ready.
                </p>
              )}
              {d.status === 'failed' && d.failureReason && (
                <p className="text-xs text-status-amber-text">
                  {d.failureReason}
                </p>
              )}
            </div>
            <span className="flex shrink-0 gap-3 text-sm">
              {(d.status === 'ready' || d.status === 'approved') && (
                <button
                  type="button"
                  onClick={() => setOpenId(d.id)}
                  className="font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  {d.status === 'ready' ? 'Review' : 'View'}
                </button>
              )}
              {d.status === 'failed' && mayDraft && (
                <DiscardButton
                  draftId={d.id}
                  onDone={() =>
                    void qc.invalidateQueries({ queryKey: ['drafts', caseId] })
                  }
                />
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusChip({ draft }: { draft: Draft }) {
  const styles: Record<Draft['status'], string> = {
    generating: 'bg-gray-100 text-gray-700',
    ready: 'border border-resend-purple text-resend-purple',
    failed: 'border border-status-amber text-resend-ink',
    approved: 'bg-resend-green text-white',
  };
  const labels: Record<Draft['status'], string> = {
    generating: 'Drafting…',
    ready: 'Ready for review',
    failed: 'Failed',
    approved: 'Approved',
  };
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[draft.status]}`}
    >
      {labels[draft.status]}
    </span>
  );
}

function DiscardButton({
  draftId,
  onDone,
}: {
  draftId: string;
  onDone: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const discard = useMutation({
    mutationFn: () => discardDraft(draftId),
    onSuccess: onDone,
  });
  return confirm ? (
    <span className="flex gap-2 text-xs">
      <button
        type="button"
        onClick={() => discard.mutate()}
        className="font-semibold text-status-amber-text hover:underline"
      >
        Yes, discard
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="text-gray-600 hover:underline"
      >
        Keep
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="text-status-amber-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
    >
      Discard
    </button>
  );
}

type EditSections = {
  key: DraftSection['key'];
  paragraphs: {
    /** Stable key for React, also for paragraphs not yet saved. */
    uiKey: string;
    id?: string;
    text: string;
    sourceIds: string[];
    edited: boolean;
    /** The wording has changed since its sources were matched to it. */
    reworded: boolean;
  }[];
}[];

function toEditable(draft: Draft): EditSections {
  return draft.sections.map((s) => ({
    key: s.key,
    paragraphs: s.paragraphs.map((p) => ({
      ...p,
      uiKey: p.id,
      reworded: p.edited,
    })),
  }));
}

/**
 * Unsaved edits, kept while the person moves to another tab of the case and
 * back (the view unmounts), so switching tabs never throws work away. Cleared
 * when saved, approved or discarded.
 */
const unsavedEdits = new Map<
  string,
  { base: string; sections: EditSections }
>();

/** Review, edit and approve one draft (or read an approved one). */
function DraftView({
  draft,
  mayDraft,
  onBack,
  onChanged,
  onSaved,
  onFiled,
}: {
  draft: Draft;
  mayDraft: boolean;
  onBack: () => void;
  onChanged: () => void;
  onSaved: (draft: Draft) => void;
  onFiled: () => void;
}) {
  const editable = draft.status === 'ready' && mayDraft;
  const kept = unsavedEdits.get(draft.id);
  const [sections, setSections] = useState<EditSections>(
    () => kept?.sections ?? toEditable(draft),
  );
  const [dirty, setDirty] = useState(Boolean(kept));
  // The version this editor started from, sent with a save so another
  // person's save in the meantime is reported, not overwritten.
  const [base, setBase] = useState(kept?.base ?? draft.updatedAt);

  // Keep unsaved work across tab switches; warn before leaving the page.
  useEffect(() => {
    if (dirty) unsavedEdits.set(draft.id, { base, sections });
    else unsavedEdits.delete(draft.id);
  }, [dirty, base, sections, draft.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [confirming, setConfirming] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pick up a fresh copy (e.g. after another person's save) when not editing.
  useEffect(() => {
    if (!dirty) {
      setSections(toEditable(draft));
      setBase(draft.updatedAt);
    }
  }, [draft, dirty]);

  const sourceNumber = useMemo(() => {
    const m = new Map<string, number>();
    draft.sources.forEach((s, i) => m.set(s.id, i + 1));
    return m;
  }, [draft.sources]);

  const update = (fn: (s: EditSections) => EditSections) => {
    setSections((prev) => fn(prev));
    setDirty(true);
  };
  const payload = () =>
    sections.map((s) => ({
      key: s.key,
      paragraphs: s.paragraphs.map((p) => ({ id: p.id, text: p.text })),
    }));

  /** Save and adopt the server's copy (so the view never flicks back). */
  const persist = async () => {
    const saved = await saveDraft(draft.id, base, payload());
    unsavedEdits.delete(draft.id);
    onSaved(saved);
    setSections(toEditable(saved));
    setBase(saved.updatedAt);
    setDirty(false);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await persist();
    } catch (e) {
      setError(`Not saved: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      if (dirty) await persist();
      await approveDraft(draft.id);
      setConfirming(false);
      onChanged();
      onFiled();
    } catch (e) {
      setError(`Not approved: ${errorText(e)}`);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const meta = draft.sections;
  const copy = REVIEW_COPY[draft.kind];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm('Leave without saving your changes?')
              )
                onBack();
            }}
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            ← All drafts
          </button>
          <span className="text-xs text-gray-600">
            {DRAFT_KIND_LABELS[draft.kind]} · asked for by{' '}
            {draft.createdByName ?? 'Unknown'} · {when(draft.createdAt)}
          </span>
        </div>

        {draft.status === 'approved' ? (
          <div className="rounded-md border border-resend-green px-3 py-2 text-sm">
            Approved by {draft.approvedByName ?? 'Unknown'}{' '}
            {draft.approvedAt && when(draft.approvedAt)}, and filed in
            Documents.{' '}
            {draft.documentId && (
              <a
                href={documentContentUrl(draft.documentId, true)}
                className="font-medium text-resend-purple hover:underline"
              >
                Download the Word document
              </a>
            )}
          </div>
        ) : (
          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-resend-ink">
            <strong>{copy.notFinished}</strong> Read each paragraph against its
            sources (numbered, on the right), correct anything that is wrong,
            and fill the gaps the draft flags. A source shows where a passage
            was drawn from; it is not proof that the passage is right, so check
            that the source says it.
            {draft.removedUnsupported > 0 &&
              ` ${draft.removedUnsupported} passage${
                draft.removedUnsupported === 1 ? ' was' : 's were'
              } removed because nothing in the file supported ${
                draft.removedUnsupported === 1 ? 'it' : 'them'
              }.`}
          </div>
        )}

        {draft.alerts.length > 0 && (
          <div
            role="status"
            className="rounded-md border-2 border-status-amber px-3 py-2 text-sm text-resend-ink"
          >
            <ul className="space-y-1">
              {draft.alerts.map((a, i) => (
                <li key={i}>
                  <strong>Important: </strong>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft.kind !== 'position_statement' && (
          <FormLinks form={TRIBUNAL_FORMS[draft.kind]} />
        )}

        {draft.instructions && (
          <p className="text-xs text-gray-600">
            Asked to focus on: “{draft.instructions}”
          </p>
        )}

        {sections.map((section, si) => {
          const info = meta.find((m) => m.key === section.key)!;
          return (
            <section key={section.key} aria-labelledby={`h-${section.key}`}>
              <h3
                id={`h-${section.key}`}
                className="mb-2 text-base font-semibold text-resend-ink"
              >
                {info.heading}
              </h3>
              {info.gap && (
                <p className="mb-2 rounded-md border border-status-amber px-3 py-1.5 text-sm text-resend-ink">
                  <span className="font-medium">{copy.gapLabel}</span>
                  {info.gap}
                </p>
              )}
              <ol className="space-y-2">
                {section.paragraphs.map((p, pi) => (
                  <li key={p.uiKey}>
                    {editable ? (
                      <textarea
                        value={p.text}
                        onChange={(e) =>
                          update((all) =>
                            all.map((s, i) =>
                              i !== si
                                ? s
                                : {
                                    ...s,
                                    paragraphs: s.paragraphs.map((q, j) =>
                                      j === pi
                                        ? {
                                            ...q,
                                            text: e.target.value,
                                            edited: true,
                                          }
                                        : q,
                                    ),
                                  },
                            ),
                          )
                        }
                        rows={Math.max(2, Math.ceil(p.text.length / 90) + 1)}
                        aria-label={`${info.heading}, paragraph ${pi + 1}`}
                        className="w-full rounded-md border border-gray-200 p-2 text-sm leading-relaxed text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                      />
                    ) : (
                      <p className="text-sm leading-relaxed text-resend-ink">
                        {p.text}
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {p.sourceIds.length > 0 ? (
                        <span className="text-gray-600">
                          From{' '}
                          {p.sourceIds.map((id) => (
                            <a
                              key={id}
                              href={`#source-${id}`}
                              className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-resend-ink hover:bg-gray-200"
                            >
                              [{sourceNumber.get(id)}]
                            </a>
                          ))}
                        </span>
                      ) : (
                        <span className="text-gray-600">
                          Written by a caseworker
                        </span>
                      )}
                      {p.reworded && p.sourceIds.length > 0 && (
                        <span className="text-gray-600">
                          · reworded — check these sources still support it
                        </span>
                      )}
                      {editable && (
                        <button
                          type="button"
                          onClick={() =>
                            update((all) =>
                              all.map((s, i) =>
                                i !== si
                                  ? s
                                  : {
                                      ...s,
                                      paragraphs: s.paragraphs.filter(
                                        (_q, j) => j !== pi,
                                      ),
                                    },
                              ),
                            )
                          }
                          className="ml-auto text-status-amber-text hover:underline"
                        >
                          Remove paragraph
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    update((all) =>
                      all.map((s, i) =>
                        i !== si
                          ? s
                          : {
                              ...s,
                              paragraphs: [
                                ...s.paragraphs,
                                {
                                  uiKey: crypto.randomUUID(),
                                  text: '',
                                  sourceIds: [],
                                  edited: true,
                                  reworded: true,
                                },
                              ],
                            },
                      ),
                    )
                  }
                  className="mt-1 text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  + Add a paragraph
                </button>
              )}
            </section>
          );
        })}

        {draft.missingInformation.length > 0 && (
          <section aria-labelledby="missing-h">
            <h3 id="missing-h" className="mb-1 text-base font-semibold">
              {draft.kind !== 'position_statement'
                ? 'Before the form is sent'
                : 'To obtain or check'}
            </h3>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-resend-ink">
              {draft.missingInformation.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-amber-text">
            {error}
          </p>
        )}

        {editable && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-white py-3">
            {dirty && (
              <span className="mr-auto text-xs text-gray-600">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || busy}
              className="rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Approve and file…
            </button>
          </div>
        )}
      </div>

      <aside
        aria-labelledby="sources-h"
        className="lg:sticky lg:top-0 lg:self-start"
      >
        <h3
          id="sources-h"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600"
        >
          Sources ({draft.sources.length})
        </h3>
        <ol className="space-y-2">
          {draft.sources.map((s, i) => (
            <SourceCard key={s.id} source={s} n={i + 1} />
          ))}
        </ol>
      </aside>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h2 id="approve-title" className="text-base font-semibold">
              Approve this {DRAFT_KIND_LABELS[draft.kind].toLowerCase()}?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              It will be locked, recorded as approved by you, and filed in
              Documents as a Word document. Further changes can be made in Word.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-resend-ink">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
              />
              {copy.confirm}
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!checked || busy}
                onClick={() => void approve()}
                className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {busy ? 'Filing…' : 'Approve and file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, n }: { source: DraftSource; n: number }) {
  return (
    <li
      id={`source-${source.id}`}
      className="scroll-mt-4 rounded-md border border-gray-200 p-2 text-xs target:border-resend-purple"
    >
      <p className="font-medium text-resend-ink">
        [{n}] {source.title}
      </p>
      <p className="text-gray-600">
        {SOURCE_TYPE_LABELS[source.type] ?? source.type}
        {source.date && ` · ${formatCivilDate(source.date)}`}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-gray-700">{source.excerpt}</p>
      {source.type === 'document' && (
        <a
          href={documentContentUrl(source.id)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-resend-purple hover:underline"
        >
          Open document
        </a>
      )}
    </li>
  );
}

/** Where the approved answers go: the form online, or on GOV.UK. */
function FormLinks({
  form,
}: {
  form: (typeof TRIBUNAL_FORMS)[keyof typeof TRIBUNAL_FORMS];
}) {
  const link = (href: string, text: string) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-resend-purple hover:underline"
    >
      {text}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
  return (
    <p className="text-sm text-gray-600">
      Answers that cite “Case record — copied by the system” are copied from the
      case record; the rest are drafted from the file. Copy the approved answers
      into the{' '}
      {form.onlineUrl ? (
        <>
          {link(form.onlineUrl, `online ${form.code} form`)} or the{' '}
          {link(form.guidanceUrl, 'paper form on GOV.UK')}
        </>
      ) : (
        link(form.guidanceUrl, `${form.code} form on GOV.UK`)
      )}{' '}
      ({form.version}).
    </p>
  );
}
