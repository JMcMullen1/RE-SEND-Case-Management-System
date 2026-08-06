import {
  KEY_DATE_TYPE_LABELS,
  compareEvents,
  eachDay,
  groupByDay,
  isSameMonth,
  monthGrid,
  viewRange,
  type CalendarEvent,
} from '@re-send/shared';
import { TypeDot } from './primitives';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

/** One event, rendered as a button that opens its case's key date. */
function EventChip({
  event,
  onOpen,
  compact,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  compact?: boolean;
}) {
  const label = `${event.time ? `${event.time} ` : ''}${event.caseReference}${
    event.childName ? ` · ${event.childName}` : ''
  } — ${event.title}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      title={`${KEY_DATE_TYPE_LABELS[event.type]}: ${label}`}
      aria-label={`${KEY_DATE_TYPE_LABELS[event.type]}: ${label}${
        event.superseded ? ' (superseded)' : ''
      }`}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
        event.superseded ? 'text-gray-400 line-through' : 'text-resend-ink'
      } ${compact ? 'truncate' : ''}`}
    >
      <TypeDot type={event.type} />
      {event.time && (
        <span className="tabular-nums text-gray-500">{event.time}</span>
      )}
      <span className={compact ? 'truncate' : ''}>
        <span className="font-medium">{event.caseReference}</span>
        {event.childName && (
          <span className="text-gray-500"> · {event.childName}</span>
        )}
        <span className="text-gray-600"> — {event.title}</span>
      </span>
    </button>
  );
}

/** Agenda: a forward list of days that have events. The default view. */
export function AgendaView({
  events,
  anchor,
  onOpen,
}: {
  events: CalendarEvent[];
  anchor: string;
  onOpen: (event: CalendarEvent) => void;
}) {
  const { from, to } = viewRange('agenda', anchor);
  const inRange = events
    .filter((e) => e.date >= from && e.date <= to)
    .sort(compareEvents);
  const byDay = groupByDay(inRange);
  const days = [...byDay.keys()].sort();

  if (days.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-gray-400">
        No key dates in the next two months.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-gray-100">
      {days.map((day) => (
        <li key={day} className="flex gap-4 py-3">
          <h3 className="w-40 shrink-0 text-sm font-semibold text-resend-ink">
            {formatDayHeading(day)}
          </h3>
          <ul className="min-w-0 flex-1 space-y-1">
            {byDay.get(day)!.map((e) => (
              <li key={e.keyDateId}>
                <EventChip event={e} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Week: seven day columns Monday–Sunday. */
export function WeekView({
  events,
  anchor,
  onOpen,
  onAddOn,
}: {
  events: CalendarEvent[];
  anchor: string;
  onOpen: (event: CalendarEvent) => void;
  onAddOn: (date: string) => void;
}) {
  const { from, to } = viewRange('week', anchor);
  const days = eachDay(from, to);
  const byDay = groupByDay(
    events.filter((e) => e.date >= from && e.date <= to),
  );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((day, i) => (
        <section
          key={day}
          className="rounded-md border border-gray-100 p-2"
          aria-label={formatDayHeading(day)}
        >
          <header className="mb-1 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-gray-600">
              {WEEKDAYS[i]} {dayNumber(day)}
            </h3>
            <button
              type="button"
              onClick={() => onAddOn(day)}
              aria-label={`Add key date on ${formatDayHeading(day)}`}
              className="rounded px-1 text-sm text-gray-400 hover:text-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              +
            </button>
          </header>
          <ul className="space-y-1">
            {(byDay.get(day) ?? []).map((e) => (
              <li key={e.keyDateId}>
                <EventChip event={e} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Month: a Monday–Sunday grid; overflow days show a “+N more” count. */
export function MonthView({
  events,
  anchor,
  onOpen,
  onAddOn,
}: {
  events: CalendarEvent[];
  anchor: string;
  onOpen: (event: CalendarEvent) => void;
  onAddOn: (date: string) => void;
}) {
  const weeks = monthGrid(anchor);
  const byDay = groupByDay(events);
  const MAX = 3;

  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          {WEEKDAYS.map((d) => (
            <th
              key={d}
              scope="col"
              className="border border-gray-100 p-1 text-xs font-medium text-gray-500"
            >
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const dayEvents = byDay.get(day) ?? [];
              const outside = !isSameMonth(day, anchor);
              return (
                <td
                  key={day}
                  className={`h-24 border border-gray-100 p-1 align-top ${
                    outside ? 'bg-gray-50/50' : ''
                  }`}
                >
                  <div className="mb-0.5 flex items-baseline justify-between">
                    <span
                      className={`text-xs ${
                        outside ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {dayNumber(day)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddOn(day)}
                      aria-label={`Add key date on ${formatDayHeading(day)}`}
                      className="rounded px-1 text-xs text-gray-300 hover:text-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    >
                      +
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    {dayEvents.slice(0, MAX).map((e) => (
                      <li key={e.keyDateId}>
                        <EventChip event={e} onOpen={onOpen} compact />
                      </li>
                    ))}
                    {dayEvents.length > MAX && (
                      <li className="px-1.5 text-xs text-gray-400">
                        +{dayEvents.length - MAX} more
                      </li>
                    )}
                  </ul>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
