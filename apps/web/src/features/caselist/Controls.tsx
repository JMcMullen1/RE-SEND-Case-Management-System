import { useEffect, useState } from 'react';
import { SORTS, type SortId, type ViewMode } from '@re-send/shared';

export function SegmentedControl({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
    >
      {(['simple', 'advanced'] as const).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1 text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple ${
            mode === m
              ? 'bg-white text-resend-purple shadow-sm'
              : 'text-gray-600'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function SortSelect({
  sort,
  onChange,
}: {
  sort: SortId;
  onChange: (sort: SortId) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className="sr-only">Sort by</span>
      <span aria-hidden="true">Sort</span>
      <select
        value={sort}
        onChange={(e) => onChange(e.target.value as SortId)}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => window.clearTimeout(id);
  }, [local, value, onChange]);

  return (
    <input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="Search client, child, reference or notes"
      aria-label="Search cases"
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-resend-ink placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
    />
  );
}

export function DensityToggle({
  density,
  onChange,
}: {
  density: 'comfortable' | 'compact';
  onChange: (density: 'comfortable' | 'compact') => void;
}) {
  const next = density === 'comfortable' ? 'compact' : 'comfortable';
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      aria-label={`Switch to ${next} density`}
    >
      {density === 'comfortable' ? 'Comfortable' : 'Compact'}
    </button>
  );
}
