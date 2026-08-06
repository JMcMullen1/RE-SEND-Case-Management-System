import {
  countActiveFilters,
  QUICK_FILTERS,
  type CaseFilters,
  type QuickFilterId,
  type Status,
  type Team,
} from '@re-send/shared';

function toggleMember<T>(list: T[] | undefined, value: T): T[] | undefined {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  const next = [...set];
  return next.length ? next : undefined;
}

function withKey<K extends keyof CaseFilters>(
  filters: CaseFilters,
  key: K,
  value: CaseFilters[K],
): CaseFilters {
  const next = { ...filters };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function isActive(id: QuickFilterId, f: CaseFilters): boolean {
  switch (id) {
    case 'all':
      return countActiveFilters(f) === 0;
    case 'mine':
      return Boolean(f.mine);
    case 'toBeAssigned':
      return Boolean(f.unassigned);
    case 'active':
      return f.status?.includes('Active') ?? false;
    case 'tsa':
      return f.team?.includes('TSA') ?? false;
    case 'isa':
      return f.team?.includes('ISA') ?? false;
    case 'paymentsBilling':
      return f.status?.includes('Payment/Billing') ?? false;
  }
}

function toggle(id: QuickFilterId, f: CaseFilters): CaseFilters {
  switch (id) {
    case 'all':
      return {};
    case 'mine':
      return withKey(f, 'mine', f.mine ? undefined : true);
    case 'toBeAssigned':
      return withKey(f, 'unassigned', f.unassigned ? undefined : true);
    case 'active':
      return withKey(f, 'status', toggleMember<Status>(f.status, 'Active'));
    case 'paymentsBilling':
      return withKey(
        f,
        'status',
        toggleMember<Status>(f.status, 'Payment/Billing'),
      );
    case 'tsa':
      return withKey(f, 'team', toggleMember<Team>(f.team, 'TSA'));
    case 'isa':
      return withKey(f, 'team', toggleMember<Team>(f.team, 'ISA'));
  }
}

export function QuickFilters({
  filters,
  onChange,
}: {
  filters: CaseFilters;
  onChange: (filters: CaseFilters) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Quick filters"
    >
      {QUICK_FILTERS.map((pill) => {
        const active = isActive(pill.id, filters);
        return (
          <button
            key={pill.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(toggle(pill.id, filters))}
            className={`rounded-full px-3 py-1 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
              active
                ? 'bg-resend-purple text-white'
                : 'bg-gray-100 text-resend-ink hover:bg-gray-200'
            }`}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
