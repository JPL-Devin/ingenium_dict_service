import { jest } from '@jest/globals';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export { publicKey, privateKey };

export function createMockCursor(data) {
  const items = Array.isArray(data) ? data : [data];
  let index = 0;
  return {
    all: jest.fn().mockResolvedValue(items),
    next: jest.fn().mockImplementation(() => {
      return Promise.resolve(items[index++] || null);
    }),
    extra: { stats: { fullCount: items.length } },
  };
}

export function createMockCollection() {
  return {
    save: jest.fn().mockResolvedValue({ new: { _key: 'mock-key' } }),
    saveAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ new: { _key: 'mock-key' } }),
    remove: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(true),
  };
}

export function buildTestApp(routePlugin, opts = {}) {
  const fastify = Fastify({ logger: false });

  const mockCollections = {};
  const mockDb = {
    query: jest.fn().mockResolvedValue(createMockCursor([])),
    collection: jest.fn((name) => {
      if (!mockCollections[name]) {
        mockCollections[name] = createMockCollection();
      }
      return mockCollections[name];
    }),
  };

  fastify.register(fp(async function mockArango(fastify) {
    fastify.decorate('db', mockDb);
  }));

  fastify.register(fp(async function mockAuth(fastify) {
    fastify.decorate('authenticate', async () => {});
  }));

  fastify.register(routePlugin, { prefix: 'api/v4' });

  fastify.mockDb = mockDb;
  fastify.mockCollections = mockCollections;

  return fastify;
}
