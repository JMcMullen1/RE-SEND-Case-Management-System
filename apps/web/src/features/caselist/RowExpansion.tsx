import {
  CONSULTATION_STATE_LABELS,
  KEY_DATE_SOURCE_LABELS,
  KEY_DATE_TYPE_LABELS,
  formatCivilDate,
  keyDateWhen,
  relativeSince,
  typeOfCase,
  NOTE_KIND_SINGULAR,
  type CaseListRow,
} from '@re-send/shared';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addNote } from '../../api/caseScreen';
import { recordReview } from '../../api/review';
import type { CaseExpansion } from '../../api/client';
import { useExpansion } from '../../hooks/useCaseData';
import { TypeDot } from '../calendar/primitives';

/** "Tue 17 Nov 2026" for a civil date. */
function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Every key date of the case, soonest first: the date with its day and time,
 * how far away it is, what it is and its type, any detail written with it,
 * and where it came from. The next one is marked; ones gone by are muted.
 */
function KeyDatesDetail({
  keyDates,
  today,
}: {
  keyDates: CaseExpansion['keyDates'];
  today: string;
}) {
  if (keyDates.length === 0)
    return <p className="text-sm text-gray-500">No key dates on this case.</p>;
  const nextId = keyDates.find((k) => !keyDateWhen(k.date, today).passed)?.id;
  return (
    <ol className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
      {keyDates.map((k) => {
        const when = keyDateWhen(k.date, today);
        const isNext = k.id === nextId;
        return (
          <li
            key={k.id}
            className={`grid grid-cols-[9.5rem_1fr] gap-3 px-3 py-2 ${
              isNext ? 'bg-gray-50' : ''
            }`}
          >
            <div className={when.passed ? 'text-gray-500' : 'text-resend-ink'}>
              <p className="text-sm font-semibold tabular-nums">
                {longDate(k.date)}
              </p>
              <p className="text-xs tabular-nums">
                {k.time ? `${k.time.slice(0, 5)} · ` : ''}
                <span
                  className={
                    !when.passed &&
                    (when.words === 'Today' || when.words === 'Tomorrow')
                      ? 'font-semibold text-resend-ink'
                      : ''
                  }
                >
                  {when.words}
                </span>
              </p>
            </div>
            <div className="min-w-0">
              <p
                className={`flex flex-wrap items-center gap-2 text-sm ${
                  when.passed ? 'text-gray-600' : 'font-medium text-resend-ink'
                }`}
              >
                {k.title}
                {isNext && (
                  <span className="rounded-full bg-resend-purple px-2 py-0.5 text-xs font-semibold text-white">
                    Next
                  </span>
                )}
                {when.passed && (
                  <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600">
                    Passed
                  </span>
                )}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-gray-600">
                <TypeDot type={k.type} />
                {KEY_DATE_TYPE_LABELS[k.type]} ·{' '}
                {KEY_DATE_SOURCE_LABELS[k.source]}
                {k.sourceReference && ` (${k.sourceReference})`}
              </p>
              {k.description && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">
                  {k.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The weekly review, written straight from the case list: saved as a note on
 * the case and recorded as this week's review, so the Updated column shows it
 * at once (as review mode does, one case at a time).
 */
/** Reviews being typed, by case: kept if the row is closed or the list refreshes. */
const reviewDrafts = new Map<string, string>();

function WeeklyReview({ row, today }: { row: CaseListRow; today: string }) {
  const qc = useQueryClient();
  const [text, setTextState] = useState(() => reviewDrafts.get(row.id) ?? '');
  const setText = (value: string) => {
    if (value) reviewDrafts.set(row.id, value);
    else reviewDrafts.delete(row.id);
    setTextState(value);
  };
  const [saved, setSaved] = useState(false);
  // The note is saved first; if recording the review then fails, a retry
  // records only the review, never the same note twice.
  const [noteSaved, setNoteSaved] = useState(false);
  const save = useMutation({
    mutationFn: async (body: string) => {
      if (!noteSaved) {
        await addNote(row.id, body, 'note');
        setNoteSaved(true);
        setText('');
        void qc.invalidateQueries({ queryKey: ['cases'] });
      }
      await recordReview(row.id);
    },
    onSuccess: () => {
      setNoteSaved(false);
      setText('');
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['expansion', row.id] });
      void qc.invalidateQueries({ queryKey: ['timeline', row.id] });
    },
  });
  const id = `weekly-review-${row.id}`;
  const submit = () => {
    if (save.isPending) return;
    if (noteSaved || text.trim()) save.mutate(text.trim());
  };
  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
      >
        Weekly review
      </label>
      <textarea
        id={id}
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onKeyDown={(e) => {
          // Ctrl/⌘ + Enter saves, as in review mode.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Where this case is this week, and what happens next"
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={(!text.trim() && !noteSaved) || save.isPending}
          className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending
            ? 'Saving…'
            : noteSaved
              ? 'Record the review'
              : 'Save review'}
        </button>
        <span role="status" className="text-xs text-gray-600">
          {save.isError
            ? noteSaved
              ? 'The note is saved, but the review was not recorded. Try again.'
              : 'Not saved. Try again.'
            : saved
              ? 'Saved as a note on the case — shown under Updated.'
              : row.lastReviewedAt
                ? `Last reviewed ${relativeSince(row.lastReviewedAt.slice(0, 10), today)}.`
                : 'Not reviewed yet.'}
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-resend-ink">{children ?? '—'}</dd>
    </div>
  );
}

export function RowExpansion({
  row,
  today,
}: {
  row: CaseListRow;
  today: string;
}) {
  const { data, isLoading } = useExpansion(row.id, true);

  return (
    <div className="grid grid-cols-1 gap-6 bg-gray-50/60 px-6 py-4 md:grid-cols-3">
      <section className="md:col-span-2">
        <WeeklyReview row={row} today={today} />
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Key dates
        </h4>
        <div className="mb-4">
          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {data && <KeyDatesDetail keyDates={data.keyDates} today={today} />}
        </div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Recent notes
        </h4>
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!isLoading && data && data.notes.length === 0 && (
          <p className="text-sm text-gray-400">No notes yet.</p>
        )}
        <ul className="space-y-2">
          {data?.notes.map((n, i) => (
            <li key={i} className="border-l-2 border-resend-lilac pl-3">
              <p className="text-sm text-resend-ink">
                <span className="mr-1.5 rounded bg-resend-purple px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-white align-middle">
                  {NOTE_KIND_SINGULAR[n.kind]}
                </span>
                {n.body}
              </p>
              <p className="text-xs text-gray-500">
                {formatCivilDate(n.entryDate)} · {n.author ?? 'Unknown'} ·{' '}
                {relativeSince(n.entryDate, today)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-1">
        <Field label="Type of case">
          {typeOfCase(row.currentWork, row.originalQuery) ?? '—'}
        </Field>
        <Field label="Consultation">
          {CONSULTATION_STATE_LABELS[row.consultStatus]}
        </Field>
        <Field label="Method of enquiry">{row.methodOfEnquiry ?? '—'}</Field>
        <Field label="Date of enquiry">
          {row.dateOfEnquiry ? formatCivilDate(row.dateOfEnquiry) : '—'}
        </Field>
        <Field label="Email">
          {data?.email ? (
            <a
              className="text-resend-purple underline"
              href={`mailto:${data.email}`}
            >
              {data.email}
            </a>
          ) : (
            '—'
          )}
        </Field>
        <Field label="Phone">{data?.phone ?? data?.mobile ?? '—'}</Field>
      </dl>
    </div>
  );
}
