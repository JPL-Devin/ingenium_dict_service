import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import healthRoutes from '../src/routes/health.js';

describe('Health Routes', () => {
  let fastify;

  afterAll(async () => {
    if (fastify) await fastify.close();
  });

  it('GET /api/v4/health returns 200 with status OK', async () => {
    fastify = Fastify({ logger: false });
    fastify.register(healthRoutes, { prefix: '/api/v4' });
    await fastify.ready();

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/v4/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'OK' });
  });
});
