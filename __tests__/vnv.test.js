import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildTestApp, createMockCursor } from './helpers/setup.js';
import vnvRoutes from '../src/routes/vnv.js';

describe('VnV Routes', () => {
  let fastify;

  beforeEach(async () => {
    fastify = buildTestApp(vnvRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  describe('POST /api/v4/vnv/vis', () => {
    it('creates verification items', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const vnvCollection = fastify.mockDb.collection('vnv');
      vnvCollection.saveAll.mockResolvedValueOnce([
        { new: { _key: 'v1', vi_id: 'VI-001', vi_name: 'Test Item' } },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/vnv/vis',
        payload: [{ vi_id: 'VI-001', vi_name: 'Test Item', vi_type: 'requirement' }],
      });

      expect(response.statusCode).toBe(201);
    });

    it('returns 409 on duplicate vi_id', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(['VI-001']));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/vnv/vis',
        payload: [{ vi_id: 'VI-001', vi_name: 'Test Item' }],
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /api/v4/vnv/vis', () => {
    it('returns list of verification items', async () => {
      const items = [
        { vi_id: 'VI-001', vi_name: 'Item A' },
        { vi_id: 'VI-002', vi_name: 'Item B' },
      ];
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(items));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/vnv/vis',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('returns empty list when no items', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/vnv/vis',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/v4/vnv/vis/:vi_id', () => {
    it('returns single verification item', async () => {
      const item = { vi_id: 'VI-001', vi_name: 'Item A' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(item));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/vnv/vis/VI-001',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().vi_id).toBe('VI-001');
    });

    it('returns 404 when item not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/vnv/vis/NONEXISTENT',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v4/vnv/vis/:vi_id', () => {
    it('updates verification item', async () => {
      const existing = { _key: 'v1', vi_id: 'VI-001', vi_name: 'Item A' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

      const vnvCollection = fastify.mockDb.collection('vnv');
      vnvCollection.update.mockResolvedValueOnce({ new: { ...existing, vi_name: 'Updated' } });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/vnv/vis/VI-001',
        payload: { vi_name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 when item not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/vnv/vis/NONEXISTENT',
        payload: { vi_name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v4/vnv/vis/:vi_id', () => {
    it('deletes verification item', async () => {
      const existing = { _key: 'v1', vi_id: 'VI-001' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

      const vnvCollection = fastify.mockDb.collection('vnv');
      vnvCollection.remove.mockResolvedValueOnce(true);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/vnv/vis/VI-001',
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 when item not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/vnv/vis/NONEXISTENT',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v4/vnv/vis/bulk', () => {
    it('returns bulk queried verification items', async () => {
      const items = [{ vi_id: 'VI-001' }, { vi_id: 'VI-002' }];
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(items));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/vnv/vis/bulk',
        payload: ['VI-001', 'VI-002'],
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });
  });
});
