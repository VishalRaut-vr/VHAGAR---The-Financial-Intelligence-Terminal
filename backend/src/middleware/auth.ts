import { createHmac } from 'node:crypto';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/Session.js';
import { env } from '../config/env.js';

export type AuthenticatedRequest = Express.Request & { userId?: mongoose.Types.ObjectId };
export const SESSION_COOKIE = 'vhagar_session';
export const hashSessionToken = (token: string) => createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) {
      res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Please sign in to continue.' });
      return;
    }
    const session = await Session.findOne({ tokenHash: hashSessionToken(token), expiresAt: { $gt: new Date() } }).select('+tokenHash').lean();
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/' });
      res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' });
      return;
    }
    (req as AuthenticatedRequest).userId = session.user as mongoose.Types.ObjectId;
    next();
  } catch (error) { next(error); }
};
