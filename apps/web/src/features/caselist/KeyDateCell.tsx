import {
  keyDateCell,
  selectPrimaryKeyDate,
  type CaseListRow,
} from '@re-send/shared';

/**
 * The key date column. Two lines with real typographic hierarchy: what the key
 * date is, then a countdown and date. The countdown is computed here on the
 * client against `today` (Europe/London) so it stays correct across midnight.
 * Overdue is conveyed by weight and the word itself — there is no colour
 * banding. A "+N" affordance reveals same-day key dates in the row expansion.
 */
export function KeyDateCell({
  row,
  today,
  onExpand,
}: {
  row: CaseListRow;
  today: string;
  onExpand: () => void;
}) {
  const { primary, sameDay } = selectPrimaryKeyDate(row.keyDates, today);
  const cell = keyDateCell(primary, today, row.status);
  const imminent =
    cell.overdue ||
    cell.detail.startsWith('Today') ||
    cell.detail.startsWith('Tomorrow');

  if (cell.noneSet) {
    return <span className="text-sm italic text-gray-400">None set</span>;
  }

  return (
    <div className="leading-tight">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-resend-ink">
          {cell.title}
        </span>
        {sameDay.length > 0 && (
          <button
            type="button"
            onClick={onExpand}
            className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-600 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
            aria-label={`${sameDay.length} more key date${sameDay.length > 1 ? 's' : ''} on the same day`}
          >
            +{sameDay.length}
          </button>
        )}
      </div>
      <div className="text-sm tabular-nums text-gray-500">
        <span className={imminent ? 'font-semibold text-resend-ink' : ''}>
          {cell.detail}
        </span>
      </div>
    </div>
  );
}
