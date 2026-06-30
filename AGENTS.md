# Vectro AODB

Airport Operating System: AODB + Vectro Allocate (gate/stand/check-in
allocation, `src/allocate.js`, `/api/allocate/*`) + airline Landing Fees Portal.
A single zero-dependency Node.js process (`server.js`) serves the ops console
(`/`, 21 modules), the landing fees portal (`/portal.html`), a REST/SSE API
(`/api/*`), and an in-process live simulator. This instance is configured for
Kelowna International (YLW) — airport/resources/airlines/routes live in
`src/seed.js`. State persists to `data/db.json` (gitignored, auto-created).
See `README.md` for product/API details and the env-var table.

## Product priorities

- **Primary: aeronautical billing + the airline Landing Fees Portal.** This is
  the core of the product — the billing engine (`src/billing.js`, auto-rated
  charges at off-blocks), `/api/billing/*`, the portal (`/portal.html`,
  `/api/portal/*`), and tariff/invoicing flows must stay correct and take
  precedence in any change or trade-off.
- **Secondary: everything else** — AODB/flights, Vectro Allocate
  (gate/stand/check-in), turnaround, terminal, airside, safety, etc. These are
  supporting modules; keep them, but never let them regress or complicate the
  billing/landing-fees path.

## Cursor Cloud specific instructions

- Run/test/build commands live in `package.json` and `README.md`; reuse those.
  Quick reference: `node server.js` (or `npm start`/`npm run dev`) to run,
  `npm test` to run the smoke suite.
- Zero runtime dependencies — `npm install` is a no-op. There is no build step
  and no linter configured (no ESLint/Prettier), so "lint" is not applicable.
- Server listens on `PORT` (default `8080`). The healthcheck/bootstrap endpoint
  is `GET /api/bootstrap`.
- `npm test` boots a real server on port `8198` with `NODE_ENV=development` and
  wipes `data/` first — don't run it against a state you care about. It is
  self-contained (needs no secrets or external services).
- No external services (no DB/cache/queue). The "database" is `data/db.json`,
  which the store reseeds when stale (~20h old); delete `data/` to force a fresh
  operating day.
- `.env` is NOT auto-loaded (no dotenv). Env vars must be exported in the shell.
  For local dev no secrets are needed: when `NODE_ENV` is not `production`, demo
  portal API keys are enabled — `demo-ac-key`, `demo-ws-key`, `demo-pd-key`
  (sent as `Authorization: Bearer <key>`). In production, demo keys are disabled
  and `PORTAL_API_KEYS` (JSON map) must be set.
- The simulator advances on a 4s tick, so API responses (flights, charges,
  alerts) change over time — expect non-deterministic live values.
