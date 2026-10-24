# VHAGAR — Financial Intelligence Platform

VHAGAR connects provider-sourced market data, company news, FinBERT financial sentiment, and an AI research assistant. The application is designed to disclose unavailable providers and incomplete evidence rather than invent prices, news, or sentiment.

## Current capabilities

- Responsive React + Vite + TypeScript financial terminal.
- Express + TypeScript REST API under `/api/v1`.
- MongoDB/Mongoose persistence for users, hashed opaque sessions, watchlists, news cache, market cache, conversations, and saved research.
- Argon2id password hashing, HTTP-only session cookies, input validation, auth rate limiting, origin checks, Helmet, and user-scoped private routes.
- Finnhub adapter for quotes, historical OHLCV candles, company profiles/search, and company news. Data freshness is bounded with MongoDB TTL caches.
- Separate FastAPI service configured to load the genuine `ProsusAI/finbert` model once per process, expose `/health` and `/infer`, return class probabilities and confidence, and report unavailable inference honestly.
- OpenAI Chat Completions or OpenAI-compatible LLM endpoint support. Company-specific research includes retrieved context when configured; conversations are user-scoped.
- Automated backend API-boundary/authentication-primitive/schema tests and FinBERT service tests.

## Important limitations

This source archive is not proof of a deployed production system. Live market/news requests require provider entitlements and API credentials. AI answers require a configured LLM key. FinBERT needs Python dependencies, model-download internet access, and sufficient RAM/disk. This development environment could not complete `npm install` because dependency installation timed out, so a frontend/backend build has **not** been verified here. Do not describe the app as production-ready until you run the checks below in an environment that can install packages and connect to MongoDB/providers.

## Requirements

- Node.js 20+ and npm 10+
- MongoDB 7+ locally or MongoDB Atlas
- Python 3.11 recommended for the FinBERT service
- Internet access for npm/pip installs and the first Hugging Face model download
- Optional provider credentials: Finnhub and an OpenAI or OpenAI-compatible LLM provider

## Local setup (Windows PowerShell or CMD)

1. Install Node.js 20+, Python 3.11, and MongoDB, or create a MongoDB Atlas database. On Windows, run `scripts\setup-windows.bat` to install JavaScript/Python dependencies and create local environment-file templates; it does not install MongoDB or create provider credentials.
2. Edit `backend/.env` (created from the example by the setup script). At minimum set `MONGODB_URI` and `SESSION_SECRET` (a random string of 32+ characters). For actual market/news features, set `MARKET_DATA_PROVIDER=finnhub`, `NEWS_PROVIDER=finnhub`, and `MARKET_DATA_API_KEY` to a key from your Finnhub account. Provider symbol coverage and delay depend on your plan/exchange entitlements.
3. Check that `frontend/.env` exists. The default API URL is `http://localhost:4000/api/v1`. The backend explicitly loads `backend/.env` even when npm workspace scripts are launched from the repository root.
4. If you did not use the Windows setup script, install packages from the project root:

   ```bash
   npm install
   ```

5. Start MongoDB.
6. In terminal 1, from the project root:

   ```bash
   npm run dev:backend
   ```

7. In terminal 2, from the project root:

   ```bash
   npm run dev:frontend
   ```

8. In terminal 3, start FinBERT:

   ```bash
   cd services/finbert-service
   python -m venv .venv
   # Windows CMD: .venv\\Scripts\\activate.bat
   # Windows PowerShell: .venv\\Scripts\\Activate.ps1
   # macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
   ```

9. Open `http://localhost:5173`. Keep the service terminals open. FinBERT downloads model weights on first start and may take several minutes. Check `http://127.0.0.1:8001/health` until `ready` is true. On Windows, after setup and editing `backend/.env`, `scripts\start-windows.bat` opens the frontend, backend, and FinBERT service in separate terminals.

### Enable AI research

In `backend/.env` set:

```dotenv
LLM_PROVIDER=openai
LLM_API_KEY=your-provider-key
LLM_MODEL=gpt-4o-mini
```

The API key stays in the backend environment. Never use a `VITE_` variable for provider secrets. For another OpenAI-compatible provider, set `LLM_PROVIDER` to its HTTPS base URL ending before `/chat/completions`, then set the corresponding key and model.

### Docker Compose (MongoDB + API + UI + FinBERT)

Docker provides a local MongoDB container. It does not remove the need for market/news/LLM credentials if you want those integrations.

1. Copy root `.env.example` to `.env` and replace `SESSION_SECRET` with a random value of at least 32 characters. Add provider values if available.
2. Install Docker Desktop and start it.
3. Run from the repository root:

   ```bash
   docker compose up --build
   ```

4. Open `http://localhost:4173`. API is bound to `http://localhost:4000`; FinBERT health is bound to `http://localhost:8001/health`. The first image build/model download needs internet and disk space. To stop services, run `docker compose down`; use `docker compose down -v` only if you intentionally want to delete the local MongoDB and model volumes.

## Troubleshooting

- **Blank page after opening `index.html`:** do not open the file directly. Run Vite with `npm run dev:frontend` from the repository root and open `http://localhost:5173`. React modules are served and transformed by Vite.
- **Backend exits with environment validation errors:** edit `backend/.env`; replace the example `SESSION_SECRET` with a unique random value of at least 32 characters. The backend loads this file automatically from the workspace root.
- **Backend cannot connect:** confirm MongoDB is running or `MONGODB_URI` points to a reachable Atlas deployment. The API does not silently switch to in-memory storage.
- **No quotes/news:** configure Finnhub in `backend/.env`, and verify your API plan allows the requested symbols/endpoints. No sample prices or fictional articles are substituted.
- **FinBERT reports `ready: false`:** inspect its terminal for model-download/dependency errors, then run `npm run verify:finbert` after `/health` reports `ready: true`. The model weights are downloaded from Hugging Face on first startup and are not bundled in the ZIP.
- **AI research is unavailable:** configure an LLM provider, key, and model in `backend/.env`. Never put provider secrets in `frontend/.env`.
- **npm install cannot resolve the registry:** check your internet, DNS, proxy, and npm registry access, then retry `npm install`. A successful typecheck/build cannot be claimed until dependencies are installed.

## Provider configuration

| Variable | Required for | Example |
|---|---|---|
| `MONGODB_URI` | Persistent application data | `mongodb://127.0.0.1:27017/vhagar` |
| `SESSION_SECRET` | Session-token hashing | random 32+ character secret |
| `MARKET_DATA_PROVIDER` | Quotes/history/company search | `finnhub` |
| `MARKET_DATA_API_KEY` | Finnhub market data and (if selected) news | provider-issued key |
| `NEWS_PROVIDER` | Company news retrieval | `finnhub` |
| `FINBERT_SERVICE_URL` | Node-to-FinBERT service | `http://127.0.0.1:8001` |
| `FINBERT_MODEL_ID` | Sentiment-cache model version | `ProsusAI/finbert` |
| `LLM_PROVIDER` | AI research generation | `openai` or an OpenAI-compatible HTTPS base URL |
| `LLM_API_KEY` | AI research generation | provider-issued key |
| `LLM_MODEL` | AI research generation | model name supported by provider |

Finnhub is the implemented provider adapter in this version. Set both market and news provider variables to `finnhub` to enable both features with the shared key. A configured key does not guarantee exchange access or real-time entitlement; the UI displays errors and timestamps rather than fabricating values.

## API overview

- `GET /api/v1/health` — API liveness
- `GET /api/v1/health/details` — database and integration readiness
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `PATCH /api/v1/auth/preferences`
- `GET /api/v1/market/search?q=...`, `GET /api/v1/market/quote/:symbol`, `GET /api/v1/market/quotes`, `GET /api/v1/market/history/:symbol`, `GET /api/v1/market/company/:symbol`
- `GET /api/v1/news/company/:symbol`
- Authenticated `GET/POST /api/v1/watchlist`, `DELETE /api/v1/watchlist/:symbol`
- Authenticated `POST /api/v1/ai/chat`, `GET /api/v1/ai/conversations`, `GET/DELETE /api/v1/ai/conversations/:id`, and saved research endpoints under `/api/v1/ai/saved`
- FinBERT internal endpoints: `GET /health`, `POST /infer`

See `docs/API.md` and `docs/ARCHITECTURE.md` for more details.

## Quality checks

From the project root after `npm install`:

```bash
npm run typecheck
npm run build
npm test
npm run check:python
npm run test:finbert
```

Run Python tests from the repository root; they use a fake inference pipeline to test response handling and service-unavailable behavior. They do **not** prove the downloaded FinBERT weights themselves work. To verify real model inference, start the service and POST a non-sensitive sample financial sentence to `/infer`, then verify `/health` reports `ready: true`. Run `npm run verify:finbert` to exercise the running service with a real model response (this requires the model weights to have downloaded successfully). For end-to-end verification, also test with a reachable MongoDB and valid provider credentials.

## Security and data integrity

- Do not commit `.env` files or share API keys/passwords in chat.
- Production deployments must use HTTPS and `COOKIE_SECURE=true`, a restrictive frontend origin, secure secret management, and appropriate CSRF controls for the chosen deployment topology.
- Market cache freshness is explicit: quotes 30 seconds, candles 1 hour, profiles 24 hours, search 1 hour; news API cache 10 minutes and article/sentiment cache 30 minutes.
- FinBERT model confidence is not the probability a security will rise or fall. The assistant is for research and education, not personalized investment advice.
