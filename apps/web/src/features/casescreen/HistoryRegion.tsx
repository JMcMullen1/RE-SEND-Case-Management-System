import { useMemo, useState } from 'react';
import {
  EMAIL_DIRECTION_LABELS,
  HISTORY_FILTER_LABELS,
  HISTORY_FILTER_VALUES,
  NOTE_KIND_SINGULAR,
  buildCaseHistory,
  filterCaseHistory,
  formatCivilDate,
  formatMinutes,
  type HistoryEntry,
  type HistoryFilter,
} from '@re-send/shared';
import { documentContentUrl } from '../../api/documents';
import {
  useDocuments,
  useEmails,
  useTimeline,
} from '../../hooks/useCaseScreen';

const chip = 'rounded px-1.5 py-0.5 text-[11px] font-medium';

/** How long an email body shows before "Show the whole email". */
const EMAIL_PREVIEW_LINES = 6;

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function NoteEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'note' }>;
}) {
  const n = entry.note;
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className={`${chip} bg-resend-purple text-white`}>
          {NOTE_KIND_SINGULAR[n.kind]}
        </span>
        {n.minutes !== null && <span>{formatMinutes(n.minutes)}</span>}
        <span>{n.authorName ?? 'Unknown'}</span>
        {n.edited && <span>(edited)</span>}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-resend-ink">
        {n.body}
      </p>
    </>
  );
}

function EmailEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'email' }>;
}) {
  const e = entry.email;
  const [open, setOpen] = useState(false);
  const lines = (e.bodyText ?? '').trim().split('\n');
  const long = lines.length > EMAIL_PREVIEW_LINES;
  const body =
    open || !long ? e.bodyText : lines.slice(0, EMAIL_PREVIEW_LINES).join('\n');
  const from = e.fromName || e.fromAddress || 'Unknown sender';
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span
          className={`${chip} border border-resend-purple text-resend-purple`}
        >
          Email · {EMAIL_DIRECTION_LABELS[e.direction]}
        </span>
        {e.sentAt && <span>{time(e.sentAt)}</span>}
        <span>
          From {from}
          {e.toAddresses.length > 0 && ` to ${e.toAddresses.join(', ')}`}
        </span>
      </p>
      <p className="mt-1 text-sm font-medium text-resend-ink">
        {e.subject || '(no subject)'}
      </p>
      {body && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
          {body}
          {long && !open && '…'}
        </p>
      )}
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {open ? 'Show less' : 'Show the whole email'}
        </button>
      )}
      {e.attachments.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2 text-xs">
          {e.attachments.map((a) => (
            <li key={a.documentId}>
              <a
                href={documentContentUrl(a.documentId)}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-gray-100 px-1.5 py-0.5 text-resend-ink hover:bg-gray-200"
              >
                <span aria-hidden="true">📎 </span>
                {a.originalFilename}
                <span className="sr-only">
                  {' '}
                  (attachment, opens in a new tab)
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DocumentEntry({
  entry,
}: {
  entry: Extract<HistoryEntry, { kind: 'document' }>;
}) {
  const d = entry.document;
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span className={`${chip} bg-gray-100 text-gray-700`}>
          Document · {d.category}
        </span>
        <span>
          {d.versionCount > 1 ? `Version ${d.version} uploaded` : 'Uploaded'} by{' '}
          {d.uploadedByName ?? 'Unknown'}
        </span>
      </p>
      <p className="mt-1 text-sm">
        <a
          href={documentContentUrl(d.id)}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-resend-purple hover:underline"
        >
          {d.originalFilename}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        {d.versionCount > 1 && (
          <span className="ml-1 text-xs text-gray-600">
            — earlier versions are in Documents
          </span>
        )}
      </p>
    </>
  );
}

/**
 * The case's whole story in one place: notes and billables, the emails filed
 * to it and its documents, in date order, grouped by day. Notes are written on
 * their own tabs; this is for reading the case start to finish.
 */
export function HistoryRegion({ caseId }: { caseId: string }) {
  const notes = useTimeline(caseId, {});
  const emails = useEmails(caseId);
  const documents = useDocuments(caseId);
  const [kinds, setKinds] = useState<HistoryFilter[]>([]);
  const [text, setText] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');

  const all = useMemo(
    () =>
      buildCaseHistory(
        {
          notes: (notes.data?.items ?? []).filter((i) => i.type === 'note'),
          emails: emails.data?.emails ?? [],
          documents: documents.data?.documents ?? [],
        },
        order,
      ),
    [notes.data, emails.data, documents.data, order],
  );
  const shown = useMemo(
    () => filterCaseHistory(all, { kinds, text }),
    [all, kinds, text],
  );
  const days = useMemo(() => {
    const groups: { date: string; entries: HistoryEntry[] }[] = [];
    for (const entry of shown) {
      const last = groups.at(-1);
      if (last && last.date === entry.date) last.entries.push(entry);
      else groups.push({ date: entry.date, entries: [entry] });
    }
    return groups;
  }, [shown]);

  const loading = notes.isLoading || emails.isLoading || documents.isLoading;
  const failed = notes.isError || emails.isError || documents.isError;
  const toggle = (k: HistoryFilter) =>
    setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {HISTORY_FILTER_VALUES.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kinds.includes(k)}
              onClick={() => toggle(k)}
              className={`rounded-full border px-3 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
                kinds.includes(k)
                  ? 'border-resend-purple bg-resend-purple text-white'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {HISTORY_FILTER_LABELS[k]}
            </button>
          ))}
        </div>
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Find in this case’s history</span>
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Find in the history"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <span className="sr-only">Order</span>
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <p role="status" className="text-xs text-gray-600">
        {loading
          ? 'Loading the history…'
          : failed
            ? 'Part of the history could not be loaded. Try again shortly.'
            : all.length === 0
              ? 'Nothing on this case yet: notes, emails and documents will appear here as they are added.'
              : shown.length === all.length
                ? `${all.length} entr${all.length === 1 ? 'y' : 'ies'}.`
                : `${shown.length} of ${all.length} entries shown.`}
      </p>

      <ol className="space-y-5">
        {days.map((day) => (
          <li key={day.date}>
            <h3 className="sticky top-0 z-10 bg-white py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {formatCivilDate(day.date)}
            </h3>
            <ol className="space-y-3 border-l-2 border-gray-100 pl-4">
              {day.entries.map((entry) => (
                <li key={entry.key}>
                  {entry.kind === 'note' ? (
                    <NoteEntry entry={entry} />
                  ) : entry.kind === 'email' ? (
                    <EmailEntry entry={entry} />
                  ) : (
                    <DocumentEntry entry={entry} />
                  )}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
