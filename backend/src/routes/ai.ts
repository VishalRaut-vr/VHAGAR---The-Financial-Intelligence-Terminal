import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ChatConversation } from '../models/ChatConversation.js';
import { SavedResearch } from '../models/SavedResearch.js';
import { NewsCache } from '../models/NewsCache.js';
import { getCandles, getCompanyNews, getProfile, getQuote, safeHttpUrl } from '../services/marketData.js';
import { answerResearch } from '../services/llm.js';
export const aiRouter = Router(); aiRouter.use(requireAuth);
const aiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'AI research limit reached. Please try again later.' } });
const uid = (req: any) => (req as AuthenticatedRequest).userId as mongoose.Types.ObjectId;
const askSchema = z.object({ question: z.string().trim().min(3).max(4000), symbol: z.string().trim().max(20).optional(), conversationId: z.string().optional() }).strict();
aiRouter.get('/conversations', async (req, res, next) => { try { const items = await ChatConversation.find({ user: uid(req) }).select('title createdAt updatedAt messages').sort({ updatedAt: -1 }).limit(50).lean(); res.json({ conversations: items.map(c => ({ id: String(c._id), title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length })) }); } catch (e) { next(e); } });
aiRouter.get('/conversations/:id', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'INVALID_ID', message: 'Invalid conversation id.' }); return; } const c = await ChatConversation.findOne({ _id: req.params.id, user: uid(req) }).lean(); if (!c) { res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation not found.' }); return; } res.json({ conversation: { id: String(c._id), title: c.title, messages: c.messages, createdAt: c.createdAt, updatedAt: c.updatedAt } }); } catch (e) { next(e); } });
aiRouter.delete('/conversations/:id', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'INVALID_ID', message: 'Invalid conversation id.' }); return; } await ChatConversation.deleteOne({ _id: req.params.id, user: uid(req) }); res.status(204).end(); } catch (e) { next(e); } });
aiRouter.post('/chat', aiLimiter, async (req, res, next) => {
  try {
    const parsed = askSchema.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Question must be 3–4000 characters.' }); return; } const { question, symbol } = parsed.data; let context = 'No external evidence has been retrieved yet.'; const sources: Array<{ title: string; url: string; timestamp?: string }> = [];
    if (symbol) { try { const [profile, quote, candles] = await Promise.all([getProfile(symbol), getQuote(symbol), getCandles(symbol, 'D', 30)]); context += `\nCompany: ${JSON.stringify(profile)}\nLatest provider quote: ${JSON.stringify(quote)}\nRecent historical candles (last 10): ${JSON.stringify(candles.slice(-10))}`; } catch (error) { context += `\nCompany market data unavailable: ${error instanceof Error ? error.message : 'provider unavailable'}`; } }
    let news: any[] = [];
    if (symbol) {
      news = await NewsCache.find({ symbol: symbol.toUpperCase(), expiresAt: { $gt: new Date() } }).sort({ publishedAt: -1 }).limit(10).lean();
      if (!news.length) { try { news = await getCompanyNews(symbol, 7); } catch { context += '\nCompany news could not be retrieved from the configured provider.'; } }
    }
    if (news.length) {
      const published = (n: any) => n.publishedAt instanceof Date ? n.publishedAt.toISOString() : String(n.publishedAt ?? '');
      context += '\nRetrieved news articles:\n' + news.slice(0, 10).map(n => `${n.title} | ${n.source} | ${published(n)} | ${n.url} | sentiment=${n.sentiment?.status === 'success' ? n.sentiment.label : 'unavailable'} | ${n.description ?? ''}`).join('\n');
      news.slice(0, 10).forEach(n => sources.push({ title: n.title, url: n.url, timestamp: published(n) || undefined }));
    }
    let conversation: any; if (parsed.data.conversationId) { if (!mongoose.isValidObjectId(parsed.data.conversationId)) { res.status(400).json({ error: 'INVALID_ID', message: 'Invalid conversation id.' }); return; } conversation = await ChatConversation.findOne({ _id: parsed.data.conversationId, user: uid(req) }); if (!conversation) { res.status(404).json({ error: 'NOT_FOUND', message: 'Conversation not found.' }); return; } } else conversation = new ChatConversation({ user: uid(req), title: question.slice(0, 80), messages: [] });
    conversation.messages.push({ role: 'user', content: question }); const answer = await answerResearch(question, context); conversation.messages.push({ role: 'assistant', content: answer, sources: sources.map(source => ({ title: source.title, url: source.url, timestamp: source.timestamp ? new Date(source.timestamp) : undefined })) }); const maxStoredMessages = 80; if (conversation.messages.length > maxStoredMessages) conversation.messages.splice(0, conversation.messages.length - maxStoredMessages); await conversation.save(); res.json({ conversationId: String(conversation._id), answer, sources, asOf: new Date().toISOString(), grounding: news.length || symbol ? 'retrieved-context' : 'limited-context' });
  } catch (e) {
    console.error('[VHAGAR AI CHAT ERROR]', e);
    next(e);
  }
});
aiRouter.get('/saved', async (req, res, next) => {
  try { const items = await SavedResearch.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ items }); } catch (e) { next(e); }
});

aiRouter.post('/saved', async (req, res, next) => { try { const parsed = z.object({ symbol: z.string().trim().min(1).max(20), title: z.string().trim().min(1).max(180), content: z.string().trim().min(1).max(30000), sources: z.array(z.object({ title: z.string().trim().min(1).max(300), url: z.string().url().refine(safeHttpUrl, { message: 'Only HTTP(S) source URLs are allowed.' }), timestamp: z.coerce.date().optional() })).max(30).optional() }).safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid saved research payload.' }); return; } const item = await SavedResearch.create({ ...parsed.data, user: uid(req) }); res.status(201).json({ item }); } catch (e) { next(e); } });
aiRouter.delete('/saved/:id', async (req, res, next) => { try { if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'INVALID_ID', message: 'Invalid saved research id.' }); return; } await SavedResearch.deleteOne({ _id: req.params.id, user: uid(req) }); res.status(204).end(); } catch (e) { next(e); } });
