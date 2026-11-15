import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  DEFAULT_DOCUMENT_FOLDERS,
  PRODUCT_NAME,
  SEARCH_QUERY_MAX,
  SEARCH_SCOPE_LABELS,
  SEARCH_SCOPE_VALUES,
  type SearchScope,
} from '@re-send/shared';
import { searchFiles } from '../../api/search';
import { SEARCH_TIPS, SearchResults, searchMessage } from './SearchResults';

const field =
  'rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-resend-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Search inside every case's documents and emails. */
export function SearchPage() {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [folder, setFolder] = useState('');
  const [earlier, setEarlier] = useState(false);
  const search = useMutation({ mutationFn: searchFiles });
  const run = () => {
    if (!q.trim()) return;
    search.mutate({
      q: q.trim(),
      scope: folder.trim() ? 'documents' : scope,
      folder: folder.trim() || null,
      includeEarlierVersions: earlier,
    });
  };

  return (
    <div className="min-h-screen bg-white text-resend-ink">
      <header className="border-b border-gray-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-resend-purple">
              Search documents and emails
            </h1>
            <p className="text-xs text-gray-500">
              Across every case in {PRODUCT_NAME}
            </p>
          </div>
          <a
            href="/"
            className="text-sm text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Cases
          </a>
        </div>
      </header>
      <main className="max-w-4xl space-y-4 px-6 py-5">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap gap-2">
            <label className="min-w-[16rem] flex-1">
              <span className="sr-only">Search for</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={SEARCH_QUERY_MAX}
                placeholder="e.g. speech and language therapy"
                className={`${field} w-full`}
                autoFocus
              />
            </label>
            <button
              type="submit"
              disabled={!q.trim() || search.isPending}
              className="rounded-md bg-resend-purple px-4 py-1.5 text-sm font-semibold text-white hover:bg-resend-lilac disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            >
              {search.isPending ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              Look in
              <select
                value={folder ? 'documents' : scope}
                disabled={Boolean(folder)}
                onChange={(e) => setScope(e.target.value as SearchScope)}
                className={field}
              >
                {SEARCH_SCOPE_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {SEARCH_SCOPE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Folder
              <input
                type="text"
                list="search-folders"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                maxLength={60}
                placeholder="Any folder"
                className={`${field} w-44`}
              />
              <datalist id="search-folders">
                {DEFAULT_DOCUMENT_FOLDERS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={earlier}
                onChange={(e) => setEarlier(e.target.checked)}
                className="h-4 w-4 accent-resend-purple"
              />
              Include earlier versions
            </label>
          </div>
          <p className="text-xs text-gray-600">{SEARCH_TIPS}</p>
        </form>
        {search.isError && (
          <p role="alert" className="text-sm text-status-amber-text">
            {errorText(search.error)}
          </p>
        )}
        <p role="status" className="text-sm text-gray-600">
          {searchMessage(search)}
        </p>
        {search.data && <SearchResults result={search.data} showCase />}
      </main>
    </div>
  );
}
