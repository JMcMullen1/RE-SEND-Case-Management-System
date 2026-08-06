import { useMemo, useState } from 'react';
import {
  CALENDAR_VIEW_VALUES,
  KEY_DATE_TYPE_LABELS,
  PRODUCT_NAME,
  viewRange,
  type CalendarEvent,
  type CalendarFilters as Filters,
  type CalendarView,
} from '@re-send/shared';
import { useToday } from '../../hooks/useToday';
import { useUsers } from '../../hooks/useCaseData';
import {
  useCalendar,
  useHolidays,
  useKeyDateMutations,
} from '../../hooks/useCalendar';
import { CalendarFilters } from './CalendarFilters';
import {
  draftFromEvent,
  newDraft,
  KeyDateDialog,
  type KeyDateDraft,
} from './KeyDateDialog';
import { SubscribeButton } from './SubscribeButton';
import { TypeLegend, TypeDot } from './primitives';
import { AgendaView, MonthView, WeekView } from './views';

const VIEW_LABELS: Record<CalendarView, string> = {
  agenda: 'Agenda',
  week: 'Week',
  month: 'Month',
};

function shiftAnchor(anchor: string, view: CalendarView, dir: 1 | -1): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  if (view === 'week') date.setUTCDate(date.getUTCDate() + dir * 7);
  else if (view === 'month') date.setUTCMonth(date.getUTCMonth() + dir);
  else date.setUTCDate(date.getUTCDate() + dir * 14);
  return date.toISOString().slice(0, 10);
}

function rangeLabel(view: CalendarView, anchor: string): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-GB', {
      ...opts,
      timeZone: 'UTC',
    });
  };
  if (view === 'month') return fmt(anchor, { month: 'long', year: 'numeric' });
  const { from, to } = viewRange(view, anchor);
  return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function CalendarPage() {
  const today = useToday();
  const users = useUsers().data?.users ?? [];
  const holidays = useHolidays();
  const mutations = useKeyDateMutations();

  const [view, setView] = useState<CalendarView>('agenda');
  const [anchor, setAnchor] = useState(today);
  const [filters, setFilters] = useState<Filters>({ scope: 'all' });
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<KeyDateDraft | null>(null);

  // Fetch a window wide enough for the current view; the query key carries the
  // filters + range so live-update invalidation of ['calendar'] refetches it.
  const range = useMemo(() => {
    const { from, to } = viewRange(view, anchor);
    return { from, to };
  }, [view, anchor]);
  const query = useCalendar({ ...filters, from: range.from, to: range.to });
  const events = query.data?.events ?? [];

  const openCaseHref = (e: CalendarEvent) => `/cases/${e.caseId}`;

  const saving =
    mutations.add.isPending ||
    mutations.edit.isPending ||
    mutations.remove.isPending;

  const save = (d: KeyDateDraft) => {
    const input = {
      date: d.date,
      time: d.time || null,
      title: d.title.trim(),
      type: d.type,
    };
    if (d.keyDateId) {
      mutations.edit.mutate(
        { id: d.keyDateId, patch: input, caseId: d.caseId ?? undefined },
        { onSuccess: () => setDraft(null) },
      );
    } else if (d.caseId) {
      mutations.add.mutate(
        { caseId: d.caseId, input },
        { onSuccess: () => setDraft(null) },
      );
    }
  };

  const remove = (d: KeyDateDraft) => {
    if (!d.keyDateId) return;
    mutations.remove.mutate(
      { id: d.keyDateId },
      {
        onSuccess: () => {
          setDraft(null);
          setSelected(null);
        },
      },
    );
  };

  return (
    <div className="flex h-screen flex-col bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} calendar
            </h1>
            <p className="text-xs text-gray-500">Key dates across every case</p>
          </div>
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
          <SubscribeButton />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Calendar view"
            className="flex gap-1 rounded-lg border border-gray-200 p-0.5"
          >
            {CALENDAR_VIEW_VALUES.map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                  view === v
                    ? 'bg-resend-purple text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}
              aria-label="Previous"
              className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="rounded-md border border-gray-200 px-3 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}
              aria-label="Next"
              className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              ›
            </button>
          </div>

          <span
            className="text-sm font-medium text-resend-ink"
            aria-live="polite"
          >
            {rangeLabel(view, anchor)}
          </span>

          <button
            type="button"
            onClick={() => setDraft(newDraft(today))}
            className="ml-auto rounded-lg bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Add key date
          </button>
        </div>

        <div className="mt-3">
          <CalendarFilters
            filters={filters}
            users={users}
            onChange={setFilters}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {query.isLoading ? (
          <p className="py-16 text-center text-sm text-gray-500">
            Loading key dates…
          </p>
        ) : view === 'agenda' ? (
          <AgendaView events={events} anchor={anchor} onOpen={setSelected} />
        ) : view === 'week' ? (
          <WeekView
            events={events}
            anchor={anchor}
            onOpen={setSelected}
            onAddOn={(date) => setDraft(newDraft(date))}
          />
        ) : (
          <MonthView
            events={events}
            anchor={anchor}
            onOpen={setSelected}
            onAddOn={(date) => setDraft(newDraft(date))}
          />
        )}
      </main>

      <footer className="border-t border-gray-100 px-6 py-2">
        <TypeLegend />
      </footer>

      {selected && (
        <EventDetails
          event={selected}
          href={openCaseHref(selected)}
          onEdit={() => {
            setDraft(draftFromEvent(selected));
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {draft && (
        <KeyDateDialog
          draft={draft}
          holidays={holidays}
          saving={saving}
          onSave={save}
          onDelete={draft.keyDateId ? remove : undefined}
          onCancel={() => setDraft(null)}
        />
      )}
    </div>
  );
}

/** A small dialog shown when an entry is clicked: open the case, or edit it. */
function EventDetails({
  event,
  href,
  onEdit,
  onClose,
}: {
  event: CalendarEvent;
  href: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Key date"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <TypeDot type={event.type} />
          <span className="text-xs uppercase tracking-wide text-gray-500">
            {KEY_DATE_TYPE_LABELS[event.type]}
          </span>
          {event.superseded && (
            <span className="rounded bg-gray-100 px-1.5 text-xs text-gray-500">
              superseded
            </span>
          )}
        </div>
        <h2 className="mt-2 text-lg font-semibold text-resend-ink">
          {event.title}
        </h2>
        <p className="text-sm text-gray-600">
          {event.caseReference}
          {event.childName && ` · ${event.childName}`}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {event.date}
          {event.time && ` at ${event.time}`}
          {event.ownerName && ` · ${event.ownerName}`}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Edit
          </button>
          <a
            href={href}
            className="rounded-md bg-resend-purple px-4 py-2 text-sm font-medium text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Open case
          </a>
        </div>
      </div>
    </div>
  );
}
