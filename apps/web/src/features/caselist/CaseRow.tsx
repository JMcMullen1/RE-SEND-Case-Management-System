import { Link } from '@tanstack/react-router';
import {
  formatCivilDate,
  relativeSince,
  typeOfCase,
  type CaseListRow,
  type OwnerQueue,
} from '@re-send/shared';
import type { UserSummary } from '../../api/client';
import { Chevron, StatusChip } from './primitives';
import { KeyDateCell } from './KeyDateCell';
import { StaffCell } from './StaffCell';
import { RowExpansion } from './RowExpansion';
import { COLUMN_META, type ColumnId } from './columns';

type Target = { ownerUserId: string } | { ownerQueue: OwnerQueue };

export function CaseRow({
  row,
  columns,
  template,
  today,
  users,
  compact,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  onReassign,
}: {
  row: CaseListRow;
  columns: ColumnId[];
  template: string;
  today: string;
  users: UserSummary[];
  compact: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  onReassign: (target: Target) => void;
}) {
  const pad = compact ? 'py-2' : 'py-4';
  const unassigned = row.owner.kind === 'queue';

  const cell = (id: ColumnId) => {
    switch (id) {
      case 'select':
        return (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${row.clientName ?? 'case'}`}
            className="h-4 w-4 rounded border-gray-300 text-resend-purple focus:ring-resend-purple"
          />
        );
      case 'expander':
        return (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse row' : 'Expand row'}
            className="rounded p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            <Chevron open={expanded} />
          </button>
        );
      case 'client':
        return (
          <Link
            to="/cases/$caseId"
            params={{ caseId: row.id }}
            className="text-base font-semibold text-resend-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-resend-purple"
          >
            {row.clientName ?? 'Unnamed client'}
          </Link>
        );
      case 'child':
        return (
          <span className="text-sm text-resend-ink">
            {row.childName ?? '—'}
          </span>
        );
      case 'type':
        return (
          <span className="text-sm text-resend-ink">
            {typeOfCase(row.currentWork, row.originalQuery) ?? '—'}
          </span>
        );
      case 'staff':
        return <StaffCell row={row} users={users} onReassign={onReassign} />;
      case 'keydate':
        return (
          <KeyDateCell row={row} today={today} onExpand={onToggleExpand} />
        );
      case 'status':
        return <StatusChip status={row.status} />;
      case 'updated':
        return (
          <span className="text-sm text-gray-500">
            {relativeSince(row.mostRecentNoteDate, today)}
          </span>
        );
      case 'team':
        return (
          <span className="text-sm text-resend-ink">
            {row.team.join(', ') || '—'}
          </span>
        );
      case 'dateOfEnquiry':
        return (
          <span className="text-sm text-resend-ink">
            {row.dateOfEnquiry ? formatCivilDate(row.dateOfEnquiry) : '—'}
          </span>
        );
      case 'methodOfEnquiry':
        return (
          <span className="text-sm text-resend-ink">
            {row.methodOfEnquiry ?? '—'}
          </span>
        );
      case 'dealingShadow':
        return (
          <span className="text-sm text-resend-ink">
            {row.shadowUserName ?? '—'}
          </span>
        );
      case 'schoolYear':
        return (
          <span className="text-sm text-resend-ink">
            {row.schoolYear ?? '—'}
          </span>
        );
      case 'paymentCode':
        return (
          <span className="text-sm text-resend-ink">
            {row.paymentCode ?? '—'}
          </span>
        );
      case 'discountCode':
        return (
          <span className="text-sm text-resend-ink">
            {row.discountCode ?? '—'}
          </span>
        );
      case 'invoiceStatus':
        return (
          <span className="text-sm text-resend-ink">
            {row.invoiceStatusText ?? '—'}
          </span>
        );
      case 'consultationState':
        return (
          <span className="text-sm text-resend-ink">{row.consultStatus}</span>
        );
      case 'lastReviewed':
        return (
          <span className="text-sm text-gray-500">
            {row.lastReviewedAt
              ? relativeSince(row.lastReviewedAt.slice(0, 10), today)
              : 'Never'}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="border-b border-gray-100">
      <div
        role="row"
        className={`grid items-center gap-3 pr-4 ${pad} ${unassigned ? 'border-l-2 border-status-amber pl-3' : 'pl-3.5'}`}
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((id) => (
          <div
            key={id}
            role="cell"
            className={
              COLUMN_META[id].width.startsWith('minmax')
                ? 'min-w-0 truncate'
                : ''
            }
          >
            {cell(id)}
          </div>
        ))}
      </div>
      {expanded && <RowExpansion row={row} today={today} />}
    </div>
  );
}
