import { buildServer } from './server';
import { startEntityListener } from './entity-listener';
import { provisionDemoAccounts } from './auth/demo-accounts';
import { assertRuntimeSafety, env } from './env';
import { assertEncryptionConfigured } from './crypto/encryption';
import { runEncryptionBackfill } from './crypto/backfill';

async function main(): Promise<void> {
  // Fatal safety checks before anything binds: demo login must never be live in
  // production, and production must have a session secret.
  assertRuntimeSafety();
  // No key, no start: sensitive data must never be stored unprotected.
  assertEncryptionConfigured();

  const app = await buildServer();

  // In demo mode, ensure the named sign-in accounts exist. This provisions
  // staff (the real staff list), not cases — the case list still starts empty.
  if (env.DEMO_MODE) {
    try {
      await provisionDemoAccounts();
    } catch (error) {
      app.log.error(error, 'failed to provision demo accounts');
    }
  }

  // The live-updates LISTEN connection is best-effort at boot: if the database
  // is briefly unreachable the server still starts and serves (readiness will
  // report unready until the database is up).
  let stopListener = async () => {};
  try {
    stopListener = await startEntityListener();
  } catch (error) {
    app.log.error(error, 'entity listener failed to start');
  }
  const shutdown = () => {
    void stopListener();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    // Encrypt anything stored before encryption (or under a previous key), in
    // the background: the service is already answering. Counts only are logged.
    void runEncryptionBackfill()
      .then((r) => {
        if (!r) return; // another instance is running it
        app.log.info(r, 'encryption pass finished');
        if (r.unreadable || r.failed)
          app.log.error(
            { unreadable: r.unreadable, failed: r.failed },
            'encryption pass incomplete: keep ENCRYPTION_KEY_PREVIOUS until a pass reports none',
          );
      })
      .catch((error: unknown) =>
        app.log.error(
          { error: error instanceof Error ? error.name : 'unknown' },
          'encryption pass failed',
        ),
      );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
