import { useState } from 'react';
import {
  DIRECTIONS_LOW_CONFIDENCE,
  KEY_DATE_TYPE_VALUES,
  diffRowToApplyRow,
  type DirectionApplyRow,
  type DirectionDiffRow,
  type DirectionsReview as Review,
  type KeyDateType,
} from '@re-send/shared';

/** Editable overlay a caseworker can change before applying a row. */
interface RowEdit {
  include: boolean;
  date: string;
  time: string;
  title: string;
  type: KeyDateType;
}

const CLASS_LABEL: Record<DirectionDiffRow['class'], string> = {
  new: 'New',
  moved: 'Moved',
  superseded: 'Removed',
  unchanged: 'Unchanged',
};

const CLASS_BADGE: Record<DirectionDiffRow['class'], string> = {
  new: 'bg-resend-green text-white',
  moved: 'border border-status-amber text-resend-ink',
  superseded: 'bg-gray-200 text-gray-600',
  unchanged: 'border border-gray-200 text-gray-400',
};

function initialEdit(row: DirectionDiffRow): RowEdit {
  return {
    include: row.include,
    date: row.newValue?.date ?? '',
    time: row.newValue?.time ?? '',
    title: row.newValue?.title ?? row.oldValue?.title ?? '',
    type: row.type,
  };
}

/**
 * The directions review screen. Nothing here has touched the calendar. It shows
 * the plain summary, then each proposed change with its old and new value side
 * by side and the source paragraph quoted; every row is individually editable
 * and individually includable. "Apply changes" is the only thing that writes.
 */
export function DirectionsReview({
  review,
  onApply,
  onCancel,
  applying,
}: {
  review: Review;
  onApply: (rows: (DirectionApplyRow & { confidence?: number })[]) => void;
  onCancel: () => void;
  applying: boolean;
}) {
  const [edits, setEdits] = useState<RowEdit[]>(() =>
    review.rows.map(initialEdit),
  );

  const setEdit = (i: number, patch: Partial<RowEdit>) =>
    setEdits((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const includedCount = edits.filter((e) => e.include).length;

  const handleApply = () => {
    const rows = review.rows.map((row, i) => {
      const e = edits[i]!;
      const base = diffRowToApplyRow(row);
      return {
        ...base,
        include: e.include,
        // A removal carries no date; everything else uses the edited values.
        date: row.class === 'superseded' ? null : e.date || null,
        time: row.class === 'superseded' ? null : e.time || null,
        title: e.title,
        type: e.type,
        confidence: row.confidence,
      };
    });
    onApply(rows);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review directions"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <header className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-resend-ink">
            Review directions
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium text-resend-ink">
              {review.summary}
            </span>
            {review.orderDate && (
              <span className="text-gray-500">
                {' '}
                · order dated {review.orderDate}
              </span>
            )}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {review.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No dated obligations were found in this order.
            </p>
          ) : (
            <ul className="space-y-4">
              {review.rows.map((row, i) => (
                <RowCard
                  key={i}
                  row={row}
                  edit={edits[i]!}
                  onChange={(patch) => setEdit(i, patch)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <span className="text-sm text-gray-500">
            {includedCount} of {review.rows.length} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || includedCount === 0}
              className="rounded-md bg-resend-purple px-4 py-2 text-sm font-medium text-white hover:bg-resend-purple/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Apply changes'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function RowCard({
  row,
  edit,
  onChange,
}: {
  row: DirectionDiffRow;
  edit: RowEdit;
  onChange: (patch: Partial<RowEdit>) => void;
}) {
  const lowConfidence = row.confidence <= DIRECTIONS_LOW_CONFIDENCE;
  const removing = row.class === 'superseded';

  return (
    <li
      className={`rounded-lg border p-4 ${
        edit.include ? 'border-gray-200' : 'border-gray-100 bg-gray-50/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={edit.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          aria-label={`Include ${row.type}`}
          className="mt-1 h-4 w-4 accent-resend-purple"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${CLASS_BADGE[row.class]}`}
            >
              {CLASS_LABEL[row.class]}
            </span>
            <span className="text-xs uppercase tracking-wide text-gray-400">
              {row.party}
            </span>
            {lowConfidence && (
              <span className="flex items-center gap-1 text-xs text-status-amber">
                <span className="inline-block h-2 w-2 rounded-full bg-status-amber" />
                Low confidence
              </span>
            )}
          </div>

          {/* Old and new value side by side. */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-gray-400">
                Current
              </p>
              {row.oldValue ? (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{row.oldValue.title}</span>
                  <br />
                  {row.oldValue.date}
                  {row.oldValue.time && ` at ${row.oldValue.time}`}
                </p>
              ) : (
                <p className="text-sm italic text-gray-400">— none —</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-400">
                {removing ? 'After' : 'Proposed'}
              </p>
              {removing ? (
                <p className="text-sm italic text-gray-500">
                  removed from the calendar
                </p>
              ) : (
                <div className="space-y-1.5">
                  <input
                    value={edit.title}
                    onChange={(e) => onChange({ title: e.target.value })}
                    aria-label="Title"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={edit.date}
                      onChange={(e) => onChange({ date: e.target.value })}
                      aria-label="Date"
                      className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    />
                    <input
                      type="time"
                      value={edit.time}
                      onChange={(e) => onChange({ time: e.target.value })}
                      aria-label="Time"
                      className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    />
                    <select
                      value={edit.type}
                      onChange={(e) =>
                        onChange({ type: e.target.value as KeyDateType })
                      }
                      aria-label="Type"
                      className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    >
                      {KEY_DATE_TYPE_VALUES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* The working-day arithmetic, so a caseworker can check it. */}
          {row.explanation && (
            <p className="mt-2 text-xs text-gray-500">{row.explanation}</p>
          )}

          {/* The source paragraph, quoted next to the row. */}
          <blockquote className="mt-2 border-l-2 border-gray-200 pl-3 text-xs italic text-gray-500">
            {row.paragraph !== null && (
              <span className="font-medium not-italic text-gray-400">
                ¶{row.paragraph}:{' '}
              </span>
            )}
            “{row.obligation}”
          </blockquote>
        </div>
      </div>
    </li>
  );
}
