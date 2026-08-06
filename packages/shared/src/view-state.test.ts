import { describe, expect, it } from 'vitest';
import {
  activeFilterChips,
  countActiveFilters,
  decodeViewState,
  defaultViewState,
  encodeViewState,
  removeFilterChip,
  type ViewState,
} from './view-state';

describe('view-state URL codec', () => {
  it('round-trips a full state', () => {
    const state: ViewState = {
      mode: 'advanced',
      sort: 'lastUpdatedOldest',
      density: 'compact',
      search: 'hearing bundle',
      columns: ['team', 'schoolYear'],
      filters: {
        mine: true,
        status: ['Active', 'Enquiry'],
        team: ['TSA'],
        staff: ['user-1', 'user-2'],
        enquiryYear: [2025, 2026],
        noNoteInDays: 30,
        noKeyDate: true,
      },
    };
    const decoded = decodeViewState(encodeViewState(state));
    expect(decoded).toEqual(state);
  });

  it('omits defaults from the URL for clean links', () => {
    const params = encodeViewState(defaultViewState());
    expect(params.toString()).toBe('');
  });

  it('drops values that are not in their vocabulary', () => {
    const decoded = decodeViewState(
      'status=Active,Nonsense&team=XYZ&sort=bogus',
    );
    expect(decoded.filters.status).toEqual(['Active']);
    expect(decoded.filters.team).toBeUndefined();
    expect(decoded.sort).toBe('keyDateSoonest');
  });
});

describe('active filter chips', () => {
  it('renders one chip per value and flags user lookups', () => {
    const filters = {
      status: ['Active', 'Closed'] as ('Active' | 'Closed')[],
      staff: ['user-1'],
      noKeyDate: true,
    };
    const chips = activeFilterChips({ ...filters });
    expect(countActiveFilters(filters)).toBe(chips.length);
    expect(chips.map((c) => c.key)).toContain('status:Active');
    expect(chips.find((c) => c.facet === 'staff')?.needsUserLookup).toBe(true);
    expect(chips.find((c) => c.facet === 'noKeyDate')?.label).toBe(
      'No key date set',
    );
  });

  it('removes a single value without dropping the rest of the facet', () => {
    const filters = { status: ['Active', 'Closed'] as ('Active' | 'Closed')[] };
    const chip = activeFilterChips(filters).find((c) => c.value === 'Active')!;
    expect(removeFilterChip(filters, chip).status).toEqual(['Closed']);
  });

  it('removes a boolean facet entirely', () => {
    const filters = { missingConsent: true };
    const chip = activeFilterChips(filters)[0]!;
    expect(removeFilterChip(filters, chip).missingConsent).toBeUndefined();
  });
});
