import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CASE_SCHOOL_ROLE_LABELS,
  PRODUCT_NAME,
  ageRangeLabel,
  canEditSchools,
  SCHOOL_FUNDING_LABELS,
  SCHOOL_PROVISION_LABELS,
  type SchoolDetail,
} from '@re-send/shared';
import { archiveSchool, fetchSchool, updateSchool } from '../../api/schools';
import { useMe } from '../../hooks/useCaseData';
import { ContactsEditor } from './ContactsEditor';
import { SchoolForm } from './SchoolForm';

/** One school: its facts, its contacts, and the cases it is linked to. */
export function SchoolPage() {
  const { schoolId } = useParams({ from: '/schools/$schoolId' });
  const qc = useQueryClient();
  const me = useMe().data;
  const canEdit = canEditSchools(me?.role);
  const isAdmin = me?.role === 'admin';
  const school = useQuery({
    queryKey: ['school', schoolId],
    queryFn: () => fetchSchool(schoolId),
  });
  const [editing, setEditing] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['school', schoolId] });
    void qc.invalidateQueries({ queryKey: ['schools'] });
    void qc.invalidateQueries({ queryKey: ['case-schools'] });
  };

  if (school.isLoading)
    return <p className="p-10 text-center text-sm text-gray-500">Loading…</p>;
  if (!school.data)
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-gray-600">This school could not be found.</p>
        <a
          href="/schools"
          className="mt-3 inline-block text-sm text-resend-purple underline"
        >
          Back to schools
        </a>
      </div>
    );
  const s: SchoolDetail = school.data;

  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto min-w-0">
            <a
              href="/schools"
              className="text-xs text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              ← {PRODUCT_NAME} schools
            </a>
            <h1 className="text-lg font-semibold">
              {s.name}
              {s.section41 && (
                <span className="ml-2 rounded bg-resend-purple px-1.5 py-0.5 align-middle text-xs font-medium text-white">
                  Section 41
                </span>
              )}
              {s.archived && (
                <span className="ml-2 align-middle text-sm font-normal text-gray-500">
                  (archived)
                </span>
              )}
            </h1>
          </div>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Edit details
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setArchiveError(null);
                archiveSchool(s.id, !s.archived)
                  .then(refresh)
                  .catch(() => setArchiveError('Could not change. Try again.'));
              }}
              className="text-sm text-status-amber-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
            >
              {s.archived ? 'Restore' : 'Archive'}
            </button>
          )}
        </div>
        {archiveError && (
          <p role="alert" className="mt-1 text-xs text-status-amber-text">
            {archiveError}
          </p>
        )}
      </div>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-6 md:grid-cols-2">
        <section aria-labelledby="facts-h">
          <h2
            id="facts-h"
            className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Details
          </h2>
          {editing ? (
            <SchoolForm
              initial={s}
              submitLabel="Save"
              onSubmit={async (fields) => {
                await updateSchool(s.id, fields);
                setEditing(false);
                refresh();
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <Fact label="Type">
                {s.funding ? SCHOOL_FUNDING_LABELS[s.funding] : null}
              </Fact>
              <Fact label="Provision">
                {s.provision ? SCHOOL_PROVISION_LABELS[s.provision] : null}
              </Fact>
              <Fact label="Section 41">{s.section41 ? 'Yes' : 'No'}</Fact>
              <Fact label="Ages">{ageRangeLabel(s.ageFrom, s.ageTo)}</Fact>
              <Fact label="Local authority">{s.localAuthority}</Fact>
              <Fact label="URN">{s.urn}</Fact>
              <Fact label="Address">
                {[s.address, s.postcode].filter(Boolean).join(', ') || null}
              </Fact>
              <Fact label="Phone">
                {s.phone && (
                  <a
                    href={`tel:${s.phone.replace(/\s+/g, '')}`}
                    className="text-resend-purple hover:underline"
                  >
                    {s.phone}
                  </a>
                )}
              </Fact>
              <Fact label="Email">
                {s.email && (
                  <a
                    href={`mailto:${s.email}`}
                    className="text-resend-purple hover:underline"
                  >
                    {s.email}
                  </a>
                )}
              </Fact>
              <Fact label="Website">
                {s.website && (
                  <a
                    href={
                      /^https?:\/\//.test(s.website)
                        ? s.website
                        : `https://${s.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-resend-purple hover:underline"
                  >
                    {s.website}
                  </a>
                )}
              </Fact>
              <Fact label="Notes">{s.notes}</Fact>
            </dl>
          )}
        </section>

        <div className="space-y-8">
          <section aria-labelledby="contacts-h">
            <h2
              id="contacts-h"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Contacts
            </h2>
            <ContactsEditor
              schoolId={s.id}
              contacts={s.contacts}
              canEdit={canEdit}
              onChanged={refresh}
            />
          </section>

          <section aria-labelledby="cases-h">
            <h2
              id="cases-h"
              className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Cases ({s.cases.length})
            </h2>
            {s.cases.length === 0 ? (
              <p className="text-sm text-gray-500">
                Not linked to any case yet. Link it from a case’s details.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {s.cases.map((c) => (
                  <li key={`${c.caseId}:${c.role}`}>
                    <a
                      href={`/cases/${c.caseId}`}
                      className="font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    >
                      {c.caseReference}
                    </a>
                    <span className="text-gray-600">
                      {c.childName ? ` · ${c.childName}` : ''} ·{' '}
                      {CASE_SCHOOL_ROLE_LABELS[c.role]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-resend-ink">
        {children ?? <span className="text-gray-500">—</span>}
      </dd>
    </>
  );
}
