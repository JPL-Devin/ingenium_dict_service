import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { buildTestApp, createMockCursor } from './helpers/setup.js';
import customScriptRoutes from '../src/routes/customScript.js';

describe('Custom Script Routes', () => {
  let fastify;

  beforeEach(async () => {
    fastify = buildTestApp(customScriptRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  describe('POST /api/v4/custom_scripts', () => {
    it('creates custom scripts', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const csCollection = fastify.mockDb.collection('custom_script');
      csCollection.saveAll.mockResolvedValueOnce([
        { new: { _key: 'cs1', script_id: 'SCRIPT-001', script_name: 'Test Script' } },
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/custom_scripts',
        payload: [{ script_id: 'SCRIPT-001', script_name: 'Test Script' }],
      });

      expect(response.statusCode).toBe(201);
    });

    it('returns 409 on duplicate script_id', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(['SCRIPT-001']));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/custom_scripts',
        payload: [{ script_id: 'SCRIPT-001', script_name: 'Test Script' }],
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('GET /api/v4/custom_scripts', () => {
    it('returns list of custom scripts', async () => {
      const scripts = [
        { script_id: 'SCRIPT-001', script_name: 'Script A' },
        { script_id: 'SCRIPT-002', script_name: 'Script B' },
      ];
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(scripts));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/custom_scripts',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });

    it('returns empty list when no scripts exist', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/custom_scripts',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/v4/custom_scripts/:script_id', () => {
    it('returns single custom script', async () => {
      const script = { script_id: 'SCRIPT-001', script_name: 'Script A' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(script));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/custom_scripts/SCRIPT-001',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().script_id).toBe('SCRIPT-001');
    });

    it('returns 404 when script not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/custom_scripts/NONEXISTENT',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v4/custom_scripts/:script_id', () => {
    it('updates custom script', async () => {
      const existing = { _key: 'cs1', script_id: 'SCRIPT-001', script_name: 'Script A' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

      const csCollection = fastify.mockDb.collection('custom_script');
      csCollection.update.mockResolvedValueOnce({ new: { ...existing, script_name: 'Updated' } });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/custom_scripts/SCRIPT-001',
        payload: { script_name: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 when script not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/custom_scripts/NONEXISTENT',
        payload: { script_name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v4/custom_scripts/:script_id', () => {
    it('deletes custom script', async () => {
      const existing = { _key: 'cs1', script_id: 'SCRIPT-001' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existing));

      const csCollection = fastify.mockDb.collection('custom_script');
      csCollection.remove.mockResolvedValueOnce(true);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/custom_scripts/SCRIPT-001',
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 when script not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/custom_scripts/NONEXISTENT',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v4/custom_scripts/bulk_query', () => {
    it('returns bulk queried custom scripts', async () => {
      const scripts = [{ script_id: 'SCRIPT-001' }, { script_id: 'SCRIPT-002' }];
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(scripts));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/custom_scripts/bulk_query',
        payload: ['SCRIPT-001', 'SCRIPT-002'],
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(2);
    });
  });
});
