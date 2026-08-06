import { execSync } from 'node:child_process';
import postgres from 'postgres';

/**
 * The clean e2e database and its preparation. Drops and recreates `resend_e2e`,
 * migrates it, and provisions the demo sign-in accounts — leaving the case list
 * EMPTY. Called from the API launcher (serve-api.ts) so preparation always
 * completes before the API starts, independent of Playwright's setup ordering.
 */
const BASE =
  process.env.E2E_ADMIN_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/postgres';
const E2E_DB = 'resend_e2e';

function urlFor(db: string): string {
  const u = new URL(BASE);
  u.pathname = `/${db}`;
  return u.toString();
}

export const E2E_DATABASE_URL = urlFor(E2E_DB);

const ACCOUNTS: [string, string, string][] = [
  ['ada@resend.demo', 'Ada Okafor', 'admin'],
  ['ben@resend.demo', 'Ben Carter', 'caseworker'],
  ['priya@resend.demo', 'Priya Nair', 'caseworker'],
  ['dana@resend.demo', 'Dana Ruiz', 'finance'],
];

export async function prepareDatabase(repoRoot: string): Promise<void> {
  const admin = postgres(urlFor('postgres'), { max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${E2E_DB}`);
  } finally {
    await admin.end();
  }

  execSync('npm run db:migrate -w @re-send/api', {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'ignore',
  });

  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    for (const [email, name, role] of ACCOUNTS) {
      await sql`
        INSERT INTO users (email, display_name, role, active)
        VALUES (${email}, ${name}, ${role}, true)
        ON CONFLICT (email) DO UPDATE SET active = true
      `;
    }
  } finally {
    await sql.end();
  }
}
