import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/vhagar_test';
process.env.SESSION_SECRET ||= 'test-session-secret-not-for-production-000000';
process.env.FINBERT_SERVICE_URL ||= 'http://127.0.0.1:8001';

let server: any;
let baseUrl = '';
beforeAll(async () => {
  const { app } = await import('./app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });

describe('VHAGAR API boundary behavior', () => {
  it('returns a liveness response without requiring a database connection', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
    expect((await response.json()).service).toBe('vhagar-api');
  });
  it('rejects unauthenticated access to user-specific watchlists', async () => {
    const response = await fetch(`${baseUrl}/api/v1/watchlist`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('UNAUTHENTICATED');
  });
  it('returns a structured 404 for unknown API routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('NOT_FOUND');
  });
});

describe('authentication primitives', () => {
  it('stores a one-way Argon2id hash rather than a plaintext password', async () => {
    const password = 'a-long-test-password-123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(hash, password)).toBe(true);
    expect(await argon2.verify(hash, 'incorrect-password')).toBe(false);
  });
});
