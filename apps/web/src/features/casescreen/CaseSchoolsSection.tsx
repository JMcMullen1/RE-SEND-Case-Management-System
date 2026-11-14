import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CASE_SCHOOL_ROLE_LABELS,
  CASE_SCHOOL_ROLE_VALUES,
  canEditSchools,
  schoolFactsLine,
  schoolNameKey,
  type CaseSchool,
  type CaseSchoolRole,
  type SchoolSummary,
} from '@re-send/shared';
import {
  fetchCaseSchools,
  linkSchool,
  searchSchools,
  unlinkSchool,
  updateCaseSchool,
} from '../../api/schools';
import { useMe } from '../../hooks/useCaseData';
import { AddSchoolDialog } from '../schools/SchoolForm';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * The schools on a case, from the shared directory: what each one is, how it
 * relates to the case, and which of its contacts are involved. Linking a
 * current or proposed school also fills in the child's Current / Desired
 * school, so the two never disagree.
 */
export function CaseSchoolsSection({
  caseId,
  currentSchoolName,
  desiredSchool,
}: {
  caseId: string;
  currentSchoolName: string | null;
  desiredSchool: string | null;
}) {
  const qc = useQueryClient();
  const canEdit = canEditSchools(useMe().data?.role);
  const links = useQuery({
    queryKey: ['case-schools', caseId],
    queryFn: () => fetchCaseSchools(caseId),
  });
  const [linking, setLinking] = useState<{
    role: CaseSchoolRole;
    q: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (p: Promise<{ schools: CaseSchool[] }>) => {
    setError(null);
    return p
      .then((data) => {
        qc.setQueryData(['case-schools', caseId], data);
        void qc.invalidateQueries({ queryKey: ['case-detail', caseId] });
        void qc.invalidateQueries({ queryKey: ['schools'] });
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  const list = links.data?.schools ?? [];
  // A school typed on the case but not linked from the directory yet.
  const unlinked = (
    [
      ['current', currentSchoolName],
      ['proposed', desiredSchool],
    ] as const
  ).filter(
    ([role, name]) =>
      name &&
      !list.some(
        (l) =>
          l.role === role &&
          schoolNameKey(l.school.name) === schoolNameKey(name),
      ),
  );

  return (
    <div className="space-y-3">
      {links.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {list.map((link) => (
        <LinkedSchool
          key={link.linkId}
          link={link}
          canEdit={canEdit}
          onRole={(role) =>
            void apply(updateCaseSchool(caseId, link.linkId, { role }))
          }
          onContacts={(contactIds) =>
            void apply(updateCaseSchool(caseId, link.linkId, { contactIds }))
          }
          onUnlink={() => void apply(unlinkSchool(caseId, link.linkId))}
        />
      ))}
      {!links.isLoading && list.length === 0 && unlinked.length === 0 && (
        <p className="text-sm text-gray-500">
          No schools linked from the directory yet.
        </p>
      )}
      {canEdit &&
        unlinked.map(([role, name]) => (
          <p
            key={role}
            className="rounded-md bg-gray-50 px-3 py-2 text-sm text-resend-ink"
          >
            “{name}” ({CASE_SCHOOL_ROLE_LABELS[role].toLowerCase()}) isn’t
            linked to the schools directory.{' '}
            <button
              type="button"
              onClick={() => setLinking({ role, q: name! })}
              className="font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Find it in the directory
            </button>
          </p>
        ))}
      {error && (
        <p role="alert" className="text-sm text-status-amber-text">
          {error}
        </p>
      )}
      {canEdit &&
        (linking ? (
          <LinkPicker
            initial={linking}
            onPick={(school, role) => {
              void apply(linkSchool(caseId, school.id, role)).then(() =>
                setLinking(null),
              );
            }}
            onCancel={() => setLinking(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() =>
              setLinking({
                role: list.some((l) => l.role === 'current')
                  ? 'proposed'
                  : 'current',
                q: '',
              })
            }
            className="text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            + Link a school
          </button>
        ))}
    </div>
  );
}

function LinkedSchool({
  link,
  canEdit,
  onRole,
  onContacts,
  onUnlink,
}: {
  link: CaseSchool;
  canEdit: boolean;
  onRole: (role: CaseSchoolRole) => void;
  onContacts: (ids: string[]) => void;
  onUnlink: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const s = link.school;
  const involved = new Set(link.involvedContactIds);
  const facts = schoolFactsLine(s);
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <a
            href={`/schools/${s.id}`}
            className="font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {s.name}
          </a>
          {s.archived && (
            <span className="ml-1 text-xs text-gray-500">(archived)</span>
          )}
          {facts && <p className="text-xs text-gray-600">{facts}</p>}
        </div>
        {canEdit ? (
          <select
            value={link.role}
            onChange={(e) => onRole(e.target.value as CaseSchoolRole)}
            aria-label={`How ${s.name} relates to this case`}
            className="rounded-md border border-gray-200 px-2 py-0.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {CASE_SCHOOL_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {CASE_SCHOOL_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-gray-600">
            {CASE_SCHOOL_ROLE_LABELS[link.role]}
          </span>
        )}
      </div>

      {link.contacts.length > 0 && (
        <fieldset className="mt-2">
          <legend className="text-xs text-gray-500">
            Contacts — tick those involved in this case
          </legend>
          <ul className="mt-1 space-y-0.5">
            {link.contacts.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`${link.linkId}-${c.id}`}
                  checked={involved.has(c.id)}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const next = new Set(involved);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    onContacts([...next]);
                  }}
                  className="mt-1 h-3.5 w-3.5 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                />
                <label htmlFor={`${link.linkId}-${c.id}`} className="min-w-0">
                  <span className={involved.has(c.id) ? 'font-medium' : ''}>
                    {c.name}
                  </span>
                  {c.role && <span className="text-gray-600"> · {c.role}</span>}
                  {(c.email || c.phone) && (
                    <span className="block text-xs text-gray-600">
                      {[c.email, c.phone].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {link.contacts.length === 0 && (
        <p className="mt-1 text-xs text-gray-500">
          No contacts recorded.{' '}
          <a
            href={`/schools/${s.id}`}
            className="text-resend-purple hover:underline"
          >
            Add them on the school’s page
          </a>
          .
        </p>
      )}

      {canEdit && (
        <div className="mt-1 text-right text-xs">
          {confirm ? (
            <span className="inline-flex gap-3">
              <span className="text-gray-600">
                Unlink {s.name} from this case?
              </span>
              <button
                type="button"
                onClick={onUnlink}
                className="font-semibold text-status-amber-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
              >
                Yes, unlink
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="text-gray-600 hover:underline"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="text-status-amber-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
            >
              Unlink
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Find a school in the directory (or add it) and link it in a chosen role. */
function LinkPicker({
  initial,
  onPick,
  onCancel,
}: {
  initial: { role: CaseSchoolRole; q: string };
  onPick: (school: SchoolSummary, role: CaseSchoolRole) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(initial.q);
  const [role, setRole] = useState<CaseSchoolRole>(initial.role);
  const [debounced, setDebounced] = useState(initial.q);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ['schools', 'picker', debounced],
    queryFn: () => searchSchools({ q: debounced }),
    enabled: debounced.trim().length >= 2,
  });
  const found = results.data?.schools ?? [];

  return (
    <div className="rounded-lg border border-resend-purple p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-xs text-gray-600">
          Find a school
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="Name, URN, postcode or town"
            className="mt-0.5 block w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
        </label>
        <label className="text-xs text-gray-600">
          Link as
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as CaseSchoolRole)}
            className="mt-0.5 block rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {CASE_SCHOOL_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {CASE_SCHOOL_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Cancel
        </button>
      </div>
      {debounced.trim().length >= 2 && (
        <ul
          className="mt-2 divide-y divide-gray-100"
          aria-label="Matching schools"
        >
          {results.isLoading && (
            <li className="py-1 text-sm text-gray-500">Searching…</li>
          )}
          {found.slice(0, 8).map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium text-resend-ink">{s.name}</span>
                <span className="block text-xs text-gray-600">
                  {[schoolFactsLine(s), s.postcode, s.localAuthority]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onPick(s, role)}
                className="shrink-0 rounded-md bg-resend-purple px-2.5 py-1 text-xs font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Link
              </button>
            </li>
          ))}
          {results.data && found.length === 0 && (
            <li className="py-1 text-sm text-gray-600">
              No school in the directory matches “{debounced}”.
            </li>
          )}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-2 text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Not in the directory? Add it
      </button>
      {adding && (
        <AddSchoolDialog
          initialName={q}
          pickLabel="Link this school"
          onAdded={(school) => {
            setAdding(false);
            onPick(school, role);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
