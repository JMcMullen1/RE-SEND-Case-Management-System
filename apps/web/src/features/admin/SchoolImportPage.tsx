import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GIAS_ALL_DATA_URL_PREFIX,
  GIAS_DOWNLOAD_PAGE,
  NotAGiasFile,
  SCHOOL_FUNDING_LABELS,
  SCHOOL_IMPORT_MAX,
  SCHOOL_PROVISION_LABELS,
  decodeGiasBytes,
  localAuthorityCounts,
  readGiasFile,
  type GiasFileContents,
  type ImportedSchool,
  type SchoolFunding,
  type SchoolImportPreview,
  type SchoolImportUpdate,
  type SchoolProvision,
} from '@re-send/shared';
import { previewSchoolImport, runSchoolImport } from '../../api/school-import';
import { useMe } from '../../hooks/useCaseData';
import { useToday } from '../../hooks/useToday';
import { AdminTabs } from '../layout/AdminTabs';

const panel = 'rounded-lg border border-gray-200 p-4';
const primary =
  'rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50';
const secondary =
  'rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50';
const link =
  'font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

/** The areas last imported, remembered in this browser for next time. */
const AREAS_KEY = 'resend.schoolImportAreas';
function loadAreas(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(AREAS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveAreas(areas: string[]): void {
  try {
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
  } catch {
    /* a convenience only */
  }
}

const FIELD_LABELS: Record<string, string> = {
  urn: 'URN',
  name: 'Name',
  address: 'Address',
  postcode: 'Postcode',
  localAuthority: 'Local authority',
  phone: 'Phone',
  website: 'Website',
  funding: 'Funding',
  provision: 'Provision',
  section41: 'Section 41',
  ageFrom: 'Lowest age',
  ageTo: 'Highest age',
};

function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'funding') return SCHOOL_FUNDING_LABELS[value as SchoolFunding];
  if (field === 'provision')
    return SCHOOL_PROVISION_LABELS[value as SchoolProvision];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, one: string, many = `${one}s`) =>
  `${n(x)} ${x === 1 ? one : many}`;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function ChangesTable({
  caption,
  rows,
}: {
  caption: string;
  rows: SchoolImportUpdate[];
}) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-xs uppercase tracking-wide text-gray-500">
        <tr>
          <th scope="col" className="py-1 pr-3 font-medium">
            School
          </th>
          <th scope="col" className="py-1 font-medium">
            What changes
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} className="border-t border-gray-100 align-top">
            <td className="py-1.5 pr-3">
              {u.name}
              <span className="block text-xs text-gray-500">
                URN {u.urn}
                {u.archived && ' · archived (stays archived)'}
              </span>
            </td>
            <td className="py-1.5">
              <ul className="space-y-0.5">
                {Object.entries(u.changes).map(([field, c]) => (
                  <li key={field}>
                    <span className="text-gray-600">
                      {FIELD_LABELS[field] ?? field}:
                    </span>{' '}
                    <span className="text-gray-500 line-through">
                      {shown(field, c?.from)}
                    </span>{' '}
                    → {shown(field, c?.to)}
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Importing schools from the DfE's register (admins only). The DfE file is
 * read in the browser; the admin chooses the areas the charity covers (and,
 * by default, every Section 41 school, wherever it is), checks what will
 * change, then imports. Running it again later brings the directory up to date.
 */
export function SchoolImportPage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const qc = useQueryClient();
  const today = useToday();
  const fileInput = useRef<HTMLInputElement>(null);

  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [contents, setContents] = useState<GiasFileContents | null>(null);
  const [fileName, setFileName] = useState('');
  const [areas, setAreas] = useState<string[]>(loadAreas);
  const [allSection41, setAllSection41] = useState(true);
  const [areaFilter, setAreaFilter] = useState('');
  // The preview and exactly the schools it was made for: those are what an
  // import sends, so what the admin approved is what is imported.
  const [previewed, setPreviewed] = useState<{
    schools: ImportedSchool[];
    preview: SchoolImportPreview;
  } | null>(null);
  const preview = previewed?.preview ?? null;

  const counts = useMemo(
    () => (contents ? localAuthorityCounts(contents.schools) : []),
    [contents],
  );
  const chosen = useMemo<ImportedSchool[]>(() => {
    if (!contents) return [];
    const set = new Set(areas);
    return contents.schools.filter(
      (s) =>
        set.has(s.localAuthority ?? 'Not recorded') ||
        (allSection41 && s.section41),
    );
  }, [contents, areas, allSection41]);
  const shownAreas = counts.filter((c) =>
    c.name.toLowerCase().includes(areaFilter.trim().toLowerCase()),
  );

  // The selection as it is now, so a check answered after it changed is
  // dropped rather than shown for the wrong schools.
  const latest = useRef(chosen);
  latest.current = chosen;
  const check = useMutation({
    mutationFn: async (sent: ImportedSchool[]) => ({
      sent,
      preview: await previewSchoolImport(sent),
    }),
    onSuccess: ({ sent, preview: p }) => {
      if (sent === latest.current) setPreviewed({ schools: sent, preview: p });
    },
  });
  const run = useMutation({
    mutationFn: (schools: ImportedSchool[]) => runSchoolImport(schools),
    onSuccess: () => {
      saveAreas(areas);
      void qc.invalidateQueries({ queryKey: ['schools'] });
      void qc.invalidateQueries({ queryKey: ['school'] });
      void qc.invalidateQueries({ queryKey: ['case-schools'] });
    },
  });

  async function readFile(file: File) {
    setReading(true);
    setReadError(null);
    setContents(null);
    setFileName(file.name);
    setPreviewed(null);
    run.reset();
    check.reset();
    try {
      // Let "Reading…" show before the browser is busy with a large file.
      await new Promise((r) => setTimeout(r, 30));
      const text = decodeGiasBytes(new Uint8Array(await file.arrayBuffer()));
      const read = readGiasFile(text);
      setContents(read);
      // Keep only remembered areas this file has.
      const present = new Set(read.schools.map((s) => s.localAuthority));
      setAreas((a) => a.filter((x) => present.has(x)));
    } catch (err) {
      setReadError(
        err instanceof NotAGiasFile
          ? err.message
          : 'The file could not be read. Choose the CSV file downloaded from the DfE.',
      );
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /** The selection changed: any preview or check result is out of date. */
  function selectionChanged() {
    setPreviewed(null);
    check.reset();
    run.reset();
  }
  function changeAreas(next: string[]) {
    setAreas(next);
    selectionChanged();
  }

  const todaysFile = `${GIAS_ALL_DATA_URL_PREFIX}${today.replace(/-/g, '')}.csv`;
  const result = run.data;

  if (me.isLoading) return null;
  if (!isAdmin)
    return (
      <main className="p-6 text-sm text-gray-600">
        Importing schools is for admins.
      </main>
    );

  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-resend-ink">
          Import schools
        </h1>
        <p className="text-xs text-gray-500">
          From the DfE’s register of schools, Get Information About Schools
        </p>
        <AdminTabs />
      </div>

      <main className="max-w-4xl space-y-5 px-6 py-5">
        {result ? (
          <section className={panel} aria-labelledby="done-h">
            <h2 id="done-h" className="text-base font-semibold">
              Import complete
            </h2>
            <p className="mt-2 text-sm">
              {plural(result.created, 'school')} added,{' '}
              {plural(result.updated, 'school')} brought up to date
              {result.unchanged > 0 &&
                `, ${plural(result.unchanged, 'school')} already up to date`}
              .
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Contacts, notes and links to cases are as they were. Import a
              newer file at any time to bring the directory up to date again.
            </p>
            <div className="mt-4 flex gap-2">
              <a href="/schools" className={primary}>
                Go to the schools directory
              </a>
            </div>
          </section>
        ) : (
          <>
            <section className={panel} aria-labelledby="file-h">
              <h2 id="file-h" className="text-base font-semibold">
                1. Choose the DfE’s file
              </h2>
              <p className="mt-1 text-sm text-gray-700">
                Download today’s{' '}
                <a
                  href={todaysFile}
                  target="_blank"
                  rel="noreferrer"
                  className={link}
                >
                  all establishment data
                  <span className="sr-only"> (downloads in a new tab)</span>
                </a>{' '}
                file (a CSV of about 65 MB). If that link isn’t ready yet, use
                “All establishment data” on the{' '}
                <a
                  href={GIAS_DOWNLOAD_PAGE}
                  target="_blank"
                  rel="noreferrer"
                  className={link}
                >
                  DfE downloads page
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                . The file is read here in your browser; only the schools you
                choose are sent.
              </p>
              <label className="mt-3 inline-block">
                <span className="sr-only">The DfE establishment file</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void readFile(f);
                  }}
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-resend-purple file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-resend-purple hover:file:bg-gray-50"
                />
              </label>
              <p role="status" className="mt-2 text-sm text-gray-600">
                {reading
                  ? 'Reading the file…'
                  : contents
                    ? `${fileName}: ${plural(contents.schools.length, 'open school')} in ${plural(counts.length, 'area')}. Left out: ${n(contents.closed)} closed or not yet open, and ${n(contents.outOfScope)} abroad, universities, online-only or in Wales.`
                    : ''}
              </p>
              {readError && (
                <p role="alert" className="mt-2 text-sm text-status-amber-text">
                  {readError}
                </p>
              )}
            </section>

            {contents && (
              <section className={panel} aria-labelledby="areas-h">
                <h2 id="areas-h" className="text-base font-semibold">
                  2. Choose the areas you cover
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  Schools are grouped by local authority. Your choice is
                  remembered for the next import.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="min-w-[14rem] flex-1">
                    <span className="sr-only">Find an area</span>
                    <input
                      type="search"
                      value={areaFilter}
                      onChange={(e) => setAreaFilter(e.target.value)}
                      placeholder="Find an area"
                      className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    />
                  </label>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() =>
                      changeAreas([
                        ...new Set([
                          ...areas,
                          ...shownAreas.map((a) => a.name),
                        ]),
                      ])
                    }
                  >
                    {areaFilter ? 'Select these' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => changeAreas([])}
                    disabled={areas.length === 0}
                  >
                    Clear
                  </button>
                </div>
                <fieldset className="mt-3">
                  <legend className="sr-only">Local authorities</legend>
                  <ul className="grid max-h-72 grid-cols-1 gap-x-4 overflow-y-auto rounded-md border border-gray-100 p-2 sm:grid-cols-2 lg:grid-cols-3">
                    {shownAreas.map((a) => (
                      <li key={a.name}>
                        <label className="flex items-center gap-2 py-0.5 text-sm">
                          <input
                            type="checkbox"
                            checked={areas.includes(a.name)}
                            onChange={(e) =>
                              changeAreas(
                                e.target.checked
                                  ? [...areas, a.name]
                                  : areas.filter((x) => x !== a.name),
                              )
                            }
                          />
                          <span>
                            {a.name}{' '}
                            <span className="text-gray-500">
                              ({n(a.count)})
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                    {shownAreas.length === 0 && (
                      <li className="text-sm text-gray-500">
                        No area matches.
                      </li>
                    )}
                  </ul>
                </fieldset>
                <p className="mt-2 text-sm text-gray-700">
                  {areas.length === 0
                    ? 'No areas chosen yet.'
                    : `Chosen: ${[...areas].sort((a, b) => a.localeCompare(b)).join(', ')}.`}
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allSection41}
                    onChange={(e) => {
                      setAllSection41(e.target.checked);
                      selectionChanged();
                    }}
                  />
                  <span>
                    Also every Section 41 school and college in England,
                    wherever it is (families often look further afield for
                    these)
                  </span>
                </label>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={primary}
                    disabled={
                      chosen.length === 0 ||
                      chosen.length > SCHOOL_IMPORT_MAX ||
                      check.isPending
                    }
                    onClick={() => check.mutate(chosen)}
                  >
                    {check.isPending ? 'Checking…' : 'Check what will change'}
                  </button>
                  <span className="text-sm text-gray-600">
                    {plural(areas.length, 'area')} ·{' '}
                    {plural(chosen.length, 'school')}
                  </span>
                </div>
                {check.isError && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-status-amber-text"
                  >
                    {errorText(check.error)}
                  </p>
                )}
              </section>
            )}

            {preview && (
              <section className={panel} aria-labelledby="check-h">
                <h2 id="check-h" className="text-base font-semibold">
                  3. Check and import
                </h2>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    ['New schools', preview.toCreate],
                    ['To bring up to date', preview.toUpdate],
                    ['Already up to date', preview.unchanged],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border border-gray-100 p-3"
                    >
                      <dt className="text-xs text-gray-600">{label}</dt>
                      <dd className="text-xl font-semibold">
                        {n(value as number)}
                      </dd>
                    </div>
                  ))}
                </dl>

                {preview.matchedByName.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold">
                      Schools added by hand, recognised by name and postcode
                    </h3>
                    <p className="text-sm text-gray-600">
                      These gain their URN and the DfE’s details; their
                      contacts, notes and cases stay with them. If one is not
                      the same school, add its URN on the school’s page before
                      importing.
                    </p>
                    <div className="mt-2">
                      <ChangesTable
                        caption="Schools recognised by name"
                        rows={preview.matchedByName}
                      />
                    </div>
                  </div>
                )}

                {preview.updates.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-resend-purple">
                      What changes on schools already in the directory
                      {preview.toUpdate - preview.matchedByName.length >
                        preview.updates.length &&
                        ` (the first ${n(preview.updates.length)})`}
                    </summary>
                    <div className="mt-2">
                      <ChangesTable
                        caption="Changes to schools already in the directory"
                        rows={preview.updates}
                      />
                    </div>
                  </details>
                )}

                <p className="mt-4 text-sm text-gray-600">
                  Nothing is removed: a school no longer on the DfE’s list stays
                  in the directory, and contacts, notes, email addresses and
                  links to cases are never changed.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primary}
                    disabled={
                      run.isPending || preview.toCreate + preview.toUpdate === 0
                    }
                    onClick={() => previewed && run.mutate(previewed.schools)}
                  >
                    {run.isPending
                      ? 'Importing…'
                      : preview.toCreate + preview.toUpdate === 0
                        ? 'Nothing to import'
                        : `Import: ${plural(preview.toCreate, 'new school')}, ${n(preview.toUpdate)} updated`}
                  </button>
                </div>
                {run.isError && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-status-amber-text"
                  >
                    {errorText(run.error)}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
