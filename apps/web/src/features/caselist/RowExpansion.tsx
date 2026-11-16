import {
  formatCivilDate,
  relativeSince,
  selectPrimaryKeyDate,
  typeOfCase,
  NOTE_KIND_SINGULAR,
  type CaseListRow,
} from '@re-send/shared';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addNote } from '../../api/caseScreen';
import { recordReview } from '../../api/review';
import { useExpansion } from '../../hooks/useCaseData';

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
  const save = useMutation({
    mutationFn: async (body: string) => {
      await addNote(row.id, body, 'note');
      await recordReview(row.id);
    },
    onSuccess: () => {
      setText('');
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['expansion', row.id] });
      void qc.invalidateQueries({ queryKey: ['timeline', row.id] });
    },
  });
  const id = `weekly-review-${row.id}`;
  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) save.mutate(text.trim());
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
            if (text.trim()) save.mutate(text.trim());
          }
        }}
        placeholder="Where this case is this week, and what happens next"
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!text.trim() || save.isPending}
          className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : 'Save review'}
        </button>
        <span role="status" className="text-xs text-gray-600">
          {save.isError
            ? 'Not saved. Try again.'
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
  const { sameDay } = selectPrimaryKeyDate(row.keyDates, today);

  return (
    <div className="grid grid-cols-1 gap-6 bg-gray-50/60 px-6 py-4 md:grid-cols-3">
      <section className="md:col-span-2">
        <WeeklyReview row={row} today={today} />
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

        {sameDay.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Also on this day
            </h4>
            <ul className="space-y-1">
              {sameDay.map((k) => (
                <li key={k.id} className="text-sm text-resend-ink">
                  {k.title}
                  <span className="text-gray-500">
                    {' '}
                    · {formatCivilDate(k.date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-1">
        <Field label="Type of case">
          {typeOfCase(row.currentWork, row.originalQuery) ?? '—'}
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
