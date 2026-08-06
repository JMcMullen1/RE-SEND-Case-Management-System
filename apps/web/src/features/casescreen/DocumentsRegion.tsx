import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_CATEGORY_VALUES,
  formatCivilDate,
  formatFileSize,
  isPreviewable,
  type DocumentInfo,
  type DocumentUploadOutcome,
} from '@re-send/shared';
import {
  documentContentUrl,
  fetchDocumentVersions,
  uploadDocument,
} from '../../api/documents';
import { useDocuments } from '../../hooks/useCaseScreen';
import { DropZone } from './DropZone';

interface Upload {
  id: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  outcome?: DocumentUploadOutcome;
  error?: string;
}

const OUTCOME_LABEL: Record<DocumentUploadOutcome, string> = {
  created: 'New',
  version: 'New version',
  duplicate: 'Already filed',
};

const CONCURRENCY = 3;

export function DocumentsRegion({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useDocuments(caseId);
  const documents = data?.documents ?? [];
  const [category, setCategory] = useState<string>('Other');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<DocumentInfo | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const setUpload = (id: string, patch: Partial<Upload>) =>
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    );

  const onFiles = (files: File[]) => {
    const queued: Upload[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'uploading',
      progress: 0,
    }));
    setUploads((prev) => [...queued, ...prev]);
    void runPool(files, queued);
  };

  // Upload a batch with limited concurrency. Each file is independent: one
  // failure never discards the others' progress or results.
  const runPool = async (files: File[], queued: Upload[]) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const index = cursor++;
        const file = files[index]!;
        const entry = queued[index]!;
        try {
          const result = await uploadDocument(caseId, file, category, (f) =>
            setUpload(entry.id, { progress: f }),
          );
          setUpload(entry.id, {
            status: 'done',
            progress: 1,
            outcome: result.outcome,
          });
          await qc.invalidateQueries({ queryKey: ['documents', caseId] });
        } catch (err) {
          setUpload(entry.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed',
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker),
    );
  };

  const busy = uploads.some((u) => u.status === 'uploading');

  return (
    <div className="flex h-full flex-col">
      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {!isLoading && documents.length === 0 && (
        <p className="mb-3 text-sm text-gray-400">
          No documents yet. Uploaded query forms and directions orders will be
          listed here.
        </p>
      )}

      <ul className="mb-4 divide-y divide-gray-100">
        {documents.map((doc) => (
          <li key={doc.id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-resend-ink">
                  {doc.originalFilename}
                  {doc.versionCount > 1 && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                      v{doc.version}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {doc.category} · {doc.uploadedByName ?? 'Unknown'} ·{' '}
                  {formatCivilDate(doc.uploadedAt.slice(0, 10))} ·{' '}
                  {formatFileSize(doc.byteSize)}
                  {doc.versionCount > 1 && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        onClick={() =>
                          setHistoryFor((h) => (h === doc.id ? null : doc.id))
                        }
                        className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                      >
                        {doc.versionCount} versions
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-sm">
                {isPreviewable(doc.mimeType) && (
                  <button
                    type="button"
                    onClick={() => setPreview(doc)}
                    className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                  >
                    Preview
                  </button>
                )}
                <a
                  href={documentContentUrl(doc.id, true)}
                  className="text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
                >
                  Download
                </a>
              </div>
            </div>
            {historyFor === doc.id && <VersionHistory documentId={doc.id} />}
          </li>
        ))}
      </ul>

      {uploads.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {uploads.map((u) => (
            <li key={u.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-resend-ink">
                  {u.name}
                </span>
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
      )}

      <div className="mt-auto">
        <label className="mb-2 flex items-center gap-2 text-xs text-gray-500">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {DOCUMENT_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <DropZone onFiles={onFiles} busy={busy} />
      </div>

      {preview && (
        <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function UploadStatus({ upload }: { upload: Upload }) {
  if (upload.status === 'uploading') {
    return (
      <span className="shrink-0 tabular-nums text-gray-400">
        {Math.round(upload.progress * 100)}%
      </span>
    );
  }
  if (upload.status === 'error') {
    return <span className="shrink-0 text-status-amber">Failed</span>;
  }
  const outcome = upload.outcome ?? 'created';
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 ${
        outcome === 'duplicate'
          ? 'border border-status-amber text-resend-ink'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

function VersionHistory({ documentId }: { documentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: () => fetchDocumentVersions(documentId),
  });
  if (isLoading)
    return <p className="mt-1 pl-3 text-xs text-gray-400">Loading versions…</p>;
  const versions = data?.versions ?? [];
  return (
    <ul className="mt-1 space-y-0.5 border-l-2 border-gray-100 pl-3">
      {versions.map((v) => (
        <li
          key={v.id}
          className="flex items-center gap-2 text-xs text-gray-500"
        >
          <span className="tabular-nums">v{v.version}</span>
          {v.isCurrent && (
            <span className="rounded bg-resend-green px-1 text-[10px] font-medium text-white">
              current
            </span>
          )}
          <span>{formatCivilDate(v.uploadedAt.slice(0, 10))}</span>
          <span>· {v.uploadedByName ?? 'Unknown'}</span>
          <span>· {formatFileSize(v.byteSize)}</span>
          <a
            href={documentContentUrl(v.id, true)}
            className="ml-auto text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}

function PreviewModal({
  doc,
  onClose,
}: {
  doc: DocumentInfo;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h3 className="text-sm font-medium text-resend-ink">
            {doc.originalFilename}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-gray-500 hover:text-resend-ink"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-gray-100">
          {doc.mimeType.startsWith('image/') ? (
            <img
              src={documentContentUrl(doc.id)}
              alt={doc.originalFilename}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          ) : (
            <iframe
              title={doc.originalFilename}
              src={documentContentUrl(doc.id)}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
