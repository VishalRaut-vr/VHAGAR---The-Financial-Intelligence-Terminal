
import { useCallback, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import Plot from 'react-plotly.js';
import {
  Activity, ArrowUpRight, Bell, BookOpenText, ChevronDown,
  CircleHelp, Compass, Cpu, LayoutDashboard, LogIn, LogOut,
  Menu, Newspaper, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Star, TrendingUp, X, Trash2, RefreshCw, ExternalLink
} from 'lucide-react';
import { ApiError, apiRequest } from './lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
import TradePage from './pages/TradePage';

type User = {
  id: string;
  name: string;
  email: string;
  preferences?: { theme?: string; defaultMarket?: string };
};

type Health = {
  status: string;
  database?: string;
  services?: Record<string, string>;
};

type Quote = {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  timestamp: string;
  currency?: string;
  source?: string;
  delayed?: boolean | null;
  unavailable?: boolean;
  error?: string;
};

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Article = {
  id: string;
  symbol: string;
  title: string;
  description?: string;
  source?: string;
  publishedAt: string;
  url: string;
  sentiment?: {
    status: string;
    label?: string;
    confidence?: number;
    model?: string;
    analyzedText?: string;
    probabilities?: Array<{ label: string; score: number }>;
  };
};

type Source = { title: string; url: string; timestamp?: string };

const routeByName: Record<string, string> = {
  Dashboard: '/',
  'Market explorer': '/market',
  'Graphs & Analysis': '/analysis',
  'News center': '/news',
  'AI research': '/research',
  Watchlist: '/watchlist',
  Settings: '/settings',
  Profile: '/settings',
  'Help & documentation': '/help'
};

const nameByRoute: Record<string, string> = {
  '/': 'Dashboard',
  '/market': 'Market explorer',
  '/analysis': 'Graphs & Analysis',
  '/news': 'News center',
  '/research': 'AI research',
  '/watchlist': 'Watchlist',
  '/settings': 'Settings',
  '/help': 'Help & documentation'
};

const nav = [
  {
    label: 'OVERVIEW',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard },
      { name: 'Market explorer', icon: Compass },
      { name: 'Graphs & Analysis', icon: Activity }
    ]
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { name: 'News center', icon: Newspaper },
      { name: 'AI research', icon: Sparkles },
      { name: 'Watchlist', icon: Star },
      { name: 'Trade execution', icon: ShieldCheck }
    ]
  }
];

const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return `${new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2
    }).format(n)} ${currency}`;
  }
};

const priceDisplay = (n: number, currency?: string) =>
  money(n, currency || 'INR');

const dateTime = (s?: string) =>
  s ? new Date(s).toLocaleString('en-IN') : 'Time unavailable';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const navigate = useNavigate();
  const location = useLocation();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [toast, setToast] = useState('');

  const refreshHealth = useCallback(
    () =>
      apiRequest<Health>('/health/details')
        .then(v => {
          setHealth(v);
          setHealthError(false);
        })
        .catch(() => setHealthError(true)),
    []
  );

  useEffect(() => {
    void refreshHealth();
    apiRequest<{ user: User }>('/auth/me')
      .then(v => setUser(v.user))
      .catch(() => setUser(null));
  }, [refreshHealth]);

  useEffect(() => {
    setActive(nameByRoute[location.pathname] || 'Not found');
  }, [location.pathname]);

  const select = (name: string) => {
    setActive(name);
    setMobileNav(false);
    setToast('');
    navigate(routeByName[name] || '/');
  };

  const notify = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(''), 5000);
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
      notify('Signed out.');
    } catch (e) {
      notify(errText(e));
    }
  };

  const globalSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      select('Market explorer');
      setToast(`Search results for â€œ${query.trim()}â€`);
    }
  };

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}

      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={20} /></div>
          <div>
            <div className="brand-name">VHAGAR<span>®</span></div>
            <div className="brand-sub">FINANCIAL INTELLIGENCE</div>
          </div>
          <button
            className="icon-button close-nav"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switch">
          <div className="workspace-avatar">V</div>
          <div className="workspace-copy">
            <strong>Research desk</strong>
            <span>{user ? 'Authenticated workspace' : 'Evidence-first research'}</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-groups">
          {nav.map(group => (
            <section className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => select(item.name)}
                    className={`nav-item ${active === item.name ? 'nav-active' : ''}`}
                  >
                    <Icon size={17} />
                    <span>{item.name}</span>
                    {item.name === 'AI research' && <span className="nav-new">AI</span>}
                  </button>
                );
              })}
            </section>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="coverage-card">
            <div className="coverage-icon"><ShieldCheck size={16} /></div>
            <div>
              <strong>NSE India</strong>
              <p>Indian listed-company research.</p>
            </div>
          </div>

          <button
            className={`nav-item ${active === 'Settings' ? 'nav-active' : ''}`}
            onClick={() => select('Settings')}
          >
            <Settings2 size={17} /><span>Settings & services</span>
          </button>

          <button
            className={`nav-item ${active === 'Help & documentation' ? 'nav-active' : ''}`}
            onClick={() => select('Help & documentation')}
          >
            <CircleHelp size={17} /><span>Help & documentation</span>
          </button>

          <div className="user-mini">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase() || 'G'}</div>
            <div className="user-copy">
              <strong>{user?.name || 'Guest researcher'}</strong>
              <span>{user ? 'Signed in' : 'Sign in to save research'}</span>
            </div>
            {user ? (
              <button className="icon-button" aria-label="Sign out" onClick={() => void logout()}>
                <LogOut size={15} />
              </button>
            ) : (
              <button className="icon-button" aria-label="Sign in" onClick={() => setAuthMode('login')}>
                <LogIn size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{active}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <form className="global-search" onSubmit={globalSearch}>
              <Search size={15} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search NSE companies..."
                aria-label="Search NSE companies"
              />
              <kbd>↵</kbd>
            </form>

            <div className="market-status">
              <span className="status-dot" /> API{' '}
              <span className="status-muted">
                {healthError ? 'OFFLINE' : health?.status === 'ok' ? 'ONLINE' : 'DEGRADED'}
              </span>
            </div>

            <button
              className="icon-button notification-button"
              aria-label="Refresh service status"
              onClick={() => void refreshHealth()}
            >
              <Bell size={17} />
            </button>

            <button
              className="top-avatar"
              title={user?.email || 'Guest'}
              onClick={() => user ? select('Settings') : setAuthMode('login')}
            >
              {user?.name?.[0]?.toUpperCase() || 'G'}
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            INDIAN FINANCIAL INTELLIGENCE
            <span className="eyebrow-date">
              NSE INDIA · {user ? 'PERSONAL WORKSPACE' : 'GUEST MODE'}
            </span>
          </div>

          {toast && (
            <div className="inline-toast" role="status">
              {toast}
              <button onClick={() => setToast('')} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}

          <div hidden={active !== 'Dashboard'}>
            <Dashboard
              health={health}
              healthError={healthError}
              user={user}
              onSelect={select}
              onAuth={() => setAuthMode('login')}
            />
          </div>

          <div hidden={active !== 'Market explorer'}>
            <MarketExplorer initialQuery={query} user={user} notify={notify} />
          </div>

          <div hidden={active !== 'Graphs & Analysis'}><AnalysisPage /></div>
          <div hidden={active !== 'News center'}><NewsPage /></div>
          <div hidden={active !== 'AI research'}>
            <ResearchPage user={user} onAuth={() => setAuthMode('login')} />
          </div>
          <div hidden={active !== 'Watchlist'}>
            <WatchlistPage user={user} onAuth={() => setAuthMode('login')} notify={notify} />
          </div>
          <div hidden={active !== 'Trade execution'}><TradePage /></div>

          <div hidden={active !== 'Settings'}>
            <SettingsPage
              user={user}
              health={health}
              healthError={healthError}
              onAuth={() => setAuthMode('login')}
              onRefresh={() => void refreshHealth()}
              onUserUpdate={setUser}
            />
          </div>

          <div hidden={active !== 'Help & documentation'}><HelpPage /></div>

          {active === 'Not found' && (
            <>
              <PageTitle
                kicker="404 / NOT FOUND"
                title="This page isn't in the research desk."
                text="The route may have changed or the address may be incorrect."
              />
              <EmptyState
                icon={<CircleHelp size={22} />}
                title="Page not found"
                text="Return to the dashboard to continue your research."
                action={
                  <button className="primary-button" onClick={() => select('Dashboard')}>
                    <ArrowUpRight size={14} /> Back to dashboard
                  </button>
                }
              />
            </>
          )}

          {active === 'Profile' && (
            <SettingsPage
              user={user}
              health={health}
              healthError={healthError}
              onAuth={() => setAuthMode('login')}
              onRefresh={() => void refreshHealth()}
              onUserUpdate={setUser}
            />
          )}

          <footer className="page-footer">
            <div>
              <span className="footer-mark"><Activity size={13} /></span>
              VHAGAR <span className="footer-sep">·</span> Evidence over noise.
            </div>
            <div>
              <span className="footer-dot" />
              {healthError ? 'API UNREACHABLE' : health?.status === 'ok' ? 'API ONLINE' : 'SERVICE STATUS UNKNOWN'}
              <span className="footer-sep">·</span> NSE RESEARCH & EDUCATION
            </div>
          </footer>
        </div>
      </main>

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={u => {
            setUser(u);
            setAuthMode(null);
            notify(`Welcome, ${u.name}.`);
          }}
          onSwitch={setAuthMode}
        />
      )}
    </div>
  );
}

function Dashboard({
  health, healthError, user, onSelect, onAuth
}: {
  health: Health | null;
  healthError: boolean;
  user: User | null;
  onSelect: (s: string) => void;
  onAuth: () => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteError, setQuoteError] = useState('');
  const [newsCount, setNewsCount] = useState(0);
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [newsError, setNewsError] = useState('');

  const symbols = 'RELIANCE,TCS,INFY,HDFCBANK';

  useEffect(() => {
    apiRequest<{ quotes: Quote[] }>(
      `/market/quotes?symbols=${encodeURIComponent(symbols)}`
    )
      .then(r => {
        setQuotes(r.quotes);
        setQuoteError('');
      })
      .catch(e => setQuoteError(errText(e)));
  }, [symbols]);

  useEffect(() => {
    apiRequest<{ articles: Article[]; sentimentCounts: { positive: number; negative: number; neutral: number }; analyzedCount: number }>(
      `/news/company/RELIANCE?days=1&refresh=true`
    )
      .then(r => {
        const now = new Date();
        const eligible = (r.articles || []).filter(a => {
          if (!a.publishedAt) return true;
          const d = new Date(a.publishedAt);
          return (now.getTime() - d.getTime()) < 86400000;
        });
        setNewsCount(eligible.length);
        const analyzed = eligible.filter(a => a.sentiment?.status === 'success');
        if (analyzed.length > 0) {
          const scores = analyzed.map(a => {
            const probs = a.sentiment?.probabilities || [];
            const pos = probs.find(p => p.label === 'positive')?.score || 0;
            const neg = probs.find(p => p.label === 'negative')?.score || 0;
            return 100 * (pos - neg);
          });
          setSentimentIndex(scores.reduce((s, v) => s + v, 0) / scores.length);
        } else {
          setSentimentIndex(null);
        }
        setNewsError('');
      })
      .catch(e => {
        setNewsError(errText(e));
        setNewsCount(0);
        setSentimentIndex(null);
      });
  }, []);

  return (
    <>
      <div className="hero-row">
        <div>
          <h1>Market intelligence,<br /><em>with context.</em></h1>
          <p className="hero-copy">
            Connect Indian market movements to news, sentiment, and supporting evidence.
          </p>
        </div>
        <button className="primary-button" onClick={() => user ? onSelect('AI research') : onAuth()}>
          <Sparkles size={16} /> Ask VHAGAR <span>→</span>
        </button>
      </div>

      {(healthError || health?.status !== 'ok') && (
        <Notice
          title={healthError ? 'Backend connection unavailable' : 'Backend is degraded'}
          text={
            healthError
              ? 'Start the backend and configure MongoDB to enable persistence.'
              : `Database: ${health?.database || 'unknown'}. Configure required services in backend/.env.`
          }
          state={healthError ? 'OFFLINE' : 'CHECK CONFIGURATION'}
        />
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="section-kicker">01 / MARKET PULSE</span>
            <h2>NSE market overview</h2>
          </div>
          <button className="text-action" onClick={() => onSelect('Market explorer')}>
            Explore companies <span>→</span>
          </button>
        </div>

        <div className="metric-grid">
          <Metric
            title="Market quotes"
            value={quotes.filter(q => !q.unavailable && q.price).length
              ? String(quotes.filter(q => !q.unavailable && q.price).length)
              : '—'}
            detail={quoteError || 'Verified provider quotes only'}
            icon={<Compass size={16} />}
          />
          <Metric title="News velocity" value={newsError ? "—" : String(newsCount)} detail={newsError || `Last 24h · ${newsCount} eligible`} icon={<Newspaper size={16} />} />
          <Metric title="Sentiment index" value={sentimentIndex === null ? "—" : `${sentimentIndex > 0 ? "+" : ""}${sentimentIndex.toFixed(1)}`} detail={sentimentIndex === null ? "Requires successful FinBERT runs" : "Mean across classified articles (-100 to +100)"} icon={<Cpu size={16} />} />
          <Metric title="Saved research" value={user ? 'Available' : 'Sign in required'} detail="Private to your account" icon={<TrendingUp size={16} />} />
        </div>
      </section>

      <section className="content-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">MARKET MONITOR</span>
              <h3>NSE company quotes</h3>
            </div>
            <button className="select-button" onClick={() => onSelect('Graphs & Analysis')}>
              Historical charts <ArrowUpRight size={14} />
            </button>
          </div>

          {quotes.length > 0 && quotes.some(q => q.price) ? (
            <div className="quote-list">
              {quotes.map(q => (
                <div className="watch-row" key={q.symbol}>
                  <div className="ticker-logo">{q.symbol[0]}</div>
                  <div className="ticker-copy">
                    <strong>{q.symbol}</strong>
                    <span>{q.source || 'Provider data'} · {q.timestamp ? dateTime(q.timestamp) : 'timestamp unavailable'}</span>
                  </div>
                  <div className="ticker-value">
                    <strong>{q.price ? priceDisplay(q.price, q.currency) : '—'}</strong>
                    <span className={
                      q.changePercent !== null && q.changePercent !== undefined && q.changePercent >= 0
                        ? 'positive' : 'negative'
                    }>
                      {q.changePercent === null || q.changePercent === undefined
                        ? 'Unavailable'
                        : `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="chart-empty">
              <div className="chart-orbit orbit-one" />
              <div className="chart-orbit orbit-two" />
              <div className="chart-center"><Activity size={22} /></div>
              <strong>Awaiting verified NSE market data</strong>
              <p>{quoteError || 'Check the configured provider and its Indian exchange access.'}</p>
              <button className="outline-button" onClick={() => onSelect('Settings')}>
                Configure data source <span>→</span>
              </button>
            </div>
          )}

          <div className="chart-legend">
            <span><i className="legend-dot green" /> Provider data</span>
            <span className="legend-note">No synthetic prices</span>
          </div>
        </div>

        <div className="panel watch-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">YOUR UNIVERSE</span>
              <h3>Personal watchlist</h3>
            </div>
            <button className="icon-button" aria-label="Open watchlist" onClick={() => onSelect('Watchlist')}>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <div className="chart-empty small-empty">
            <div className="chart-center"><Star size={20} /></div>
            <strong>{user ? 'Open your watchlist' : 'Sign in to save symbols'}</strong>
            <p>{user ? 'Manage and monitor your tracked companies.' : 'Your watchlist is saved to your private account.'}</p>
          </div>
          <button className="watch-footer" onClick={() => onSelect('Watchlist')}>
            Open watchlist <span>→</span>
          </button>
        </div>
      </section>

      <section className="section-block lower-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">02 / SIGNAL DISCOVERY</span>
            <h2>From headlines to understanding</h2>
          </div>
          <button className="text-action" onClick={() => onSelect('News center')}>
            Open news center <span>→</span>
          </button>
        </div>

        <div className="intelligence-grid">
          <Feature
            icon={<Newspaper size={18} />}
            number="01"
            title="Indian company news"
            text="Retrieve company-linked coverage with publisher attribution and timestamps."
            action="Explore news"
            onClick={() => onSelect('News center')}
          />
          <Feature
            icon={<Cpu size={18} />}
            number="02"
            title="Financial sentiment"
            text="Classify financial language with genuine FinBERT, confidence, and inference status."
            action="View analysis"
            onClick={() => onSelect('Graphs & Analysis')}
          />
          <Feature
            icon={<BookOpenText size={18} />}
            number="03"
            title="Evidence-linked research"
            text="Ask questions and trace research answers to retrieved data and source links."
            action="Start research"
            onClick={() => onSelect('AI research')}
          />
        </div>
      </section>
    </>
  );
}

function MarketExplorer({
  initialQuery, user, notify
}: {
  initialQuery: string;
  user: User | null;
  notify: (s: string) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Array<{ name: string; symbol: string; type: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState('');

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiRequest<{ results: Array<{ name: string; symbol: string; type: string }> }>(
        `/market/search?q=${encodeURIComponent(q.trim())}`
      );

      const indianResults = r.results.filter(
        item => /\.NS$/i.test(item.symbol) || /\.BO$/i.test(item.symbol)
      );

      setResults(indianResults);

      if (!indianResults.length) {
        setError('No NSE/BSE-listed matching symbols were returned by the provider.');
      }
    } catch (e) {
      setError(errText(e));
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const load = async (symbol: string) => {
    setSelected(symbol);
    setBusy(true);
    setError('');
    setQuote(null);
    setProfile(null);
    setCandles([]);

    try {
      const [qv, pv, hv] = await Promise.allSettled([
        apiRequest<{ quote: Quote }>(`/market/quote/${encodeURIComponent(symbol)}`),
        apiRequest<{ company: any }>(`/market/company/${encodeURIComponent(symbol)}`),
        apiRequest<{ candles: Candle[] }>(
          `/market/history/${encodeURIComponent(symbol)}?days=180&resolution=D`
        )
      ]);

      if (qv.status === 'rejected') throw qv.reason;
      if (hv.status === 'rejected') throw hv.reason;

      setQuote(qv.value.quote);
      setCandles(hv.value.candles);

      setProfile(
        pv.status === 'fulfilled'
          ? pv.value.company
          : {
              symbol,
              name: symbol,
              exchange: 'NSE',
              currency: 'INR',
              source: 'NSE symbol'
            }
      );
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!user) {
      notify('Sign in before saving symbols to your watchlist.');
      return;
    }

    try {
      await apiRequest('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: selected })
      });
      notify(`${selected} added to your watchlist.`);
    } catch (e) {
      notify(errText(e));
    }
  };

  useEffect(() => {
    if (initialQuery.trim()) {
      setQ(initialQuery);
    }
  }, [initialQuery]);

  return (
    <>
      <PageTitle
        kicker="NSE MARKET EXPLORER"
        title="Find an Indian company."
        text="Search Indian listed companies, inspect available quotes, and explore historical daily prices."
      />

      <form className="search-panel" onSubmit={search}>
        <Search size={18} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search NSE ticker or company (e.g. RELIANCE)"
          aria-label="Search NSE stock symbols"
        />
        <button className="primary-button" disabled={busy}>
          {busy ? 'Loading…' : 'Search'}
        </button>
      </form>

      {error && <InlineError text={error} />}

      {results.length > 0 && (
        <div className="results-grid">
          {results.map(r => (
            <button
              className={`result-card ${selected === r.symbol ? 'result-selected' : ''}`}
              key={`${r.symbol}-${r.type}`}
              onClick={() => void load(r.symbol)}
            >
              <span className="ticker-logo">{r.symbol[0]}</span>
              <span className="result-main">
                <strong>{r.symbol}</strong>
                <small>{r.name}</small>
              </span>
              <span className="result-type">{r.type}</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <section className="panel detail-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">COMPANY DETAIL</span>
              <h3>{profile?.name || selected} <span className="muted">({selected})</span></h3>
            </div>
            <div className="action-row">
              <button className="outline-button" onClick={() => void load(selected)}>
                <RefreshCw size={13} /> Refresh
              </button>
              <button className="primary-button" onClick={() => void add()}>
                <Plus size={14} /> Add to watchlist
              </button>
            </div>
          </div>

          {busy && <p className="muted">Retrieving provider data…</p>}

          {quote && (
            <div className="quote-hero">
              <div>
                <strong>{priceDisplay(quote.price, quote.currency || profile?.currency)}</strong>
                <span className={
                  quote.changePercent !== null && quote.changePercent !== undefined && quote.changePercent >= 0
                    ? 'positive' : 'negative'
                }>
                  {quote.change !== null && quote.change !== undefined
                    ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent?.toFixed(2)}%)`
                    : 'Change unavailable'}
                </span>
              </div>
              <div className="quote-meta">
                {profile?.exchange || 'Exchange unavailable'} · {quote.source}
                <br />
                Timestamp: {dateTime(quote.timestamp)} · Delay status: {
                  quote.delayed === true ? 'Delayed'
                    : quote.delayed === false ? 'Real-time'
                      : 'Unknown; check provider plan'
                }
              </div>
            </div>
          )}

          {profile && (
            <div className="company-facts">
              <Fact label="Industry" value={profile.industry || 'Not supplied'} />
              <Fact label="Currency" value={profile.currency || 'INR'} />
              <Fact
                label="Market cap"
                value={profile.marketCapitalization
                  ? `${profile.marketCapitalization.toLocaleString()} (provider units)`
                  : 'Not supplied'}
              />
              <Fact label="Exchange" value={profile.exchange || 'Not supplied'} />
            </div>
          )}

          {candles.length > 0 && (
            <div className="plot-wrap">
              <Plot
                data={[
                  {
                    x: candles.map(c => c.time),
                    y: candles.map(c => c.close),
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Close',
                    line: { color: '#79d8ac', width: 2 },
                    hovertemplate: '%{x}<br>Close: %{y:.2f}<extra></extra>'
                  },
                  {
                    x: candles.map(c => c.time),
                    y: candles.map(c => c.volume),
                    type: 'bar',
                    name: 'Volume',
                    yaxis: 'y2',
                    marker: { color: '#7399d4' },
                    opacity: 0.24,
                    hovertemplate: '%{x}<br>Volume: %{y}<extra></extra>'
                  }
                ]}
                layout={{
                  autosize: true,
                  paper_bgcolor: '#0e141e',
                  plot_bgcolor: '#0e141e',
                  font: { color: '#aab7c8' },
                  margin: { l: 50, r: 45, t: 20, b: 45 },
                  xaxis: { gridcolor: '#202a38' },
                  yaxis: { gridcolor: '#202a38', title: { text: 'Price (INR)' } },
                  yaxis2: { overlaying: 'y', side: 'right', showgrid: false, title: { text: 'Volume' } },
                  legend: { orientation: 'h' },
                  showlegend: true
                }}
                useResizeHandler
                style={{ width: '100%', height: '360px' }}
                config={{ displaylogo: false, responsive: true }}
              />
            </div>
          )}

          {!quote && !busy && !error && (
            <p className="muted">Select an NSE-listed result to load company details and price history.</p>
          )}
        </section>
      )}

      {!results.length && !selected && !error && (
        <EmptyState
          icon={<Compass size={22} />}
          title="Search an Indian company to begin"
          text="Search the available Indian-market symbols. Only provider-returned securities are displayed."
        />
      )}
    </>
  );
}

const NSE_COMPANIES = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd' },
  { symbol: 'INFY', name: 'Infosys Ltd' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd' },
  { symbol: 'ITC', name: 'ITC Ltd' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd' },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd' },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries Ltd' },
  { symbol: 'WIPRO', name: 'Wipro Ltd' },
  { symbol: 'TATASTEEL', name: 'Tata Steel Ltd' },
  { symbol: 'NTPC', name: 'NTPC Ltd' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation of India Ltd' },
  { symbol: 'ONGC', name: 'Oil and Natural Gas Corporation Ltd' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd' },
  { symbol: 'TITAN', name: 'Titan Company Ltd' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints Ltd' },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement Ltd' },
];

type AnalysisSavedState = {
  symbol?: string;
  days?: number;
  candles?: Candle[];
  quote?: Quote | null;
  profile?: any;
  updatedAt?: string;
};

function readAnalysisState(): AnalysisSavedState {
  try {
    return JSON.parse(sessionStorage.getItem('vhagar.analysis.v1') || '{}');
  } catch {
    return {};
  }
}

function AnalysisPage() {
  const [saved] = useState<AnalysisSavedState>(() => readAnalysisState());
  const [symbol, setSymbol] = useState(saved.symbol || 'RELIANCE');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState(saved.days || 365);
  const [candles, setCandles] = useState<Candle[]>(saved.candles || []);
  const [quote, setQuote] = useState<Quote | null>(saved.quote || null);
  const [profile, setProfile] = useState<any>(saved.profile || null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(saved.updatedAt || '');

  const company = NSE_COMPANIES.find(c => c.symbol === symbol);
  const filteredCompanies = NSE_COMPANIES.filter(c =>
    `${c.symbol} ${c.name}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const latest = candles.length ? candles[candles.length - 1] : null;
  const previous = candles.length > 1 ? candles[candles.length - 2] : null;
  const dayChange = latest && previous ? latest.close - previous.close : quote?.change;
  const dayChangePct = latest && previous && previous.close
    ? ((latest.close - previous.close) / previous.close) * 100
    : quote?.changePercent;
  const isPositive = (dayChangePct ?? 0) >= 0;

  useEffect(() => {
    try {
      sessionStorage.setItem('vhagar.analysis.v1', JSON.stringify({
        symbol, days, candles, quote, profile, updatedAt: lastUpdated
      }));
    } catch {
      // Session storage can be unavailable in private or restricted browser contexts.
    }
  }, [symbol, days, candles, quote, profile, lastUpdated]);

  const load = async (e?: FormEvent, selectedSymbol?: string, selectedDays?: number) => {
    e?.preventDefault();
    const cleaned = (selectedSymbol || symbol).trim().toUpperCase().replace(/\.NS$/i, '');
    const range = selectedDays || days;
    if (!/^[A-Z0-9&_-]+$/.test(cleaned)) {
      setError('Choose a valid NSE company symbol.');
      return;
    }
    setSymbol(cleaned);
    setDays(range);
    setBusy(true);
    setError('');
    try {
      const historyPromise = apiRequest<{ candles: Candle[] }>(
        `/market/history/${encodeURIComponent(cleaned)}?days=${range}&resolution=D`
      );
      const quotePromise = apiRequest<{ quote: Quote }>(
        `/market/quote/${encodeURIComponent(cleaned)}`
      ).catch(() => null);
      const profilePromise = apiRequest<{ company: any }>(
        `/market/company/${encodeURIComponent(cleaned)}`
      ).catch(() => null);
      const [history, quoteResult, profileResult] = await Promise.all([
        historyPromise, quotePromise, profilePromise
      ]);
      setCandles(history.candles || []);
      setQuote(quoteResult?.quote || null);
      setProfile(profileResult?.company || null);
      setLastUpdated(new Date().toISOString());
      if (!history.candles?.length) setError('No historical daily prices were returned for this symbol.');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!candles.length) void load(undefined, symbol, days);
    // Load initial company only when no cached chart exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatPrice = (n?: number | null) =>
    n == null || !Number.isFinite(n) ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const changeLabel = dayChangePct == null
    ? 'Change unavailable'
    : `${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%`;
  const chartColor = isPositive ? '#79c995' : '#e18c8c';

  return (
    <>
      <PageTitle
        kicker="NSE GRAPHS & ANALYSIS"
        title="Market price, at a glance."
        text="Choose an Indian-listed company and explore its historical daily prices. Data availability depends on the market-data source."
      />

      <section className="stock-terminal panel">
        <div className="stock-terminal-head">
          <div className="stock-company">
            <div className="stock-company-logo">{symbol.slice(0, 1)}</div>
            <div>
              <h2>{profile?.name || company?.name || symbol}</h2>
              <span>NSE: {symbol} <span className="stock-dot">â€¢</span> INR</span>
            </div>
          </div>
          <form className="stock-selector" onSubmit={e => void load(e)}>
            <div className="stock-select-search">
              <Search size={15} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search NSE companies..."
                aria-label="Search NSE companies"
              />
            </div>
            <select
              aria-label="Select NSE company"
              value={symbol}
              onChange={e => { setSearch(''); void load(undefined, e.target.value, days); }}
            >
              {!NSE_COMPANIES.some(c => c.symbol === symbol) && <option value={symbol}>{symbol}</option>}
              {filteredCompanies.map(c => (
                <option key={c.symbol} value={c.symbol}>{c.name} ({c.symbol})</option>
              ))}
            </select>
            <button className="primary-button" disabled={busy}>
              <RefreshCw size={13} /> {busy ? 'Loading…' : 'Refresh'}
            </button>
          </form>
        </div>

        <div className="stock-price-row">
          <div className="stock-price-main">
            <div className="stock-price">{formatPrice(quote?.price ?? latest?.close)}</div>
            <div className={`stock-change ${isPositive ? 'positive' : 'negative'}`}>
              <TrendingUp size={15} /> {changeLabel}
            </div>
            <div className="stock-change-amount">
              {dayChange == null ? 'Daily change unavailable' : `${dayChange >= 0 ? '+' : ''}${formatPrice(dayChange).replace('₹', '₹')} vs previous close`}
            </div>
          </div>
          <div className="stock-price-meta">
            <span>{lastUpdated ? `Updated ${dateTime(lastUpdated)}` : 'Waiting for data'}</span>
            <small>Historical data: daily candles · Source: configured market-data service</small>
          </div>
        </div>

        <div className="stock-range-tabs" role="group" aria-label="Historical time range">
          {[
            { label: '1M', days: 30 }, { label: '3M', days: 90 },
            { label: '6M', days: 180 }, { label: '1Y', days: 365 },
            { label: '2Y', days: 730 }
          ].map(range => (
            <button
              key={range.label}
              className={days === range.days ? 'stock-range-active' : ''}
              onClick={() => void load(undefined, symbol, range.days)}
              disabled={busy}
            >{range.label}</button>
          ))}
        </div>

        {error && <InlineError text={error} />}

        <div className="stock-chart-wrap">
          {candles.length ? (
            <Plot
              data={[{
                x: candles.map(c => c.time),
                y: candles.map(c => c.close),
                type: 'scatter',
                mode: 'lines',
                name: symbol,
                line: { color: chartColor, width: 2.5, shape: 'spline', smoothing: 0.7 },
                fill: 'tozeroy',
                fillcolor: isPositive ? 'rgba(121,201,149,0.12)' : 'rgba(225,140,140,0.10)',
                hovertemplate: '%{x|%d %b %Y}<br>Close: ₹%{y:,.2f}<extra></extra>'
              }]}
              layout={{
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#aeb9c9', family: 'DM Sans, sans-serif', size: 11 },
                margin: { l: 62, r: 22, t: 15, b: 42 },
                xaxis: { gridcolor: 'rgba(130,150,170,0.08)', linecolor: 'rgba(130,150,170,0.14)', tickfont: { size: 10 }, nticks: 6, showgrid: false },
                yaxis: { gridcolor: 'rgba(130,150,170,0.15)', tickprefix: '₹', tickformat: ',.0f', side: 'left', zeroline: false, automargin: true },
                showlegend: false,
                hovermode: 'x unified',
                dragmode: false
              }}
              useResizeHandler
              style={{ width: '100%', height: '390px' }}
              config={{ displaylogo: false, responsive: true, scrollZoom: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'] }}
            />
          ) : (
            <div className="stock-chart-empty">
              <Activity size={25} />
              <strong>{busy ? 'Loading historical prices…' : 'No chart data loaded'}</strong>
              <span>{busy ? 'Fetching daily prices from the configured source.' : 'Select a company or refresh to retrieve its history.'}</span>
            </div>
          )}
        </div>

        <div className="stock-stat-grid">
          <div><span>Open</span><strong>{formatPrice(latest?.open)}</strong></div>
          <div><span>Day high</span><strong>{formatPrice(latest?.high)}</strong></div>
          <div><span>Day low</span><strong>{formatPrice(latest?.low)}</strong></div>
          <div><span>Volume</span><strong>{latest?.volume ? latest.volume.toLocaleString('en-IN') : '—'}</strong></div>
          <div><span>Market cap</span><strong>{profile?.marketCapitalization ? `${Number(profile.marketCapitalization).toLocaleString('en-IN')} (provider units)` : '—'}</strong></div>
          <div><span>Exchange</span><strong>{profile?.exchange || 'NSE India'}</strong></div>
        </div>
        <div className="stock-chart-foot">
          <span><i style={{ background: chartColor }} /> Daily closing price</span>
          <span>Not intraday data · Verify prices with your broker</span>
        </div>
      </section>
    </>
  );
}

function NewsPage() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState({ positive: 0, negative: 0, neutral: 0 });
  const [analyzed, setAnalyzed] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState('7');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const load = async (e?: FormEvent) => {
    e?.preventDefault();

    const cleaned = symbol.trim().toUpperCase().replace(/\.NS$/, '');

    if (!/^[A-Z0-9&_-]+$/.test(cleaned)) {
      setError('Enter a valid NSE company symbol.');
      return;
    }

    setSymbol(cleaned);
    setBusy(true);
    setError('');

    try {
      const r = await apiRequest<{
        articles: Article[];
        sentimentCounts: { positive: number; negative: number; neutral: number };
        analyzedCount: number;
      }>(`/news/company/${encodeURIComponent(cleaned)}?days=${days}&refresh=true`);

      setArticles(r.articles);
      setCounts(r.sentimentCounts);
      setAnalyzed(r.analyzedCount);

      if (!r.articles.length) {
        setError('No articles were returned for this symbol and date range.');
      }
    } catch (e) {
      setError(errText(e));
      setArticles([]);
    } finally {
      setBusy(false);
    }
  };

  const visibleArticles = articles.filter(
    a =>
      (sentimentFilter === 'all' ||
        (a.sentiment?.status === 'success' && a.sentiment.label === sentimentFilter)) &&
      (sourceFilter === 'all' || a.source === sourceFilter)
  );

  const sourcesList = Array.from(
    new Set(articles.map(a => a.source).filter((s): s is string => Boolean(s)))
  );

  return (
    <>
      <PageTitle
        kicker="INDIAN FINANCIAL NEWS"
        title="News, with provenance."
        text="Retrieve company-specific articles and run FinBERT when the model service is available."
      />

      <form className="search-panel compact-search" onSubmit={load}>
        <Newspaper size={18} />
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="NSE company symbol (e.g. RELIANCE)"
          aria-label="NSE company symbol for news"
        />
        <button className="primary-button" disabled={busy}>
          {busy ? 'Retrieving…' : 'Retrieve news'}
        </button>
      </form>

      {error && <InlineError text={error} />}

      <div className="metric-grid sentiment-metrics">
        <Metric title="Positive articles" value={analyzed ? String(counts.positive) : '—'} detail="Successful FinBERT results only" icon={<TrendingUp size={16} />} />
        <Metric title="Negative articles" value={analyzed ? String(counts.negative) : '—'} detail="Successful FinBERT results only" icon={<Activity size={16} />} />
        <Metric title="Neutral articles" value={analyzed ? String(counts.neutral) : '—'} detail="Successful FinBERT results only" icon={<Cpu size={16} />} />
        <Metric title="Analyzed articles" value={String(analyzed)} detail="Not yet analyzed" icon={<ShieldCheck size={16} />} />
      </div>

      <div className="news-filters">
        <label>
          Time range
          <select value={days} onChange={e => setDays(e.target.value)}>
            <option value="1">24 hours</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <label>
          Sentiment
          <select value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)}>
            <option value="all">All articles</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <label>
          Publisher
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="all">All publishers</option>
            {sourcesList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="article-list">
        {visibleArticles.map(a => (
          <article className="article-card" key={a.id}>
            <div className="article-meta">
              <span>{a.source || 'Publisher unavailable'}</span>
              <span>{dateTime(a.publishedAt)}</span>
              <span
                className="sentiment-pill"
                title={
                  a.sentiment?.status === 'success'
                    ? `${a.sentiment.model || 'FinBERT'} analyzed: ${a.sentiment.analyzedText || 'headline and description'}\n${(a.sentiment.probabilities || []).map(p => `${p.label}: ${(p.score * 100).toFixed(1)}%`).join(' · ')}`
                    : 'No successful inference'
                }
              >
                {a.sentiment?.status === 'success'
                  ? `${a.sentiment.label} · ${((a.sentiment.confidence ?? 0) * 100).toFixed(1)}%`
                  : 'Sentiment unavailable'}
              </span>
              {a.sentiment?.status === 'success' && (
                <span className="sentiment-model">
                  {a.sentiment.model || 'FinBERT'} · headline + description
                </span>
              )}
            </div>
            <h3>{a.title}</h3>
            {a.description && <p>{a.description}</p>}
            <a href={a.url} target="_blank" rel="noreferrer">
              Read original article <ExternalLink size={13} />
            </a>
          </article>
        ))}
      </div>

      {articles.length > 0 && !visibleArticles.length && (
        <EmptyState
          icon={<Search size={22} />}
          title="No articles match these filters"
          text="Change the sentiment or publisher filter to view more results."
        />
      )}

      {!articles.length && !error && (
        <EmptyState
          icon={<Newspaper size={22} />}
          title="Retrieve Indian company news"
          text="Enter an NSE company symbol to load available articles. News availability depends on the configured provider."
        />
      )}
    </>
  );
}

function WatchlistPage({
  user, onAuth, notify
}: {
  user: User | null;
  onAuth: () => void;
  notify: (s: string) => void;
}) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    try {
      const r = await apiRequest<{ symbols: string[]; quotes: Quote[] }>('/watchlist');
      setSymbols(r.symbols);
      setQuotes(r.quotes as Quote[]);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = symbol.trim().toUpperCase().replace(/\.NS$/, '');

    if (!/^[A-Z0-9&_-]+$/.test(cleaned)) {
      setError('Enter a valid NSE company symbol.');
      return;
    }

    if (!cleaned) return;

    setBusy(true);

    try {
      const r = await apiRequest<{ symbols: string[] }>('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: cleaned })
      });

      setSymbols(r.symbols);
      setSymbol('');
      await load();
      notify('Symbol saved.');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: string) => {
    try {
      const r = await apiRequest<{ symbols: string[] }>(
        `/watchlist/${encodeURIComponent(s)}`,
        { method: 'DELETE' }
      );
      setSymbols(r.symbols);
      await load();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (!user) {
    return (
      <>
        <PageTitle
          kicker="PERSONAL WATCHLIST"
          title="Your universe."
          text="Save Indian-market symbols to a private watchlist."
        />
        <EmptyState
          icon={<Star size={22} />}
          title="Sign in to manage your watchlist"
          text="Create an account to store symbols and retrieve available quotes."
          action={
            <button className="primary-button" onClick={onAuth}>
              <LogIn size={14} /> Sign in or register
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        kicker="PERSONAL WATCHLIST"
        title="Your universe."
        text="Track saved company symbols. Quotes depend on provider availability."
      />

      <form className="search-panel compact-search" onSubmit={add}>
        <Plus size={18} />
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          placeholder="Add NSE ticker (e.g. RELIANCE)"
          aria-label="Add NSE ticker"
        />
        <button className="primary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Add symbol'}
        </button>
      </form>

      {error && <InlineError text={error} />}

      <section className="panel detail-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">SAVED SYMBOLS</span>
            <h3>{symbols.length} tracked {symbols.length === 1 ? 'symbol' : 'symbols'}</h3>
          </div>
          <button className="outline-button" onClick={() => void load()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {symbols.length
          ? symbols.map(s => {
            const q = quotes.find(v => v.symbol === s);
            return (
              <div className="watch-row" key={s}>
                <div className="ticker-logo">{s[0]}</div>
                <div className="ticker-copy">
                  <strong>{s}</strong>
                  <span>{q?.timestamp ? `As of ${dateTime(q.timestamp)}` : 'Quote unavailable or provider not configured'}</span>
                </div>
                <div className="ticker-value">
                  <strong>{q?.price ? priceDisplay(q.price, q.currency) : '—'}</strong>
                  <span className={
                    q?.changePercent !== undefined && q?.changePercent !== null && q.changePercent >= 0
                      ? 'positive' : 'negative'
                  }>
                    {q?.changePercent !== undefined && q?.changePercent !== null
                      ? `${q.changePercent.toFixed(2)}%` : 'Unavailable'}
                  </span>
                </div>
                <button
                  className="icon-button"
                  onClick={() => void remove(s)}
                  aria-label={`Remove ${s}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })
          : (
            <EmptyState
              icon={<Star size={22} />}
              title="Your watchlist is empty"
              text="Add an NSE company symbol above."
            />
          )}
      </section>
    </>
  );
}

function ResearchPage({
  user, onAuth
}: {
  user: User | null;
  onAuth: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [symbol, setSymbol] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [saved, setSaved] = useState<Array<{ _id: string; symbol: string; title: string; createdAt: string }>>([]);

  useEffect(() => {
    if (user) {
      apiRequest<{ conversations: Array<{ id: string; title: string; updatedAt: string }> }>('/ai/conversations')
        .then(r => setHistory(r.conversations))
        .catch(() => { });

      apiRequest<{ items: Array<{ _id: string; symbol: string; title: string; createdAt: string }> }>('/ai/saved')
        .then(r => setSaved(r.items))
        .catch(() => { });
    }
  }, [user]);

  const ask = async (e: FormEvent) => {
    e.preventDefault();

    if (!user) {
      onAuth();
      return;
    }

    if (!question.trim()) return;

    setBusy(true);
    setError('');
    setAnswer('');
    setSources([]);

    try {
      const cleanedSymbol = symbol.trim().toUpperCase().replace(/\.NS$/, '');

      const r = await apiRequest<{
        conversationId: string;
        answer: string;
        sources: Source[];
      }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          question: question.trim(),
          symbol: cleanedSymbol || undefined,
          conversationId: conversationId || undefined
        })
      });

      setConversationId(r.conversationId);
      setAnswer(r.answer);
      setSources(r.sources || []);

      apiRequest<{ conversations: Array<{ id: string; title: string; updatedAt: string }> }>('/ai/conversations')
        .then(v => setHistory(v.conversations))
        .catch(() => { });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await apiRequest(`/ai/conversations/${id}`, { method: 'DELETE' });
      setHistory(v => v.filter(c => c.id !== id));

      if (conversationId === id) {
        setConversationId('');
        setAnswer('');
        setSources([]);
      }
    } catch (e) {
      setError(errText(e));
    }
  };

  const saveAnswer = async () => {
    try {
      const cleanedSymbol = symbol.trim().toUpperCase().replace(/\.NS$/, '');

      const r = await apiRequest<{
        item: { _id: string; symbol: string; title: string; createdAt: string };
      }>('/ai/saved', {
        method: 'POST',
        body: JSON.stringify({
          symbol: cleanedSymbol || 'GENERAL',
          title: question.trim().slice(0, 180) || 'VHAGAR research',
          content: answer,
          sources
        })
      });

      setSaved(v => [r.item, ...v]);
    } catch (e) {
      setError(errText(e));
    }
  };

  const open = async (id: string) => {
    try {
      const r = await apiRequest<{
        conversation: {
          id: string;
          title: string;
          messages: Array<{ role: string; content: string; sources?: Source[] }>;
        };
      }>('/ai/conversations/' + id);

      setConversationId(id);
      const msgs = r.conversation.messages;
      const last = [...msgs].reverse().find(m => m.role === 'assistant');
      setAnswer(last?.content || '');
      setSources(last?.sources || []);
      setQuestion('');
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <>
      <PageTitle
        kicker="INDIAN MARKET AI RESEARCH"
        title="Ask with evidence."
        text="Research Indian companies using available provider data, company news, and cited sources."
      />

      {!user && (
        <Notice
          title="Sign in required"
          text="Conversation history is private and stored in MongoDB. Sign in to ask questions and save research."
          state="AUTHENTICATION REQUIRED"
        />
      )}

      <div className="research-layout">
        <section className="panel research-main">
          <div className="research-intro">
            <div className="feature-icon"><Sparkles size={18} /></div>
            <div>
              <h3>VHAGAR Research</h3>
              <p>Ask about Indian company context, retrieved news, historical prices, or financial terminology.</p>
            </div>
          </div>

          <form className="research-form" onSubmit={ask}>
            <label>
              NSE company symbol (optional)
              <input
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. RELIANCE"
                maxLength={20}
              />
            </label>

            <label>
              Your question
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="What recent news has affected this Indian company?"
                rows={4}
                maxLength={4000}
              />
            </label>

            <div className="form-foot">
              <span>Research assistance only · Not investment advice</span>
              <button className="primary-button" disabled={busy || !question.trim()}>
                <Sparkles size={14} /> {busy ? 'Researching…' : 'Ask VHAGAR'}
              </button>
            </div>
          </form>

          {error && <InlineError text={error} />}

          {answer && (
            <div className="answer-block">
              <div className="answer-heading">
                <span className="section-kicker">RESEARCH RESPONSE</span>
                <div className="action-row">
                  <button className="outline-button" onClick={() => void saveAnswer()}>
                    <BookOpenText size={12} /> Save research
                  </button>
                  <button
                    className="outline-button"
                    onClick={() => navigator.clipboard?.writeText(answer).catch(() => { })}
                  >
                    Copy answer
                  </button>
                </div>
              </div>

              <div className="answer-text">{answer}</div>

              {sources.length > 0 && (
                <div className="source-list">
                  <strong>Retrieved sources</strong>
                  {sources.map((s, i) => (
                    <a key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer">
                      {s.title || s.url} <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="panel history-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">YOUR RESEARCH</span>
              <h3>Conversations</h3>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                setConversationId('');
                setAnswer('');
                setQuestion('');
                setSources([]);
              }}
              aria-label="New conversation"
            >
              <Plus size={16} />
            </button>
          </div>

          {!user
            ? <p className="muted">Sign in to access saved conversations.</p>
            : history.length
              ? history.map(c => (
                <div className={`history-entry ${conversationId === c.id ? 'history-active' : ''}`} key={c.id}>
                  <button className="history-item" onClick={() => void open(c.id)}>
                    <strong>{c.title}</strong>
                    <small>{dateTime(c.updatedAt)}</small>
                  </button>
                  <button
                    className="icon-button history-delete"
                    aria-label={`Delete conversation ${c.title}`}
                    onClick={() => void deleteConversation(c.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
              : <p className="muted">No saved conversations yet.</p>
          }

          <div className="saved-research-list">
            <div className="section-kicker">SAVED RESEARCH</div>
            {saved.length
              ? saved.slice(0, 8).map(item => (
                <div className="saved-item" key={item._id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.symbol} · {dateTime(item.createdAt)}</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Delete saved research ${item.title}`}
                    onClick={() =>
                      void apiRequest(`/ai/saved/${item._id}`, { method: 'DELETE' })
                        .then(() => setSaved(v => v.filter(x => x._id !== item._id)))
                        .catch(e => setError(errText(e)))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
              : <p className="muted">No saved research yet.</p>
            }
          </div>
        </aside>
      </div>
    </>
  );
}

function SettingsPage({
  user, health, healthError, onAuth, onRefresh, onUserUpdate
}: {
  user: User | null;
  health: Health | null;
  healthError: boolean;
  onAuth: () => void;
  onRefresh: () => void;
  onUserUpdate: (user: User) => void;
}) {
  const [theme, setTheme] = useState(user?.preferences?.theme || 'dark');
  const [preferenceMessage, setPreferenceMessage] = useState('');
  const [savingPreferences, setSavingPreferences] = useState(false);

  const savePreferences = async (e: FormEvent) => {
    e.preventDefault();

    if (!user) {
      onAuth();
      return;
    }

    setSavingPreferences(true);
    setPreferenceMessage('');

    try {
      const response = await apiRequest<{ user: User }>('/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ defaultMarket: 'IN', theme })
      });

      onUserUpdate(response.user);
      setPreferenceMessage('Preferences saved. Default market is NSE India.');
    } catch (e) {
      setPreferenceMessage(errText(e));
    } finally {
      setSavingPreferences(false);
    }
  };

  const rows = [
    ['MongoDB', health?.database || 'Unknown'],
    ['Market data', health?.services?.marketData || 'Unknown'],
    ['News provider', health?.services?.news || 'Unknown'],
    ['FinBERT inference', health?.services?.finbert || 'Unknown'],
    ['LLM provider', health?.services?.llm || 'Unknown']
  ];

  return (
    <>
      <PageTitle
        kicker="SETTINGS & SERVICES"
        title="Operational status."
        text="VHAGAR is configured for Indian listed-company research. Keep secrets in backend/.env."
      />

      <section className="panel detail-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">SERVICE READINESS</span>
            <h3>Connection status</h3>
          </div>
          <button className="outline-button" onClick={onRefresh}>
            <RefreshCw size={13} /> Refresh status
          </button>
        </div>

        {rows.map(([name, status]) => (
          <div className="service-row" key={name}>
            <div>
              <strong>{name}</strong>
              <small>{serviceDescription(name)}</small>
            </div>
            <span className={`service-state ${['connected', 'configured', 'ready'].includes(status.toLowerCase()) ? 'service-good' : ''}`}>
              {status}
            </span>
          </div>
        ))}

        {healthError && (
          <InlineError text="API could not be reached. Check that the Express backend is running." />
        )}
      </section>

      <section className="panel detail-panel">
        <span className="section-kicker">PREFERENCES</span>
        <h3>Research defaults</h3>

        <form className="preferences-form" onSubmit={savePreferences}>
          <label>
            Market
            <select value="IN" disabled>
              <option value="IN">NSE India</option>
            </select>
          </label>

          <label>
            Theme preference
            <select value={theme} onChange={e => setTheme(e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>

          <button className="primary-button" disabled={savingPreferences}>
            {savingPreferences ? 'Saving…' : 'Save preferences'}
          </button>
        </form>

        {preferenceMessage && <p className="muted" role="status">{preferenceMessage}</p>}
      </section>

      <section className="panel detail-panel">
        <span className="section-kicker">ACCOUNT</span>
        <h3>Research workspace</h3>

        {user ? (
          <div className="account-card">
            <div className="user-avatar">{user.name[0]?.toUpperCase()}</div>
            <div>
              <strong>{user.name}</strong>
              <p>{user.email}</p>
              <small>Preferences and saved data are associated with this account.</small>
            </div>
          </div>
        ) : (
          <>
            <p className="muted">You are in guest mode. Sign in to use persistent watchlists and AI conversations.</p>
            <button className="primary-button" onClick={onAuth}>
              <LogIn size={14} /> Sign in or register
            </button>
          </>
        )}
      </section>

      <section className="panel detail-panel">
        <span className="section-kicker">LOCAL CONFIGURATION</span>
        <h3>Enable real data</h3>
        <p className="muted">
          Open <code>backend/.env</code> and configure <code>MONGODB_URI</code>,
          a 32+ character <code>SESSION_SECRET</code>, <code>MARKET_DATA_PROVIDER</code>,
          <code> MARKET_DATA_API_KEY</code>, and an LLM provider/key/model.
          Run the FinBERT FastAPI service separately. Never paste keys into this page or commit them to Git.
        </p>
        <p className="muted">
          Historical daily charts use the free Yahoo Finance chart endpoint.
          Quotes, profiles, and news still depend on their configured provider's Indian-market access.
        </p>
      </section>
    </>
  );
}

function HelpPage() {
  return (
    <>
      <PageTitle
        kicker="DOCUMENTATION"
        title="Know what the data means."
        text="VHAGAR distinguishes provider facts, model outputs, and AI interpretation."
      />
      <div className="help-grid">
        <article className="panel detail-panel">
          <BookOpenText size={19} />
          <h3>Data provenance</h3>
          <p>Quotes and historical candles originate from their configured providers. Each article links to its original publisher. Verify timestamps and data delays before use.</p>
        </article>
        <article className="panel detail-panel">
          <Cpu size={19} />
          <h3>FinBERT sentiment</h3>
          <p>FinBERT predicts positive, negative, or neutral tone in the supplied text. Confidence is model confidence, not the probability a stock will rise or fall. Failed inference is never converted to neutral.</p>
        </article>
        <article className="panel detail-panel">
          <ShieldCheck size={19} />
          <h3>Research safety</h3>
          <p>AI responses can be wrong or incomplete. Review linked sources, distinguish evidence from interpretation, and do not treat sentiment as an unsupported buy/sell signal.</p>
        </article>
      </div>
    </>
  );
}

function AuthModal({
  mode, onClose, onSuccess, onSwitch
}: {
  mode: 'login' | 'register';
  onClose: () => void;
  onSuccess: (u: User) => void;
  onSwitch: (m: 'login' | 'register') => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const r = await apiRequest<{ user: User }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(mode === 'register' ? { name, email, password } : { email, password })
      });

      onSuccess(r.user);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
        <div className="brand-mark modal-mark"><Activity size={20} /></div>
        <span className="section-kicker">VHAGAR ACCOUNT</span>
        <h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Create your research desk.'}</h2>
        <p className="muted">Secure, persistent access to your watchlists and research history.</p>

        <form className="research-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              maxLength={254}
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 12 : 1}
              maxLength={128}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? 'At least 12 characters' : ''}
            />
          </label>

          {error && <InlineError text={error} />}

          <button className="primary-button full-width" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
          <button onClick={() => onSwitch(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  );
}

function PageTitle({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <div className="page-title">
      <span className="section-kicker">{kicker}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

function Notice({ title, text, state }: { title: string; text: string; state: string }) {
  return (
    <div className="system-notice">
      <div className="notice-icon"><Activity size={16} /></div>
      <div><strong>{title}</strong><p>{text}</p></div>
      <span className="notice-state">{state}</span>
    </div>
  );
}

function Metric({
  title, value, detail, icon
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail"><span className="metric-dash" />{detail}</div>
    </div>
  );
}

function Feature({
  icon, number, title, text, action, onClick
}: {
  icon: ReactNode;
  number: string;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <article className="feature-card">
      <div className="feature-top">
        <span className="feature-icon">{icon}</span>
        <span className="feature-number">{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="feature-action" onClick={onClick}>{action} <span>→</span></button>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({
  icon, title, text, action
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return <div className="inline-error" role="alert">{text}</div>;
}

function serviceDescription(name: string) {
  return ({
    MongoDB: 'Persistent user records, watchlists, news cache, and conversations.',
    'Market data': 'Configured live quote provider; Indian exchange access must be verified.',
    'News provider': 'Company-specific article retrieval and attribution.',
    'FinBERT inference': 'Python inference service and model readiness.',
    'LLM provider': 'Server-side AI research generation.'
  } as Record<string, string>)[name] || '';
}

function errText(e: unknown) {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : 'Unexpected error. Please retry.';
}

