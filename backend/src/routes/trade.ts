import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { TradeIntent } from '../models/TradeIntent.js';
import { analyzeSentiment, analyzeSentimentCached } from '../services/finbert.js';
import { getQuote } from '../services/marketData.js';
import { env } from '../config/env.js';

const tradeRouter = Router();

/**
 * POST /api/v1/trade/intent
 * Creates a trade intent and opens behavioral firewall.
 */
tradeRouter.post('/intent', requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        symbol: z.string().trim().min(1).max(20).transform(v => v.toUpperCase()),
        quantity: z.number().int().min(1).max(100_000),
        articleText: z.string().trim().min(1).max(10_000)
      })
      .strict()
      .parse(req.body);

    const { symbol, quantity, articleText } = body;
    const userId = (req as any).userId;

    // Get fresh quote
    const quote = await getQuote(symbol);
    if (
      typeof quote.price !== 'number' ||
      !Number.isFinite(quote.price) ||
      quote.price <= 0
    ) {
      return res.status(502).json({
        error: 'QUOTE_UNAVAILABLE',
        message: 'A valid market quote is unavailable. Please try again.'
      });
    }
    const estimatedCost = Math.round(quote.price * quantity * 100) / 100;

    // Create trade intent record
    const intent = await TradeIntent.create({
      user: userId,
      ticker: symbol,
      quantity,
      quotePrice: quote.price,
      quoteTimestamp: quote.timestamp,
      estimatedCost,
      articleText,
      sentimentStatus: 'pending'
    });

    res.json({
      intentId: String(intent._id),
      quote: {
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        timestamp: quote.timestamp,
        currency: quote.currency,
        source: quote.source,
        note: quote.note
      },
      estimatedCost,
      sentimentStatus: 'pending',
      requiresAnalysis: true,
      modalTriggered: true
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/v1/trade/analyze/:intentId
 * Runs FinBERT sentiment analysis on the article text.
 */
tradeRouter.post('/analyze/:intentId', requireAuth, async (req, res, next) => {
  try {
    const { intentId } = req.params;

    const intent = await TradeIntent.findById(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Trade intent not found.' });
    }
    if (intent.user.toString() !== (req as any).userId.toString()) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your trade intent.' });
    }
    if (intent.sentimentStatus !== 'pending') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Analysis already completed.' });
    }

    if (!intent.articleText || typeof intent.articleText !== 'string' || intent.articleText.trim().length < 2) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Article text is too short or invalid for sentiment analysis.' });
    }
    // Analyze using the existing function (will raise if service unavailable)
    const result = await analyzeSentiment(intent.articleText);

    // Update intent with analysis
    intent.sentimentStatus = 'success';
    intent.set('sentiment', {
      model: result.model,
      label: result.label,
      confidence: result.confidence,
      analyzedText: result.analyzedText,
      probabilities: result.probabilities.map(({ label, score }) => ({
        label,
        score
      }))
    });
    await intent.save();

    res.json({
      sentiment: {
        label: result.label,
        labelText: result.label.charAt(0).toUpperCase() + result.label.slice(1),
        confidence: result.confidence,
        probabilities: result.probabilities,
        analyzedText: result.analyzedText
      },
      analysisStatus: 'success'
    });
  } catch (e) {
    // If FinBERT fails, mark intent as failed
    try {
      await TradeIntent.findByIdAndUpdate(req.params.intentId, {
        sentimentStatus: 'failed',
        $set: { sentiment: undefined }
      });
    } catch { }
    res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'FinBERT analysis failed. Please retry.' });
  }
});

/**
 * POST /api/v1/trade/bias/:intentId
 * Acknowledge the behavioral bias check.
 */
tradeRouter.post('/bias/:intentId', requireAuth, async (req, res, next) => {
  try {
    const { intentId } = req.params;
    const intent = await TradeIntent.findById(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Trade intent not found.' });
    }
    if (intent.user.toString() !== (req as any).userId.toString()) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your trade intent.' });
    }
    if (intent.sentimentStatus !== 'success') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Analysis not successful.' });
    }
    intent.biasAcknowledged = true;
    await intent.save();
    res.json({ biasAcknowledged: true });
  } catch (e) { next(e); }
});

/**
 * POST /api/v1/trade/confirm/:intentId
 * Final confirmation after bias check. Simulated trade record only.
 */
tradeRouter.post('/confirm/:intentId', requireAuth, async (req, res, next) => {
  try {
    const { intentId } = req.params;

    const intent = await TradeIntent.findById(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Trade intent not found.' });
    }
    if (intent.user.toString() !== (req as any).userId.toString()) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your trade intent.' });
    }
    if (intent.sentimentStatus !== 'success') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Analysis not successful.' });
    }
    if (intent.biasAcknowledged !== true) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Behavioral bias check not acknowledged.' });
    }
    if (intent.confirmed) {
      return res.status(200).json({ message: 'Already confirmed.', alreadyConfirmed: true });
    }

    // Revalidate quote and recalculate
    const quote = await getQuote(intent.ticker);
    if (
      typeof quote.price !== 'number' ||
      !Number.isFinite(quote.price) ||
      quote.price <= 0
    ) {
      return res.status(502).json({
        error: 'QUOTE_UNAVAILABLE',
        message: 'A valid market quote is unavailable. Please try again.'
      });
    }
    const freshEstimatedCost = Math.round(quote.price * intent.quantity * 100) / 100;

    // Mark as confirmed (simulated - no brokerage order placed)
    intent.confirmed = true;
    await intent.save();

    res.json({
      message: 'Trade intent confirmed (simulated). No brokerage order placed.',
      confirmed: true,
      tradeSummary: {
        ticker: intent.ticker,
        quantity: intent.quantity,
        quotePrice: freshEstimatedCost / intent.quantity,
        estimatedCost: freshEstimatedCost,
        sentiment: intent.sentiment?.label,
        sentimentConfidence: intent.sentiment?.confidence,
        articleText: intent.articleText.slice(0, 100) + (intent.articleText.length > 100 ? '…' : '')
      }
    });
  } catch (e) {
    next(e);
  }
});

export { tradeRouter };