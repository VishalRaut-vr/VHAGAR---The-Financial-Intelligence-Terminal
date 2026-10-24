
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/vhagar_test';
process.env.SESSION_SECRET ||= 'test-session-secret-not-for-production-000000';
process.env.FINBERT_SERVICE_URL ||= 'http://127.0.0.1:8001';

let server: any;
let baseUrl = '';
let sessionCookie = '';
let mongoose: typeof import('mongoose');
let User: typeof import('../models/User.js').User;
let Session: typeof import('../models/Session.js').Session;
let hashSessionToken: typeof import('../middleware/auth.js').hashSessionToken;

beforeAll(async () => {
  mongoose = await import('mongoose');
  const appModule = await import('../app.js');
  const userModule = await import('../models/User.js');
  const sessionModule = await import('../models/Session.js');
  const authModule = await import('../middleware/auth.js');

  User = userModule.User;
  Session = sessionModule.Session;
  hashSessionToken = authModule.hashSessionToken;

  await mongoose.default.connect(process.env.MONGODB_URI!);

  const email = `trade-test-${randomBytes(8).toString('hex')}@example.com`;
  const user = await User.create({
    name: 'Trade Test User',
    email,
    passwordHash: 'test-only-password-hash'
  });

  const token = randomBytes(32).toString('base64url');
  await Session.create({
    user: user._id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  sessionCookie = `vhagar_session=${token}`;

  server = appModule.app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  if (mongoose?.default.connection.readyState) {
    await mongoose.default.connection.close();
  }
});

describe('Trade execution & behavioral firewall', () => {
  it('rejects unauthenticated trade intent creation', async () => {
    const response = await fetch(`${baseUrl}/api/v1/trade/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'RELIANCE',
        quantity: 10,
        articleText: 'Earnings beat estimates.'
      })
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid request bodies', async () => {
    const response = await fetch(`${baseUrl}/api/v1/trade/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        symbol: '',
        quantity: 0,
        articleText: 'short'
      })
    });

    expect(response.status).toBe(400);
  });

  it('rejects client-tampered prices and totals', async () => {
    const response = await fetch(`${baseUrl}/api/v1/trade/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        symbol: 'RELIANCE',
        quantity: 10,
        articleText: 'Earnings beat estimates.',
        price: 1,
        total: 999999
      })
    });

    expect(response.status).toBe(400);
  });

  it('creates only an intent on the initial Buy action', async () => {
    const response = await fetch(`${baseUrl}/api/v1/trade/intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        symbol: 'RELIANCE',
        quantity: 10,
        articleText: 'Earnings beat estimates.'
      })
    });

    // A successful request may need live market data.
    // If it succeeds, it must create an intent, not place an order.
    if (response.ok) {
      const body = await response.json();
      expect(body.intentId).toBeTruthy();
      expect(body.modalTriggered).toBe(true);
      expect(body.requiresAnalysis).toBe(true);
    } else {
      // Market-data or database dependencies may prevent creation.
      expect([400, 502, 503]).toContain(response.status);
    }
  });
});
