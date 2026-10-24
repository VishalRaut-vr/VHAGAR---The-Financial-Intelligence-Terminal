import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
export const healthRouter = Router();
healthRouter.get('/', async (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  const configured = (value: string) => value !== '' && value !== 'disabled';
  const services: Record<string, string> = {
    finbert: env.FINBERT_SERVICE_URL ? 'configured' : 'not_configured',
    marketData: env.MARKET_DATA_PROVIDER.toLowerCase() === 'finnhub' && Boolean(env.MARKET_DATA_API_KEY) ? 'configured' : 'not_configured',
    news: configured(env.NEWS_PROVIDER) && env.NEWS_PROVIDER.toLowerCase() === 'finnhub' && Boolean(env.MARKET_DATA_API_KEY) ? 'configured' : 'not_configured',
    llm: configured(env.LLM_PROVIDER) && Boolean(env.LLM_API_KEY) ? 'configured' : 'not_configured',
  };
  let finbertReady = 'unavailable';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${env.FINBERT_SERVICE_URL.replace(/\/$/, '')}/health`, { signal: controller.signal });
    if (response.ok) {
      const body = await response.json() as { ready?: boolean };
      finbertReady = body.ready ? 'ready' : 'model_not_ready';
    }
  } catch {
    finbertReady = 'unavailable';
  } finally {
    clearTimeout(timeout);
  }
  res.status(200).json({ status: dbConnected ? 'ok' : 'degraded', service: 'vhagar-api', timestamp: new Date().toISOString(), database: dbConnected ? 'connected' : 'disconnected', services: { ...services, finbert: finbertReady } });
});
