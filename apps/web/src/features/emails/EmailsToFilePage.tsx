import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMAIL_FILING_ROLES,
  EMAIL_MATCH_REASON_LABELS,
  defaultViewState,
  isEmailFile,
  type EmailCaseSuggestion,
  type EmailInboxItem,
  type EmailIntakeResult,
  type EmailMatchReason,
} from '@re-send/shared';
import { fetchCases } from '../../api/client';
import {
  dismissInboxItem,
  fetchInbox,
  fetchInboxText,
  fileInboxItem,
  intakeEmail,
} from '../../api/email-inbox';
import { useMe } from '../../hooks/useCaseData';
import { collectDroppedFiles } from '../casescreen/DropZone';

const primary =
  'rounded-md bg-resend-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50';
const secondary =
  'rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50';
const quiet =
  'text-sm font-medium text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

/** "the client’s email address and the child’s name". */
function why(reasons: EmailMatchReason[]): string {
  const parts = reasons.map((r) => EMAIL_MATCH_REASON_LABELS[r]);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const caseLink = (caseId: string) => `/cases/${caseId}?tab=docs-emails`;

interface DropResult {
  key: string;
  filename: string;
  result?: EmailIntakeResult;
  error?: string;
}

/** One line per email just dropped in: where it went, or why not. */
function DropResults({
  results,
  onClear,
}: {
  results: DropResult[];
  onClear: () => void;
}) {
  if (!results.length) return null;
  return (
    <section aria-labelledby="results-h" className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 id="results-h" className="text-sm font-semibold">
          Just dropped in
        </h2>
        <button type="button" onClick={onClear} className={quiet}>
          Clear
        </button>
      </div>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {results.map((r) => (
          <li key={r.key} className="px-3 py-2 text-sm">
            <span className="font-medium">{r.filename}</span>
            <span className="block text-gray-700">
              {!r.result && !r.error && 'Matching…'}
              {r.error && (
                <span className="text-status-amber-text">{r.error}</span>
              )}
              {r.result?.outcome === 'filed' && (
                <>
                  Filed to{' '}
                  <a href={caseLink(r.result.caseId)} className={quiet}>
                    {r.result.caseReference}
                  </a>
                  {r.result.reasons.length > 0 &&
                    ` — matched by ${why(r.result.reasons)}`}
                  .
                </>
              )}
              {r.result?.outcome === 'duplicate' && (
                <>
                  Already filed on{' '}
                  <a href={caseLink(r.result.caseId)} className={quiet}>
                    {r.result.caseReference}
                  </a>
                  ; nothing new was added.
                </>
              )}
              {r.result?.outcome === 'queued' &&
                (r.result.item.suggestions.length > 1
                  ? `Could be one of ${r.result.item.suggestions.length} cases — choose below.`
                  : r.result.item.suggestions.length === 1
                    ? `Probably ${r.result.item.suggestions[0]!.caseReference}, but not certain enough to file by itself — check below.`
                    : 'No case matched — choose one below.')}
              {r.result?.outcome === 'already_waiting' &&
                'Already in the list below.'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Find any case by client, child or reference, to file to. */
function CasePicker({
  onPick,
  busy,
}: {
  onPick: (caseId: string) => void;
  busy: boolean;
}) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const found = useQuery({
    queryKey: ['cases', 'email-picker', term],
    queryFn: () => fetchCases({ ...defaultViewState(), search: term }, 0, 8),
    enabled: term.length >= 2,
  });
  return (
    <div className="mt-2 rounded-md border border-gray-200 p-2">
      <label className="block">
        <span className="sr-only">Find a case</span>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a case by client, child or reference"
          className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        />
      </label>
      {term.length >= 2 && (
        <ul className="mt-1 divide-y divide-gray-100 text-sm">
          {found.isLoading && <li className="py-1 text-gray-500">Finding…</li>}
          {found.data?.rows.length === 0 && (
            <li className="py-1 text-gray-500">No case matches.</li>
          )}
          {found.data?.rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate">
                {row.clientName ?? 'Unnamed client'}
                {row.childName && (
                  <span className="text-gray-500"> · {row.childName}</span>
                )}
                {row.status === 'Closed' && (
                  <span className="ml-1 text-xs text-gray-500">(closed)</span>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(row.id)}
                className={quiet}
              >
                File here
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({
  s,
  busy,
  onFile,
}: {
  s: EmailCaseSuggestion;
  busy: boolean;
  onFile: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={onFile}
        className={secondary}
      >
        File to {s.caseReference}
      </button>
      <span className="min-w-0 flex-1 text-sm">
        {s.clientName ?? 'Unnamed client'}
        {s.childName && <span className="text-gray-600"> · {s.childName}</span>}
        {s.closed && (
          <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
            Closed
          </span>
        )}
        <span className="block text-xs text-gray-600">
          Matched by {why(s.reasons)}
        </span>
      </span>
    </li>
  );
}

function InboxCard({
  item,
  canFile,
  onFiled,
}: {
  item: EmailInboxItem;
  canFile: boolean;
  onFiled: (subject: string, result: EmailIntakeResult) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const text = useQuery({
    // Not under 'email-inbox': refreshing the list must not re-read an
    // email that has just been filed.
    queryKey: ['email-inbox-text', item.id],
    queryFn: () => fetchInboxText(item.id),
    enabled: open,
  });
  const done = () => void qc.invalidateQueries({ queryKey: ['email-inbox'] });
  const file = useMutation({
    mutationFn: (caseId: string) => fileInboxItem(item.id, caseId),
    onSuccess: (result) => {
      onFiled(item.subject || '(no subject)', result);
      done();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => dismissInboxItem(item.id),
    onSuccess: done,
  });
  const busy = file.isPending || dismiss.isPending;
  const from = item.fromName || item.fromAddress || 'Unknown sender';

  return (
    <li className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-resend-ink">
        {item.subject || '(no subject)'}
      </h3>
      <p className="text-xs text-gray-600">
        From {from}
        {item.fromName && item.fromAddress && ` <${item.fromAddress}>`}
        {item.sentAt && ` · ${when(item.sentAt)}`} · added by{' '}
        {item.addedByName ?? 'someone'}
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`mt-1 ${quiet} text-xs`}
      >
        {open ? 'Hide the email' : 'Show the email'}
      </button>
      {open && (
        <div className="mt-2 rounded-md bg-gray-50 p-3 text-sm">
          {text.isLoading && <p className="text-gray-500">Loading…</p>}
          {text.isError && (
            <p className="text-status-amber-text">{errorText(text.error)}</p>
          )}
          {text.data && (
            <>
              <p className="text-xs text-gray-600">
                To {text.data.toAddresses.join(', ') || '—'}
                {text.data.ccAddresses.length > 0 &&
                  ` · Cc ${text.data.ccAddresses.join(', ')}`}
              </p>
              <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-resend-ink">
                {text.data.bodyText.trim() || '(no text)'}
              </p>
              {text.data.attachmentNames.length > 0 && (
                <p className="mt-2 text-xs text-gray-600">
                  Attachments: {text.data.attachmentNames.join(', ')}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {canFile && (
        <div className="mt-3">
          {item.suggestions.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Likely cases
              </p>
              <ul className="divide-y divide-gray-100">
                {item.suggestions.map((s) => (
                  <SuggestionRow
                    key={s.caseId}
                    s={s}
                    busy={busy}
                    onFile={() => file.mutate(s.caseId)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Nothing on this email matched a case.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-4">
            <button
              type="button"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
              className={quiet}
            >
              {item.suggestions.length ? 'Another case…' : 'Choose a case…'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Remove this email from the list without filing it? Its file is deleted.',
                  )
                )
                  dismiss.mutate();
              }}
              className="text-sm font-medium text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              Not for a case
            </button>
          </div>
          {picking && (
            <CasePicker busy={busy} onPick={(id) => file.mutate(id)} />
          )}
          {(file.isError || dismiss.isError) && (
            <p role="alert" className="mt-2 text-sm text-status-amber-text">
              {errorText(file.error ?? dismiss.error)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Emails to file: drop in emails without choosing a case. Each is matched to
 * the cases from what they hold — reference, appeal number, the client's
 * email, the child's and client's names, school and LA contacts. A confident
 * match to one open case is filed at once; anything else waits here, shared by
 * everyone, with the likely cases to choose from.
 */
export function EmailsToFilePage() {
  const me = useMe().data;
  const canFile = (EMAIL_FILING_ROLES as readonly string[]).includes(
    me?.role ?? '',
  );
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ['email-inbox'], queryFn: fetchInbox });
  const [results, setResults] = useState<DropResult[]>([]);
  const [filed, setFiled] = useState<{
    subject: string;
    caseId: string;
    caseReference: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  async function take(files: File[]) {
    for (const f of files) {
      const key = `${seq.current++}`;
      if (!isEmailFile(f.name, f.type)) {
        setResults((r) => [
          {
            key,
            filename: f.name,
            error: 'Not an email: drop .eml or Outlook .msg files here.',
          },
          ...r,
        ]);
        continue;
      }
      setResults((r) => [{ key, filename: f.name }, ...r]);
      try {
        const result = await intakeEmail(f);
        setResults((r) => r.map((x) => (x.key === key ? { ...x, result } : x)));
      } catch (err) {
        setResults((r) =>
          r.map((x) => (x.key === key ? { ...x, error: errorText(err) } : x)),
        );
      }
    }
    void qc.invalidateQueries({ queryKey: ['email-inbox'] });
  }

  const items = inbox.data?.items ?? [];

  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-resend-ink">
          Emails to file
        </h1>
        <p className="text-xs text-gray-500">
          Drop emails in without choosing a case: each is matched to its case,
          and anything unclear waits here for someone to choose
        </p>
      </div>

      <main className="max-w-4xl space-y-5 px-6 py-5">
        {canFile && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void collectDroppedFiles(e.dataTransfer).then(take);
            }}
            className={`rounded-lg border-2 border-dashed p-6 text-center text-sm ${
              dragging
                ? 'border-resend-purple bg-gray-50'
                : 'border-gray-300 text-gray-700'
            }`}
          >
            <p>
              Drop emails here — as many as you like. In Outlook, drag messages
              to your desktop (or File › Save As) to get .msg files.
            </p>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={`mt-3 ${primary}`}
            >
              Choose emails
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
              className="hidden"
              aria-label="Emails to file"
              onChange={(e) => {
                void take(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <p className="mt-3 text-xs text-gray-600">
              Filed straight to its case when one open case clearly matches — by
              its reference, appeal number or client’s email address, with the
              child’s name telling siblings apart. Never to a closed case
              without asking.
            </p>
          </div>
        )}

        <DropResults results={results} onClear={() => setResults([])} />

        <section aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="text-base font-semibold">
            Waiting for a case
            {items.length > 0 && (
              <span className="ml-2 rounded-full bg-resend-purple px-2 py-0.5 text-xs text-white">
                {items.length}
              </span>
            )}
          </h2>
          {filed && (
            <p className="mt-2 rounded-md border-l-4 border-resend-green bg-gray-50 px-3 py-2 text-sm">
              Filed “{filed.subject}” to{' '}
              <a href={caseLink(filed.caseId)} className={quiet}>
                {filed.caseReference}
              </a>
              .
            </p>
          )}
          <p role="status" className="mt-1 text-sm text-gray-600">
            {inbox.isLoading
              ? 'Loading…'
              : inbox.isError
                ? 'The list could not be loaded. Try again shortly.'
                : items.length === 0
                  ? 'Nothing waiting. Emails that can’t be matched to one case with confidence wait here.'
                  : ''}
          </p>
          <ul className="mt-3 space-y-3">
            {items.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                canFile={canFile}
                onFiled={(subject, result) => {
                  if ('caseId' in result)
                    setFiled({
                      subject,
                      caseId: result.caseId,
                      caseReference: result.caseReference,
                    });
                }}
              />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
