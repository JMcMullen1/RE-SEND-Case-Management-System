import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EMAIL_ATTACHMENT_FOLDER,
  EMAIL_DIRECTION_LABELS,
  formatFileSize,
  isPreviewable,
  type EmailInfo,
} from '@re-send/shared';
import { documentContentUrl } from '../../api/documents';
import { deleteEmail } from '../../api/emails';
import { useEmails } from '../../hooks/useCaseScreen';
import { collectDroppedFiles } from './DropZone';
import { UploadList, useCaseUploads } from './useCaseUploads';

/** "1 Oct 2025, 09:30" in UK time — the sent time as staff read it. */
function formatSent(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

/** Short form for the list: "1 Oct 2025". */
function formatSentShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
}

function matches(email: EmailInfo, q: string): boolean {
  const hay = [
    email.subject,
    email.fromName,
    email.fromAddress,
    ...email.toAddresses,
    ...email.ccAddresses,
    email.bodyText,
    ...email.attachments.map((a) => a.originalFilename),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/**
 * Correspondence filed against the case. Emails saved from Outlook (.msg) or
 * any mail client (.eml) are dropped here — or anywhere on the case's files —
 * and appear for everyone at once; their attachments are filed as documents.
 * The body is shown as plain text only, so nothing in an email can run.
 */
export function EmailsRegion({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useEmails(caseId);
  const emails = useMemo(() => data?.emails ?? [], [data]);
  const { uploads, onFiles, clearFinished } = useCaseUploads(caseId);

  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EmailInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const del = useMutation({
    mutationFn: (v: { id: string; withAttachments: boolean }) =>
      deleteEmail(caseId, v.id, v.withAttachments),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['emails', caseId] }),
        qc.invalidateQueries({ queryKey: ['documents', caseId] }),
      ]);
      setPendingDelete(null);
    },
  });

  const visible = useMemo(
    () => (query.trim() ? emails.filter((e) => matches(e, query)) : emails),
    [emails, query],
  );

  // Anything that is not an email goes to the documents' Correspondence folder,
  // so a stray PDF dropped here is still filed sensibly.
  const file = (files: File[]) => onFiles(files, EMAIL_ATTACHMENT_FOLDER);

  return (
    <div
      className="relative flex h-full flex-col"
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
        void collectDroppedFiles(e.dataTransfer).then(file);
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        {emails.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emails"
            aria-label="Search emails"
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2.5 py-1 text-sm focus:border-resend-purple focus:outline-none focus:ring-1 focus:ring-resend-purple"
          />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ml-auto shrink-0 rounded-md bg-resend-purple px-3 py-1 text-xs font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          File an email
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
          className="hidden"
          onChange={(e) => {
            file(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Drop emails here — several at once is fine. In Outlook, drag a message
        to your desktop (or File › Save As) to get a .msg file. Attachments are
        filed in Documents under {EMAIL_ATTACHMENT_FOLDER}.
      </p>

      <UploadList uploads={uploads} onClear={clearFinished} />

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {isError && (
        <p className="text-sm text-status-amber">
          Emails could not be loaded. Refresh to try again.
        </p>
      )}
      {!isLoading && !isError && emails.length === 0 && (
        <p className="text-sm text-gray-400">
          No emails filed on this case yet.
        </p>
      )}
      {emails.length > 0 && visible.length === 0 && (
        <p className="text-sm text-gray-400">No emails match “{query}”.</p>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-auto">
        {visible.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            open={openId === email.id}
            onToggle={() =>
              setOpenId((id) => (id === email.id ? null : email.id))
            }
            onDelete={() => setPendingDelete(email)}
          />
        ))}
      </ul>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-resend-purple bg-white/85 text-sm font-medium text-resend-purple">
          Drop to file emails on this case
        </div>
      )}

      {pendingDelete && (
        <ConfirmDeleteEmail
          email={pendingDelete}
          busy={del.isPending}
          error={del.isError ? 'Could not delete. Please try again.' : null}
          onCancel={() => {
            del.reset();
            setPendingDelete(null);
          }}
          onConfirm={(withAttachments) =>
            del.mutate({ id: pendingDelete.id, withAttachments })
          }
        />
      )}
    </div>
  );
}

function EmailRow({
  email,
  open,
  onToggle,
  onDelete,
}: {
  email: EmailInfo;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const sent = email.direction === 'outbound';
  const counterpart = sent
    ? `To ${email.toAddresses.join(', ') || 'unknown'}`
    : email.fromName || email.fromAddress || 'Unknown sender';
  const when = email.sentAt ?? email.filedAt;
  const panelId = `email-${email.id}`;
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                sent
                  ? 'bg-resend-green text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {EMAIL_DIRECTION_LABELS[email.direction]}
            </span>
            <span className="truncate text-sm font-medium text-resend-ink">
              {email.subject ?? '(no subject)'}
            </span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-gray-500">
            {formatSentShort(when)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {counterpart}
          {email.attachments.length > 0 &&
            ` · ${email.attachments.length} attachment${email.attachments.length === 1 ? '' : 's'}`}
        </p>
      </button>

      {open && (
        <div id={panelId} className="mt-2 space-y-2 text-sm">
          <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
            <dt className="text-gray-500">From</dt>
            <dd className="break-all text-resend-ink">
              {[email.fromName, email.fromAddress && `<${email.fromAddress}>`]
                .filter(Boolean)
                .join(' ') || 'Unknown'}
            </dd>
            {email.toAddresses.length > 0 && (
              <>
                <dt className="text-gray-500">To</dt>
                <dd className="break-all text-resend-ink">
                  {email.toAddresses.join(', ')}
                </dd>
              </>
            )}
            {email.ccAddresses.length > 0 && (
              <>
                <dt className="text-gray-500">Cc</dt>
                <dd className="break-all text-resend-ink">
                  {email.ccAddresses.join(', ')}
                </dd>
              </>
            )}
            <dt className="text-gray-500">Sent</dt>
            <dd className="text-resend-ink">
              {email.sentAt ? formatSent(email.sentAt) : 'Not recorded'}
            </dd>
            <dt className="text-gray-500">Filed</dt>
            <dd className="text-resend-ink">
              {formatSent(email.filedAt)} by {email.filedByName ?? 'Unknown'}
            </dd>
          </dl>

          <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-sm text-resend-ink">
            {email.bodyText?.trim() || (
              <span className="text-gray-400">This email has no text.</span>
            )}
          </div>

          {email.attachments.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                Attachments (filed in Documents)
              </p>
              <ul className="space-y-1">
                {email.attachments.map((a) => (
                  <li
                    key={a.documentId}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-resend-ink">
                      {a.originalFilename}
                      <span className="text-gray-400">
                        {' '}
                        · {a.category} · {formatFileSize(a.byteSize)}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {isPreviewable(a.mimeType) && (
                        <a
                          href={documentContentUrl(a.documentId)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                        >
                          Open
                        </a>
                      )}
                      <a
                        href={documentContentUrl(a.documentId, true)}
                        className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                      >
                        Download
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 text-xs">
            {email.rawDocumentId && (
              <a
                href={documentContentUrl(email.rawDocumentId, true)}
                className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
              >
                Download original
              </a>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** A deliberate second click before an email is removed from the case. */
function ConfirmDeleteEmail({
  email,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  email: EmailInfo;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (withAttachments: boolean) => void;
}) {
  const [withAttachments, setWithAttachments] = useState(false);
  const n = email.attachments.length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-email-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
        <h2
          id="confirm-delete-email-title"
          className="text-base font-semibold text-resend-ink"
        >
          Delete this email?
        </h2>
        <p className="mt-2 break-words text-sm text-gray-600">
          “{email.subject ?? '(no subject)'}” will be removed from this case. It
          is recoverable by an administrator and the deletion is recorded.
        </p>
        {n > 0 && (
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={withAttachments}
              onChange={(e) => setWithAttachments(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
            />
            <span>
              Also delete {n === 1 ? 'its attachment' : `its ${n} attachments`}{' '}
              from Documents
              <span className="block text-xs text-gray-500">
                Tick this if the email was filed on the wrong case. Files that
                were already on the case are kept.
              </span>
            </span>
          </label>
        )}
        {error && <p className="mt-2 text-sm text-status-amber">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(withAttachments)}
            disabled={busy}
            className="rounded-md bg-status-amber px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Yes, delete email'}
          </button>
        </div>
      </div>
    </div>
  );
}
