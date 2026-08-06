import { useEffect, useRef, useState } from 'react';
import {
  KEY_DATE_TYPE_LABELS,
  KEY_DATE_TYPE_VALUES,
  type CalendarEvent,
  type Holidays,
  type KeyDateType,
} from '@re-send/shared';
import {
  searchCalendarCases,
  type CalendarCaseMatch,
} from '../../api/calendar';
import { WorkingDayField } from './primitives';

export interface KeyDateDraft {
  keyDateId: string | null; // null when creating
  caseId: string | null;
  caseLabel: string | null;
  date: string;
  time: string;
  title: string;
  type: KeyDateType;
}

export function draftFromEvent(e: CalendarEvent): KeyDateDraft {
  return {
    keyDateId: e.keyDateId,
    caseId: e.caseId,
    caseLabel: `${e.caseReference}${e.childName ? ` · ${e.childName}` : ''}`,
    date: e.date,
    time: e.time ?? '',
    title: e.title,
    type: e.type,
  };
}

export function newDraft(date: string): KeyDateDraft {
  return {
    keyDateId: null,
    caseId: null,
    caseLabel: null,
    date,
    time: '',
    title: '',
    type: 'hearing',
  };
}

/**
 * Create or edit a key date from the calendar. Creating requires picking a case
 * (a typeahead over reference / client / child); editing is bound to its case.
 * The date field is working-day aware. Nothing is written until Save.
 */
export function KeyDateDialog({
  draft: initial,
  holidays,
  onSave,
  onDelete,
  onCancel,
  saving,
}: {
  draft: KeyDateDraft;
  holidays: Holidays | null;
  onSave: (draft: KeyDateDraft) => void;
  onDelete?: (draft: KeyDateDraft) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const editing = draft.keyDateId !== null;
  const canSave =
    draft.title.trim().length > 0 &&
    Boolean(draft.caseId) &&
    Boolean(draft.date);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit key date' : 'New key date'}
    >
      <form
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave(draft);
        }}
      >
        <h2 className="text-lg font-semibold text-resend-ink">
          {editing ? 'Edit key date' : 'New key date'}
        </h2>

        <div className="mt-4 space-y-3">
          {editing ? (
            <p className="text-sm text-gray-600">{draft.caseLabel}</p>
          ) : (
            <CasePicker
              value={draft.caseLabel}
              onPick={(match) =>
                setDraft((d) => ({
                  ...d,
                  caseId: match.id,
                  caseLabel: `${match.caseReference}${
                    match.childName ? ` · ${match.childName}` : ''
                  }`,
                }))
              }
              onClear={() =>
                setDraft((d) => ({ ...d, caseId: null, caseLabel: null }))
              }
            />
          )}

          <div>
            <label
              htmlFor="kd-title"
              className="block text-xs font-medium text-gray-600"
            >
              Title
            </label>
            <input
              id="kd-title"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="e.g. Tribunal hearing"
              className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <WorkingDayField
              id="kd-date"
              label="Date"
              value={draft.date}
              holidays={holidays}
              onChange={(date) => setDraft((d) => ({ ...d, date }))}
            />
            <div>
              <label
                htmlFor="kd-time"
                className="block text-xs font-medium text-gray-600"
              >
                Time (optional)
              </label>
              <input
                id="kd-time"
                type="time"
                value={draft.time}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, time: e.target.value }))
                }
                className="mt-0.5 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              />
            </div>
            <div>
              <label
                htmlFor="kd-type"
                className="block text-xs font-medium text-gray-600"
              >
                Type
              </label>
              <select
                id="kd-type"
                value={draft.type}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    type: e.target.value as KeyDateType,
                  }))
                }
                className="mt-0.5 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {KEY_DATE_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>
                    {KEY_DATE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {editing && onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(draft)}
              disabled={saving}
              className="rounded px-2 py-1 text-sm text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave || saving}
              className="rounded-md bg-resend-purple px-4 py-2 text-sm font-medium text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function CasePicker({
  value,
  onPick,
  onClear,
}: {
  value: string | null;
  onPick: (match: CalendarCaseMatch) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<CalendarCaseMatch[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setMatches([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      void searchCalendarCases(q.trim()).then((r) => {
        setMatches(r.cases);
        setOpen(true);
      });
    }, 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div>
      <label
        htmlFor="kd-case"
        className="block text-xs font-medium text-gray-600"
      >
        Case
      </label>
      {value ? (
        <p className="mt-0.5 flex items-center gap-2 text-sm text-resend-ink">
          {value}
          <button
            type="button"
            onClick={() => {
              setQ('');
              onClear();
            }}
            className="text-xs text-gray-500 underline hover:text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            change
          </button>
        </p>
      ) : (
        <div className="relative">
          <input
            id="kd-case"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by reference, client or child"
            autoComplete="off"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-controls="kd-case-list"
            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          {open && matches.length > 0 && (
            <ul
              id="kd-case-list"
              role="listbox"
              className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
            >
              {matches.map((m) => (
                <li key={m.id} role="option" aria-selected="false">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(m);
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <span className="font-medium">{m.caseReference}</span>
                    {(m.childName ?? m.clientName) && (
                      <span className="text-gray-500">
                        {' '}
                        · {m.childName ?? m.clientName}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
