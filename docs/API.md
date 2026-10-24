# VHAGAR API contract

Base path: `/api/v1`. JSON requests/responses unless status `204`. All error responses use `{ "error": "CODE", "message": "Human-readable message" }`. Internal stack traces and provider credentials are not returned.

## Health
- `GET /health` — liveness, suitable for basic process checks.
- `GET /health/details` — database state and configured/ready integrations. `status` may be `degraded`; inspect individual service fields.

## Authentication
- `POST /auth/register` — `{ name, email, password }`; password minimum 12 characters; creates an Argon2id hash and an opaque session cookie.
- `POST /auth/login` — `{ email, password }`.
- `POST /auth/logout` — invalidates the server-side session and clears the cookie.
- `GET /auth/me` — current authenticated user.
- `PATCH /auth/preferences` — one or more of `{ theme, defaultMarket, timezone }`.

Sessions are random opaque tokens stored as HMAC-SHA-256 hashes in MongoDB with expiry. Cookies are HTTP-only and SameSite=Lax. Set `COOKIE_SECURE=true` behind HTTPS. The API rejects mutation requests whose supplied `Origin` does not match `FRONTEND_ORIGIN`; production deployments should review CSRF protections and origin topology before exposing the service.

## Market data
- `GET /market/search?q=...` — provider search results.
- `GET /market/quote/:symbol` — provider quote with timestamp and delay caveat.
- `GET /market/quotes?symbols=AAPL,MSFT` — partial-success batch quotes.
- `GET /market/history/:symbol?days=90&resolution=D` — OHLCV candles.
- `GET /market/company/:symbol` — provider company profile.

Implemented provider: Finnhub. Quotes are cached for 30 seconds, candles for 1 hour, profiles for 24 hours, and search for 1 hour in MongoDB with TTL expiry. Cache reads require the configured MongoDB; no in-memory persistence fallback exists. Provider access and delays depend on the provider plan and exchange entitlement. The current quote endpoint marks delay status as unknown when the provider response does not establish it.

## News and sentiment
- `GET /news/company/:symbol?days=7&refresh=true` — company-specific provider articles with original URLs, publisher, publication timestamp, article sentiment status, and aggregate counts. News provider cache is 10 minutes; article/sentiment attachment cache is 30 minutes; successful text-hash/model-version sentiment cache is 90 days. Successful inference is cached by normalized-text SHA-256 hash and model version. Failed inference remains unavailable and is not counted as neutral.

## User-specific resources (authentication required)
- `GET /watchlist`
- `POST /watchlist` — `{ symbol }`
- `DELETE /watchlist/:symbol`
- `GET /ai/conversations`
- `GET /ai/conversations/:id`
- `DELETE /ai/conversations/:id`
- `POST /ai/chat` — `{ question, symbol?, conversationId? }`
- `GET /ai/saved`
- `POST /ai/saved` — `{ symbol, title, content, sources? }`
- `DELETE /ai/saved/:id`

All conversation and saved-research queries include the authenticated user identifier in their database filters. AI research returns source references when retrieved articles were available. If data is unavailable, the context and answer should disclose that limitation.

## FinBERT service (internal)
- `GET /health` — service and model readiness.
- `POST /infer` — `{ text }`; returns model id, analyzed text, label, confidence, and probabilities. Node maps snake_case response fields to the API's internal camelCase types. The service returns `503` if model initialization/download failed.
