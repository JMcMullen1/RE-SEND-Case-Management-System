import { describe, expect, it } from 'vitest';
import { restorePlan } from './backup';

describe('restorePlan', () => {
  it('puts each table after the ones it refers to', () => {
    const { order, deferred } = restorePlan(
      ['notes', 'cases', 'users'],
      [
        { table: 'notes', column: 'case_id', references: 'cases' },
        { table: 'cases', column: 'owner_id', references: 'users' },
      ],
    );
    expect(order).toEqual(['users', 'cases', 'notes']);
    expect(deferred).toEqual({});
  });

  it('fills in links to the same table, and links round a loop, afterwards', () => {
    const { order, deferred } = restorePlan(
      ['a', 'b'],
      [
        { table: 'a', column: 'parent_id', references: 'a' },
        { table: 'a', column: 'b_id', references: 'b' },
        { table: 'b', column: 'a_id', references: 'a' },
      ],
    );
    expect(order).toHaveLength(2);
    expect(deferred.a).toContain('parent_id');
    // One side of the a ⇄ b loop waits until both tables are filled.
    const first = order[0]!;
    expect(deferred[first]).toContain(first === 'a' ? 'b_id' : 'a_id');
  });
});
