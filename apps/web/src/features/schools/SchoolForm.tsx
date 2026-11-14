import { useId, useState } from 'react';
import {
  SCHOOL_FUNDING_LABELS,
  SCHOOL_FUNDING_VALUES,
  SCHOOL_PROVISION_LABELS,
  SCHOOL_PROVISION_VALUES,
  schoolFactsLine,
  schoolFieldsProblem,
  type SchoolFields,
  type SchoolFunding,
  type SchoolProvision,
  type SchoolSummary,
} from '@re-send/shared';
import { createSchool } from '../../api/schools';

export const EMPTY_SCHOOL: SchoolFields = {
  name: '',
  urn: null,
  address: null,
  postcode: null,
  localAuthority: null,
  phone: null,
  email: null,
  website: null,
  funding: null,
  provision: null,
  section41: false,
  ageFrom: null,
  ageTo: null,
  notes: null,
};

const input =
  'mt-0.5 block w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * The facts about a school, for adding or editing. Only the name is required;
 * everything else can be filled in as it becomes known.
 */
export function SchoolForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: SchoolFields;
  submitLabel: string;
  onSubmit: (fields: SchoolFields) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [f, setF] = useState<SchoolFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SchoolFields>(k: K, v: SchoolFields[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));
  const text = (v: string) => (v.trim() ? v : null);
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const submit = async () => {
    const problem = schoolFieldsProblem(f);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(f);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: keyof SchoolFields,
    label: string,
    props: { type?: string; span2?: boolean } = {},
  ) => (
    <label
      className={`block text-xs text-gray-600 ${props.span2 ? 'sm:col-span-2' : ''}`}
    >
      {label}
      <input
        type={props.type ?? 'text'}
        value={(f[key] as string | number | null) ?? ''}
        onChange={(e) =>
          set(
            key,
            (props.type === 'number'
              ? num(e.target.value)
              : key === 'name'
                ? e.target.value
                : text(e.target.value)) as never,
          )
        }
        className={input}
      />
    </label>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-3"
      aria-labelledby={`${id}-title`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-gray-600 sm:col-span-2">
          School name <span className="text-status-amber">*</span>
          <input
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
            required
            autoFocus
            className={input}
          />
        </label>
        {field('urn', 'URN (DfE reference)')}
        {field('localAuthority', 'Local authority')}
        {field('address', 'Address', { span2: true })}
        {field('postcode', 'Postcode')}
        {field('phone', 'Phone')}
        {field('email', 'Email', { type: 'email' })}
        {field('website', 'Website')}
        <label className="block text-xs text-gray-600">
          Type of school
          <select
            value={f.funding ?? ''}
            onChange={(e) =>
              set('funding', (e.target.value || null) as SchoolFunding | null)
            }
            className={input}
          >
            <option value="">Not known</option>
            {SCHOOL_FUNDING_VALUES.map((v) => (
              <option key={v} value={v}>
                {SCHOOL_FUNDING_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-gray-600">
          Provision
          <select
            value={f.provision ?? ''}
            onChange={(e) =>
              set(
                'provision',
                (e.target.value || null) as SchoolProvision | null,
              )
            }
            className={input}
          >
            <option value="">Not known</option>
            {SCHOOL_PROVISION_VALUES.map((v) => (
              <option key={v} value={v}>
                {SCHOOL_PROVISION_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {field('ageFrom', 'Age from', { type: 'number' })}
          {field('ageTo', 'Age to', { type: 'number' })}
        </div>
        <label className="flex items-center gap-2 self-end pb-1 text-sm text-resend-ink">
          <input
            type="checkbox"
            checked={f.section41}
            onChange={(e) => set('section41', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
          />
          On the Section 41 list
        </label>
        <label className="block text-xs text-gray-600 sm:col-span-2">
          Notes
          <textarea
            value={f.notes ?? ''}
            onChange={(e) => set('notes', text(e.target.value))}
            rows={2}
            className={input}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-status-amber">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !f.name.trim()}
          className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * Add a school, in a dialog. If it looks like one already in the directory,
 * the person is shown the match and can use it instead — or add theirs anyway
 * if it really is a different school.
 */
export function AddSchoolDialog({
  initialName = '',
  onAdded,
  onClose,
  pickLabel = 'Use this school',
}: {
  initialName?: string;
  /** Called with the new school, or the existing one the person chose. */
  onAdded: (school: SchoolSummary) => void;
  onClose: () => void;
  pickLabel?: string;
}) {
  const [duplicates, setDuplicates] = useState<SchoolSummary[] | null>(null);
  const [pending, setPending] = useState<SchoolFields | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (fields: SchoolFields, force = false) => {
    const res = await createSchool(fields, force);
    if ('duplicates' in res) {
      setPending(fields);
      setDuplicates(res.duplicates);
      return;
    }
    onAdded(res.school);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-school-title"
    >
      <div className="my-8 w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
        <h2
          id="add-school-title"
          className="mb-4 text-base font-semibold text-resend-ink"
        >
          {duplicates ? 'Is it one of these?' : 'Add a school'}
        </h2>
        {duplicates ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              This looks like a school already in the directory. Using the
              existing one keeps every case pointing at the same record.
            </p>
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {duplicates.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-resend-ink">
                      {d.name}
                      {d.archived && (
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          (archived)
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[d.urn && `URN ${d.urn}`, d.postcode, schoolFactsLine(d)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {!d.archived && (
                    <button
                      type="button"
                      onClick={() => onAdded(d)}
                      className="shrink-0 rounded-md bg-resend-purple px-3 py-1 text-xs font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                    >
                      {pickLabel}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-sm text-status-amber">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicates(null)}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!pending) return;
                  setBusy(true);
                  setError(null);
                  save(pending, true)
                    .catch((e: unknown) => setError(errorText(e)))
                    .finally(() => setBusy(false));
                }}
                className="rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                No, it’s a different school — add it
              </button>
            </div>
          </div>
        ) : (
          <SchoolForm
            initial={pending ?? { ...EMPTY_SCHOOL, name: initialName }}
            submitLabel="Add school"
            onSubmit={(fields) => save(fields)}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
