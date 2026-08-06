import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DOCUMENT_CATEGORY_VALUES,
  formatCivilDate,
  formatFileSize,
  isPreviewable,
  type DocumentInfo,
} from '@re-send/shared';
import { documentContentUrl, uploadDocument } from '../../api/caseScreen';
import { useDocuments } from '../../hooks/useCaseScreen';

export function DocumentsRegion({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useDocuments(caseId);
  const documents = data?.documents ?? [];
  const [category, setCategory] = useState<string>('Other');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DocumentInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      await uploadDocument(caseId, file, category);
      await qc.invalidateQueries({ queryKey: ['documents', caseId] });
    } finally {
      setBusy(false);
    }
  };

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
          <li
            key={doc.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-resend-ink">
                {doc.originalFilename}
              </p>
              <p className="text-xs text-gray-500">
                {doc.category} · {doc.uploadedByName ?? 'Unknown'} ·{' '}
                {formatCivilDate(doc.uploadedAt.slice(0, 10))} ·{' '}
                {formatFileSize(doc.byteSize)}
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
          </li>
        ))}
      </ul>

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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          }}
          className={`flex w-full flex-col items-center rounded-lg border-2 border-dashed px-4 py-6 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
            dragging
              ? 'border-resend-purple bg-gray-50'
              : 'border-gray-200 text-gray-500'
          }`}
        >
          {busy ? 'Uploading…' : 'Drop a file here, or click to choose'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <h3 className="text-sm font-medium text-resend-ink">
                {preview.originalFilename}
              </h3>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
                className="text-gray-500 hover:text-resend-ink"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 bg-gray-100">
              {preview.mimeType.startsWith('image/') ? (
                <img
                  src={documentContentUrl(preview.id)}
                  alt={preview.originalFilename}
                  className="mx-auto max-h-full max-w-full object-contain"
                />
              ) : (
                <iframe
                  title={preview.originalFilename}
                  src={documentContentUrl(preview.id)}
                  className="h-full w-full"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
