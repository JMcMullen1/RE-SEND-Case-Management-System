import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isEmailFile } from '@re-send/shared';
import { uploadDocument } from '../../api/documents';
import { fileEmail } from '../../api/emails';

/** What happened to one file, in words a caseworker reads at a glance. */
export type UploadOutcome =
  'created' | 'version' | 'duplicate' | 'email' | 'email-duplicate';

const OUTCOME_LABEL: Record<UploadOutcome, string> = {
  created: 'New',
  version: 'New version',
  duplicate: 'Already filed',
  email: 'Filed as email',
  'email-duplicate': 'Email already filed',
};

export interface Upload {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  outcome?: UploadOutcome;
  /** For a filed email: how many attachments went into Documents. */
  attachments?: number;
  error?: string;
}

const CONCURRENCY = 3;

/**
 * Files dropped or chosen on a case, wherever they were dropped: an email
 * (.eml / .msg) is filed as an email — its attachments become documents — and
 * anything else is filed as a document in `folder`. Staff never have to know
 * which panel a file "belongs" to. Each file is independent: one failure never
 * discards the others' progress or results.
 */
export function useCaseUploads(caseId: string) {
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);

  const patch = (id: string, p: Partial<Upload>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...p } : u)));

  const uploadOne = async (file: File, entry: Upload, folder: string) => {
    const onProgress = (f: number) => patch(entry.id, { progress: f });
    try {
      if (isEmailFile(file.name, file.type)) {
        const res = await fileEmail(caseId, file, onProgress);
        patch(entry.id, {
          status: 'done',
          progress: 1,
          outcome: res.outcome === 'duplicate' ? 'email-duplicate' : 'email',
          attachments: res.email.attachments.length,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['emails', caseId] }),
          qc.invalidateQueries({ queryKey: ['documents', caseId] }),
        ]);
      } else {
        const res = await uploadDocument(caseId, file, folder, onProgress);
        patch(entry.id, { status: 'done', progress: 1, outcome: res.outcome });
        await qc.invalidateQueries({ queryKey: ['documents', caseId] });
      }
    } catch (err) {
      patch(entry.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const onFiles = (files: File[], folder: string) => {
    if (files.length === 0) return;
    const queued: Upload[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'uploading',
      progress: 0,
    }));
    setUploads((prev) => [...queued, ...prev]);
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        await uploadOne(files[i]!, queued[i]!, folder);
      }
    };
    void Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
    );
  };

  const clearFinished = () =>
    setUploads((prev) => prev.filter((u) => u.status === 'uploading'));

  return { uploads, onFiles, clearFinished };
}

/** Progress and outcome for each file in a batch. */
export function UploadList({
  uploads,
  onClear,
}: {
  uploads: Upload[];
  onClear: () => void;
}) {
  if (uploads.length === 0) return null;
  const busy = uploads.some((u) => u.status === 'uploading');
  return (
    <div className="mb-3">
      <ul className="space-y-1.5" aria-live="polite">
        {uploads.map((u) => (
          <li key={u.id} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-resend-ink">{u.name}</span>
              <UploadStatus upload={u} />
            </div>
            {u.status === 'uploading' && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full bg-resend-purple transition-[width]"
                  style={{ width: `${Math.round(u.progress * 100)}%` }}
                />
              </div>
            )}
            {u.status === 'error' && (
              <p className="mt-0.5 text-status-amber">{u.error}</p>
            )}
          </li>
        ))}
      </ul>
      {!busy && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 text-xs text-gray-500 hover:text-resend-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function UploadStatus({ upload }: { upload: Upload }) {
  if (upload.status === 'uploading') {
    return (
      <span className="shrink-0 tabular-nums text-gray-500">
        {Math.round(upload.progress * 100)}%
      </span>
    );
  }
  if (upload.status === 'error') {
    return <span className="shrink-0 text-status-amber">Failed</span>;
  }
  const outcome = upload.outcome ?? 'created';
  const duplicate = outcome === 'duplicate' || outcome === 'email-duplicate';
  const extra =
    outcome === 'email' && upload.attachments
      ? ` · ${upload.attachments} attachment${upload.attachments === 1 ? '' : 's'} to Documents`
      : '';
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 ${
        duplicate
          ? 'border border-status-amber text-resend-ink'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {OUTCOME_LABEL[outcome]}
      {extra}
    </span>
  );
}
