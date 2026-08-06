import {
  LOGO_PATH,
  PRODUCT_NAME,
  STRAPLINE,
  type CaseFilters,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { ActiveFilterChips } from './ActiveFilterChips';

/** First-run: no cases exist yet. A designed screen, not a placeholder. */
export function EmptyFirstRun() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <img
        src={LOGO_PATH}
        alt={`${PRODUCT_NAME} logo`}
        className="mb-6 h-14 w-14"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      <h2 className="text-xl font-semibold text-resend-purple">
        {PRODUCT_NAME}
      </h2>
      <p className="mb-1 text-sm text-gray-500">{STRAPLINE}</p>
      <p className="mb-8 mt-4 text-base text-resend-ink">
        No cases have been added yet. Start by adding a case, or drop in a query
        form to begin.
      </p>
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <a
          href="/cases/new"
          className="flex-1 rounded-lg bg-resend-purple px-4 py-3 text-center text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple focus-visible:ring-offset-2"
        >
          Add a case
        </a>
        <a
          href="/cases/new?upload=1"
          className="flex-1 rounded-lg border-2 border-resend-purple px-4 py-3 text-center text-sm font-semibold text-resend-purple hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple focus-visible:ring-offset-2"
        >
          Upload a query form
        </a>
      </div>
    </div>
  );
}

/** Cases exist, but the current filters/search match none. */
export function EmptyNoMatch({
  filters,
  users,
  onChange,
}: {
  filters: CaseFilters;
  users: UserSummary[];
  onChange: (filters: CaseFilters) => void;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
      <h2 className="text-lg font-semibold text-resend-ink">
        No cases match the current filters
      </h2>
      <p className="mb-6 mt-2 text-sm text-gray-500">
        Try removing a filter to widen the results.
      </p>
      <div className="mb-6">
        <ActiveFilterChips
          filters={filters}
          users={users}
          onChange={onChange}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({})}
        className="rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Clear all
      </button>
    </div>
  );
}
