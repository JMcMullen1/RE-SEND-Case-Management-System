import { describe, expect, it } from 'vitest';
import { assertRuntimeSafety, type Env } from './env';

function envWith(overrides: Partial<Env>): Env {
  return {
    NODE_ENV: 'development',
    PORT: 3000,
    HOST: '0.0.0.0',
    STORAGE_PROVIDER: 'local',
    UPLOAD_DIR: '.uploads',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: true,
    AI_ENABLED: true,
    AI_MAX_RETRIES: 2,
    LOG_LEVEL: 'info',
    DEMO_MODE: false,
    DEMO_PASSWORD: 'resend-demo',
    ...overrides,
  } as Env;
}

describe('assertRuntimeSafety', () => {
  it('refuses DEMO_MODE in production', () => {
    expect(() =>
      assertRuntimeSafety(
        envWith({
          DEMO_MODE: true,
          NODE_ENV: 'production',
          SESSION_SECRET: 's',
        }),
      ),
    ).toThrow(/DEMO_MODE must not be enabled/);
  });

  it('requires a session secret in production', () => {
    expect(() =>
      assertRuntimeSafety(envWith({ NODE_ENV: 'production' })),
    ).toThrow(/SESSION_SECRET is required/);
  });

  it('allows demo mode outside production', () => {
    expect(() =>
      assertRuntimeSafety(
        envWith({ DEMO_MODE: true, NODE_ENV: 'development' }),
      ),
    ).not.toThrow();
  });

  it('allows production with a session secret and demo off', () => {
    expect(() =>
      assertRuntimeSafety(
        envWith({ NODE_ENV: 'production', SESSION_SECRET: 'secret' }),
      ),
    ).not.toThrow();
  });
});
