import {
  KEY_DATE_TYPE_LABELS,
  KEY_DATE_TYPE_VALUES,
  STATUS_VALUES,
  TEAM_VALUES,
  type CalendarFilters as Filters,
  type KeyDateType,
  type Status,
  type Team,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { TypeDot } from './primitives';

/**
 * The calendar filter bar: whose dates (mine / all staff / a named person),
 * team, key-date type, case status, and whether to show superseded history.
 */
export function CalendarFilters({
  filters,
  users,
  onChange,
}: {
  filters: Filters;
  users: UserSummary[];
  onChange: (filters: Filters) => void;
}) {
  const patch = (p: Partial<Filters>) => onChange({ ...filters, ...p });

  const scopeValue =
    filters.scope === 'user' ? `user:${filters.userId ?? ''}` : filters.scope;

  const toggleType = (t: KeyDateType) => {
    const set = new Set(filters.types ?? []);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    patch({ types: set.size ? [...set] : undefined });
  };

  const toggleStatus = (s: Status) => {
    const set = new Set(filters.statuses ?? []);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    patch({ statuses: set.size ? [...set] : undefined });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium text-gray-500">Show</span>
        <select
          value={scopeValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'mine') patch({ scope: 'mine', userId: null });
            else if (v === 'all') patch({ scope: 'all', userId: null });
            else patch({ scope: 'user', userId: v.slice('user:'.length) });
          }}
          aria-label="Whose dates to show"
          className="rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          <option value="mine">My dates</option>
          <option value="all">All staff</option>
          <optgroup label="A named person">
            {users.map((u) => (
              <option key={u.id} value={`user:${u.id}`}>
                {u.displayName}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="flex items-center gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium text-gray-500">Team</span>
        <select
          value={filters.team ?? ''}
          onChange={(e) =>
            patch({ team: (e.target.value || null) as Team | null })
          }
          aria-label="Team"
          className="rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          <option value="">All teams</option>
          {TEAM_VALUES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Key date types</legend>
        {KEY_DATE_TYPE_VALUES.map((t) => {
          const on = filters.types?.includes(t) ?? false;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggleType(t)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                on
                  ? 'border-resend-purple bg-resend-purple/10 text-resend-ink'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              <TypeDot type={t} />
              {KEY_DATE_TYPE_LABELS[t]}
            </button>
          );
        })}
      </fieldset>

      <label className="flex items-center gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium text-gray-500">Status</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) toggleStatus(e.target.value as Status);
          }}
          aria-label="Add a case-status filter"
          className="rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          <option value="">
            {filters.statuses?.length
              ? `${filters.statuses.length} selected`
              : 'Any status'}
          </option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {filters.statuses?.includes(s) ? `✓ ${s}` : s}
            </option>
          ))}
        </select>
      </label>
      {filters.statuses?.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => toggleStatus(s)}
          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          aria-label={`Remove status filter ${s}`}
        >
          {s} ×
        </button>
      ))}

      <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={filters.includeSuperseded ?? false}
          onChange={(e) => patch({ includeSuperseded: e.target.checked })}
          className="h-4 w-4 accent-resend-purple"
        />
        Show timetable history
      </label>
    </div>
  );
}
