import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calculateAge,
  CONSULTATION_STATE_VALUES,
  decodeViewState,
  FILTER_DAY_DEFAULTS,
  formatCivilDate,
  OWNER_QUEUE_VALUES,
  relativeSince,
  STATUS_VALUES,
  typeOfCase,
  type CaseListRow,
  type OwnerQueue,
  type Status,
} from '@re-send/shared';
import { fetchCases } from '../../api/client';
import { recordReview } from '../../api/review';
import { useToday } from '../../hooks/useToday';
import { useUsers } from '../../hooks/useCaseData';
import {
  useCaseDetail,
  useCaseMutations,
  useTimeline,
} from '../../hooks/useCaseScreen';
import { KeyDatesEditor } from '../casescreen/KeyDatesEditor';

export function ReviewModePage() {
  const today = useToday();
  const qc = useQueryClient();
  const state = useMemo(() => decodeViewState(window.location.search), []);

  const listQuery = useQuery({
    queryKey: ['review-cases', window.location.search],
    queryFn: () => fetchCases(state, 0, 200),
  });
  const rows: CaseListRow[] = listQuery.data?.rows ?? [];

  const users = useUsers().data?.users ?? [];
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [reassigned, setReassigned] = useState<Set<string>>(new Set());
  const [notesAdded, setNotesAdded] = useState(0);
  const [finished, setFinished] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const current = rows[index];
  const caseId = current?.id ?? '';
  const detail = useCaseDetail(caseId);
  const timeline = useTimeline(caseId, {});
  const mutations = useCaseMutations(caseId);

  const focusNote = useCallback(() => noteRef.current?.focus(), []);
  // Keep the note box focused: on first render once the set has loaded (caseId
  // goes from '' to a real id) and on every navigation (caseId changes).
  useEffect(() => {
    if (!finished && caseId) focusNote();
  }, [caseId, finished, focusNote]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < rows.length - 1 ? i + 1 : i));
  }, [rows.length]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const markReviewed = useCallback(async () => {
    if (!current) return;
    const id = current.id;
    const draft = (drafts[id] ?? '').trim();
    try {
      if (draft) {
        await mutations.addNote.mutateAsync({ body: draft, kind: 'note' });
        setNotesAdded((n) => n + 1);
        setDrafts((d) => ({ ...d, [id]: '' }));
      }
      await recordReview(id);
      await qc.invalidateQueries({ queryKey: ['cases'] });
      setReviewed((r) => new Set(r).add(id));
      if (index < rows.length - 1) setIndex(index + 1);
      else setFinished(true);
    } catch {
      /* leave the reviewer on this case if it failed */
    }
  }, [current, drafts, mutations.addNote, qc, index, rows.length]);

  const reassign = (
    target: { ownerUserId: string } | { ownerQueue: OwnerQueue },
  ) => {
    if (!current) return;
    mutations.reassign.mutate(target);
    setReassigned((r) => new Set(r).add(current.id));
    focusNote();
  };

  // Keyboard: J/K and arrows navigate (when not typing into another field or a
  // non-empty note); Cmd/Ctrl+Enter reviews and advances; Escape returns focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void markReviewed();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        focusNote();
        return;
      }
      const el = document.activeElement as HTMLElement | null;
      const inNote = el === noteRef.current;
      const inField =
        !!el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !inNote;
      const noteEmpty = !(noteRef.current?.value ?? '').trim();
      const canNav = !inField && (!inNote || noteEmpty);
      if (!canNav) return;
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, markReviewed, goNext, goPrev, focusNote]);

  if (listQuery.isLoading) {
    return (
      <p className="p-10 text-center text-sm text-gray-400">
        Loading review set…
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-gray-500">
          No cases match this filter to review.
        </p>
        <a
          href="/"
          className="mt-3 inline-block text-sm text-resend-purple underline"
        >
          Back to the case list
        </a>
      </div>
    );
  }
  if (finished) {
    const notReached = rows.filter((r) => !reviewed.has(r.id));
    const notReviewedDays = FILTER_DAY_DEFAULTS.notReviewedInDays;
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-semibold text-resend-purple">
          Review complete
        </h1>
        <dl className="mt-6 grid grid-cols-3 gap-4 text-center">
          <Stat label="Reviewed" value={reviewed.size} />
          <Stat label="Notes added" value={notesAdded} />
          <Stat label="Reassigned" value={reassigned.size} />
        </dl>
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Not reached ({notReached.length})
          </h2>
          {notReached.length === 0 ? (
            <p className="mt-1 text-sm text-gray-400">
              Every case in the filter was reviewed.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {notReached.map((r) => (
                <li key={r.id} className="text-sm text-resend-ink">
                  {r.clientName ?? 'Unnamed'}
                  {r.childName && (
                    <span className="text-gray-500"> · {r.childName}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-8 flex gap-4">
          <a
            href={`/?notReviewedInDays=${notReviewedDays}`}
            className="rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Open “not reviewed in {notReviewedDays} days”
          </a>
          <a
            href="/"
            className="self-center text-sm text-resend-purple underline"
          >
            Back to the case list
          </a>
        </div>
      </div>
    );
  }

  const c = detail.data;
  const age = calculateAge(c?.child?.dateOfBirth ?? null, today);
  const recent = (timeline.data?.items ?? []).slice(0, 4);

  return (
    <div className="flex h-screen flex-col bg-white text-resend-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-gray-200 px-6 py-3">
        <a href="/" className="text-sm text-resend-purple hover:underline">
          ← Exit
        </a>
        <div className="mr-auto">
          <h1 className="text-lg font-semibold text-resend-ink">
            {current?.clientName ?? 'Unnamed'}
            {current?.childName && (
              <span className="font-normal text-gray-500">
                {' '}
                · {current.childName}
              </span>
            )}
          </h1>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium tabular-nums text-resend-ink">
          {index + 1} of {rows.length}
        </span>
        <button
          type="button"
          onClick={() => setFinished(true)}
          className="rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Finish
        </button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-gray-100 lg:grid-cols-3">
        {/* Detail + quick actions */}
        <section className="overflow-hidden bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Detail
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label="Type of case">
              {typeOfCase(
                current?.currentWork ?? null,
                current?.originalQuery ?? null,
              ) ?? '—'}
            </Row>
            <Row label="Date of birth">
              {c?.child?.dateOfBirth
                ? `${formatCivilDate(c.child.dateOfBirth)}${age !== null ? ` · age ${age}` : ''}`
                : '—'}
            </Row>
            <Row label="School year">{c?.child?.schoolYear ?? '—'}</Row>
            <Row label="Team">{c?.team.join(', ') || '—'}</Row>
          </dl>

          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
            <QuickSelect
              label="Owner"
              value={
                c?.owner.kind === 'user'
                  ? `user:${c.owner.userId}`
                  : `queue:${c?.owner.queue ?? ''}`
              }
              onChange={(v) =>
                v.startsWith('user:')
                  ? reassign({ ownerUserId: v.slice(5) })
                  : reassign({ ownerQueue: v.slice(6) as OwnerQueue })
              }
              options={[
                ...users.map((u) => ({
                  value: `user:${u.id}`,
                  label: u.displayName,
                })),
                ...OWNER_QUEUE_VALUES.map((q) => ({
                  value: `queue:${q}`,
                  label: `Queue: ${q}`,
                })),
              ]}
            />
            <QuickSelect
              label="Status"
              value={c?.status ?? ''}
              onChange={(v) => {
                mutations.patchCase.mutate({ status: v as Status });
                focusNote();
              }}
              options={STATUS_VALUES.map((s) => ({ value: s, label: s }))}
            />
            <QuickSelect
              label="Consultation"
              value={c?.consultStatus ?? ''}
              onChange={(v) => {
                mutations.patchCase.mutate({ consultStatus: v });
                focusNote();
              }}
              options={CONSULTATION_STATE_VALUES.map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </div>
        </section>

        {/* Key dates + recent timeline */}
        <section className="overflow-hidden bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Key dates
          </h2>
          {c && (
            <KeyDatesEditor
              keyDates={c.keyDates}
              today={today}
              onAdd={(input) => mutations.addKeyDate.mutate(input)}
              onEdit={(id, patch) =>
                mutations.editKeyDate.mutate({ id, patch })
              }
              onRemove={(id) => mutations.removeKeyDate.mutate(id)}
            />
          )}
          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Recent timeline
          </h2>
          {recent.length === 0 && (
            <p className="text-sm text-gray-400">No entries yet.</p>
          )}
          <ul className="space-y-2">
            {recent.map((item) => (
              <li
                key={`${item.type}:${item.id}`}
                className="border-l-2 border-resend-lilac pl-3"
              >
                <p className="text-sm text-resend-ink">
                  {item.type === 'note' ? item.body : item.type}
                </p>
                <p className="text-xs text-gray-500">
                  {formatCivilDate(item.occurredOn)} ·{' '}
                  {item.authorName ?? 'Unknown'} ·{' '}
                  {relativeSince(item.occurredOn, today)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Note box + review action */}
        <section className="flex flex-col overflow-hidden bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Meeting note
          </h2>
          <textarea
            ref={noteRef}
            value={drafts[caseId] ?? ''}
            onChange={(e) =>
              setDrafts((d) => ({ ...d, [caseId]: e.target.value }))
            }
            placeholder="Type straight into the case. It is saved when you mark the case reviewed."
            aria-label="Meeting note"
            className="min-h-0 flex-1 resize-none rounded-lg border border-gray-200 p-3 text-sm text-resend-ink placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          <button
            type="button"
            onClick={() => void markReviewed()}
            className="mt-3 rounded-lg bg-resend-green px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-green"
          >
            Reviewed {reviewed.has(caseId) && '✓'}
          </button>
          <p className="mt-3 text-xs text-gray-400">
            <kbd className="font-sans">⌘/Ctrl + Enter</kbd> review &amp; next ·{' '}
            <kbd className="font-sans">J</kbd>/
            <kbd className="font-sans">→</kbd> next ·{' '}
            <kbd className="font-sans">K</kbd>/
            <kbd className="font-sans">←</kbd> previous ·{' '}
            <kbd className="font-sans">Tab</kbd> to actions ·{' '}
            <kbd className="font-sans">Esc</kbd> back to note. Bare keys
            navigate when the note is empty.
          </p>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <div className="text-2xl font-semibold text-resend-purple tabular-nums">
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-right text-resend-ink">{children}</dd>
    </div>
  );
}

function QuickSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
