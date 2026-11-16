import { useState } from 'react';
import { EXPORT_URL } from '../../api/admin';
import { useMe } from '../../hooks/useCaseData';
import { AdminTabs } from '../layout/AdminTabs';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Admin › Full export: everything the system holds, in one ZIP. */
export function ExportPage() {
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  return (
    <div className="bg-white text-resend-ink">
      <div className="border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-resend-ink">Full export</h1>
        <p className="text-xs text-gray-500">
          Every record, document and email in one file you can keep
        </p>
        <AdminTabs />
      </div>
      <main className="mx-auto max-w-3xl px-6 py-6">
        {me.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        {me.data && !isAdmin && (
          <p className="text-sm text-gray-600">
            Only an admin can export data.
          </p>
        )}
        {isAdmin && <ExportPanel />}
      </main>
    </div>
  );
}

export function ExportPanel() {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Fetched rather than linked, so a refusal (e.g. too many exports this
  // hour) is shown here instead of being saved as a broken file.
  const download = async () => {
    setState('working');
    setError(null);
    try {
      const res = await fetch(EXPORT_URL, { credentials: 'include' });
      if (!res.ok) {
        let message = `The export could not be made (${res.status}).`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          /* not JSON */
        }
        if (res.status === 429)
          message = 'Three exports have been made this hour. Try again later.';
        throw new Error(message);
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get('content-disposition') ?? '',
        )?.[1] ?? 'resend-export.zip';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState('done');
    } catch (e) {
      setError(errorText(e));
      setState('idle');
    }
  };

  return (
    <section
      aria-labelledby="export-h"
      className="rounded-lg border border-gray-200 p-4"
    >
      <h2 id="export-h" className="text-base font-semibold">
        Download a full export
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Download everything the system holds as one ZIP file you can save and
        keep: every record as a spreadsheet (CSV) file, every document in a
        folder per case, every filed email as its original file, and a guide to
        what is inside. The charity’s data belongs to the charity: you can take
        a complete copy at any time.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        The same file is a backup: <strong>Full import</strong> can put all of
        it back exactly as it was. Keep it unchanged if you mean to use it that
        way.
      </p>
      <p className="mt-2 text-sm text-resend-ink">
        <strong>
          This file contains special category data about children.
        </strong>{' '}
        Save it only somewhere encrypted and access-controlled, and delete it
        when it is no longer needed. Each download is recorded.
      </p>
      <button
        type="button"
        onClick={() => void download()}
        disabled={state === 'working'}
        className="mt-3 rounded-lg bg-resend-purple px-4 py-2 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {state === 'working' ? 'Preparing the export…' : 'Download full export'}
      </button>
      {state === 'done' && (
        <p role="status" className="mt-1 text-sm text-resend-ink">
          Downloaded. Check MANIFEST.txt inside: it lists what was exported and
          any file that could not be found.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-status-amber-text">
          {error}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-600">
        A large document library takes a few minutes. Up to three exports an
        hour.
      </p>
    </section>
  );
}
