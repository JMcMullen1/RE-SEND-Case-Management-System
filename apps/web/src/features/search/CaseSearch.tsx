import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SEARCH_QUERY_MAX } from '@re-send/shared';
import { searchFiles } from '../../api/search';
import { SEARCH_TIPS, SearchResults, searchMessage } from './SearchResults';

/** Search inside one case's documents and emails, above its lists. */
export function CaseSearch({ caseId }: { caseId: string }) {
  const [q, setQ] = useState('');
  const search = useMutation({ mutationFn: searchFiles });
  return (
    <div className="border-b border-gray-100 px-5 py-3">
      <form
        role="search"
        aria-label="This case’s documents and emails"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) search.mutate({ q: q.trim(), caseId });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="min-w-[14rem] flex-1">
          <span className="sr-only">
            Search this case’s documents and emails
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!e.target.value) search.reset();
            }}
            maxLength={SEARCH_QUERY_MAX}
            placeholder="Search inside this case’s documents and emails"
            title={SEARCH_TIPS}
            className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          />
        </label>
        <button
          type="submit"
          disabled={!q.trim() || search.isPending}
          className="rounded-md border border-resend-purple px-3 py-1.5 text-sm font-semibold text-resend-purple hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
        >
          {search.isPending ? 'Searching…' : 'Search'}
        </button>
        {search.data && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              search.reset();
            }}
            className="text-sm text-gray-600 hover:underline"
          >
            Clear
          </button>
        )}
      </form>
      {search.isError && (
        <p role="alert" className="mt-2 text-sm text-status-amber-text">
          {search.error instanceof Error
            ? search.error.message
            : 'Search failed.'}
        </p>
      )}
      <p role="status" className="mt-1 text-sm text-gray-600">
        {searchMessage(search)}
      </p>
      {search.data && (
        <div className="max-h-80 overflow-auto">
          <SearchResults result={search.data} showCase={false} />
        </div>
      )}
    </div>
  );
}
