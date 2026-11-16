import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  checkBackup,
  restoreStatus,
  runRestore,
  type BackupSummary,
} from '../../api/admin';
import { ApiError } from '../../api/client';
import { useMe } from '../../hooks/useCaseData';
import { AdminTabs } from '../layout/AdminTabs';

const panel = 'rounded-lg border border-gray-200 p-4';
const primary =
  'rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple disabled:cursor-not-allowed disabled:opacity-50';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

const n = (x: number) => x.toLocaleString('en-GB');

/**
 * Admin › Full import: put a full export back. The file is checked first and
 * what it holds is shown; only after typing REPLACE does everything in the
 * system get replaced with it — every record with its own id, every document
 * and email file back in its place.
 */
export function RestorePage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [checked, setChecked] = useState<{
    id: string;
    summary: BackupSummary;
    name: string;
  } | null>(null);
  const [confirm, setConfirm] = useState('');

  const check = useMutation({
    mutationFn: (file: File) => checkBackup(file, setProgress),
    onMutate: () => {
      setChecked(null);
      setConfirm('');
      restore.reset();
      setProgress(0);
    },
    onSuccess: (res, file) => setChecked({ ...res, name: file.name }),
  });
  const restore = useMutation({
    mutationFn: (id: string) => runRestore(id),
  });
  // The restore runs on the server; follow it until it ends. If this admin
  // is not in the backup, their session ends with it.
  const progressQuery = useQuery({
    queryKey: ['restore-status', checked?.id],
    queryFn: restoreStatus,
    enabled: restore.isSuccess,
    refetchInterval: (q) =>
      q.state.data?.state === 'running' || !q.state.data ? 2000 : false,
    retry: false,
  });
  const outcome = restore.isSuccess ? progressQuery.data : undefined;
  const signedOut =
    progressQuery.error instanceof ApiError &&
    [401, 403].includes(progressQuery.error.status);
  const running =
    restore.isPending ||
    (restore.isSuccess &&
      !signedOut &&
      outcome?.state !== 'done' &&
      outcome?.state !== 'failed');

  if (me.isLoading) return null;

  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-resend-ink">Full import</h1>
        <p className="text-xs text-gray-500">
          Put back a full export: every record, document and email, exactly as
          it was
        </p>
        <AdminTabs />
      </div>

      <main className="mx-auto max-w-3xl space-y-5 px-6 py-6">
        {!isAdmin ? (
          <p className="text-sm text-gray-600">
            Only an admin can import a backup.
          </p>
        ) : outcome?.state === 'done' || signedOut ? (
          <section className={panel} aria-labelledby="done-h">
            <h2 id="done-h" className="text-base font-semibold">
              Everything has been put back
            </h2>
            <p className="mt-2 text-sm">
              {outcome?.state === 'done'
                ? `${n(outcome.rows)} records and ${n(outcome.files)} files from the backup are back in place.`
                : 'Your account is not in the backup, so you have been signed out. Sign in with an account from the backup.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className={`mt-4 ${primary}`}
            >
              Go to the cases
            </button>
          </section>
        ) : (
          <>
            <section className={panel} aria-labelledby="what-h">
              <h2 id="what-h" className="text-base font-semibold">
                Before you start
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                <li>
                  <strong>
                    This replaces everything in the system with the backup
                  </strong>{' '}
                  — cases, notes, documents, emails, schools, staff and the
                  audit trail. Anything added since the backup was made is
                  removed.
                </li>
                <li>
                  Take a{' '}
                  <Link
                    to="/admin/export"
                    className="font-medium text-resend-purple hover:underline"
                  >
                    full export
                  </Link>{' '}
                  first, so you can go back if you need to.
                </li>
                <li>
                  Use a full export from this system, unchanged. A backup from
                  an earlier version is refused rather than half put back.
                </li>
                <li>
                  If your own account is not in the backup, you will be signed
                  out when it finishes. Everyone else should stop work while it
                  runs.
                </li>
              </ul>
            </section>

            <section className={panel} aria-labelledby="file-h">
              <h2 id="file-h" className="text-base font-semibold">
                1. Choose the backup
              </h2>
              <label className="mt-3 inline-block">
                <span className="sr-only">The full export (.zip)</span>
                <input
                  ref={input}
                  type="file"
                  accept=".zip,application/zip"
                  disabled={check.isPending}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) check.mutate(f);
                    e.target.value = '';
                  }}
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-resend-purple file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-resend-purple hover:file:bg-gray-50"
                />
              </label>
              <p role="status" className="mt-2 text-sm text-gray-600">
                {check.isPending
                  ? progress < 1
                    ? `Uploading… ${Math.round(progress * 100)}%`
                    : 'Checking the backup…'
                  : ''}
              </p>
              {check.isError && (
                <p role="alert" className="mt-2 text-sm text-status-amber-text">
                  {errorText(check.error)}
                </p>
              )}
            </section>

            {checked && (
              <section className={panel} aria-labelledby="confirm-h">
                <h2 id="confirm-h" className="text-base font-semibold">
                  2. Check and replace
                </h2>
                <dl className="mt-2 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
                  <dt className="text-gray-600">File</dt>
                  <dd>{checked.name}</dd>
                  <dt className="text-gray-600">Made</dt>
                  <dd>
                    {new Date(checked.summary.createdAt).toLocaleString(
                      'en-GB',
                      {
                        dateStyle: 'long',
                        timeStyle: 'short',
                        timeZone: 'Europe/London',
                      },
                    )}{' '}
                    by {checked.summary.createdBy}
                  </dd>
                  <dt className="text-gray-600">Holds</dt>
                  <dd>
                    {n(checked.summary.rows)} records in{' '}
                    {checked.summary.tables} tables, and{' '}
                    {n(checked.summary.files)} files
                  </dd>
                </dl>
                <label className="mt-4 block text-sm">
                  To replace everything in the system with this backup, type{' '}
                  <strong>REPLACE</strong>:
                  <input
                    type="text"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="off"
                    className="mt-1 block w-48 rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  />
                </label>
                <button
                  type="button"
                  disabled={confirm !== 'REPLACE' || running}
                  onClick={() => restore.mutate(checked.id)}
                  className={`mt-3 ${primary}`}
                >
                  {running
                    ? 'Putting everything back…'
                    : 'Replace everything with this backup'}
                </button>
                {running && (
                  <p role="status" className="mt-2 text-sm text-gray-600">
                    This can take a few minutes for a large document library.
                    Keep this page open.
                  </p>
                )}
                {restore.isError && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-status-amber-text"
                  >
                    {errorText(restore.error)} Nothing has been changed.
                  </p>
                )}
                {outcome?.state === 'failed' && (
                  <p
                    role="alert"
                    className="mt-2 text-sm text-status-amber-text"
                  >
                    {outcome.message}
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
