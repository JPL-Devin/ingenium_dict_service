import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import authPlugin from '../src/plugins/auth.js';
import { publicKey, privateKey } from './helpers/setup.js';

describe('Auth Plugin', () => {
  let fastify;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    fastify.register(authPlugin, { secret: publicKey });

    fastify.after(() => {
      fastify.get('/protected', {
        preHandler: [fastify.authenticate],
        handler: async (request) => {
          return { user: request.user };
        },
      });
    });

    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('decorates fastify with authenticate function', () => {
    expect(fastify.authenticate).toBeDefined();
    expect(typeof fastify.authenticate).toBe('function');
  });

  it('returns 401 when no Authorization header', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing or invalid Authorization header');
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc123' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Missing or invalid Authorization header');
  });

  it('returns 401 with invalid JWT token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer invalid.token.here' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid or expired token');
  });

  it('returns 401 with expired JWT token', async () => {
    const token = jwt.sign({ sub: 'user1' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '-1s',
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().message).toBe('Invalid or expired token');
  });

  it('sets request.user with valid JWT token', async () => {
    const token = jwt.sign({ sub: 'user1', scope: 'admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.sub).toBe('user1');
    expect(body.user.scope).toBe('admin');
  });

  it('throws error if secret is not provided', async () => {
    const app = Fastify({ logger: false });
    app.register(authPlugin, {});

    await expect(app.ready()).rejects.toThrow('Secret must be provided for auth plugin');
    await app.close();
  });
});
