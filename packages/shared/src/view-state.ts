/**
 * view-state.ts — the complete case list view state and its URL codec.
 *
 * mode, filters, sort and columns all encode into the URL so a view can be
 * pasted into a chat and reopened exactly. Filters and sort are one list, shown
 * differently in simple and advanced view; switching mode never drops them.
 */

import {
  DEFAULT_SORT,
  OPTIONAL_COLUMN_VALUES,
  SORT_VALUES,
  STATUS_VALUES,
  TEAM_VALUES,
  WORK_TYPE_VALUES,
  QUERY_TYPE_VALUES,
  ENQUIRY_METHOD_VALUES,
  PAYMENT_CODE_VALUES,
  DISCOUNT_CODE_VALUES,
  SCHOOL_YEAR_VALUES,
  CONSULTATION_STATE_VALUES,
} from './config';
import type {
  ConsultationState,
  DiscountCode,
  EnquiryMethod,
  OptionalColumnId,
  PaymentCode,
  QueryType,
  SchoolYear,
  SortId,
  Status,
  Team,
  WorkType,
} from './config';

export type ViewMode = 'simple' | 'advanced';
export type Density = 'comfortable' | 'compact';

export interface CaseFilters {
  mine?: boolean;
  unassigned?: boolean;
  staff?: string[];
  dealingShadow?: string[];
  status?: Status[];
  team?: Team[];
  workType?: WorkType[];
  queryType?: QueryType[];
  enquiryMethod?: EnquiryMethod[];
  enquiryYear?: number[];
  paymentCode?: PaymentCode[];
  discountCode?: DiscountCode[];
  schoolYear?: SchoolYear[];
  consultationState?: ConsultationState[];
  noNoteInDays?: number;
  notReviewedInDays?: number;
  keyDatePassed?: boolean;
  keyDateWithinDays?: number;
  noKeyDate?: boolean;
  missingConsent?: boolean;
}

export interface ViewState {
  mode: ViewMode;
  sort: SortId;
  density: Density;
  search: string;
  columns: OptionalColumnId[];
  filters: CaseFilters;
}

export function defaultViewState(): ViewState {
  return {
    mode: 'simple',
    sort: DEFAULT_SORT,
    density: 'comfortable',
    search: '',
    columns: [],
    filters: {},
  };
}

const VOCAB_FACETS = {
  status: STATUS_VALUES,
  team: TEAM_VALUES,
  workType: WORK_TYPE_VALUES,
  queryType: QUERY_TYPE_VALUES,
  enquiryMethod: ENQUIRY_METHOD_VALUES,
  paymentCode: PAYMENT_CODE_VALUES,
  discountCode: DISCOUNT_CODE_VALUES,
  schoolYear: SCHOOL_YEAR_VALUES,
  consultationState: CONSULTATION_STATE_VALUES,
} as const;

const USER_FACETS = ['staff', 'dealingShadow'] as const;
const BOOL_FACETS = [
  'mine',
  'unassigned',
  'keyDatePassed',
  'noKeyDate',
  'missingConsent',
] as const;
const DAY_FACETS = [
  'noNoteInDays',
  'notReviewedInDays',
  'keyDateWithinDays',
] as const;

// --- Encode -----------------------------------------------------------------

export function encodeViewState(state: ViewState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.mode !== 'simple') p.set('mode', state.mode);
  if (state.sort !== DEFAULT_SORT) p.set('sort', state.sort);
  if (state.density !== 'comfortable') p.set('density', state.density);
  if (state.search.trim()) p.set('q', state.search.trim());
  if (state.columns.length) p.set('cols', state.columns.join(','));

  const f = state.filters;
  for (const key of Object.keys(
    VOCAB_FACETS,
  ) as (keyof typeof VOCAB_FACETS)[]) {
    const value = f[key];
    if (value && value.length) p.set(key, value.join(','));
  }
  for (const key of USER_FACETS) {
    const value = f[key];
    if (value && value.length) p.set(key, value.join(','));
  }
  if (f.enquiryYear && f.enquiryYear.length) {
    p.set('enquiryYear', f.enquiryYear.join(','));
  }
  for (const key of BOOL_FACETS) {
    if (f[key]) p.set(key, '1');
  }
  for (const key of DAY_FACETS) {
    const value = f[key];
    if (typeof value === 'number') p.set(key, String(value));
  }
  return p;
}

export function encodeViewStateToString(state: ViewState): string {
  const s = encodeViewState(state).toString();
  return s ? `?${s}` : '';
}

// --- Decode -----------------------------------------------------------------

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

function keep<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const set = new Set<string>(allowed);
  return values.filter((v): v is T => set.has(v));
}

export function decodeViewState(input: URLSearchParams | string): ViewState {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input;

  const state = defaultViewState();

  const mode = params.get('mode');
  if (mode === 'advanced' || mode === 'simple') state.mode = mode;

  const sort = params.get('sort');
  if (sort && (SORT_VALUES as readonly string[]).includes(sort)) {
    state.sort = sort as SortId;
  }

  const density = params.get('density');
  if (density === 'compact' || density === 'comfortable')
    state.density = density;

  state.search = params.get('q') ?? '';
  state.columns = keep(readList(params, 'cols'), OPTIONAL_COLUMN_VALUES);

  const f: CaseFilters = {};
  for (const key of Object.keys(
    VOCAB_FACETS,
  ) as (keyof typeof VOCAB_FACETS)[]) {
    const kept = keep(readList(params, key), VOCAB_FACETS[key]);
    if (kept.length) f[key] = kept as never;
  }
  for (const key of USER_FACETS) {
    const list = readList(params, key);
    if (list.length) f[key] = list;
  }
  const years = readList(params, 'enquiryYear')
    .map((y) => Number(y))
    .filter((y) => Number.isInteger(y) && y > 1900 && y < 3000);
  if (years.length) f.enquiryYear = years;

  for (const key of BOOL_FACETS) {
    if (params.get(key) === '1') f[key] = true;
  }
  for (const key of DAY_FACETS) {
    const n = Number(params.get(key));
    if (Number.isFinite(n) && n > 0) f[key] = n;
  }

  state.filters = f;
  return state;
}

// --- Active filter chips -----------------------------------------------------

export interface FilterChip {
  /** Stable key for React lists and removal. */
  key: string;
  facet: keyof CaseFilters;
  /** The single value this chip represents, when the facet is multi-value. */
  value?: string | number;
  label: string;
  /** True when `label` is a user id the UI should replace with a display name. */
  needsUserLookup: boolean;
}

const SIMPLE_BOOL_LABELS: Record<string, string> = {
  mine: 'Mine',
  unassigned: 'To be assigned',
  keyDatePassed: 'Key date passed',
  noKeyDate: 'No key date set',
  missingConsent: 'Missing consent',
};
const DAY_LABELS: Record<string, (n: number) => string> = {
  noNoteInDays: (n) => `No note in ${n} days`,
  notReviewedInDays: (n) => `Not reviewed in ${n} days`,
  keyDateWithinDays: (n) => `Key date within ${n} days`,
};
const FACET_PREFIX: Record<string, string> = {
  status: 'Status',
  team: 'Team',
  workType: 'Type',
  queryType: 'Query',
  enquiryMethod: 'Method',
  enquiryYear: 'Enquiry',
  paymentCode: 'Payment',
  discountCode: 'Discount',
  schoolYear: 'Year',
  consultationState: 'Consult',
  staff: 'Staff',
  dealingShadow: 'Dealing/Shadow',
};

/** Every active filter as a removable chip, for BOTH views. */
export function activeFilterChips(filters: CaseFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  const pushList = (facet: keyof CaseFilters, values: (string | number)[]) => {
    for (const value of values) {
      const isUser = (USER_FACETS as readonly string[]).includes(facet);
      chips.push({
        key: `${facet}:${value}`,
        facet,
        value,
        label: isUser
          ? String(value)
          : `${FACET_PREFIX[facet] ?? facet}: ${value}`,
        needsUserLookup: isUser,
      });
    }
  };

  for (const key of Object.keys(
    VOCAB_FACETS,
  ) as (keyof typeof VOCAB_FACETS)[]) {
    const value = filters[key];
    if (value && value.length) pushList(key, value as (string | number)[]);
  }
  for (const key of USER_FACETS) {
    const value = filters[key];
    if (value && value.length) pushList(key, value);
  }
  if (filters.enquiryYear?.length) pushList('enquiryYear', filters.enquiryYear);

  for (const key of BOOL_FACETS) {
    if (filters[key]) {
      chips.push({
        key,
        facet: key,
        label: SIMPLE_BOOL_LABELS[key] ?? key,
        needsUserLookup: false,
      });
    }
  }
  for (const key of DAY_FACETS) {
    const value = filters[key];
    if (typeof value === 'number') {
      chips.push({
        key,
        facet: key,
        label: DAY_LABELS[key]!(value),
        needsUserLookup: false,
      });
    }
  }
  return chips;
}

export function countActiveFilters(filters: CaseFilters): number {
  return activeFilterChips(filters).length;
}

export function hasActiveFilters(filters: CaseFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/** Remove one chip's contribution, returning new filters. */
export function removeFilterChip(
  filters: CaseFilters,
  chip: FilterChip,
): CaseFilters {
  const next: CaseFilters = { ...filters };
  if (chip.value === undefined) {
    delete next[chip.facet];
    return next;
  }
  const current = next[chip.facet];
  if (Array.isArray(current)) {
    const filtered = (current as (string | number)[]).filter(
      (v) => v !== chip.value,
    );
    if (filtered.length) {
      next[chip.facet] = filtered as never;
    } else {
      delete next[chip.facet];
    }
  }
  return next;
}
