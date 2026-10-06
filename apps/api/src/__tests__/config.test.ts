import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws an error when SESSION_SECRET is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Ensure it's not set
    vi.stubEnv('SESSION_SECRET', '');

    // Zod throws a ZodError, so we check for that or the message
    await expect(import('../config.js')).rejects.toThrow();
  });

  it('generates a random secret when SESSION_SECRET is missing in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SESSION_SECRET', '');

    const { config, logSessionSecretWarning } = await import('../config.js');
    const logger = { warn: vi.fn() };
    logSessionSecretWarning(logger);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Sessions will not survive restarts'));
    expect(config.sessionSecret).toBeDefined();
    expect(config.sessionSecret.length).toBe(64);
  });

  it('uses provided SESSION_SECRET in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SESSION_SECRET', 'my-super-secret-key-that-is-long-enough');

    const { config, logSessionSecretWarning } = await import('../config.js');
    const logger = { warn: vi.fn() };
    logSessionSecretWarning(logger);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(config.sessionSecret).toBe('my-super-secret-key-that-is-long-enough');
  });
});
