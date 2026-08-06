import { useState } from 'react';
import {
  calendarDaysBetween,
  KEY_DATE_TYPE_VALUES,
  type KeyDateFull,
  type KeyDateType,
} from '@re-send/shared';

const TYPE_LABELS: Record<KeyDateType, string> = {
  hearing: 'Hearing',
  evidence_deadline: 'Evidence deadline',
  annual_review: 'Annual review',
  working_document: 'Working document',
  mediation: 'Mediation',
  consultation: 'Consultation',
  other: 'Other',
};

function countdownHint(date: string, today: string): string {
  const d = calendarDaysBetween(today, date);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days overdue`;
}

export function KeyDatesEditor({
  keyDates,
  today,
  onAdd,
  onEdit,
  onRemove,
}: {
  keyDates: KeyDateFull[];
  today: string;
  onAdd: (input: Record<string, unknown>) => void;
  onEdit: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    date: today,
    title: '',
    type: 'hearing' as KeyDateType,
  });

  return (
    <div>
      <ul className="space-y-2">
        {keyDates.length === 0 && (
          <li className="text-sm italic text-gray-400">No key dates yet.</li>
        )}
        {keyDates.map((k) => (
          <li key={k.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <input
                value={k.title}
                onChange={(e) => onEdit(k.id, { title: e.target.value })}
                aria-label="Key date title"
                className="w-full truncate rounded bg-transparent px-1 text-sm font-medium text-resend-ink hover:bg-gray-50 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              />
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-gray-500">
                <input
                  type="date"
                  value={k.date}
                  onChange={(e) => onEdit(k.id, { date: e.target.value })}
                  aria-label="Key date"
                  className="rounded bg-transparent hover:bg-gray-50 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                />
                <span className="tabular-nums">
                  {countdownHint(k.date, today)}
                </span>
                <select
                  value={k.type}
                  onChange={(e) => onEdit(k.id, { type: e.target.value })}
                  aria-label="Key date type"
                  className="rounded bg-transparent hover:bg-gray-50 focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  {KEY_DATE_TYPE_VALUES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(k.id)}
              aria-label={`Remove key date ${k.title}`}
              className="mt-0.5 shrink-0 rounded px-1 text-gray-400 hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="mt-3 space-y-2 rounded-md bg-gray-50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.title.trim()) return;
            onAdd({ date: draft.date, title: draft.title, type: draft.type });
            setDraft({ date: today, title: '', type: 'hearing' });
            setAdding(false);
          }}
        >
          <input
            autoFocus
            placeholder="Title, e.g. Tribunal hearing"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            aria-label="New key date title"
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
              aria-label="New key date"
              className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            />
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({ ...d, type: e.target.value as KeyDateType }))
              }
              aria-label="New key date type"
              className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              {KEY_DATE_TYPE_VALUES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-resend-purple px-3 py-1 text-sm font-medium text-white"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-sm text-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          + Add key date
        </button>
      )}
    </div>
  );
}
