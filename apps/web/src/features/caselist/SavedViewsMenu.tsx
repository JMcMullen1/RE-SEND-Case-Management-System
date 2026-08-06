import { useState } from 'react';
import {
  decodeViewState,
  type SavedViewSeed,
  type ViewState,
} from '@re-send/shared';
import type { SavedView } from '../../api/client';

/** Seed filters are stored loosely; decode them into a full view state. */
function seedToState(seed: SavedViewSeed): ViewState {
  const params = new URLSearchParams();
  params.set('mode', seed.mode);
  params.set('sort', seed.sort);
  for (const [key, value] of Object.entries(seed.filters)) {
    if (Array.isArray(value)) params.set(key, value.join(','));
    else if (value === true) params.set(key, '1');
    else if (typeof value === 'number') params.set(key, String(value));
  }
  return { ...decodeViewState(params), mode: seed.mode };
}

export function SavedViewsMenu({
  seeds,
  views,
  onApply,
  onSave,
  onDelete,
}: {
  seeds: SavedViewSeed[];
  views: SavedView[];
  onApply: (state: ViewState) => void;
  onSave: (name: string, shared: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const apply = (state: ViewState) => {
    setOpen(false);
    onApply(state);
  };

  const save = () => {
    const name = window.prompt('Name this view');
    if (name) onSave(name, false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
      >
        Saved views
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close saved views"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Starter views
            </p>
            {seeds.map((seed) => (
              <button
                key={seed.id}
                type="button"
                onClick={() => apply(seedToState(seed))}
                className="block w-full px-3 py-1.5 text-left text-sm text-resend-ink hover:bg-gray-50"
              >
                {seed.name}
              </button>
            ))}
            {views.length > 0 && (
              <p className="mt-1 border-t border-gray-100 px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Saved
              </p>
            )}
            {views.map((view) => (
              <div
                key={view.id}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50"
              >
                <button
                  type="button"
                  onClick={() => apply(view.state)}
                  className="text-left text-sm text-resend-ink"
                >
                  {view.name}
                  {view.shared && (
                    <span className="ml-1 text-xs text-gray-400">shared</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(view.id)}
                  aria-label={`Delete ${view.name}`}
                  className="text-gray-400 hover:text-resend-ink"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="mt-1 border-t border-gray-100 px-3 pt-2 pb-1">
              <button
                type="button"
                onClick={save}
                className="text-sm font-medium text-resend-purple hover:underline"
              >
                Save current view…
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
