import { spawn } from 'node:child_process';
import { E2E_DATABASE_URL, prepareDatabase } from './e2e-db';

/**
 * Prepare the clean e2e database, then start the API against it. Used as the
 * Playwright webServer command so the database is always ready before the API
 * boots and /health/ready can go green.
 */
const repoRoot = `${import.meta.dirname}/../../..`;

async function main(): Promise<void> {
  await prepareDatabase(repoRoot);

  const child = spawn('npm', ['run', 'start', '-w', '@re-send/api'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      DEMO_MODE: 'true',
      DEMO_PASSWORD: 'resend-demo',
      SESSION_SECRET: 'e2e-session-secret',
      NODE_ENV: 'development',
      PORT: '3000',
      AI_ENABLED: 'true',
      STORAGE_PROVIDER: 'local',
      UPLOAD_DIR: '.uploads-e2e',
      LOG_LEVEL: 'warn',
    },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

void main();
