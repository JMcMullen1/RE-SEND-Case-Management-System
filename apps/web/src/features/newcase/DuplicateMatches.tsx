import type { MatchResult } from '../../api/createCase';

/**
 * Possible existing records, shown inline as the names are typed. Offers to
 * attach the new case to an existing client rather than creating a second one.
 */
export function DuplicateMatches({
  matches,
  onAttachClient,
  onUseChild,
}: {
  matches: MatchResult;
  onAttachClient: (clientId: string) => void;
  onUseChild: (childId: string, clientId: string | null) => void;
}) {
  const hasAny =
    matches.clientMatches.length > 0 || matches.childMatches.length > 0;
  if (!hasAny) return null;

  return (
    <div className="rounded-lg border-l-4 border-status-amber bg-gray-50 p-4">
      <p className="mb-2 text-sm font-semibold text-resend-ink">
        Possible existing records
      </p>

      {matches.clientMatches.map((c) => (
        <div
          key={c.clientId}
          className="flex items-center justify-between gap-3 py-1 text-sm"
        >
          <span className="text-resend-ink">
            {c.displayName}
            {c.email && <span className="text-gray-500"> · {c.email}</span>}
            {c.cases.length > 0 && (
              <span className="text-gray-500">
                {' '}
                · {c.cases.map((x) => x.caseReference).join(', ')}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onAttachClient(c.clientId)}
            className="shrink-0 rounded-md bg-resend-purple px-2.5 py-1 text-xs font-medium text-white hover:bg-resend-lilac focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Attach to this client
          </button>
        </div>
      ))}

      {matches.childMatches.map((c) => (
        <div
          key={c.childId}
          className="flex items-center justify-between gap-3 py-1 text-sm"
        >
          <span className="text-resend-ink">
            {c.fullName}
            {c.dateOfBirth && (
              <span className="text-gray-500"> · born {c.dateOfBirth}</span>
            )}
            {c.clientDisplayName && (
              <span className="text-gray-500"> · {c.clientDisplayName}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onUseChild(c.childId, c.clientId)}
            className="shrink-0 rounded-md border border-resend-purple px-2.5 py-1 text-xs font-medium text-resend-purple hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            Use this child &amp; client
          </button>
        </div>
      ))}
    </div>
  );
}
