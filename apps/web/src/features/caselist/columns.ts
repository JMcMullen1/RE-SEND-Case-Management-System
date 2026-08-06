import { OPTIONAL_COLUMNS, type ViewState } from '@re-send/shared';

export type ColumnId =
  | 'select'
  | 'expander'
  | 'client'
  | 'child'
  | 'type'
  | 'staff'
  | 'keydate'
  | 'status'
  | 'updated'
  | (typeof OPTIONAL_COLUMNS)[number]['id'];

interface ColumnMeta {
  header: string;
  width: string;
}

export const COLUMN_META: Record<ColumnId, ColumnMeta> = {
  select: { header: '', width: '40px' },
  expander: { header: '', width: '36px' },
  client: { header: 'Client Name', width: 'minmax(200px, 1.6fr)' },
  child: { header: "Child's Name", width: 'minmax(120px, 1fr)' },
  type: { header: 'Type of Case', width: 'minmax(130px, 1fr)' },
  staff: { header: 'Staff', width: 'minmax(130px, 1fr)' },
  keydate: { header: 'Key Date', width: '210px' },
  status: { header: 'Status', width: '130px' },
  updated: { header: 'Updated', width: '130px' },
  team: { header: 'Team', width: '110px' },
  dateOfEnquiry: { header: 'Date of enquiry', width: '130px' },
  methodOfEnquiry: { header: 'Method', width: '150px' },
  dealingShadow: { header: 'Dealing/Shadow', width: '150px' },
  schoolYear: { header: 'School year', width: '110px' },
  dsplArea: { header: 'DSPL area', width: '110px' },
  paymentCode: { header: 'Payment', width: '110px' },
  discountCode: { header: 'Discount', width: '110px' },
  invoiceStatus: { header: 'Invoice', width: '160px' },
  consultationState: { header: 'Consultation', width: '150px' },
  lastReviewed: { header: 'Last reviewed', width: '130px' },
};

/** The ordered list of visible columns for the current view state. */
export function visibleColumns(state: ViewState): ColumnId[] {
  const cols: ColumnId[] = [];
  if (state.mode === 'advanced') cols.push('select');
  cols.push('expander', 'client', 'child', 'type', 'staff', 'keydate');
  if (state.mode === 'advanced') {
    cols.push('status', 'updated');
    for (const opt of OPTIONAL_COLUMNS) {
      if (state.columns.includes(opt.id)) cols.push(opt.id);
    }
  }
  return cols;
}

export function gridTemplate(cols: ColumnId[]): string {
  return cols.map((c) => COLUMN_META[c].width).join(' ');
}
