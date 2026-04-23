import { describe, it, expect } from '@jest/globals';

describe('Environment Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses default values when env vars are not set', async () => {
    delete process.env.APP_PORT;
    delete process.env.APP_HOST;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.ARANGO_URL;
    delete process.env.ARANGO_DB_NAME;
    delete process.env.ARANGO_USERNAME;
    delete process.env.ARANGO_PASSWORD;
    delete process.env.PUBLIC_PEM;

    const mod = await import(`../src/config/env.js?t=${Date.now()}`);

    expect(mod.APP_PORT).toBeDefined();
    expect(mod.APP_HOST).toBeDefined();
    expect(mod.ARANGO_URL).toBeDefined();
    expect(mod.ARANGO_DB_NAME).toBeDefined();
    expect(mod.COLLECTION_NAMES).toEqual([
      'dictionary', 'command', 'channel', 'evr', 'mil1553', 'vnv', 'custom_script'
    ]);
  });

  it('exports expected configuration constants', async () => {
    const mod = await import(`../src/config/env.js?t=${Date.now() + 1}`);

    expect(mod).toHaveProperty('APP_PORT');
    expect(mod).toHaveProperty('APP_HOST');
    expect(mod).toHaveProperty('NODE_ENV');
    expect(mod).toHaveProperty('LOG_LEVEL');
    expect(mod).toHaveProperty('ARANGO_URL');
    expect(mod).toHaveProperty('ARANGO_DB_NAME');
    expect(mod).toHaveProperty('ARANGO_USERNAME');
    expect(mod).toHaveProperty('ARANGO_PASSWORD');
    expect(mod).toHaveProperty('PUBLIC_PEM');
    expect(mod).toHaveProperty('COLLECTION_NAMES');
  });
});
