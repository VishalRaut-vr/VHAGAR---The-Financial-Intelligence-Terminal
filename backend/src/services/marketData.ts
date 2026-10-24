import Parser from 'rss-parser';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { MarketCache } from '../models/MarketCache.js';

export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = 'ProviderError';
  }
}

const base = 'https://finnhub.io/api/v1';
type NseEquity = {
  symbol: string;
  name: string;
  series?: string;
};

let nseEquitiesCache: NseEquity[] | null = null;

async function findNseEquity(symbol: string): Promise<NseEquity | undefined> {
  if (!nseEquitiesCache) {
    const filePath = path.resolve(process.cwd(), 'data', 'nse-equities.json');
    const raw = await readFile(filePath, 'utf8');
    nseEquitiesCache = JSON.parse(raw) as NseEquity[];
  }

  const normalized = symbol.trim().toUpperCase().replace(/\.(NS|BO)$/i, '');

  return nseEquitiesCache.find(
    item => item.symbol.toUpperCase() === normalized
  );
}


const newsRssParser = new Parser({ timeout: 10000 });


async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  forceRefresh = false
): Promise<T> {
  if (!forceRefresh) {
    const found = await MarketCache.findOne({
      key,
      expiresAt: { $gt: new Date() }
    }).lean();

    if (found) return found.payload as T;
  }

  const value = await load();

  await MarketCache.findOneAndUpdate(
    { key },
    {
      $set: {
        key,
        payload: value,
        expiresAt: new Date(Date.now() + ttlMs)
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return value;
}

function requireFinnhub(purpose: 'market' | 'news' = 'market') {
  const provider =
    purpose === 'market'
      ? env.MARKET_DATA_PROVIDER
      : env.NEWS_PROVIDER;

  if (
    provider.toLowerCase() !== 'finnhub' ||
    !env.MARKET_DATA_API_KEY
  ) {
    throw new ProviderError(
      `${purpose === 'market' ? 'Market data' : 'Company news'
      } is not configured. Set ${purpose === 'market' ? 'MARKET_DATA_PROVIDER' : 'NEWS_PROVIDER'
      }=finnhub and MARKET_DATA_API_KEY in backend/.env.`,
      503
    );
  }
}

async function providerGet<T>(
  path: string,
  purpose: 'market' | 'news' = 'market'
): Promise<T> {
  requireFinnhub(purpose);

  const url = new URL(`${base}${path}`);
  url.searchParams.set('token', env.MARKET_DATA_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      const details = await response.text();

      console.error(
        'Finnhub API error:',
        response.status,
        details
      );

      throw new ProviderError(
        `Market data provider returned HTTP ${response.status}.`,
        response.status === 429 ? 429 : 502
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;

    throw new ProviderError(
      'Market data provider timed out or could not be reached.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * NSE quote data uses Yahoo Finance so the quote source matches the
 * Yahoo Finance historical candles used by this service.
 *
 * Yahoo Finance is an unofficial source. Its quote may be delayed or may
 * represent the latest available daily close; this function does not claim
 * that the returned price is real-time.
 */
export async function getQuote(symbol: string) {
  const input = symbol.trim().toUpperCase();
  const s = input.replace(/\.NS$/, '');

  if (!/^[A-Z0-9&_-]+$/.test(s)) {
    throw new ProviderError(`Invalid NSE stock symbol: ${symbol}.`, 400);
  }

  const yahooSymbol = `${s}.NS`;

  return cached(`quote:yahoo:${yahooSymbol}`, 30_000, async () => {
    const url = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}`
    );
    url.searchParams.set('range', '5d');
    url.searchParams.set('interval', '1d');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0'
        }
      });

      if (!response.ok) {
        const details = await response.text();
        console.error(
          'Yahoo Finance quote error:',
          response.status,
          details
        );
        throw new ProviderError(
          `Quote provider returned HTTP ${response.status}.`,
          response.status === 429 ? 429 : 502
        );
      }

      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            meta?: {
              currency?: string;
              regularMarketPrice?: number;
              regularMarketTime?: number;
              chartPreviousClose?: number;
              previousClose?: number;
              symbol?: string;
            };
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
            };
          } | null>;
          error?: {
            description?: string;
            code?: string;
          } | null;
        };
      };

      const result = data.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const meta = result?.meta;
      const quote = result?.indicators?.quote?.[0];

      if (!result || !meta || !quote || timestamps.length === 0) {
        throw new ProviderError(
          data.chart?.error?.description ||
          `No quote data is available for NSE symbol ${s}.`,
          404
        );
      }

      // Find the latest complete candle, skipping any null Yahoo Finance rows.
      let latestIndex = -1;
      for (let i = timestamps.length - 1; i >= 0; i--) {
        const close = quote.close?.[i];
        const time = timestamps[i];
        if (
          typeof time === 'number' &&
          Number.isFinite(time) &&
          time > 0 &&
          typeof close === 'number' &&
          Number.isFinite(close) &&
          close > 0
        ) {
          latestIndex = i;
          break;
        }
      }

      if (latestIndex < 0) {
        throw new ProviderError(
          `No valid quote observations are available for ${s}.`,
          404
        );
      }

      const latestClose = quote.close?.[latestIndex];
      const open = quote.open?.[latestIndex];
      const high = quote.high?.[latestIndex];
      const low = quote.low?.[latestIndex];
      const candleTime = timestamps[latestIndex];

      // Use Yahoo's market price only when it is a valid positive number.
      // Otherwise, use the latest available daily close.
      const marketPrice = meta.regularMarketPrice;
      const price =
        typeof marketPrice === 'number' &&
          Number.isFinite(marketPrice) &&
          marketPrice > 0
          ? marketPrice
          : latestClose;

      // Prefer the prior valid daily close over chartPreviousClose, which can
      // refer to the start of the requested chart range.
      let previousClose: number | undefined;
      for (let i = latestIndex - 1; i >= 0; i--) {
        const close = quote.close?.[i];
        if (
          typeof close === 'number' &&
          Number.isFinite(close) &&
          close > 0
        ) {
          previousClose = close;
          break;
        }
      }

      if (
        previousClose === undefined &&
        typeof meta.previousClose === 'number' &&
        Number.isFinite(meta.previousClose) &&
        meta.previousClose > 0
      ) {
        previousClose = meta.previousClose;
      }

      if (
        previousClose === undefined &&
        typeof meta.chartPreviousClose === 'number' &&
        Number.isFinite(meta.chartPreviousClose) &&
        meta.chartPreviousClose > 0
      ) {
        previousClose = meta.chartPreviousClose;
      }

      const validPrice =
        typeof price === 'number' &&
          Number.isFinite(price) &&
          price > 0
          ? price
          : null;

      const change =
        validPrice !== null && previousClose !== undefined
          ? validPrice - previousClose
          : null;

      const changePercent =
        change !== null &&
          previousClose !== undefined &&
          previousClose > 0
          ? (change / previousClose) * 100
          : null;

      const marketTime =
        typeof meta.regularMarketTime === 'number' &&
          Number.isFinite(meta.regularMarketTime) &&
          meta.regularMarketTime > 0
          ? meta.regularMarketTime
          : candleTime;

      if (
        typeof marketTime !== 'number' ||
        !Number.isFinite(marketTime) ||
        marketTime <= 0
      ) {
        throw new ProviderError(
          `No valid quote timestamp is available for ${s}.`,
          502
        );
      }

      const validNumber = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0;

      return {
        symbol: s,
        price,
        change,
        changePercent,
        high: validNumber(high) ? high : price,
        low: validNumber(low) ? low : price,
        open: validNumber(open) ? open : price,
        previousClose: previousClose ?? null,
        timestamp: new Date(marketTime * 1000).toISOString(),
        delayed: true as boolean | null,
        currency: meta.currency || 'INR',
        source: 'Yahoo Finance',
        note:
          'Yahoo Finance data may be delayed and may represent the latest available daily price. It is not guaranteed to be real-time.'
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      console.error('Yahoo Finance quote request failed:', error);
      throw new ProviderError(
        'Could not reach the Yahoo Finance NSE quote provider.'
      );
    } finally {
      clearTimeout(timeout);
    }
  });
}

/**
 * Historical daily candles use Yahoo Finance's chart endpoint.
 * NSE symbols such as RELIANCE are converted to RELIANCE.NS.
 *
 * This endpoint is unofficial and is subject to provider availability
 * and rate limits. Daily candles are supported by this implementation.
 */
export async function getCandles(
  symbol: string,
  resolution = 'D',
  days = 90
) {
  const input = symbol.trim().toUpperCase();
  const s = input.replace(/\.NS$/, '');
  const d = Math.min(Math.max(days, 1), 3650);

  if (!/^[A-Z0-9&_-]+$/.test(s)) {
    throw new ProviderError(
      `Invalid NSE stock symbol: ${symbol}.`,
      400
    );
  }

  if (resolution !== 'D') {
    throw new ProviderError(
      'The free historical data source currently supports daily candles only.',
      400
    );
  }

  const yahooSymbol = `${s}.NS`;

  return cached(
    `candles:yahoo:${yahooSymbol}:${resolution}:${d}`,
    60 * 60_000,
    async () => {
      const url = new URL(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          yahooSymbol
        )}`
      );

      url.searchParams.set('range', `${d}d`);
      url.searchParams.set('interval', '1d');

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        12_000
      );

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            'user-agent': 'Mozilla/5.0'
          }
        });

        if (!response.ok) {
          const details = await response.text();

          console.error(
            'Yahoo Finance chart error:',
            response.status,
            details
          );

          throw new ProviderError(
            `Historical NSE data provider returned HTTP ${response.status}.`,
            response.status === 429 ? 429 : 502
          );
        }

        const data = (await response.json()) as {
          chart?: {
            result?: Array<{
              timestamp?: number[];
              indicators?: {
                quote?: Array<{
                  open?: Array<number | null>;
                  high?: Array<number | null>;
                  low?: Array<number | null>;
                  close?: Array<number | null>;
                  volume?: Array<number | null>;
                }>;
              };
            } | null>;
            error?: {
              description?: string;
              code?: string;
            } | null;
          };
        };

        const result = data.chart?.result?.[0];
        const timestamps = result?.timestamp;
        const quote = result?.indicators?.quote?.[0];

        if (!result || !timestamps?.length || !quote) {
          throw new ProviderError(
            data.chart?.error?.description ||
            `No historical NSE price data is available for ${s}.`,
            404
          );
        }

        const rows: Array<{
          time: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        }> = [];

        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          const open = quote.open?.[i];
          const high = quote.high?.[i];
          const low = quote.low?.[i];
          const close = quote.close?.[i];
          const volume = quote.volume?.[i];

          if (
            typeof t !== 'number' ||
            !Number.isFinite(t) ||
            t <= 0 ||
            typeof open !== 'number' ||
            !Number.isFinite(open) ||
            open <= 0 ||
            typeof high !== 'number' ||
            !Number.isFinite(high) ||
            high <= 0 ||
            typeof low !== 'number' ||
            !Number.isFinite(low) ||
            low <= 0 ||
            typeof close !== 'number' ||
            !Number.isFinite(close) ||
            close <= 0 ||
            typeof volume !== 'number' ||
            !Number.isFinite(volume) ||
            volume < 0
          ) {
            continue;
          }

          rows.push({
            time: new Date(t * 1000).toISOString(),
            open,
            high,
            low,
            close,
            volume
          });
        }

        if (!rows.length) {
          throw new ProviderError(
            `The historical data provider returned no valid price observations for ${s}.`,
            502
          );
        }

        return rows;
      } catch (error) {
        if (error instanceof ProviderError) throw error;

        console.error(
          'Yahoo Finance chart request failed:',
          error
        );

        throw new ProviderError(
          'Could not reach the free historical NSE data provider.'
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  );
}

/**
 * Company profile still uses Finnhub.
 */
export async function getProfile(symbol: string) {
  const s = symbol.trim().toUpperCase();

  return cached(`profile:${s}`, 24 * 60 * 60_000, async () => {
    const equity = await findNseEquity(s);

    try {
      const p = await providerGet<{
        name?: string;
        ticker?: string;
        exchange?: string;
        currency?: string;
        finnhubIndustry?: string;
        marketCapitalization?: number;
        weburl?: string;
        logo?: string;
      }>(
        `/stock/profile2?symbol=${encodeURIComponent(s)}`
      );

      if (p.name) {
        return {
          symbol: s,
          name: p.name,
          exchange: p.exchange,
          currency: p.currency,
          industry: p.finnhubIndustry,
          marketCapitalization: p.marketCapitalization,
          website: p.weburl,
          logo: p.logo,
          source: 'Finnhub'
        };
      }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
    }

    if (equity) {
      return {
        symbol: s,
        name: equity.name,
        exchange: 'NSE',
        currency: 'INR',
        source: 'NSE symbol'
      };
    }

    throw new ProviderError(
      `Company profile is not available for ${s}.`,
      404
    );
  });
}

/**
 * Symbol search still uses Finnhub.
 */
export async function searchSymbols(query: string) {
  const q = query.trim().toLowerCase();

  return cached(`search:${q}`, 60 * 60_000, async () => {
    const data = await providerGet<{
      result?: Array<{
        description: string;
        displaySymbol: string;
        symbol: string;
        type: string;
      }>;
    }>(`/search?q=${encodeURIComponent(query)}`);

    return (data.result ?? [])
      .filter(
        x =>
          x &&
          typeof x.description === 'string' &&
          x.description.trim() &&
          typeof (x.displaySymbol || x.symbol) === 'string' &&
          Boolean(x.displaySymbol || x.symbol)
      )
      .slice(0, 20)
      .map(x => ({
        name: x.description,
        symbol: x.displaySymbol || x.symbol,
        type: x.type
      }));
  });
}

/**
 * Company news uses Google News RSS so Indian NSE and US company searches
 * do not depend on Finnhub's company-news coverage.
 */
export async function getCompanyNews(
  symbol: string,
  days = 7,
  forceRefresh = false
) {
  const s = symbol.trim().toUpperCase();
  const d = Math.min(Math.max(days, 1), 30);

  if (!/^[A-Z0-9.^_-]+$/.test(s)) {
    throw new ProviderError(`Invalid news symbol: ${symbol}.`, 400);
  }

  const knownSymbols: Record<
    string,
    { query: string; region: 'IN' | 'US' }
  > = {
    RELIANCE: { query: '"Reliance Industries" stock', region: 'IN' },
    TCS: { query: '"Tata Consultancy Services" stock', region: 'IN' },
    INFY: { query: 'Infosys stock', region: 'IN' },
    HDFCBANK: { query: '"HDFC Bank" stock', region: 'IN' },
    AAPL: { query: 'Apple AAPL stock', region: 'US' },
    MSFT: { query: 'Microsoft MSFT stock', region: 'US' },
    NVDA: { query: 'Nvidia NVDA stock', region: 'US' },
    GOOGL: { query: 'Alphabet Google GOOGL stock', region: 'US' },
    AMZN: { query: 'Amazon AMZN stock', region: 'US' },
    TSLA: { query: 'Tesla TSLA stock', region: 'US' },
    META: { query: 'Meta Platforms META stock', region: 'US' }
  };

  return cached(
    `news:google-rss:${s}:${d}`,
    10 * 60_000,
    async () => {
      const config = knownSymbols[s];
      const region = config?.region ?? 'IN';
      const query = config?.query ?? `${s} stock company news`;
      const locale =
        region === 'IN'
          ? { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' }
          : { hl: 'en-US', gl: 'US', ceid: 'US:en' };

      const url = new URL('https://news.google.com/rss/search');
      url.searchParams.set('q', `${query} when:${d}d`);
      url.searchParams.set('hl', locale.hl);
      url.searchParams.set('gl', locale.gl);
      url.searchParams.set('ceid', locale.ceid);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            accept: 'application/rss+xml, application/xml, text/xml',
            'user-agent': 'VHAGAR/1.0 (news reader)'
          }
        });

        if (!response.ok) {
          throw new ProviderError(
            `Google News RSS returned HTTP ${response.status}.`,
            response.status === 429 ? 429 : 502
          );
        }

        const xml = await response.text();
        const feed = await newsRssParser.parseString(xml);
        console.dir(
          feed.items.slice(0, 3).map((item) => ({
            title: item.title,
            source: (item as any).source,
            contentSnippet: item.contentSnippet,
            content: item.content
          })),
          { depth: 4 }
        );
        const cutoff = Date.now() - d * 86_400_000;
        const seen = new Set<string>();
        const articles: Array<{
          articleId: string;
          symbol: string;
          title: string;
          description: string;
          source: string;
          publishedAt: string;
          url: string;
          image?: string;
        }> = [];

        for (const item of feed.items) {
          const title = item.title?.trim() ?? '';
          const link = item.link?.trim() ?? '';
          const rawDate = item.isoDate || item.pubDate;
          const publishedDate = rawDate ? new Date(rawDate) : null;

          if (
            !title ||
            !link ||
            !safeHttpUrl(link) ||
            !publishedDate ||
            !Number.isFinite(publishedDate.getTime()) ||
            publishedDate.getTime() > Date.now() ||
            publishedDate.getTime() < cutoff
          ) {
            continue;
          }

          const key = title.toLocaleLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);




          const rawItem = item as unknown as {
            source?: string | { name?: string; title?: string };
            title?: string;
            content?: string;
            contentSnippet?: string;
          };

          const metadataSource =
            typeof rawItem.source === 'string'
              ? rawItem.source
              : rawItem.source?.name || rawItem.source?.title;

          const rawDescription =
            rawItem.content ?? rawItem.contentSnippet ?? '';

          const publisherFromDescription = rawDescription
            .match(/<font[^>]*>\s*([^<]+)\s*<\/font>/i)?.[1]
            ?.trim();

          const titlePublisher = title.match(/\s-\s([^-]+)$/)?.[1]?.trim();

          const source =
            (metadataSource && !metadataSource.includes('news.google.com')
              ? metadataSource
              : undefined) ||
            publisherFromDescription ||
            titlePublisher ||
            'Google News';

          const description = rawDescription
            .replace(/<[^>]*>/g, ' ')
            .trim()
            .slice(0, 4000);


          articles.push({
            articleId: link,
            symbol: s,
            title,
            description,
            source,
            publishedAt: publishedDate.toISOString(),
            url: link,
            image: undefined
          });

          if (articles.length >= 100) break;
        }

        return articles;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        console.error('Google News RSS request failed:', error);
        throw new ProviderError(
          'Google News RSS timed out or could not be reached.'
        );
      } finally {
        clearTimeout(timeout);
      }
    },
    forceRefresh
  );
}

export function safeHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
