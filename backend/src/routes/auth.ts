import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, SESSION_COOKIE, hashSessionToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } });
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) }).strict();
const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }).strict();
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = () => ({ httpOnly: true, secure: env.COOKIE_SECURE === 'true' || env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: sessionDurationMs });

function rejectCrossOriginMutation(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  const origin = req.get('origin');
  if (origin && origin !== env.FRONTEND_ORIGIN) { res.status(403).json({ error: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' }); return; }
  next();
}
authRouter.use(rejectCrossOriginMutation);

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Provide a valid name, email, and password of at least 12 characters.', issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), code: i.code })) }); return; }
    const existing = await User.exists({ email: parsed.data.email });
    if (existing) { res.status(409).json({ error: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }); return; }
    const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
    const user = await User.create({ name: parsed.data.name, email: parsed.data.email, passwordHash });
    const token = randomBytes(32).toString('base64url');
    await Session.create({ user: user._id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + sessionDurationMs) });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, preferences: user.preferences }, expiresAt: new Date(Date.now() + sessionDurationMs).toISOString() });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'EMAIL_EXISTS', message: 'An account with this email already exists.' }); return; }
    next(error);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Provide a valid email and password.' }); return; }
    const user = await User.findOne({ email: parsed.data.email }).select('+passwordHash');
    const valid = user ? await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false) : false;
    if (!user || !valid) { res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }); return; }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionDurationMs);
    await Session.create({ user: user._id, tokenHash: hashSessionToken(token), expiresAt });
    res.cookie(SESSION_COOKIE, token, cookieOptions());
    res.json({ user: { id: user.id, name: user.name, email: user.email, preferences: user.preferences }, expiresAt: expiresAt.toISOString() });
  } catch (error) { next(error); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await Session.deleteOne({ tokenHash: hashSessionToken(token) });
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
    res.status(204).end();
  } catch (error) { next(error); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const user = await User.findById(userId).select('name email preferences createdAt');
    if (!user) { res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Please sign in to continue.' }); return; }
    res.json({ user: { id: user.id, name: user.name, email: user.email, preferences: user.preferences, createdAt: user.createdAt } });
  } catch (error) { next(error); }
});

const preferencesSchema = z.object({
  theme: z.enum(['dark','light','system']).optional(),
  defaultMarket: z.enum(['IN','US','GLOBAL']).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'At least one preference is required.' });
authRouter.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error:'VALIDATION_ERROR', message:'Provide one or more valid preferences.' }); return; }
    const userId = (req as AuthenticatedRequest).userId;
    const update = Object.fromEntries(Object.entries(parsed.data).map(([key,value]) => [`preferences.${key}`,value]));
    const user = await User.findByIdAndUpdate(userId, { $set:update }, { new:true, runValidators:true }).select('name email preferences createdAt');
    if (!user) { res.status(401).json({ error:'UNAUTHENTICATED', message:'Please sign in to continue.' }); return; }
    res.json({ user:{ id:user.id, name:user.name, email:user.email, preferences:user.preferences, createdAt:user.createdAt } });
  } catch(error) { next(error); }
});
