
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';

type Quote = {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  timestamp: string;
  currency?: string;
  source?: string;
  note?: string;
};

type Sentiment = {
  label: 'positive' | 'negative' | 'neutral';
  labelText?: string;
  confidence: number;
  probabilities?: Array<{ label: string; score: number }>;
  analyzedText?: string;
};

type IntentResponse = {
  intentId: string;
  quote: Quote;
  estimatedCost: number;
  sentimentStatus: 'pending';
  requiresAnalysis: boolean;
  modalTriggered: boolean;
};

type AnalysisResponse = {
  sentiment: Sentiment;
  analysisStatus: 'success';
};

type ConfirmResponse = {
  message: string;
  confirmed: boolean;
  tradeSummary?: {
    ticker: string;
    quantity: number;
    quotePrice: number;
    estimatedCost: number;
    sentiment?: string;
    sentimentConfidence?: number;
  };
};



const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(value);


function validateArticleText(t: string): { valid: boolean; message: string } {
  const s = t.trim();
  if (!s) return { valid: false, message: 'Enter article text to analyze.' };
  if (s.length < 2) return { valid: false, message: 'Input too short for meaningful analysis.' };
  const words = s.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const meaningful = words.filter(w => w.length > 1 && /[a-zA-Z]/.test(w));
  if (meaningful.length < 2 && words.length < 3) return { valid: false, message: 'Provide at least two meaningful words (e.g., RBI raises rates). Short headlines are allowed if meaningful.' };
  if (meaningful.length >= 3) {
    const counts = new Map<string, number>();
    for (const w of meaningful) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) || 0) + 1);
    const max = Math.max(...Array.from(counts.values()));
    if (max / meaningful.length > 0.75) return { valid: false, message: 'Input appears repetitive or low-information.' };
  }
  return { valid: true, message: '' };
}

export default function TradePage() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Array<{ name: string; symbol: string; type?: string }>>([]);
  const [searchingStocks, setSearchingStocks] = useState(false);
  const [quantity, setQuantity] = useState('10');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [articleText, setArticleText] = useState('');
  const [intentId, setIntentId] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [biasEvidence, setBiasEvidence] = useState(false);
  const [biasRisk, setBiasRisk] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  const parsedQuantity = Number(quantity);
  const validQuantity =
    Number.isInteger(parsedQuantity) &&
    parsedQuantity >= 1 &&
    parsedQuantity <= 100000;

  const estimatedCost =
    quote && validQuantity
      ? Math.round(quote.price * parsedQuantity * 100) / 100
      : 0;

  const invalidateAnalysis = () => {
    setIntentId('');
    setSentiment(null);
    setBiasEvidence(false);
    setBiasRisk(false);
    setResult(null);
  };

  const refreshQuote = useCallback(async () => {
    setLoadingQuote(true);
    setError('');
    setQuote(null);
    invalidateAnalysis();

    try {
      const response = await apiRequest<{ quote: Quote }>(
        `/market/quote/${encodeURIComponent(symbol)}`
      );

      if (
        typeof response.quote?.price !== 'number' ||
        !Number.isFinite(response.quote.price) ||
        response.quote.price <= 0
      ) {
        throw new Error('A valid quote is unavailable for this symbol.');
      }

      setQuote(response.quote);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to retrieve a valid quote.');
    } finally {
      setLoadingQuote(false);
    }
  }, [symbol]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  useEffect(() => {
    const query = stockSearch.trim();

    if (query.length < 2) {
      setStockResults([]);
      setSearchingStocks(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingStocks(true);

      try {
        const response = await apiRequest<{
          results: Array<{ name: string; symbol: string; type?: string }>
        }>(`/market/nse-stocks?q=${encodeURIComponent(query)}`);

        if (!cancelled) {
          const seen = new Set<string>();
          const results = (response.results || []).filter(item => {
            const ticker = item.symbol.trim().toUpperCase();
            if (!ticker || seen.has(ticker)) return false;
            seen.add(ticker);
            return true;
          });

          setStockResults(results);
        }
      } catch {
        if (!cancelled) setStockResults([]);
      } finally {
        if (!cancelled) setSearchingStocks(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stockSearch]);

  const analyzeArticle = async () => {
    const v = validateArticleText(articleText);
    if (!v.valid) {
      setError(v.message);
      setSentiment(null);
      setResult(null);
      return;
    }
    if (!quote || !validQuantity) {
      setError('Select a valid quote, enter a valid quantity, and paste article context.');
      return;
    }

    setError('');
    setLoadingAnalysis(true);
    invalidateAnalysis();

    if (loadingAnalysis || confirming) return;
    try {
      const intent = await apiRequest<IntentResponse>('/trade/intent', {
        method: 'POST',
        body: JSON.stringify({
          symbol,
          quantity: parsedQuantity,
          articleText: articleText.trim()
        })
      });

      setIntentId(intent.intentId);
      setModalOpen(true);

      const analysis = await apiRequest<AnalysisResponse>(
        `/trade/analyze/${encodeURIComponent(intent.intentId)}`,
        { method: 'POST' }
      );

      setSentiment(analysis.sentiment);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'FinBERT analysis failed. Please try again.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const confirmSimulatedTrade = async () => {
    if (!intentId || !sentiment || !biasEvidence || !biasRisk) return;

    setError('');
    setConfirming(true);

    try {
      await apiRequest(`/trade/bias/${encodeURIComponent(intentId)}`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      const confirmation = await apiRequest<ConfirmResponse>(
        `/trade/confirm/${encodeURIComponent(intentId)}`,
        {
          method: 'POST',
          body: JSON.stringify({})
        }
      );

      setResult(confirmation);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirmation failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="page-content trade-page">
      <header className="trade-header">
        <h1>Trade Execution &amp; Behavioral Firewall</h1>
        <p className="muted">
          Review the market quote, examine your reasoning, and confirm a simulated trade only after the behavioral checks.
        </p>
      </header>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="trade-grid">
        <section className="trade-panel">
          <h2><TrendingUp size={17} /> Trade details</h2>
          <p className="trade-subtitle">Market quote and estimated order value</p>

          <div className="trade-form">
            <div className="trade-field-row">
              <label>
                Stock symbol
                <input
                  type="text"
                  value={stockSearch}
                  placeholder="Search NSE company or ticker..."
                  disabled={loadingQuote || loadingAnalysis || confirming}
                  onChange={e => setStockSearch(e.target.value)}
                  autoComplete="off"
                />
                {stockSearch.trim().length >= 2 && (
                  <div className="trade-stock-results">
                    {searchingStocks && <p>Searching NSE stocks...</p>}
                    {!searchingStocks && stockResults.length === 0 && (
                      <br></br>
                    )}
                    {stockResults.map(item => (
                      <button
                        key={item.symbol}
                        type="button"
                        className="trade-stock-result"
                        onClick={() => {
                          setSymbol(item.symbol);
                          setStockSearch(`${item.name} (${item.symbol})`);
                          setStockResults([]);
                          setQuote(null);
                          invalidateAnalysis();
                        }}
                      >
                        <span>{item.name}</span>
                        <strong>{item.symbol}</strong>
                      </button>
                    ))}
                  </div>
                )}
                <p className="trade-subtitle">Selected ticker: {symbol}</p>
              </label>
              <button
                type="button"
                className="outline-button"
                onClick={() => void refreshQuote()}
                disabled={loadingQuote || loadingAnalysis || confirming}
              >
                <RefreshCw size={14} /> {loadingQuote ? 'Loading...' : 'Refresh quote'}
              </button>
            </div>

            <div className="trade-quote" aria-live="polite">
              <span className="trade-quote-label">Latest available price</span>
              <div className="trade-price">
                {quote ? money(quote.price) : loadingQuote ? 'Loading quote...' : '—'}
              </div>
              <div className="trade-quote-meta">
                {quote
                  ? `${quote.symbol} · ${quote.source || 'Market data provider'} · ${quote.timestamp
                    ? new Date(quote.timestamp).toLocaleString('en-IN')
                    : 'Timestamp unavailable'
                  }`
                  : 'A valid quote is required before continuing.'}
              </div>
              {quote?.note && <p className="trade-status">{quote.note}</p>}
            </div>

            <label>
              Quantity (whole number, 120132013100,000)
              <input
                type="number"
                min={1}
                max={100000}
                step={1}
                value={quantity}
                disabled={loadingAnalysis || confirming}
                onChange={e => {
                  setQuantity(e.target.value);
                  invalidateAnalysis();
                }}
              />
            </label>

            <div className="trade-estimate">
              <span>Estimated total, excluding brokerage and taxes</span>
              <strong>{validQuantity && quote ? money(estimatedCost) : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="trade-panel">
          <h2><ShieldCheck size={17} /> Behavioral firewall</h2>
          <p className="trade-subtitle">
            Analyze the actual article or analyst commentary before considering confirmation.
          </p>

          <div className="trade-form">
            <label>
              Article or analyst commentary
              <textarea
                maxLength={10000}
                rows={8}
                value={articleText}
                disabled={loadingAnalysis || confirming}
                onChange={e => {
                  setArticleText(e.target.value);
                  invalidateAnalysis();
                }}
                placeholder="Paste the article or analyst commentary you are using to evaluate this trade…"
              />
            </label>

            <div className="form-foot">
              <span>{articleText.length}/10,000 characters</span>
              <button
                type="button"
                className="primary-button"
                disabled={
                  !quote ||
                  !validQuantity ||
                  !articleText.trim() ||
                  loadingAnalysis ||
                  confirming ||
                  !validateArticleText(articleText).valid
                }
                onClick={() => void analyzeArticle()}
              >
                {loadingAnalysis ? 'Analyzing…' : 'Analyze with FinBERT'}
              </button>
            </div>

            {loadingAnalysis && (
              <p className="trade-status" role="status">
                Creating the intent and requesting real FinBERT analysis…
              </p>
            )}

            {sentiment && !result && (
              <div className="trade-result" aria-live="polite">
                <strong>FinBERT result: {sentiment.labelText || sentiment.label}</strong>
                <p>Confidence: {(sentiment.confidence * 100).toFixed(1)}%</p>
                {sentiment.probabilities?.map(item => (
                  <p key={item.label}>
                    {item.label}: {(item.score * 100).toFixed(1)}%
                  </p>
                ))}
                <p className="trade-status">
                  Sentiment is model output, not a prediction of future returns or a recommendation to buy.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {modalOpen && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !confirming) setModalOpen(false);
          }}
        >
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="trade-firewall-title">
            <button
              type="button"
              className="icon-button modal-close"
              onClick={() => setModalOpen(false)}
              disabled={confirming}
              aria-label="Close"
            >
              00D7
            </button>

            <div className="modal-mark"><ShieldCheck size={21} /></div>
            <h2 id="trade-firewall-title">Behavioral Firewall</h2>
            <p className="muted">
              This is a simulated trade workflow. No brokerage order will be submitted.
            </p>

            <div className="trade-modal-summary">
              <div><span>Ticker</span><strong>{symbol}</strong></div>
              <div><span>Quantity</span><strong>{parsedQuantity}</strong></div>
              <div><span>Latest displayed quote</span><strong>{quote ? money(quote.price) : '—'}</strong></div>
              <div><span>Estimated total</span><strong>{quote && validQuantity ? money(estimatedCost) : '—'}</strong></div>
            </div>

            {!sentiment && (
              <p className="trade-status" role="status">
                Waiting for FinBERT analysis. Confirmation remains unavailable until analysis succeeds.
              </p>
            )}

            {sentiment && !result && (
              <>
                <div className="trade-bias-list">
                  <label>
                    <input
                      type="checkbox"
                      checked={biasEvidence}
                      onChange={e => setBiasEvidence(e.target.checked)}
                      disabled={confirming}
                    />
                    <span>I have reviewed the source evidence and understand sentiment is not proof of future performance.</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={biasRisk}
                      onChange={e => setBiasRisk(e.target.checked)}
                      disabled={confirming}
                    />
                    <span>I have considered downside risk and checked that fear of missing out or panic is not driving this decision.</span>
                  </label>
                </div>

                <div className="action-row">
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => setModalOpen(false)}
                    disabled={confirming}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void confirmSimulatedTrade()}
                    disabled={!biasEvidence || !biasRisk || confirming}
                  >
                    {confirming ? 'Confirming…' : 'Confirm simulated trade'}
                  </button>
                </div>
              </>
            )}

            {result?.confirmed && (
              <div className="trade-result" role="status">
                <strong>Simulated confirmation successful</strong>
                <p>{result.message}</p>
                <p>No brokerage order was placed.</p>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    setModalOpen(false);
                    setResult(null);
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}





