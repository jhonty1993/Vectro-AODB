# AODB — Airport Operational Database

## Overview

Full-stack AODB web application for CYLW (Kelowna International Airport) demo data.
pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind v4 + shadcn/ui
- **Data fetching**: TanStack React Query v5
- **Charts**: Recharts
- **Routing**: Wouter

## Architecture

- **Event-sourced**: Immutable `flight_events` log → `flight_movements` projection
- **No live API keys needed**: Simulated FR24 ingestion via simulator endpoint
- **Demo mode**: Seeded with 18 YLW/CYLW flights, 47 events, 8 aircraft, 4 tariffs, 6 billing records
- **Commercial-only MVP**: `commercialOnlyMode=true` by default — GA/private/military/helicopter suppressed from main board

## Commercial AODB MVP — Source Strategy

- **Cirium** → Future commercial schedule (STA/STD, airline, route, equipment, code-share)
- **FR24** → Live day-of-ops actuals (ATD/ATA, tail, diversion confirmation). Credit usage tracked in `fr24_usage_log` table.
- **ADS-B Exchange** → Secondary verification only (corroborates FR24, does NOT originate main board records)
- **Airport JSON Feed** → Phase 2 status/ETA overlay (de-prioritized for MVP). Stand/gate/belt are NOT used in Commercial AODB.

Commercial classifier: `artifacts/api-server/src/lib/commercial.ts`
- `COMMERCIAL_AIRLINE_IATA` set of 300+ IATA codes
- `classifyFlight()` → "airline" | "cargo" | "charter" | "ga" | "military" | "helicopter" | "unknown"
- `isCommercial()` → boolean (excludes GA, private, military, helicopters)
- `SOURCE_STRATEGY` const — per-field priority table

## Artifacts

- `artifacts/aodb` — React frontend at `/` (port 19648)
- `artifacts/api-server` — Express API at `/api` (port 8080)

## In-App Billing Module (airport revenue ops)

Full airfees-style billing module built on the movement/event model. Backend in
`lib/db` (12 billing tables), `artifacts/api-server/src/lib/billing-engine.ts`
(rating engine: route/engine classification, MTOW lookup, effective-dated
rate-rule matching with provenance + alerts), and
`artifacts/api-server/src/routes/billing-module.ts` (mounted at `/billing`).
Seeded by `seed-billing.ts` (idempotent; wired into app.ts boot chain after
`advanceDemoFlightDates`). Backend routes are auth-gated only (requireAuth).

Frontend pages under `artifacts/aodb/src/pages/billing/` (all default-export,
wrapped in `BillingShell` 8-tab sub-nav, raw fetch via `src/lib/billing-api.ts`,
NOT Orval): dashboard, charges (+ detail drawer with alerts/decision-log/
hold/discard/ready), invoices (select charges → create batch), customers,
item-codes, rate-plans (plans + rules CRUD), parking, recurring. Flight detail
shows linked charges with rate/hold/discard actions (finance+ only).

### Role-based access
- `src/lib/role.tsx` — `useRole()` reads `user.publicMetadata.role` (default
  `admin`, intentional for invite-only trusted staff). `RequireRole` client guard
  with `min` + `redirectTo`. Ranks: public < ops < finance < admin.
- Ops console (`OpsRoutes`) wrapped in `RequireRole min="ops" redirectTo="/"` —
  public-role users see only the public board.
- Billing routes wrapped in `RequireRole min="finance"`.
- Nav groups in `layout.tsx` filtered by `atLeast(role, group.min)`.
- The role split is frontend-only (nav/UX); all signed-in users are trusted.
  Set Clerk sign-up to invite-only and assign roles in the Clerk dashboard.

## Pages

All 9 core ops pages are complete:
- `/` — Operations Dashboard (movement board, stats, charts)
- `/flights/:id` — Flight lifecycle detail + immutable event timeline
- `/manual-entry` — Manual flight movement creation form
- `/rms` — RMS Integration (outbox viewer, stand/gate/belt allocation)
- `/billing` — Billing module dashboard (see In-App Billing Module above; reconciliation moved to `/billing/reconciliation`)
- `/aircraft` — Aircraft Registry & Tariff Records (admin)
- `/quality` — Data Quality & Audit Log
- `/data-sources` — Airport Feed Mapping (field mapper, feed URL config, status code mapping)
- `/settings` — Settings & Integrations (airport config, simulator)

## YLW Public Flight Feeds (live, real data)

The Kelowna airport publishes its current-day flight board as public JSON. These are the **primary baseline** for the Live Ops Board — they replace the demo seed and the 12-row sample schedule.

- Arrivals: `https://kelprodylwfast01.blob.core.windows.net/$web/ylw/flights/arrivals.json`
- Departures: `https://kelprodylwfast01.blob.core.windows.net/$web/ylw/flights/departures.json`

Each feed contains ~40–50 commercial movements per day, with `ScheduleTime` (UTC ISO), `EstimatedTime`, `Status`, `TailNumber`, `Gate`, `Baggage`, `AirlineCode`, `FlightNumber`, and via-airport. Append `?_=<timestamp>` to bust the CDN cache.

Server integration (`artifacts/api-server/src/routes/ylw-feed.ts`):
- `startYlwFeedScheduler()` is called from `app.ts` on boot and re-runs every 5 minutes.
- `syncYlwFeedToScheduleAndMovements()` upserts both `flight_movements` (with `data_source='YLW_FEED'`) and `static_schedule_movements` (under a single auto-managed "YLW Live Feed" import marked active).
- On first successful sync with ≥10 entries, all legacy demo seed rows (AC8819 / WS3281 / 8P401 / etc.) and any "demo sample" schedule import are purged.
- Status map: `ARRIVED → LANDED`, `DEPARTED → DEPARTED`, `BOARDING/GATE/DELAYED → ESTIMATED`, `CANCELLED → CANCELLED`, `DIVERTED → DIVERTED`, default → `SCHEDULED`.
- Endpoints: `GET /api/ylw-feed/status`, `POST /api/ylw-feed/sync`, `GET /api/ylw-feed/preview?direction=ARR|DEP`.

## Data Sources / Feed Mapping

Seven-tab Data Sources page:
1. **FR24 Live** (first tab) — secure key entry, connection status banner, test + sync actions, billing actuals note, FR24 priority fields list, API endpoint docs
2. **Sources Overview** — source priority rules table (10 fields × 4 priority slots + override), multi-source data-flow diagram, 4 source cards (Cirium, FR24, ADS-B Exchange, Airport Feed)
2. **ADS-B Exchange** — fully wired: status banner (live/configured/demo/failed), provider selector (ADS-B Exchange / OpenSky / Manual), config form saving to DB, Test Connection + Manual Sync buttons with live result cards, nearby aircraft table (with match type badges: exact/probable/possible/unmatched), unmatched review queue (aircraft with no Cirium match)
3. **Source Comparison** — side-by-side table (18 flights, FR24 + ADS-B Exchange columns), click-to-expand per-field source values, conflict detection rules
4. **Reliability Metrics** — FR24/ADSBX match rates, agreement rate, unmatched aircraft, per-airline breakdown
5. **Field Mapping** — live feed inspector via `/api/feed/inspect` proxy, static mapping reference
6. **Status Mapping** — feed status → canonical AODB enum

### API Routes (commercial / settings)
- `GET /api/settings` — includes `commercialOnlyMode: boolean` field
- `PUT /api/settings` — accepts `commercialOnlyMode` in body
- `POST /api/settings/commercial-scope { commercialOnlyMode: boolean }` — dedicated toggle
- `GET /api/sources/strategy` — returns `SOURCE_STRATEGY` const + live `commercialOnlyMode`
- `GET /api/flights?commercial_only=true` — filters to commercial flights only (default: on)
- `GET /api/sources/comparison?commercial_only=true` — comparison with `isCommercial`/`commercialClass` per row

### API Routes (sources)
- `GET /api/sources/adsb/status` — ADS-B connection status, last sync stats, config
- `POST /api/sources/adsb/configure` — save provider, API key (server-side), lat/lon/radius/polling
- `POST /api/sources/adsb/test-connection` — test key (live or demo)
- `POST /api/sources/adsb/sync` — run sync (saves to DB, matches to movements)
- `GET /api/sources/adsb/aircraft-nearby?limit=N` — query `adsb_observations` + `adsb_matches`
- `GET /api/sources/adsb/unmatched` — unmatched observations from review queue
- `GET /api/sources/adsb/matches` — all matches with match type + score
- `GET /api/sources/adsbexchange/nearby?lat&lon&radius` — legacy (backward compat)
- `POST /api/sources/adsbexchange/sync` — legacy (backward compat)
- `GET /api/sources/comparison` — 4-source side-by-side comparison for all flights
- `GET /api/sources/:id/source-values` — per-field source breakdown for a flight
- `GET /api/sources/reliability` — match rates and per-airline breakdown
- `POST /api/feed/inspect { url }` — server-side feed proxy
- `GET /api/sources/fr24/usage/summary` — credit balance, remaining, today's usage, warning flags
- `GET /api/sources/fr24/usage/daily?days=N` — per-day credit usage breakdown (up to 90 days)
- `GET /api/sources/fr24/usage/log?limit&offset` — raw API call log (paginated)
- `GET /api/sources/fr24/usage/export` — CSV download of all log entries
- `POST /api/sources/fr24/usage/reset-balance` — update starting credits, daily/remaining warning thresholds

### Source Priority (per-field)
- STA/STD: Cirium → Airport Feed → FR24 → Manual
- ATA/ATD: FR24 → ADS-B Exchange → Airport Feed → Manual
- Tail/Reg: FR24 → ADS-B Exchange → Manual
- Aircraft Type: FR24 → ADS-B Exchange → Cirium → Manual
- ICAO Hex / Position: ADS-B Exchange → FR24

Note: Stand, gate, belt, and runway are NOT in source priority — those fields are excluded from the Commercial AODB MVP.

### ADS-B Exchange
- Globe reference (visual only): `https://globe.adsbexchange.com/?airport=cylw`
- Production API template: `GET https://adsbexchange-com1.p.rapidapi.com/v2/lat/{lat}/lon/{lon}/dist/{radius}/`
- CYLW: lat 49.9561, lon -119.3778, default radius 25nm

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## DB Schema

9 tables: `flight_movements`, `flight_events`, `aircraft_registry`, `tariff_records`, `billing_records`, `integration_outbox`, `app_settings`, `adsb_observations`, `adsb_matches`

- `adsb_observations` — raw ADS-B aircraft observations (icaoHex, callsign, reg, type, alt, GS, track, lat, lon, distanceNm, inferredStatus, syncId, source)
- `adsb_matches` — match results linking observations to movements (matchType: exact/probable/possible/unmatched, matchScore 0–100, matchedFlightId FK)
- `app_settings` extended with: `adsbxProvider`, `adsbxApiKey`, `adsbxLat`, `adsbxLon`, `adsbxRadiusNm`, `adsbxPollingIntervalSeconds`, `adsbxConnectionStatus`, `adsbxLastSyncAt`, `adsbxLastSyncStatus`, `adsbxLastSyncCount`, `commercialOnlyMode` (boolean, default true)

## CSS / Theming

- Dark aviation command center theme — near-black navy + blue primary
- Tailwind v4 — no `@apply dark;` in `@layer base` (use `color-scheme: dark` on body instead)
- Custom variant: `@custom-variant dark (&:is(.dark *));` defined in `index.css`

## Important Notes

- Hook import pattern: `import from "@workspace/api-client-react"`. All hooks/keys exported from generated file.
- `lib/api-zod/src/index.ts` must only contain `export * from "./generated/api";` — codegen script patches this automatically via a node -e postfix after orval runs (orval incorrectly adds a second export for `api.schemas` that doesn't exist in zod single-file mode).
- API server seeds on startup (idempotent with ON CONFLICT DO NOTHING).
- `useRunSimulatorTick` takes `void` — call `.mutate()` with no arguments.
