import { useEffect, useState } from 'react';
import {
  formatCivilDate,
  formatMinutes,
  relativeSince,
  NOTE_KIND_LABELS,
  type NoteKind,
  type NoteTimelineItem,
  type TimelineItem,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import {
  useCaseTimeSummary,
  useTimeline,
  type useCaseMutations,
} from '../../hooks/useCaseScreen';
import { DurationField, recordedMinutes } from './DurationField';

type Mutations = ReturnType<typeof useCaseMutations>;

export function TimelineRegion({
  caseId,
  users,
  today,
  mutations,
  kind,
}: {
  caseId: string;
  users: UserSummary[];
  today: string;
  mutations: Mutations;
  kind: NoteKind;
}) {
  const [author, setAuthor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [draft, setDraft] = useState('');
  const [time, setTime] = useState('');
  const [triedSave, setTriedSave] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const timeline = useTimeline(caseId, {
    author: author || undefined,
    from: from || undefined,
    to: to || undefined,
    q: debounced || undefined,
    kind,
  });
  const items = timeline.data?.items ?? [];
  const singular = kind === 'billable' ? 'billable' : 'note';
  const billable = kind === 'billable';
  const minutes = billable ? recordedMinutes(time) : null;

  const add = () => {
    setTriedSave(true);
    if (!draft.trim() || (billable && minutes === null)) return;
    mutations.addNote.mutate(
      { body: draft.trim(), kind, minutes: minutes ?? undefined },
      {
        onSuccess: () => {
          setDraft('');
          setTime('');
          setTriedSave(false);
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Add a ${singular}. It will be stamped with today's date and your name.`}
          aria-label={`New ${singular}`}
          rows={3}
          className="w-full rounded-lg border border-gray-200 p-3 text-sm text-resend-ink placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          {billable ? (
            <DurationField
              value={time}
              onChange={setTime}
              showProblem={triedSave}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={!draft.trim() || mutations.addNote.isPending}
            onClick={add}
            className="rounded-lg bg-resend-purple px-4 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Add {singular}
          </button>
        </div>
      </div>

      {billable && <CaseTimeBar caseId={caseId} />}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          aria-label="Filter by author"
          className="rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          <option value="">All authors</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          className="rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          className="rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this case"
          aria-label="Search timeline"
          className="min-w-[160px] flex-1 rounded-md border border-gray-200 px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {timeline.isLoading && (
          <p className="text-sm text-gray-400">Loading…</p>
        )}
        {!timeline.isLoading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            {kind === 'billable' ? 'No billables yet.' : 'No case notes yet.'}
          </p>
        )}
        <ul className="divide-y divide-gray-100">
          {items.map((item) => (
            <TimelineRow
              key={`${item.type}:${item.id}`}
              item={item}
              today={today}
              onEdit={(patch) =>
                mutations.editNote.mutate({ id: item.id, ...patch })
              }
              onDelete={() => mutations.deleteNote.mutate(item.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

type NotePatch = { body?: string; minutes?: number };

function TimelineRow({
  item,
  today,
  onEdit,
  onDelete,
}: {
  item: TimelineItem;
  today: string;
  onEdit: (patch: NotePatch) => void;
  onDelete: () => void;
}) {
  if (item.type === 'note')
    return (
      <NoteRow item={item} today={today} onEdit={onEdit} onDelete={onDelete} />
    );
  // Registered-but-not-yet-emitted types render generically, so adding one is
  // additive rather than a rewrite.
  return (
    <li className="py-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">
        {item.type}
      </p>
      <p className="text-xs text-gray-500">
        {formatCivilDate(item.occurredOn)} · {item.authorName ?? 'System'}
      </p>
    </li>
  );
}

function NoteRow({
  item,
  today,
  onEdit,
  onDelete,
}: {
  item: NoteTimelineItem;
  today: string;
  onEdit: (patch: NotePatch) => void;
  onDelete: () => void;
}) {
  const billable = item.kind === 'billable';
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const [time, setTime] = useState('');
  const [triedSave, setTriedSave] = useState(false);
  const minutes = billable ? recordedMinutes(time) : null;
  const noun = billable ? 'billable' : 'note';

  const startEdit = () => {
    setDraft(item.body);
    setTime(item.minutes !== null ? formatMinutes(item.minutes) : '');
    setTriedSave(false);
    setEditing(true);
  };
  const save = () => {
    setTriedSave(true);
    if (!draft.trim()) return;
    if (billable && minutes === null) return;
    const patch = {
      body: draft.trim() !== item.body ? draft.trim() : undefined,
      minutes:
        billable && minutes !== item.minutes
          ? (minutes ?? undefined)
          : undefined,
    };
    if (patch.body !== undefined || patch.minutes !== undefined) onEdit(patch);
    setEditing(false);
  };

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500">
          <span className="mr-1.5 rounded bg-resend-purple px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            {NOTE_KIND_LABELS[item.kind]}
          </span>
          {billable && item.minutes !== null && (
            <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-resend-ink">
              {formatMinutes(item.minutes)}
            </span>
          )}
          {billable && item.minutes === null && (
            <span className="mr-1.5 rounded border border-status-amber px-1.5 py-0.5 text-[11px] font-medium text-resend-ink">
              No time recorded
            </span>
          )}
          <span className="font-medium text-resend-ink">
            {formatCivilDate(item.occurredOn)}
          </span>{' '}
          · {item.authorName ?? 'Unknown'} ·{' '}
          {relativeSince(item.occurredOn, today)}
          {item.edited && <span className="ml-1 text-gray-400">(edited)</span>}
        </p>
        {item.canEdit && !editing && !confirmDelete && (
          <span className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={startEdit}
              className="text-xs text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              {billable && item.minutes === null ? 'Add time' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
            >
              Delete
            </button>
          </span>
        )}
      </div>
      {confirmDelete && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-amber bg-white px-3 py-2 text-sm"
        >
          <span className="text-resend-ink">
            Delete this {noun}
            {billable && item.minutes !== null ? ' and its time' : ''}? It is
            recoverable by an administrator and the deletion is recorded.
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              className="rounded-md bg-status-amber px-2 py-1 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
            >
              Yes, delete {noun}
            </button>
          </span>
        </div>
      )}
      {editing ? (
        <div className="mt-1 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label={`Edit ${noun}`}
            className="w-full rounded border border-gray-200 p-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          {billable && (
            <DurationField
              value={time}
              onChange={setTime}
              showProblem={triedSave}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="text-xs font-medium text-resend-purple"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-resend-ink">
          {item.body}
        </p>
      )}
    </li>
  );
}

/** Time recorded on the case, by person, and any billables still lacking time. */
function CaseTimeBar({ caseId }: { caseId: string }) {
  const { data } = useCaseTimeSummary(caseId);
  if (!data) return null;
  return (
    <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-sm">
      <p className="text-resend-ink">
        <span className="font-semibold">
          {formatMinutes(data.totalMinutes)}
        </span>{' '}
        recorded on this case
        {data.byPerson.length > 0 && (
          <span className="text-gray-500">
            {' '}
            ·{' '}
            {data.byPerson
              .map((p) => `${p.name} ${formatMinutes(p.minutes)}`)
              .join(' · ')}
          </span>
        )}
      </p>
      {data.missingTimeCount > 0 && (
        <p className="mt-0.5 text-xs text-resend-ink">
          <span className="font-medium text-status-amber">
            {data.missingTimeCount} billable
            {data.missingTimeCount === 1 ? ' has' : 's have'} no time recorded
          </span>{' '}
          — use “Add time” on each one below.
        </p>
      )}
    </div>
  );
}
