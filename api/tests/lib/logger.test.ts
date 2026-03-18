import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadCreateLogger(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock('../../src/env.js', () => ({
    env: {
      NODE_ENV: 'development',
      ...envOverrides,
    },
  }));
  const module = await import('../../src/lib/logger.js');
  return module.createLogger;
}

describe('createLogger', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('defaults to warn level in test environment', async () => {
    const createLogger = await loadCreateLogger({ NODE_ENV: 'test' });
    const logger = createLogger();
    expect(logger.level).toBe('warn');
  });

  it('uses debug level in development by default', async () => {
    const createLogger = await loadCreateLogger({ NODE_ENV: 'development' });
    const logger = createLogger();
    expect(logger.level).toBe('debug');
  });

  it('respects explicit LOG_LEVEL overrides', async () => {
    const createLogger = await loadCreateLogger({
      NODE_ENV: 'production',
      LOG_LEVEL: 'trace',
    });
    const logger = createLogger();
    expect(logger.level).toBe('trace');
  });

  it('provides default level and bindings formatters when none are given', async () => {
    const createLogger = await loadCreateLogger({ NODE_ENV: 'production' });
    const logger = createLogger();

    expect(logger.formatters?.level).toBeDefined();
    expect(logger.formatters?.level!('info')).toEqual({ level: 'info' });

    expect(logger.formatters?.bindings).toBeDefined();
    expect(logger.formatters?.bindings!({ pid: 1, hostname: 'h' })).toEqual({
      pid: 1,
      hostname: 'h',
    });
  });

  it('merges custom formatter functions without overriding', async () => {
    const levelFormatter = vi.fn();
    const bindingsFormatter = vi.fn();

    const createLogger = await loadCreateLogger({ NODE_ENV: 'production' });
    const logger = createLogger({
      level: 'error',
      formatters: {
        level: levelFormatter,
        bindings: bindingsFormatter,
      },
    });

    expect(logger.level).toBe('error');
    expect(logger.formatters?.level).toBe(levelFormatter);
    expect(logger.formatters?.bindings).toBe(bindingsFormatter);
    expect(logger.base).toBeNull();
    expect(typeof logger.timestamp).toBe('function');
  });
});
