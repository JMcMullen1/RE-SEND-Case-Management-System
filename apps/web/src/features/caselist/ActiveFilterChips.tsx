import {
  activeFilterChips,
  removeFilterChip,
  type CaseFilters,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { Chip } from './primitives';

/**
 * Active filters as removable chips, shown in BOTH views. In simple view this
 * is the only place filters are visible, so nobody ever wonders where the
 * missing cases went.
 */
export function ActiveFilterChips({
  filters,
  users,
  onChange,
}: {
  filters: CaseFilters;
  users: UserSummary[];
  onChange: (filters: CaseFilters) => void;
}) {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  const nameFor = (id: string) =>
    users.find((u) => u.id === id)?.displayName ?? 'Unknown user';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          onRemove={() => onChange(removeFilterChip(filters, chip))}
          removeLabel={`Remove filter ${chip.label}`}
        >
          {chip.needsUserLookup ? nameFor(String(chip.value)) : chip.label}
        </Chip>
      ))}
      <button
        type="button"
        onClick={() => onChange({})}
        className="text-xs font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Clear all
      </button>
    </div>
  );
}
