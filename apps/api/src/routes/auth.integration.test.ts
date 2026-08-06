import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

/**
 * Demo auth and reset run against a dedicated scratch database, created here and
 * dropped afterwards. The reset TRUNCATEs every case-data table, so it must not
 * touch the shared integration database other test files use in parallel. Env
 * (DATABASE_URL, DEMO_MODE, SESSION_SECRET) is set in beforeAll — never at module
 * top level — so nothing leaks into another file's fork.
 */
const base = process.env.TEST_DATABASE_URL ?? '';
const run = base ? describe : describe.skip;

const SCRATCH_DB = 'resend_auth_scratch';

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

run('demo auth + reset', () => {
  let buildServer: typeof import('../server').buildServer;
  let scratchUrl: string;
  const prior = {
    db: process.env.DATABASE_URL,
    demo: process.env.DEMO_MODE,
    secret: process.env.SESSION_SECRET,
  };

  beforeAll(async () => {
    // Create the scratch database from a maintenance connection.
    const admin = postgres(withDatabase(base, 'postgres'), { max: 1 });
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
      await admin.unsafe(`CREATE DATABASE ${SCRATCH_DB}`);
    } finally {
      await admin.end();
    }
    scratchUrl = withDatabase(base, SCRATCH_DB);

    // Migrate it exactly as a deploy would.
    execSync('npm run db:migrate -w @re-send/api', {
      env: { ...process.env, DATABASE_URL: scratchUrl },
      stdio: 'ignore',
    });

    // Point the app at the scratch DB and enable demo mode, then load modules.
    process.env.DATABASE_URL = scratchUrl;
    process.env.DEMO_MODE = 'true';
    process.env.SESSION_SECRET = 'test-session-secret';
    ({ buildServer } = await import('../server'));
    const { provisionDemoAccounts } = await import('../auth/demo-accounts');
    await provisionDemoAccounts();
  }, 60_000);

  afterAll(async () => {
    process.env.DATABASE_URL = prior.db;
    process.env.DEMO_MODE = prior.demo;
    process.env.SESSION_SECRET = prior.secret;
    const admin = postgres(withDatabase(base, 'postgres'), { max: 1 });
    try {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it('signs in a demo account, gates /api/me, and resets to a blank list', async () => {
    const app = await buildServer();

    // Unauthenticated: /api/me is 401 in demo mode (no silent fallback).
    expect(
      (await app.inject({ method: 'GET', url: '/api/me' })).statusCode,
    ).toBe(401);

    // The sign-in page can list the accounts (never the password).
    const accounts = (
      await app.inject({ method: 'GET', url: '/api/auth/accounts' })
    ).json();
    expect(accounts.demoMode).toBe(true);
    expect(
      accounts.accounts.some(
        (a: { email: string }) => a.email === 'ada@resend.demo',
      ),
    ).toBe(true);

    // Wrong password is rejected.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ada@resend.demo', password: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);

    // Correct credentials set an httpOnly session cookie.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ada@resend.demo', password: 'resend-demo' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'resend_session');
    expect(cookie?.httpOnly).toBe(true);
    const session = `resend_session=${cookie!.value}`;

    // The cookie authenticates /api/me.
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: session },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().displayName).toBe('Ada Okafor');

    // Create a case, then reset: the list goes back to empty, accounts stay.
    await app.inject({
      method: 'POST',
      url: '/api/cases',
      headers: { cookie: session },
      payload: {
        client: { fullName: 'Reset Parent' },
        child: { fullName: 'Reset Child' },
        case: { currentWork: 'Section Appeal' },
      },
    });
    const before = (
      await app.inject({
        method: 'GET',
        url: '/api/cases?limit=1',
        headers: { cookie: session },
      })
    ).json();
    expect(before.total).toBe(1);

    const reset = await app.inject({
      method: 'POST',
      url: '/api/demo/reset',
      headers: { cookie: session },
    });
    expect(reset.statusCode).toBe(200);

    const after = (
      await app.inject({
        method: 'GET',
        url: '/api/cases?limit=1',
        headers: { cookie: session },
      })
    ).json();
    expect(after.total).toBe(0);

    // Accounts survived the reset — you can still sign in.
    const reLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ada@resend.demo', password: 'resend-demo' },
    });
    expect(reLogin.statusCode).toBe(200);

    // Readiness reflects the reachable database.
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready', database: 'up' });

    await app.close();
  });
});
