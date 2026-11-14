import { useId, useState } from 'react';
import {
  SCHOOL_CONTACT_ROLE_SUGGESTIONS,
  type SchoolContact,
} from '@re-send/shared';
import {
  addContact,
  removeContact,
  updateContact,
  type ContactInput,
} from '../../api/schools';

const input =
  'mt-0.5 block w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

const EMPTY: ContactInput = {
  name: '',
  role: null,
  email: null,
  phone: null,
  notes: null,
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Named contacts at a school: add, edit and remove (when allowed). */
export function ContactsEditor({
  schoolId,
  contacts,
  canEdit,
  onChanged,
}: {
  schoolId: string;
  contacts: SchoolContact[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setError(null);
    try {
      await removeContact(id);
      setConfirmRemove(null);
      onChanged();
    } catch (e) {
      setError(`Not removed: ${errorText(e)}`);
    }
  };

  return (
    <div>
      {contacts.length === 0 && editing !== 'new' && (
        <p className="text-sm text-gray-500">No contacts yet.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {contacts.map((c) =>
          editing === c.id ? (
            <li key={c.id} className="py-2">
              <ContactForm
                initial={c}
                submitLabel="Save"
                onSubmit={async (v) => {
                  await updateContact(c.id, v);
                  setEditing(null);
                  onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={c.id}
              className="flex items-start justify-between gap-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-resend-ink">
                  {c.name}
                  {c.role && (
                    <span className="ml-1.5 font-normal text-gray-600">
                      · {c.role}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="text-resend-purple hover:underline"
                    >
                      {c.email}
                    </a>
                  )}
                  {c.email && c.phone && ' · '}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone.replace(/\s+/g, '')}`}
                      className="text-resend-purple hover:underline"
                    >
                      {c.phone}
                    </a>
                  )}
                </p>
                {c.notes && <p className="text-xs text-gray-500">{c.notes}</p>}
              </div>
              {canEdit && (
                <span className="flex shrink-0 gap-3 text-xs">
                  {confirmRemove === c.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void remove(c.id)}
                        className="font-semibold text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
                      >
                        Yes, remove {c.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(null)}
                        className="text-gray-600 hover:underline"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(c.id)}
                        aria-label={`Edit ${c.name}`}
                        className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(c.id)}
                        aria-label={`Remove ${c.name}`}
                        className="text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </span>
              )}
            </li>
          ),
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-xs text-status-amber">
          {error}
        </p>
      )}
      {canEdit &&
        (editing === 'new' ? (
          <div className="mt-2 rounded-md border border-gray-200 p-3">
            <ContactForm
              initial={EMPTY}
              submitLabel="Add contact"
              onSubmit={async (v) => {
                await addContact(schoolId, v);
                setEditing(null);
                onChanged();
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="mt-2 text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            + Add a contact
          </button>
        ))}
    </div>
  );
}

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ContactInput;
  submitLabel: string;
  onSubmit: (v: ContactInput) => Promise<void>;
  onCancel: () => void;
}) {
  const listId = useId();
  const [v, setV] = useState<ContactInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof ContactInput, value: string) =>
    setV((p) => ({
      ...p,
      [k]: k === 'name' ? value : value.trim() ? value : null,
    }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) return;
        setBusy(true);
        setError(null);
        onSubmit({ ...v, name: v.name.trim() })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
      className="grid gap-2 sm:grid-cols-2"
    >
      <label className="block text-xs text-gray-600">
        Name <span className="text-status-amber">*</span>
        <input
          value={v.name}
          onChange={(e) => set('name', e.target.value)}
          required
          autoFocus
          className={input}
        />
      </label>
      <label className="block text-xs text-gray-600">
        Role
        <input
          value={v.role ?? ''}
          onChange={(e) => set('role', e.target.value)}
          list={listId}
          placeholder="e.g. SENCo"
          className={input}
        />
        <datalist id={listId}>
          {SCHOOL_CONTACT_ROLE_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </label>
      <label className="block text-xs text-gray-600">
        Email
        <input
          type="email"
          value={v.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-xs text-gray-600">
        Phone
        <input
          value={v.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
          className={input}
        />
      </label>
      <label className="block text-xs text-gray-600 sm:col-span-2">
        Notes
        <input
          value={v.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          className={input}
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-status-amber sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !v.name.trim()}
          className="rounded-md bg-resend-purple px-2.5 py-1 text-xs font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
