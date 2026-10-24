import { Router } from 'express';
import { z } from 'zod';
import { NewsCache } from '../models/NewsCache.js';
import { getCompanyNews, safeHttpUrl } from '../services/marketData.js';
import { analyzeSentimentCached } from '../services/finbert.js';
export const newsRouter = Router();
const sym = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.^_-]+$/);
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> { const out = new Array<R>(items.length); let next = 0; await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]!, i); } })); return out; }
newsRouter.get('/company/:symbol', async (req, res, next) => {
  try {
    const symbol = sym.parse(req.params.symbol).toUpperCase(); const days = z.coerce.number().int().min(1).max(30).default(7).parse(req.query.days);
    const refresh = req.query.refresh === 'true';
    let articles: any[] = [];
    if (!refresh) articles = await NewsCache.find({ symbol, publishedAt: { $gte: new Date(Date.now() - days * 86400000) }, expiresAt: { $gt: new Date() } }).sort({ publishedAt: -1 }).limit(100).lean();
    if (!articles.length) {
      const fresh = (await getCompanyNews(symbol, days, refresh)).slice(0, 20);
      articles = await mapLimit(fresh, 3, async a => {
        const cacheKey = `${symbol}:${a.articleId || a.url}`;
        const existing = await NewsCache.findOne({ cacheKey, expiresAt: { $gt: new Date() } }).lean(); if (existing?.sentiment?.status === 'success') return existing;
        let sentiment: any = { status: 'unavailable' };
        try { const result = await analyzeSentimentCached(`${a.title}. ${a.description || ''}`.slice(0, 6000)); sentiment = { status: 'success', label: result.label, confidence: result.confidence, model: result.model, analyzedText: result.analyzedText, probabilities: result.probabilities }; } catch { /* Missing model/service is represented honestly, never as neutral. */ }
        return NewsCache.findOneAndUpdate({ cacheKey }, { $set: { cacheKey, symbol, articleId: a.articleId, title: a.title, description: a.description, source: a.source, publishedAt: new Date(a.publishedAt), url: a.url, image: a.image, sentiment, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
      });
    }
    const valid = articles.filter(a => a && a.title && typeof a.url === 'string' && safeHttpUrl(a.url)).map(a => ({ id: String(a._id ?? a.articleId ?? a.url), symbol: a.symbol, title: a.title, description: a.description, source: a.source, publishedAt: a.publishedAt, url: a.url, image: a.image, sentiment: a.sentiment?.status === 'success' ? a.sentiment : { status: 'unavailable' } }));
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 }; valid.forEach(a => { if (a.sentiment.status === 'success' && a.sentiment.label in sentimentCounts) sentimentCounts[a.sentiment.label as keyof typeof sentimentCounts]++; });
    res.json({ symbol, articles: valid, analyzedCount: valid.filter(a => a.sentiment.status === 'success').length, sentimentCounts, asOf: new Date().toISOString(), source: 'Google News RSS' });
  } catch (e) { next(e); }
});
