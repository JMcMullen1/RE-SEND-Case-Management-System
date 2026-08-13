import { useEffect, useState } from 'react';
import {
  formatCivilDate,
  relativeSince,
  NOTE_KIND_LABELS,
  type NoteKind,
  type NoteTimelineItem,
  type TimelineItem,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { useTimeline, type useCaseMutations } from '../../hooks/useCaseScreen';

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
  /** Restrict to one kind, or omit for the combined "All" stream. */
  kind?: NoteKind;
}) {
  const [author, setAuthor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [draft, setDraft] = useState('');

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
  // The combined "All" stream has no kind of its own, so new entries there
  // default to a case note — matching the original single timeline.
  const addKind: NoteKind = kind ?? 'note';

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
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!draft.trim() || mutations.addNote.isPending}
            onClick={() =>
              mutations.addNote.mutate(
                { body: draft.trim(), kind: addKind },
                { onSuccess: () => setDraft('') },
              )
            }
            className="rounded-lg bg-resend-purple px-4 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Add {singular}
          </button>
        </div>
      </div>

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
            {kind === 'billable'
              ? 'No billables yet.'
              : kind === 'note'
                ? 'No case notes yet.'
                : 'No entries yet.'}
          </p>
        )}
        <ul className="divide-y divide-gray-100">
          {items.map((item) => (
            <TimelineRow
              key={`${item.type}:${item.id}`}
              item={item}
              today={today}
              onEdit={(body) =>
                mutations.editNote.mutate({ id: item.id, body })
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TimelineRow({
  item,
  today,
  onEdit,
}: {
  item: TimelineItem;
  today: string;
  onEdit: (body: string) => void;
}) {
  if (item.type === 'note')
    return <NoteRow item={item} today={today} onEdit={onEdit} />;
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
}: {
  item: NoteTimelineItem;
  today: string;
  onEdit: (body: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);

  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-gray-500">
          <span className="mr-1.5 rounded bg-resend-purple px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
            {NOTE_KIND_LABELS[item.kind]}
          </span>
          <span className="font-medium text-resend-ink">
            {formatCivilDate(item.occurredOn)}
          </span>{' '}
          · {item.authorName ?? 'Unknown'} ·{' '}
          {relativeSince(item.occurredOn, today)}
          {item.edited && <span className="ml-1 text-gray-400">(edited)</span>}
        </p>
        {item.canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(item.body);
              setEditing(true);
            }}
            className="text-xs text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="Edit note"
            className="w-full rounded border border-gray-200 p-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (draft.trim()) onEdit(draft.trim());
                setEditing(false);
              }}
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
