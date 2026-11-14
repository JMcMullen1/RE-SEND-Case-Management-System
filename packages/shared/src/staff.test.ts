import { describe, expect, it } from 'vitest';
import { isPlausibleEmail, normaliseEmail, staffChangeProblem } from './staff';

const admin = { id: 'a', role: 'admin' as const, active: true };

describe('staffChangeProblem', () => {
  it('never leaves the system without an active admin', () => {
    expect(
      staffChangeProblem({
        actorId: 'b',
        target: admin,
        change: { active: false },
        activeAdmins: 1,
      }),
    ).toMatch(/at least one active admin/);
    expect(
      staffChangeProblem({
        actorId: 'b',
        target: admin,
        change: { role: 'caseworker' },
        activeAdmins: 2,
      }),
    ).toBeNull();
  });
  it('stops an admin removing their own admin access', () => {
    expect(
      staffChangeProblem({
        actorId: 'a',
        target: admin,
        change: { active: false },
        activeAdmins: 3,
      }),
    ).toMatch(/your own admin access/);
  });
  it('allows ordinary changes', () => {
    expect(
      staffChangeProblem({
        actorId: 'a',
        target: { id: 'c', role: 'caseworker', active: true },
        change: { active: false },
        activeAdmins: 1,
      }),
    ).toBeNull();
  });
});

describe('emails', () => {
  it('normalises and checks addresses', () => {
    expect(normaliseEmail('  Jo.Bloggs@ReSend.org ')).toBe(
      'jo.bloggs@resend.org',
    );
    expect(isPlausibleEmail('jo@resend.org')).toBe(true);
    expect(isPlausibleEmail('jo@resend')).toBe(false);
  });
});
