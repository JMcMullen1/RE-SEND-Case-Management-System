import { AdminTabs } from '../layout/AdminTabs';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CASE_IMPORT_FIELDS,
  OWNER_QUEUE_VALUES,
  PRODUCT_NAME,
  TEAM_VALUES,
  formatCivilDate,
  matchImportHeadings,
  type CaseImportFieldId,
  type CaseImportRequest,
  type CaseImportValueToMatch,
  type ViewMode,
} from '@re-send/shared';
import {
  previewImport,
  runImport,
  type ImportPreview,
  type ImportResult,
} from '../../api/case-import';
import { useMe, useUsers } from '../../hooks/useCaseData';
import { SegmentedControl } from '../caselist/Controls';
import { readWorkbook, type SheetTable } from './readWorkbook';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const FIELD = new Map(CASE_IMPORT_FIELDS.map((f) => [f.id, f]));
const label = (id: CaseImportFieldId) => FIELD.get(id)?.label ?? id;
/** A value as it will be imported, with dates written the UK way. */
function display(field: CaseImportFieldId, value: string | undefined) {
  if (value === undefined) return undefined;
  return FIELD.get(field)?.kind === 'date' ? formatCivilDate(value) : value;
}
const SIMPLE_FIELDS = CASE_IMPORT_FIELDS.filter(
  (f) => 'simple' in f && f.simple,
).map((f) => f.id as CaseImportFieldId);

const select =
  'rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';
const panel = 'rounded-lg border border-gray-200 p-4';

type Filter = 'all' | 'import' | 'duplicate' | 'problem' | 'warning';
const PAGE = 200;

const OUTCOME: Record<
  ImportPreview['rows'][number]['outcome'],
  { text: string; style: string }
> = {
  import: { text: 'Will import', style: 'bg-resend-green text-white' },
  duplicate: {
    text: 'Already there',
    style: 'border border-gray-300 text-gray-700',
  },
  problem: {
    text: 'Needs fixing',
    style: 'border border-status-amber text-status-amber-text',
  },
};

/**
 * Importing the existing case list (admins only). The spreadsheet is read in
 * the browser; its columns are matched to the system's own headings, values
 * the system does not recognise are matched by hand, and every row is checked
 * — new or existing client, duplicate, or a problem to fix in the sheet —
 * before anything is imported.
 */
export function ImportPage() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const staff = useUsers().data?.users ?? [];

  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetTable[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [mapping, setMapping] = useState<(CaseImportFieldId | null)[]>([]);
  const [valueMaps, setValueMaps] = useState<CaseImportRequest['valueMaps']>(
    {},
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ViewMode>('simple');
  const [filter, setFilter] = useState<Filter>('all');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const sheet = sheets[sheetIndex] ?? null;
  const body: CaseImportRequest | null = sheet
    ? {
        rows: sheet.rows,
        firstRowNumber: sheet.firstRowNumber,
        mapping,
        valueMaps,
      }
    : null;

  // The latest check wins: an earlier, slower answer is ignored.
  const checkSeq = useRef(0);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const importNow = useMutation({
    mutationFn: () => runImport(body!, preview!),
    onSuccess: (r) => {
      setResult(r);
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: () => setConfirming(false),
  });

  // Check the list again whenever the column or value matches change.
  useEffect(() => {
    if (!body || body.rows.length === 0) return;
    const seq = ++checkSeq.current;
    setChecking(true);
    setCheckError(null);
    // Wait for a pause in changes, so a run of choices is checked once.
    const timer = setTimeout(() => {
      previewImport(body)
        .then((p) => {
          if (seq === checkSeq.current) setPreview(p);
        })
        .catch((e: unknown) => {
          // Never leave an earlier result on screen to be imported.
          if (seq !== checkSeq.current) return;
          setPreview(null);
          setCheckError(errorText(e));
        })
        .finally(() => {
          if (seq === checkSeq.current) setChecking(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [sheet, mapping, valueMaps]);

  const chooseSheet = (index: number, all = sheets) => {
    setSheetIndex(index);
    setMapping(matchImportHeadings(all[index]?.headings ?? []));
    setValueMaps({});
    setPreview(null);
    setFilter('all');
    setOpenRow(null);
    setShown(PAGE);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setResult(null);
    importNow.reset();
    setReading(true);
    try {
      const read = await readWorkbook(file);
      const withData = read.findIndex((s) => s.rows.length > 0);
      if (withData < 0) {
        setReadError('No rows found in this workbook.');
        setSheets([]);
        return;
      }
      setFileName(file.name);
      setSheets(read);
      chooseSheet(withData, read);
    } catch {
      setReadError(
        'This file could not be read. Save the case list as an Excel workbook (.xlsx) and try again.',
      );
    } finally {
      setReading(false);
    }
  };

  const startOver = () => {
    setFileName(null);
    setSheets([]);
    setPreview(null);
    setResult(null);
    importNow.reset();
  };

  const rows = useMemo(() => {
    const all = preview?.rows ?? [];
    if (filter === 'all') return all;
    if (filter === 'warning')
      return all.filter(
        (r) =>
          r.outcome === 'import' && r.issues.some((i) => i.level === 'warning'),
      );
    return all.filter((r) => r.outcome === filter);
  }, [preview, filter]);

  // The advanced view shows every field that has a value in this list.
  const fields: CaseImportFieldId[] =
    mode === 'simple'
      ? SIMPLE_FIELDS.filter((f) => mapping.includes(f))
      : CASE_IMPORT_FIELDS.map((f) => f.id as CaseImportFieldId).filter((f) =>
          mapping.includes(f),
        );

  if (me.isLoading) return null;
  if (!isAdmin)
    return (
      <main className="p-6 text-sm text-gray-600">
        Importing the case list is for admins.{' '}
        <a href="/" className="text-resend-purple hover:underline">
          Back to cases
        </a>
      </main>
    );

  const s = preview?.summary;
  const unmatchedHeadings = sheet
    ? sheet.headings.filter((h, i) => h && !mapping[i]).length
    : 0;
  const usedFields = new Set(mapping.filter(Boolean));

  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-xl font-semibold text-resend-ink">
              Import the case list
            </h1>
            <p className="text-xs text-gray-500">
              Bring your existing case list into {PRODUCT_NAME}
            </p>
          </div>
        </div>
        <AdminTabs />
      </div>

      <main className="space-y-5 px-6 py-5">
        {result ? (
          <section className={panel} aria-labelledby="done-h">
            <h2 id="done-h" className="text-base font-semibold">
              Import complete
            </h2>
            <ul className="mt-2 space-y-0.5 text-sm">
              <li>
                <strong>{result.casesCreated}</strong> cases imported, with{' '}
                {result.clientsCreated} new clients and {result.childrenCreated}{' '}
                new children.
              </li>
              {result.duplicatesSkipped > 0 && (
                <li>
                  {result.duplicatesSkipped} rows were already on the system and
                  were skipped.
                </li>
              )}
              {result.problemsSkipped > 0 && (
                <li>
                  {result.problemsSkipped} rows needed fixing and were not
                  imported. Fix them in the spreadsheet and import it again —
                  rows already imported are skipped.
                </li>
              )}
            </ul>
            <div className="mt-4 flex gap-2">
              <a
                href="/"
                className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Go to the case list
              </a>
              <button
                type="button"
                onClick={startOver}
                className="rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Import another file
              </button>
            </div>
          </section>
        ) : (
          <section className={panel} aria-labelledby="file-h">
            <h2 id="file-h" className="text-base font-semibold">
              1. Choose the case list
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              An Excel workbook (.xlsx) with a heading row, such as Date of
              enquiry, Allocated to, Status, Client Name and Child’s Name. The
              file is read on this computer and is not uploaded or kept; only
              the cases you import are saved. Nothing is imported until you
              check the rows and choose Import.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-resend-purple focus-within:ring-offset-2 hover:bg-resend-lilac">
                {fileName ? 'Choose a different file' : 'Choose file'}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {reading && (
                <span className="text-sm text-gray-600">Reading…</span>
              )}
              {fileName && !reading && (
                <span className="text-sm text-gray-600">{fileName}</span>
              )}
              {sheets.length > 1 && (
                <label className="text-sm text-gray-600">
                  Sheet{' '}
                  <select
                    value={sheetIndex}
                    onChange={(e) => chooseSheet(Number(e.target.value))}
                    className={select}
                  >
                    {sheets.map((sh, i) => (
                      <option key={sh.name} value={i}>
                        {sh.name} ({sh.rows.length} rows)
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {readError && (
              <p role="alert" className="mt-2 text-sm text-status-amber-text">
                {readError}
              </p>
            )}
          </section>
        )}

        {sheet && !result && (
          <>
            <details className={panel} open={unmatchedHeadings > 0}>
              <summary className="cursor-pointer text-base font-semibold">
                2. Your columns{' '}
                <span className="text-sm font-normal text-gray-600">
                  — {mapping.filter(Boolean).length} matched to the system’s
                  fields
                  {unmatchedHeadings > 0 &&
                    `, ${unmatchedHeadings} not imported`}
                </span>
              </summary>
              <p className="mt-2 text-sm text-gray-600">
                Each column is matched to the system field with the same
                heading. Change a match, or choose “Don’t import” for a column
                you do not need.
              </p>
              <table className="mt-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="py-1 pr-6 font-semibold">Your column</th>
                    <th className="py-1 font-semibold">Imported as</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.headings.map((heading, col) =>
                    heading ? (
                      <tr key={col}>
                        <td className="py-0.5 pr-6">{heading}</td>
                        <td className="py-0.5">
                          <select
                            aria-label={`Import the column “${heading}” as`}
                            value={mapping[col] ?? ''}
                            onChange={(e) =>
                              setMapping((m) =>
                                m.map((f, i) =>
                                  i === col
                                    ? ((e.target.value ||
                                        null) as CaseImportFieldId | null)
                                    : f,
                                ),
                              )
                            }
                            className={select}
                          >
                            <option value="">Don’t import</option>
                            {CASE_IMPORT_FIELDS.map((f) => (
                              <option
                                key={f.id}
                                value={f.id}
                                disabled={
                                  usedFields.has(f.id) && mapping[col] !== f.id
                                }
                              >
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </details>

            {preview && preview.valuesToMatch.length > 0 && (
              <section className={panel} aria-labelledby="values-h">
                <h2 id="values-h" className="text-base font-semibold">
                  3. Values to match
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  These values are not written the way the system expects.
                  Choose what each one means; your choice applies to every row
                  with that value.
                </p>
                <ValuesToMatch
                  values={preview.valuesToMatch}
                  staff={staff}
                  onChoose={(field, value, to) =>
                    setValueMaps((maps) => ({
                      ...maps,
                      [field]: { ...maps[field], [value]: to },
                    }))
                  }
                />
              </section>
            )}

            <section aria-labelledby="rows-h" className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="rows-h" className="mr-auto text-base font-semibold">
                  {preview?.valuesToMatch.length ? '4.' : '3.'} Check the rows
                  <span
                    aria-live="polite"
                    className="ml-2 text-sm font-normal text-gray-600"
                  >
                    {checking ? 'Checking…' : ''}
                  </span>
                </h2>
                <SegmentedControl mode={mode} onChange={setMode} />
              </div>
              {checkError && (
                <p role="alert" className="text-sm text-status-amber-text">
                  {checkError}
                </p>
              )}
              {s && (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Show rows"
                >
                  {(
                    [
                      ['all', `All rows (${s.total})`],
                      ['import', `To import (${s.toImport})`],
                      [
                        'warning',
                        `To import, worth a look (${s.withWarnings})`,
                      ],
                      ['duplicate', `Already there (${s.duplicates})`],
                      ['problem', `Need fixing (${s.problems})`],
                    ] as const
                  ).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={filter === id}
                      onClick={() => {
                        setFilter(id);
                        setShown(PAGE);
                      }}
                      className={`rounded-full border px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                        filter === id
                          ? 'border-resend-purple bg-resend-purple text-white'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}

              {preview && (
                <div className="relative overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Row</th>
                        <th className="px-3 py-2">
                          <span className="sr-only">Details</span>
                        </th>
                        <th className="px-3 py-2 font-semibold">Outcome</th>
                        {fields.map((f) => (
                          <th
                            key={f}
                            className="whitespace-nowrap px-3 py-2 font-semibold"
                          >
                            {label(f)}
                          </th>
                        ))}
                        <th className="px-3 py-2 font-semibold">Client</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.slice(0, shown).map((r) => {
                        const open = openRow === r.rowNumber;
                        const warnings = r.issues.length;
                        return (
                          <Fragment key={r.rowNumber}>
                            <tr className={open ? 'bg-gray-50' : undefined}>
                              <td className="px-3 py-2 text-gray-600">
                                {r.rowNumber}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  onClick={() =>
                                    setOpenRow(open ? null : r.rowNumber)
                                  }
                                  className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                                >
                                  {open ? 'Hide' : 'More'}
                                  {warnings > 0 && !open && ` (${warnings})`}
                                  <span className="sr-only">
                                    {' '}
                                    about row {r.rowNumber}
                                  </span>
                                </button>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${OUTCOME[r.outcome].style}`}
                                >
                                  {OUTCOME[r.outcome].text}
                                </span>
                              </td>
                              {fields.map((f) => (
                                <td
                                  key={f}
                                  className={`px-3 py-2 ${f === 'notes' ? 'max-w-xs truncate' : 'whitespace-nowrap'}`}
                                  title={f === 'notes' ? r.shown[f] : undefined}
                                >
                                  {display(f, r.shown[f]) ?? (
                                    <span className="text-gray-500">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                                {r.clientNote ?? '—'}
                              </td>
                            </tr>
                            {open && (
                              <tr className="bg-gray-50">
                                <td
                                  colSpan={fields.length + 4}
                                  className="px-3 pb-3"
                                >
                                  {/* Kept in view however far the table is scrolled sideways. */}
                                  <div className="sticky left-3 w-[min(calc(100vw-5rem),64rem)]">
                                    <RowDetails row={r} mapping={mapping} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {rows.length === 0 && (
                    <p className="p-3 text-sm text-gray-600">
                      No rows to show.
                    </p>
                  )}
                  {rows.length > shown && (
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + PAGE)}
                      className="m-3 text-sm text-resend-purple hover:underline"
                    >
                      Show more ({rows.length - shown} more)
                    </button>
                  )}
                </div>
              )}
            </section>

            {s && (
              <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-white py-3">
                <span className="mr-auto text-sm text-gray-600">
                  {s.toImport} of {s.total} rows ready to import
                  {s.existingClients > 0 &&
                    ` (${s.existingClients} for clients already on the system)`}
                  .
                </span>
                {importNow.isError && (
                  <p role="alert" className="text-sm text-status-amber-text">
                    {errorText(importNow.error)}
                  </p>
                )}
                <button
                  type="button"
                  disabled={s.toImport === 0 || checking}
                  onClick={() => setConfirming(true)}
                  className="rounded-md bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  Import {s.toImport} cases…
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {confirming && s && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-h"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !importNow.isPending)
              setConfirming(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
            <h2 id="confirm-h" className="text-base font-semibold">
              Import {s.toImport} cases?
            </h2>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
              <li>
                Each case gets its own reference and appears in the case list
                straight away. You can edit it afterwards like any other.
              </li>
              {s.problems > 0 && (
                <li>
                  {s.problems} rows that need fixing are not imported. Fix them
                  in the spreadsheet and import the file again later: rows
                  already imported are skipped.
                </li>
              )}
              {s.duplicates > 0 && (
                <li>{s.duplicates} rows already on the system are skipped.</li>
              )}
              <li>The import is recorded in the audit trail.</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importNow.isPending}
                onClick={() => importNow.mutate()}
                className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                {importNow.isPending ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The choices for a value the system did not recognise. */
function ValuesToMatch({
  values,
  staff,
  onChoose,
}: {
  values: CaseImportValueToMatch[];
  staff: { id: string; displayName: string }[];
  onChoose: (field: CaseImportFieldId, value: string, to: string) => void;
}) {
  const options = (field: CaseImportFieldId): [string, string][] => {
    const def = FIELD.get(field);
    if (field === 'allocatedTo')
      return [
        ...OWNER_QUEUE_VALUES.map((q): [string, string] => [
          `queue:${q}`,
          `${q} queue`,
        ]),
        ...staff.map((u): [string, string] => [`user:${u.id}`, u.displayName]),
      ];
    if (field === 'dealingShadow')
      return [
        ['', 'Leave blank'],
        ...staff.map((u): [string, string] => [u.id, u.displayName]),
      ];
    if (field === 'team')
      return [
        ['', 'Leave blank'],
        ...TEAM_VALUES.map((t): [string, string] => [t, t]),
      ];
    const vocab = (
      def && 'values' in def ? def.values : []
    ) as readonly string[];
    return [
      // A case always has a status, so there is no "leave blank" for it.
      ...(field === 'status' ? [] : [['', 'Leave blank'] as [string, string]]),
      ...vocab.map((v): [string, string] => [v, v]),
    ];
  };
  return (
    <table className="mt-2 text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-gray-600">
          <th className="py-1 pr-6 font-semibold">Field</th>
          <th className="py-1 pr-6 font-semibold">In your list</th>
          <th className="py-1 pr-6 font-semibold">Rows</th>
          <th className="py-1 font-semibold">Means</th>
        </tr>
      </thead>
      <tbody>
        {values.map((v) => (
          <tr key={`${v.field}:${v.value}`}>
            <td className="py-0.5 pr-6 text-gray-600">{label(v.field)}</td>
            <td className="py-0.5 pr-6 font-medium">{v.value}</td>
            <td className="py-0.5 pr-6 text-gray-600">{v.count}</td>
            <td className="py-0.5">
              <select
                aria-label={`${label(v.field)} “${v.value}” means`}
                value={v.matchedTo ?? '__choose__'}
                onChange={(e) => onChoose(v.field, v.value, e.target.value)}
                className={`${select} ${v.matchedTo === null ? 'border-status-amber' : ''}`}
              >
                <option value={'__choose__'} disabled>
                  Choose…
                </option>
                {options(v.field).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One row in full: what to look at, and each value as written and as imported. */
function RowDetails({
  row,
  mapping,
}: {
  row: ImportPreview['rows'][number];
  mapping: (CaseImportFieldId | null)[];
}) {
  const fields = CASE_IMPORT_FIELDS.map(
    (f) => f.id as CaseImportFieldId,
  ).filter((f) => mapping.includes(f) && (row.raw[f] || row.shown[f]));
  return (
    <div className="grid gap-4 pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          To look at
        </h3>
        {row.issues.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing — this row is ready.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {row.issues.map((i, n) => (
              <li key={n}>
                <span
                  className={`mr-1 font-semibold ${i.level === 'problem' ? 'text-status-amber-text' : 'text-resend-ink'}`}
                >
                  {i.level === 'problem' ? 'Fix:' : 'Note:'}
                </span>
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-sm">
        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Field
        </dt>
        <dd className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          In your list
        </dd>
        <dd className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          Imported as
        </dd>
        {fields.map((f) => (
          <Fragment key={f}>
            <dt className="text-gray-600">{label(f)}</dt>
            <dd className="whitespace-pre-wrap break-words">
              {row.raw[f] ?? '—'}
            </dd>
            <dd className="whitespace-pre-wrap break-words">
              {display(f, row.shown[f]) ?? (
                <span className="text-gray-500">blank</span>
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
