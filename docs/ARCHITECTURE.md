# VHAGAR architecture

- `frontend/`: React + Vite + TypeScript single-page app with responsive dark terminal UI, API client, Plotly historical charts, company explorer, news/sentiment view, auth dialog, watchlist, settings, and research assistant.
- `backend/`: Express REST API under `/api/v1`, Mongoose models, cookie-backed authentication, validation, rate limits, provider adapters, TTL-backed market/news caches, and per-user research persistence.
- `services/finbert-service/`: FastAPI service loading the genuine `ProsusAI/finbert` Transformers model once at process startup. Model loading failures remain visible via `/health`; inference failures return errors instead of a neutral label.
- `docs/`: API contract and operational instructions.

## Data flow

1. Browser requests the Express API. Provider API keys remain server-side.
2. Express validates query/body inputs, fetches provider data, and persists short-lived cache entries to MongoDB. It does not synthesize quote or news payloads.
3. News articles retain source attribution and original URLs. The backend sends title + description to the internal FinBERT service. Successful sentiment metadata is persisted with a model id; a MongoDB cache keyed by normalized-text SHA-256 hash and model version prevents repeat inference; failures are marked unavailable.
4. Authenticated AI questions can retrieve a provider company profile, quote, recent candles, and cached company news. An LLM response is generated only if an LLM provider is configured. Conversation ownership is enforced in database queries.
5. Frontend distinguishes service errors, unavailable provider data, and successful data; it does not fill gaps with sample financial values.

## Persistence and freshness

MongoDB is the primary application store and required for backend startup. User, session, watchlist, news cache, market cache, conversation, and saved-research records are Mongoose models. Market cache TTLs are 30 seconds for quotes, 1 hour for candles/search, 24 hours for company profiles; provider news cache is 10 minutes and article/sentiment attachment cache is 30 minutes; successful text-hash/model-version sentiment cache is 90 days. MongoDB TTL deletion is asynchronous, so every cache read also checks `expiresAt`.

## Operational limitations

- Finnhub is the implemented market/news provider adapter. Entitlements, supported symbols, quote delays, and history depth vary by plan.
- The FinBERT model requires external model download and enough local memory/disk; service availability is separate from model readiness.
- LLM output quality depends on configured provider/model and retrieved context. It is not a source of market truth.
- Production use requires HTTPS, secure cookie configuration, restrictive CORS, secrets management, rate limits, monitoring, backups, and a deployment-specific CSRF review.
