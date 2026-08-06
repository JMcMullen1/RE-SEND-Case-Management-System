import { useState } from 'react';
import { OPTIONAL_COLUMNS, type OptionalColumnId } from '@re-send/shared';

export function ColumnChooser({
  columns,
  onChange,
}: {
  columns: OptionalColumnId[];
  onChange: (columns: OptionalColumnId[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: OptionalColumnId) => {
    onChange(
      columns.includes(id) ? columns.filter((c) => c !== id) : [...columns, id],
    );
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Columns
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close columns"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
            {OPTIONAL_COLUMNS.map((col) => (
              <label
                key={col.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={columns.includes(col.id)}
                  onChange={() => toggle(col.id)}
                  className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
                />
                <span className="text-resend-ink">{col.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
