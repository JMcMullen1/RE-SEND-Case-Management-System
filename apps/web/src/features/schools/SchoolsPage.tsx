import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PRODUCT_NAME,
  SCHOOL_FUNDING_LABELS,
  SCHOOL_FUNDING_VALUES,
  SCHOOL_PROVISION_LABELS,
  SCHOOL_PROVISION_VALUES,
  canEditSchools,
  schoolFactsLine,
  type SchoolFunding,
  type SchoolProvision,
} from '@re-send/shared';
import { searchSchools } from '../../api/schools';
import { useMe } from '../../hooks/useCaseData';
import { AddSchoolDialog } from './SchoolForm';

/**
 * The schools directory: one record per school, shared by every case. Search
 * by name, URN, postcode, town or local authority, and narrow by type.
 */
export function SchoolsPage() {
  const me = useMe().data;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [section41, setSection41] = useState(false);
  const [funding, setFunding] = useState<SchoolFunding | ''>('');
  const [provision, setProvision] = useState<SchoolProvision | ''>('');
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ['schools', debounced, section41, funding, provision, archived],
    queryFn: () =>
      searchSchools({
        q: debounced,
        section41,
        funding: funding ? [funding] : undefined,
        provision: provision ? [provision] : undefined,
        archived,
      }),
  });
  const schools = results.data?.schools ?? [];
  const select =
    'rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

  return (
    <div className="min-h-screen bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} schools
            </h1>
            <p className="text-xs text-gray-500">
              One directory of schools and their contacts, shared by every case
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
          {canEditSchools(me?.role) && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Add a school
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, URN, postcode, town or LA"
            aria-label="Search schools"
            className="min-w-[260px] flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          <select
            value={funding}
            onChange={(e) => setFunding(e.target.value as SchoolFunding | '')}
            aria-label="Type of school"
            className={select}
          >
            <option value="">Any type</option>
            {SCHOOL_FUNDING_VALUES.map((v) => (
              <option key={v} value={v}>
                {SCHOOL_FUNDING_LABELS[v]}
              </option>
            ))}
          </select>
          <select
            value={provision}
            onChange={(e) =>
              setProvision(e.target.value as SchoolProvision | '')
            }
            aria-label="Provision"
            className={select}
          >
            <option value="">Any provision</option>
            {SCHOOL_PROVISION_VALUES.map((v) => (
              <option key={v} value={v}>
                {SCHOOL_PROVISION_LABELS[v]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={section41}
              onChange={(e) => setSection41(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
            />
            Section 41 only
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
            />
            Include archived
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {results.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {results.isError && (
          <p className="text-sm text-status-amber-text">
            Schools could not be loaded. Refresh to try again.
          </p>
        )}
        {results.data && schools.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">
            {debounced || section41 || funding || provision
              ? 'No schools match. Try fewer words, or add the school.'
              : 'No schools yet. Add one here, or from a case’s details.'}
          </p>
        )}
        {schools.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {schools.map((s) => (
              <li key={s.id}>
                <a
                  href={`/schools/${s.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-3 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-resend-purple">
                      {s.name}
                    </span>
                    {s.section41 && (
                      <span className="ml-2 rounded bg-resend-purple px-1.5 py-0.5 text-[11px] font-medium text-white">
                        Section 41
                      </span>
                    )}
                    {s.archived && (
                      <span className="ml-2 text-xs text-gray-500">
                        (archived)
                      </span>
                    )}
                    <span className="block text-xs text-gray-600">
                      {[
                        schoolFactsLine({ ...s, section41: false }),
                        s.localAuthority,
                        s.postcode,
                        s.urn && `URN ${s.urn}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-600">
                    {s.contactCount} contact{s.contactCount === 1 ? '' : 's'} ·{' '}
                    {s.caseCount} case{s.caseCount === 1 ? '' : 's'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>

      {adding && (
        <AddSchoolDialog
          initialName={q}
          pickLabel="Open this school"
          onAdded={(school) => {
            window.location.href = `/schools/${school.id}`;
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
