import { describe, expect, it } from 'vitest';
import type { CorpusResult } from '@re-send/shared';
import { getCachedCorpus, setCachedCorpus } from './corpus/cache';
import { dispatchEntityChange } from './realtime';

const stub = { caseId: 'c' } as CorpusResult;

describe('corpus invalidation from live updates', () => {
  it('drops a case corpus when a school is linked to or unlinked from it', () => {
    setCachedCorpus('case-1', 'k', stub);
    dispatchEntityChange('case_schools', 'link-1', 'case-1');
    expect(getCachedCorpus('case-1', 'k')).toBeUndefined();
  });

  it("drops every corpus when a school's details or contacts change", () => {
    setCachedCorpus('case-1', 'k', stub);
    setCachedCorpus('case-2', 'k', stub);
    dispatchEntityChange('schools', 'school-1', null);
    expect(getCachedCorpus('case-1', 'k')).toBeUndefined();
    expect(getCachedCorpus('case-2', 'k')).toBeUndefined();
    setCachedCorpus('case-3', 'k', stub);
    dispatchEntityChange('school_contacts', 'contact-1', 'school-1');
    expect(getCachedCorpus('case-3', 'k')).toBeUndefined();
  });
});
