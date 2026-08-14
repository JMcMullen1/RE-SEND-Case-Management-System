import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_DOCUMENT_FOLDERS,
  formatCivilDate,
  formatFileSize,
  isPreviewable,
  type DocumentInfo,
  type DocumentUploadOutcome,
} from '@re-send/shared';
import {
  deleteDocuments,
  documentContentUrl,
  fetchDocumentVersions,
  uploadDocument,
} from '../../api/documents';
import { useDocuments } from '../../hooks/useCaseScreen';
import { collectDroppedFiles } from './DropZone';

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

const ALL_FILES = 'All files';

export function DocumentsRegion({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useDocuments(caseId);
  const documents = data?.documents ?? [];

  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>(ALL_FILES);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<DocumentInfo | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Files ticked for deletion, and the batch awaiting the confirm dialog.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const del = useMutation({
    mutationFn: (ids: string[]) => deleteDocuments(caseId, ids),
    onSuccess: async (_res, ids) => {
      await qc.invalidateQueries({ queryKey: ['documents', caseId] });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setPendingDelete(null);
    },
  });

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Folders offered: the common defaults, any folder already in use on this
  // case, and any the user has just created — de-duplicated, order preserved.
  const folders = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of [
      ...DEFAULT_DOCUMENT_FOLDERS,
      ...documents.map((d) => d.category),
      ...customFolders,
    ]) {
      if (f && !seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    return out;
  }, [documents, customFolders]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) m.set(d.category, (m.get(d.category) ?? 0) + 1);
    return m;
  }, [documents]);

  // New uploads go into the selected folder; when "All files" is selected there
  // is no single target, so default to "Other".
  const uploadFolder = activeFolder === ALL_FILES ? 'Other' : activeFolder;
  const visible =
    activeFolder === ALL_FILES
      ? documents
      : documents.filter((d) => d.category === activeFolder);

  const setUpload = (id: string, patch: Partial<Upload>) =>
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    );

  const onFiles = (files: File[]) => {
    if (files.length === 0) return;
    const queued: Upload[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'uploading',
      progress: 0,
    }));
    setUploads((prev) => [...queued, ...prev]);
    void runPool(files, queued, uploadFolder);
  };

  // Upload a batch with limited concurrency. Each file is independent: one
  // failure never discards the others' progress or results.
  const runPool = async (files: File[], queued: Upload[], folder: string) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const index = cursor++;
        const file = files[index]!;
        const entry = queued[index]!;
        try {
          const result = await uploadDocument(caseId, file, folder, (f) =>
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

  const addFolder = () => {
    const name = window.prompt('New folder name')?.trim();
    if (!name) return;
    setCustomFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveFolder(name);
  };

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Ignore leave events fired while moving over child elements.
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void collectDroppedFiles(e.dataTransfer).then(onFiles);
      }}
    >
      {/* Folder filter + upload controls */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <FolderChip
          active={activeFolder === ALL_FILES}
          onClick={() => setActiveFolder(ALL_FILES)}
        >
          {ALL_FILES} ({documents.length})
        </FolderChip>
        {folders.map((f) => (
          <FolderChip
            key={f}
            active={activeFolder === f}
            onClick={() => setActiveFolder(f)}
          >
            {f}
            {counts.get(f) ? ` (${counts.get(f)})` : ''}
          </FolderChip>
        ))}
        <button
          type="button"
          onClick={addFolder}
          className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-resend-purple hover:text-resend-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          + New folder
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ml-auto rounded-md bg-resend-purple px-3 py-1 text-xs font-semibold text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          Upload{activeFolder !== ALL_FILES ? ` to ${activeFolder}` : ''}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Drag files or a folder anywhere in this panel to file them
        {activeFolder === ALL_FILES ? ' under Other' : ` in ${activeFolder}`}.
      </p>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <p className="mb-3 text-sm text-gray-400">
          {activeFolder === ALL_FILES
            ? 'No documents yet. Uploaded query forms and directions orders will be listed here.'
            : `No documents in ${activeFolder} yet.`}
        </p>
      )}

      {visible.length > 0 && (
        <div className="mb-1 flex items-center gap-3 text-xs text-gray-500">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={visible.every((d) => selected.has(d.id))}
              ref={(el) => {
                if (el)
                  el.indeterminate =
                    visible.some((d) => selected.has(d.id)) &&
                    !visible.every((d) => selected.has(d.id));
              }}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  for (const d of visible)
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                  return next;
                })
              }
              aria-label="Select all files"
              className="h-3.5 w-3.5 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
            />
            Select all
          </label>
          {selected.size > 0 && (
            <>
              <span>{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setPendingDelete([...selected])}
                className="font-medium text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
              >
                Delete selected
              </button>
            </>
          )}
        </div>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-auto">
        {visible.map((doc) => (
          <li key={doc.id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={() => toggleOne(doc.id)}
                  aria-label={`Select ${doc.originalFilename}`}
                  className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                />
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
                <button
                  type="button"
                  onClick={() => setPendingDelete([doc.id])}
                  className="text-status-amber hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber"
                >
                  Delete
                </button>
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

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-resend-purple bg-white/85 text-sm font-medium text-resend-purple">
          Drop to file
          {activeFolder === ALL_FILES ? ' under Other' : ` in ${activeFolder}`}
        </div>
      )}

      {preview && (
        <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          count={pendingDelete.length}
          busy={del.isPending}
          error={del.isError ? 'Could not delete. Please try again.' : null}
          onCancel={() => {
            del.reset();
            setPendingDelete(null);
          }}
          onConfirm={() => del.mutate(pendingDelete)}
        />
      )}
    </div>
  );
}

/**
 * The "are you sure?" gate before a document is deleted. Deletion is a real,
 * if recoverable, action on case files, so it always takes a second, deliberate
 * click here — never a single stray click on the list.
 */
function ConfirmDeleteDialog({
  count,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const noun = count === 1 ? 'file' : 'files';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
        <h2
          id="confirm-delete-title"
          className="text-base font-semibold text-resend-ink"
        >
          Delete {count} {noun}?
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {count === 1 ? 'This file' : `These ${count} files`} and every version
          will be removed from this case. It is recoverable by an administrator
          and the deletion is recorded.
        </p>
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
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-status-amber px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-status-amber disabled:opacity-50"
          >
            {busy ? 'Deleting…' : `Yes, delete ${noun}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A folder pill in the documents filter bar. */
function FolderChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
        active
          ? 'bg-resend-purple text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
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
