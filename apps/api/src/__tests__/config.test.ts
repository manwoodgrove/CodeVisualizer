import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws an error when SESSION_SECRET is missing', async () => {
    vi.stubEnv('SESSION_SECRET', '');

    // Zod throws a ZodError, so we check for that or the message
    await expect(import('../config.js')).rejects.toThrow();
  });



  it('uses provided SESSION_SECRET', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'my-super-secret-key-that-is-long-enough');

    const { config } = await import('../config.js');
    expect(config.sessionSecret).toBe('my-super-secret-key-that-is-long-enough');
  });
});
