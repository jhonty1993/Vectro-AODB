# Vectro AODB + Landing Fees Portal

**Airport Operational Database (AODB)** and **airline landing fees self-service portal** on one platform.

Built by **TechHouseCa Inc.** · vectro.ca

```
npm start          # or: node server.js
→ http://localhost:8080              # AODB operations console
→ http://localhost:8080/portal.html  # Landing fees portal (airlines)
```

Zero dependencies — runs on stock Node.js (≥18). On first boot Vectro seeds a full operating day (~106 flights) and a live simulator drives movements, charges, and alerts in real time.

## What's included

| Surface | URL | Audience |
|---------|-----|----------|
| **AODB Console** | `/` | Airport ops — 18 modules (flights, FIDS, billing, etc.) |
| **Landing Fees Portal** | `/portal.html` | Airlines — charges, invoices, tariff, fee calculator |

### AODB (Module 02)

- Full operating-day flight schedule (ARR/DEP)
- AOCC actions: delay, cancel, gate change
- FIDS boards + public display (`/#/fids-display`)
- Real-time SSE updates

### Landing Fees Portal

Airline self-service portal secured with **per-airline API keys**:

- View movement charges and landing fee line items
- View issued invoices and uninvoiced balances
- Published tariff reference
- Pre-arrival **landing fee calculator** (MTOW-based)

### Aeronautical Billing (Module 15)

- Auto-rated charges at off-blocks (landing, terminal, parking, bridge, handling, de-ice, night surcharge)
- Standalone arrivals billed on on-blocks
- Finance generates airline invoices from the console

## Environment variables

Copy `.env.example` and configure for Railway:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (Railway sets automatically) |
| `PORTAL_API_KEYS` | JSON map: `{"AC":"secret-key","WS":"other-key"}` |
| `ADMIN_API_KEY` | Optional admin key for protected actions |
| `NODE_ENV` | Set `production` on Railway (disables demo keys) |

**Demo keys (local dev only):** `demo-ac-key`, `demo-ws-key`, `demo-pd-key`

## Deploy to Railway

1. Push this repo to GitHub
2. Create a new Railway project → Deploy from GitHub → select `Vectro-AODB`
3. Add variables in Railway dashboard:
   - `NODE_ENV=production`
   - `PORTAL_API_KEYS={"AC":"your-key",...}`
   - `ADMIN_API_KEY=your-admin-key`
4. Railway uses `railway.toml` — start command: `node server.js`
5. Generate a public domain under Settings → Networking

Or from CLI:

```bash
railway up -y
railway variable set NODE_ENV=production
railway variable set PORTAL_API_KEYS='{"AC":"..."}'
```

## API — Portal endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/portal/tariff` | Public | Published tariff + aircraft MTOW reference |
| POST | `/api/portal/estimate` | Public | Landing fee calculator |
| GET | `/api/portal/me` | Bearer | Airline account summary |
| GET | `/api/portal/charges` | Bearer | Airline-scoped movement charges |
| GET | `/api/portal/invoices` | Bearer | Airline-scoped invoices |
| GET | `/api/portal/flights` | Bearer | Airline flights (±12h / +24h) |

Auth header: `Authorization: Bearer <airline-api-key>`

## Testing

```
npm test    # boots server, exercises AODB + billing + portal APIs
```

## Configuration

| File | Purpose |
|------|---------|
| `src/seed.js` → `TARIFFS` | Published aeronautical tariff |
| `src/seed.js` → airport block | Airport identity (default YYZ) |
| `data/db.json` | Operating-day snapshot (regenerates if stale) |
