import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  OWNER_QUEUE_VALUES,
  PRODUCT_NAME,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  USER_ROLE_VALUES,
  isPlausibleEmail,
  type OwnerQueue,
  type StaffMember,
  type UserRole,
} from '@re-send/shared';
import {
  EXPORT_URL,
  addStaff,
  bringBack,
  fetchStaff,
  markLeaver,
  updateStaff,
  type Handover,
} from '../../api/admin';
import { useMe } from '../../hooks/useCaseData';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const input =
  'mt-0.5 block w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

/**
 * Staff administration (admins only): joiners, role changes and leavers are
 * an admin action here, never a deploy. Every staff picker in the system is
 * built from this list. Also the charity's full data export.
 */
export function StaffPage() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const staff = useQuery({
    queryKey: ['admin-staff'],
    queryFn: fetchStaff,
    enabled: isAdmin,
  });
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<StaffMember | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-staff'] });
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['people'] });
    void qc.invalidateQueries({ queryKey: ['cases'] });
  };
  const list = staff.data?.staff ?? [];
  const active = list.filter((s) => s.active);
  const left = list.filter((s) => !s.active);

  return (
    <div className="min-h-screen bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              {PRODUCT_NAME} staff
            </h1>
            <p className="text-xs text-gray-500">
              Joiners, roles and leavers, and the full data export
            </p>
          </div>
          <a
            href="/admin/rates"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Staff rates
          </a>
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-6">
        {me.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {me.data && !isAdmin && (
          <p className="text-sm text-gray-600">
            Only an admin can manage staff and export data.
          </p>
        )}
        {isAdmin && (
          <>
            {notice && (
              <p
                role="status"
                className="flex items-center justify-between rounded-md border border-resend-green px-3 py-2 text-sm"
              >
                {notice}
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                  className="text-gray-500 hover:text-resend-ink"
                >
                  ×
                </button>
              </p>
            )}

            <section aria-labelledby="staff-h" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 id="staff-h" className="text-base font-semibold">
                  Staff ({active.length})
                </h2>
                {!adding && (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="rounded-lg bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  >
                    Add a person
                  </button>
                )}
              </div>
              {adding && (
                <AddPerson
                  onDone={(added) => {
                    setAdding(false);
                    if (added) {
                      setNotice(
                        `${added.displayName} has been added and can now sign in. They appear in every staff list straight away.`,
                      );
                      refresh();
                    }
                  }}
                />
              )}
              {staff.isLoading && (
                <p className="text-sm text-gray-500">Loading…</p>
              )}
              <StaffTable
                rows={active}
                meId={me.data?.id}
                onChanged={refresh}
                onLeave={setLeaving}
              />
            </section>

            {left.length > 0 && (
              <section aria-labelledby="left-h" className="space-y-3">
                <h2 id="left-h" className="text-base font-semibold">
                  Left ({left.length})
                </h2>
                <p className="text-sm text-gray-600">
                  People who have left cannot sign in and are not offered in
                  staff lists. Their notes, time and approvals stay attributed
                  to them.
                </p>
                <StaffTable
                  rows={left}
                  meId={me.data?.id}
                  onChanged={refresh}
                  onLeave={setLeaving}
                />
              </section>
            )}

            <ExportPanel />
          </>
        )}
      </main>

      {leaving && (
        <LeaverDialog
          person={leaving}
          colleagues={active.filter((s) => s.id !== leaving.id)}
          onClose={(result) => {
            setLeaving(null);
            if (result) {
              setNotice(
                `${result.name} has been marked as having left and signed out.${
                  result.handedOver
                    ? ` ${result.handedOver} open case${result.handedOver === 1 ? ' was' : 's were'} handed over.`
                    : ''
                }`,
              );
              refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function StaffTable({
  rows,
  meId,
  onChanged,
  onLeave,
}: {
  rows: StaffMember[];
  meId: string | undefined;
  onChanged: () => void;
  onLeave: (person: StaffMember) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="py-2 font-medium">Name</th>
          <th className="py-2 font-medium">Role</th>
          <th className="py-2 font-medium">Open cases</th>
          <th className="py-2 font-medium">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((s) => (
          <StaffRow
            key={s.id}
            person={s}
            isMe={s.id === meId}
            onChanged={onChanged}
            onLeave={() => onLeave(s)}
          />
        ))}
      </tbody>
    </table>
  );
}

function StaffRow({
  person,
  isMe,
  onChanged,
  onLeave,
}: {
  person: StaffMember;
  isMe: boolean;
  onChanged: () => void;
  onLeave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.displayName);
  const [email, setEmail] = useState(person.email);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateStaff>[1]) =>
      updateStaff(person.id, patch),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: (e) => setError(errorText(e)),
  });
  const restore = useMutation({
    mutationFn: () => bringBack(person.id),
    onSuccess: onChanged,
    onError: (e) => setError(errorText(e)),
  });

  return (
    <tr className="align-top">
      <td className="py-3 pr-4">
        {editing ? (
          <div className="grid max-w-sm gap-2">
            <label className="text-xs text-gray-600">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </label>
            <label className="text-xs text-gray-600">
              Email (used to sign in)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={
                  !name.trim() || !isPlausibleEmail(email) || save.isPending
                }
                onClick={() =>
                  save.mutate({
                    displayName:
                      name.trim() !== person.displayName ? name : undefined,
                    email: email.trim() !== person.email ? email : undefined,
                  })
                }
                className="rounded-md bg-resend-purple px-2.5 py-1 text-xs font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setName(person.displayName);
                  setEmail(person.email);
                  setError(null);
                }}
                className="rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-medium">
              {person.displayName}
              {isMe && (
                <span className="ml-1 text-xs font-normal text-gray-500">
                  (you)
                </span>
              )}
            </p>
            <p className="text-xs text-gray-600">{person.email}</p>
          </>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-status-amber-text">
            {error}
          </p>
        )}
      </td>
      <td className="py-3 pr-4">
        {person.active ? (
          <select
            value={person.role}
            onChange={(e) => save.mutate({ role: e.target.value as UserRole })}
            aria-label={`Role for ${person.displayName}`}
            disabled={isMe}
            title={
              isMe
                ? 'Another admin must change your own role.'
                : USER_ROLE_DESCRIPTIONS[person.role]
            }
            className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {USER_ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {USER_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-600">{USER_ROLE_LABELS[person.role]}</span>
        )}
      </td>
      <td className="py-3 pr-4 tabular-nums">
        {person.openCaseCount > 0 ? (
          <a
            href={`/?staff=${person.id}`}
            className="text-resend-purple hover:underline"
          >
            {person.openCaseCount}
          </a>
        ) : (
          <span className="text-gray-500">0</span>
        )}
      </td>
      <td className="py-3 text-right text-sm">
        {person.active ? (
          <span className="inline-flex gap-3">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${person.displayName}`}
                className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Edit
              </button>
            )}
            {!isMe && (
              <button
                type="button"
                onClick={onLeave}
                aria-label={`Mark ${person.displayName} as having left`}
                className="text-status-amber-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
              >
                Mark as left
              </button>
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => restore.mutate()}
            aria-label={`Bring ${person.displayName} back`}
            className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Bring back
          </button>
        )}
      </td>
    </tr>
  );
}

function AddPerson({
  onDone,
}: {
  onDone: (added: StaffMember | null) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('caseworker');
  const add = useMutation({
    mutationFn: () => addStaff({ displayName: name, email, role }),
    onSuccess: (added) => onDone(added),
  });
  const valid = name.trim() && isPlausibleEmail(email);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) add.mutate();
      }}
      className="grid gap-3 rounded-lg border border-resend-purple p-4 sm:grid-cols-3"
    >
      <label className="text-xs text-gray-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          className={input}
        />
      </label>
      <label className="text-xs text-gray-600">
        Work email (used to sign in)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={input}
        />
      </label>
      <label className="text-xs text-gray-600">
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className={input}
        >
          {USER_ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {USER_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-gray-600 sm:col-span-3">
        {USER_ROLE_LABELS[role]}: {USER_ROLE_DESCRIPTIONS[role]}
      </p>
      {add.isError && (
        <p
          role="alert"
          className="text-sm text-status-amber-text sm:col-span-3"
        >
          {errorText(add.error)}
        </p>
      )}
      <div className="flex justify-end gap-2 sm:col-span-3">
        <button
          type="button"
          onClick={() => onDone(null)}
          className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || add.isPending}
          className="rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {add.isPending ? 'Adding…' : 'Add person'}
        </button>
      </div>
    </form>
  );
}

function LeaverDialog({
  person,
  colleagues,
  onClose,
}: {
  person: StaffMember;
  colleagues: StaffMember[];
  onClose: (result: { name: string; handedOver: number } | null) => void;
}) {
  const hasCases = person.openCaseCount > 0;
  const [choice, setChoice] = useState<string>(
    hasCases ? `queue:${OWNER_QUEUE_VALUES[0]}` : 'none',
  );
  const handover = (): Handover =>
    choice.startsWith('queue:')
      ? { kind: 'queue', queue: choice.slice(6) as OwnerQueue }
      : choice.startsWith('user:')
        ? { kind: 'user', userId: choice.slice(5) }
        : { kind: 'none' };
  const leave = useMutation({
    mutationFn: () => markLeaver(person.id, handover()),
    onSuccess: (res) =>
      onClose({ name: person.displayName, handedOver: res.casesHandedOver }),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaver-title"
    >
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
        <h2 id="leaver-title" className="text-base font-semibold">
          Mark {person.displayName} as having left?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          They are signed out straight away, can no longer sign in, and are no
          longer offered in staff lists. Their notes, time and approvals stay
          attributed to them. You can bring them back later.
        </p>
        {hasCases ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-resend-ink">
              They own {person.openCaseCount} open case
              {person.openCaseCount === 1 ? '' : 's'}. Hand{' '}
              {person.openCaseCount === 1 ? 'it' : 'them'} to:
            </legend>
            <div className="mt-2 space-y-1.5 text-sm">
              {OWNER_QUEUE_VALUES.map((q) => (
                <label key={q} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="handover"
                    checked={choice === `queue:${q}`}
                    onChange={() => setChoice(`queue:${q}`)}
                  />
                  The {q} queue (unassigned, highlighted on the case list)
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="handover"
                  checked={choice.startsWith('user:')}
                  onChange={() => setChoice(`user:${colleagues[0]?.id ?? ''}`)}
                  disabled={colleagues.length === 0}
                />
                A colleague:
                <select
                  value={choice.startsWith('user:') ? choice.slice(5) : ''}
                  onChange={(e) => setChoice(`user:${e.target.value}`)}
                  aria-label="Colleague to hand cases to"
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-sm"
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {colleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="handover"
                  checked={choice === 'none'}
                  onChange={() => setChoice('none')}
                />
                Leave them with {person.displayName} for now
              </label>
            </div>
          </fieldset>
        ) : (
          <p className="mt-3 text-sm text-gray-600">
            They have no open cases to hand over.
          </p>
        )}
        {leave.isError && (
          <p role="alert" className="mt-3 text-sm text-status-amber-text">
            {errorText(leave.error)}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={leave.isPending || choice === 'user:'}
            onClick={() => leave.mutate()}
            className="rounded-md bg-status-amber px-3 py-1.5 text-sm font-semibold text-resend-ink hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
          >
            {leave.isPending ? 'Saving…' : `Mark as left`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportPanel() {
  return (
    <section
      aria-labelledby="export-h"
      className="rounded-lg border border-gray-200 p-4"
    >
      <h2 id="export-h" className="text-base font-semibold">
        Export all data
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Download everything the system holds — every record as a spreadsheet
        (CSV) file and every stored document — as one ZIP file, with a guide to
        what is inside. The charity’s data belongs to the charity: you can take
        a complete copy at any time.
      </p>
      <p className="mt-2 text-sm text-resend-ink">
        <strong>
          This file contains special category data about children.
        </strong>{' '}
        Save it only somewhere encrypted and access-controlled, and delete it
        when it is no longer needed. Each download is recorded.
      </p>
      <a
        href={EXPORT_URL}
        download
        className="mt-3 inline-block rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Download full export
      </a>
      <p className="mt-1 text-xs text-gray-600">
        A large document library takes a few minutes. Up to three downloads an
        hour.
      </p>
    </section>
  );
}
