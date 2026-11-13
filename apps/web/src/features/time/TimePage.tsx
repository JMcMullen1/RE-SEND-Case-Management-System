import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PRODUCT_NAME,
  TIME_PERIOD_VALUES,
  formatCivilDate,
  formatMinutes,
  formatPence,
  periodRange,
  shiftPeriod,
  type TimePeriod,
  type TimeEntryRow,
} from '@re-send/shared';
import { fetchTimeReport } from '../../api/time';
import { useMe, useUsers } from '../../hooks/useCaseData';
import { useToday } from '../../hooks/useToday';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

function periodTitle(period: TimePeriod, from: string, to: string): string {
  if (period === 'day') return formatCivilDate(from);
  if (period === 'week')
    return `${formatCivilDate(from)} – ${formatCivilDate(to)}`;
  return new Date(`${from}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "My time": the time a person has recorded by day, week or month, and what it
 * earned at their pay rate. Everyone sees their own; admins can look at anyone.
 * Billables with no time recorded are listed so they can be put right.
 */
export function TimePage() {
  const today = useToday();
  const me = useMe().data;
  const isAdmin = me?.role === 'admin';
  const staff = useUsers().data?.users ?? [];

  const [period, setPeriod] = useState<TimePeriod>('week');
  const [anchor, setAnchor] = useState(today);
  const [userId, setUserId] = useState<string>('');
  const { from, to } = periodRange(period, anchor);
  const subject = userId || me?.id;

  const report = useQuery({
    queryKey: ['time', subject, from, to],
    queryFn: () => fetchTimeReport({ from, to, userId: userId || undefined }),
    enabled: Boolean(me),
  });
  const data = report.data;
  const isMine = !userId || userId === me?.id;

  // Group entries by day, newest first (the API already orders them).
  const days: { date: string; entries: TimeEntryRow[] }[] = [];
  for (const e of data?.entries ?? []) {
    const last = days[days.length - 1];
    if (last?.date === e.entryDate) last.entries.push(e);
    else days.push({ date: e.entryDate, entries: [e] });
  }

  return (
    <div className="min-h-screen bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} {isMine ? 'my time' : 'time'}
            </h1>
            <p className="text-xs text-gray-500">
              Time recorded on billables, and what it earned
            </p>
          </div>
          {isAdmin && (
            <a
              href="/admin/rates"
              className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Staff rates
            </a>
          )}
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Period"
            className="flex gap-1 rounded-lg border border-gray-200 p-0.5"
          >
            {TIME_PERIOD_VALUES.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                  period === p
                    ? 'bg-resend-purple text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
              aria-label={`Previous ${period}`}
              className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
              aria-label={`Next ${period}`}
              className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              ›
            </button>
          </div>
          <h2 className="text-sm font-semibold">
            {periodTitle(period, from, to)}
          </h2>
          {isAdmin && (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="Whose time"
              className="ml-auto rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              <option value="">My time</option>
              {staff
                .filter((u) => u.id !== me?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
            </select>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-6">
        {report.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {report.isError && (
          <p className="text-sm text-status-amber">
            Time could not be loaded. Refresh to try again.
          </p>
        )}

        {data && (
          <>
            <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="Time recorded"
                value={formatMinutes(data.totalMinutes)}
              />
              <Stat
                label="Earned"
                value={
                  data.totalEarningsPence === null
                    ? '—'
                    : formatPence(data.totalEarningsPence)
                }
                note={
                  data.entries.length === 0
                    ? undefined
                    : data.totalEarningsPence === null
                      ? 'No pay rate set yet — an admin sets it under Staff rates.'
                      : data.entriesWithoutRate > 0
                        ? `${data.entriesWithoutRate} entr${data.entriesWithoutRate === 1 ? 'y' : 'ies'} fall before any pay rate and are not counted.`
                        : undefined
                }
              />
              <Stat label="Entries" value={String(data.entries.length)} />
            </section>

            {data.missingTime.length > 0 && (
              <section
                aria-label="Billables without time"
                className="rounded-lg border border-status-amber px-4 py-3"
              >
                <h2 className="text-sm font-semibold">
                  {data.missingTime.length} billable
                  {data.missingTime.length === 1 ? ' has' : 's have'} no time
                  recorded
                </h2>
                <p className="mb-2 text-xs text-gray-600">
                  These were written before time recording, or need fixing. Open
                  the case and use “Add time” on the billable.
                </p>
                <ul className="space-y-1 text-sm">
                  {data.missingTime.map((m) => (
                    <li key={m.noteId}>
                      <a
                        href={`/cases/${m.caseId}`}
                        className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                      >
                        {m.caseReference}
                      </a>{' '}
                      <span className="text-gray-500">
                        · {formatCivilDate(m.entryDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.entries.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">
                No time recorded in this {period}. Time is added with each
                billable on a case’s Billables tab.
              </p>
            ) : (
              <section aria-label="Entries" className="space-y-4">
                {days.map((day) => (
                  <div key={day.date}>
                    <h3 className="mb-1 flex justify-between border-b border-gray-100 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span>{formatCivilDate(day.date)}</span>
                      <span>
                        {formatMinutes(
                          day.entries.reduce((s, e) => s + e.minutes, 0),
                        )}
                      </span>
                    </h3>
                    <ul className="divide-y divide-gray-50">
                      {day.entries.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-baseline gap-3 py-1.5 text-sm"
                        >
                          <a
                            href={`/cases/${e.caseId}`}
                            className="shrink-0 font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                          >
                            {e.caseReference}
                          </a>
                          <span className="min-w-0 flex-1 truncate text-gray-600">
                            {e.childName ? `${e.childName} · ` : ''}
                            {e.narrative}
                          </span>
                          <span className="shrink-0 tabular-nums font-medium">
                            {formatMinutes(e.minutes)}
                          </span>
                          <span className="w-20 shrink-0 text-right tabular-nums text-gray-500">
                            {e.earningsPence === null
                              ? '—'
                              : formatPence(e.earningsPence)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  );
}
