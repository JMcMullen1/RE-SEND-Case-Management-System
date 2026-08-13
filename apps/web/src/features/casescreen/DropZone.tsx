import { useRef, useState } from 'react';

/**
 * A drop zone that accepts files and whole folders. It reads DataTransfer.items
 * and, where the browser supports it (webkitGetAsEntry), walks dropped
 * directories recursively so a folder of evidence can be dropped in one go. The
 * click fallback opens a normal multi-file picker. It only collects files and
 * hands them up; uploading, progress and partial-failure handling belong to the
 * caller.
 */
export function DropZone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = await collectDroppedFiles(e.dataTransfer);
    if (files.length > 0) onFiles(files);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void handleDrop(e)}
        className={`flex w-full flex-col items-center rounded-lg border-2 border-dashed px-4 py-6 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
          dragging
            ? 'border-resend-purple bg-gray-50 text-resend-purple'
            : 'border-gray-200 text-gray-500'
        }`}
      >
        {busy
          ? 'Uploading…'
          : 'Drop files or a folder here, or click to choose'}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/**
 * Collect the files from a drop, expanding whole folders where the browser
 * supports the entries API and falling back to the flat file list otherwise.
 * Exported so a larger drop target (e.g. the whole documents region) can reuse
 * the same directory-walking behaviour.
 */
export async function collectDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const entry = items[i]?.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length > 0) {
    return (await Promise.all(entries.map(readEntry))).flat();
  }
  return Array.from(dataTransfer.files);
}

/** Recursively resolve a dropped entry to its files. */
function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    return readAllDirEntries(reader).then((children) =>
      Promise.all(children.map(readEntry)).then((nested) => nested.flat()),
    );
  }
  return Promise.resolve([]);
}

/** readEntries returns batches; keep reading until it returns none. */
function readAllDirEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
          } else {
            all.push(...batch);
            readBatch();
          }
        },
        () => resolve(all),
      );
    };
    readBatch();
  });
}
