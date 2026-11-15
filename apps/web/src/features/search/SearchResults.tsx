import {
  formatCivilDate,
  snippetRuns,
  type SearchHit,
  type SearchResult,
} from '@re-send/shared';
import { documentContentUrl } from '../../api/documents';

/** A snippet with the matched words highlighted (plain text, never markup). */
function Snippet({ text }: { text: string }) {
  return (
    <p className="mt-1 text-sm text-gray-700">
      {snippetRuns(text).map((run, i) =>
        run.match ? (
          <mark key={i} className="rounded px-0.5 font-semibold">
            {run.text}
          </mark>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </p>
  );
}

function Hit({ hit, showCase }: { hit: SearchHit; showCase: boolean }) {
  const caseLink = `/cases/${hit.caseId}?tab=docs-emails`;
  const people = [hit.childName, hit.clientName].filter(Boolean).join(' · ');
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {hit.kind === 'document' ? (
          <a
            href={documentContentUrl(hit.id)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-resend-purple hover:underline"
          >
            {hit.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <a
            href={caseLink}
            className="font-medium text-resend-purple hover:underline"
          >
            {hit.title}
          </a>
        )}
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
          {hit.kind === 'email' ? 'Email' : (hit.detail ?? 'Document')}
        </span>
        {!hit.current && (
          <span className="rounded border border-status-amber px-1.5 py-0.5 text-xs text-status-amber-text">
            Earlier version
          </span>
        )}
        <span className="text-xs text-gray-600">
          {hit.kind === 'email' && hit.detail ? `From ${hit.detail} · ` : ''}
          {hit.date ? formatCivilDate(hit.date.slice(0, 10)) : ''}
        </span>
      </div>
      {showCase && (
        <p className="text-xs text-gray-600">
          <a href={caseLink} className="hover:underline">
            {hit.caseReference}
          </a>
          {people && ` · ${people}`}
        </p>
      )}
      {hit.snippet && <Snippet text={hit.snippet} />}
    </li>
  );
}

/** Results of a search, best first; says how many matched in all. */
export function SearchResults({
  result,
  showCase,
}: {
  result: SearchResult;
  showCase: boolean;
}) {
  return (
    <div>
      <p role="status" className="text-sm text-gray-600">
        {result.total === 0
          ? 'Nothing matched. Try fewer words, or other words for the same thing.'
          : result.total > result.hits.length
            ? `The best ${result.hits.length} of ${result.total} matches.`
            : `${result.total} match${result.total === 1 ? '' : 'es'}.`}
      </p>
      <ul className="divide-y divide-gray-100">
        {result.hits.map((hit) => (
          <Hit key={`${hit.kind}:${hit.id}`} hit={hit} showCase={showCase} />
        ))}
      </ul>
    </div>
  );
}

/** How to search, in a line. */
export const SEARCH_TIPS =
  'Finds words in the text of documents and emails, including other forms of a word (“assess” finds “assessment”). Put a phrase in “quotes”; use OR between alternatives, and -word to leave a word out.';
