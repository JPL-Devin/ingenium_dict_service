import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { buildTestApp, createMockCursor } from './helpers/setup.js';
import dictionaryRoutes from '../src/routes/dictionary.js';

describe('Dictionary Routes', () => {
  let fastify;

  beforeEach(async () => {
    fastify = buildTestApp(dictionaryRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  describe('GET /api/v4/dictionaries/:dictionary_type/versions', () => {
    it('returns list of dictionaries', async () => {
      const mockData = [
        { dictionary_type: 'flight', dictionary_version: '1.0', state: 'PUBLISHED' },
        { dictionary_type: 'flight', dictionary_version: '2.0', state: 'NOT_PUBLISHED' },
      ];
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(mockData));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/dictionaries/flight/versions',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
    });

    it('returns empty array when no dictionaries found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/dictionaries/flight/versions',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/v4/dictionaries/:dictionary_type/versions/:dictionary_version', () => {
    it('returns single dictionary', async () => {
      const mockDict = { dictionary_type: 'flight', dictionary_version: '1.0', state: 'PUBLISHED' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(mockDict));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/dictionaries/flight/versions/1.0',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dictionary_version).toBe('1.0');
    });

    it('returns 404 when dictionary not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/v4/dictionaries/flight/versions/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v4/dictionaries/:dictionary_type/versions', () => {
    it('creates new dictionary', async () => {
      // First query: check for duplicates (returns empty)
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));
      // Second query: insert
      const newDict = {
        dictionary_type: 'flight',
        dictionary_version: '3.0',
        dictionary_description: 'Test dict',
        state: 'NOT_PUBLISHED',
        creation_date: '2026-01-01T00:00:00Z',
      };
      fastify.mockDb.query.mockResolvedValueOnce({
        all: jest.fn().mockResolvedValue([newDict]),
        next: jest.fn().mockResolvedValue(null),
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/dictionaries/flight/versions',
        payload: {
          dictionary_version: '3.0',
          dictionary_description: 'Test dict',
          state: 'NOT_PUBLISHED',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dictionary_info).toBeDefined();
    });

    it('returns 409 when dictionary already exists', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor({ _key: 'existing' }));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/v4/dictionaries/flight/versions',
        payload: {
          dictionary_version: '1.0',
          state: 'PUBLISHED',
        },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('PATCH /api/v4/dictionaries/:dictionary_type/versions/:dictionary_version', () => {
    it('updates dictionary', async () => {
      const existingDoc = { _key: 'key1', dictionary_type: 'flight', dictionary_version: '1.0', state: 'NOT_PUBLISHED' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existingDoc));

      const updatedDoc = { ...existingDoc, state: 'PUBLISHED' };
      const mockCollection = fastify.mockDb.collection('dictionary');
      mockCollection.update.mockResolvedValueOnce({ new: updatedDoc });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/dictionaries/flight/versions/1.0',
        payload: { state: 'PUBLISHED' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dictionary_info).toBeDefined();
    });

    it('returns 404 when dictionary not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/v4/dictionaries/flight/versions/nonexistent',
        payload: { state: 'PUBLISHED' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v4/dictionaries/:dictionary_type/versions/:dictionary_version', () => {
    it('deletes dictionary and related content', async () => {
      const existingDoc = { _key: 'key1', dictionary_type: 'flight', dictionary_version: '1.0' };
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor(existingDoc));
      // Mock the bulk delete queries (6 collections)
      for (let i = 0; i < 6; i++) {
        fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));
      }
      const mockCollection = fastify.mockDb.collection('dictionary');
      mockCollection.remove.mockResolvedValueOnce(true);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/dictionaries/flight/versions/1.0',
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 when dictionary not found', async () => {
      fastify.mockDb.query.mockResolvedValueOnce(createMockCursor([]));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/v4/dictionaries/flight/versions/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
