'use strict';

const store = require('./store');
const { id, MIN, HOUR } = require('./util');
const { logEvent, raiseAlert } = require('./simulator');
const { authenticatePortal } = require('./auth');
const { estimateMovement, portalSummary, chargeForAirline, invoicesForAirline } = require('./billing');

// ---------------------------------------------------------------------------
// SSE hub
// ---------------------------------------------------------------------------

const clients = new Set();

function emit(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

function sse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function portalAuth(req, res) {
  const session = authenticatePortal(req);
  if (!session) {
    json(res, 401, { error: 'invalid or missing API key — use Authorization: Bearer <key>' });
    return null;
  }
  return session;
}

function chargeView(c) {
  return {
    ref: c.ref, flight: c.flight, arrFlight: c.arrFlight, reg: c.reg, acType: c.acType,
    ts: c.ts, total: c.total, status: c.status, lines: c.lines,
    landingFee: (c.lines || []).find(l => /landing fee/i.test(l.desc))?.amount || 0,
  };
}

function flightView(db, f) {
  const a = db.airlines.find(x => x.code === f.airline);
  return { ...f, airlineName: a ? a.name : f.airline, airlineColor: a ? a.color : '#888', delay: Math.round((f.est - f.sched) / MIN) };
}

// ---------------------------------------------------------------------------
// Computed payloads
// ---------------------------------------------------------------------------

function overview(db) {
  const now = Date.now();
  const flights = db.flights;
  const depDone = flights.filter(f => f.type === 'DEP' && f.act != null);
  const onTime = depDone.filter(f => f.act - f.sched <= 15 * MIN).length;
  const otp = depDone.length ? Math.round((onTime / depDone.length) * 100) : 100;
  const arrDone = flights.filter(f => f.type === 'ARR' && f.act != null);
  const paxToday = flights.filter(f => f.act != null).reduce((s, f) => s + f.pax, 0);
  const cancelled = flights.filter(f => f.status === 'CANCELLED').length;
  const delayed = flights.filter(f => f.act == null && f.status !== 'CANCELLED' && f.est - f.sched > 15 * MIN).length;
  const turnsActive = db.turnarounds.filter(t => t.status === 'IN_PROGRESS');
  const avgWait = Math.round(db.queues.reduce((s, q) => s + q.wait, 0) / db.queues.length);
  const revToday = db.charges.reduce((s, c) => s + c.total, 0);
  const upcoming = flights
    .filter(f => f.act == null && f.status !== 'CANCELLED' && f.est > now - 5 * MIN)
    .sort((a, b) => a.est - b.est).slice(0, 8).map(f => flightView(db, f));
  const movements = [];
  for (let h = -4; h <= 8; h++) {
    const from = now + h * HOUR, to = from + HOUR;
    movements.push({
      h, label: new Date(from).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: db.config.airport.tz }),
      dep: flights.filter(f => f.type === 'DEP' && f.status !== 'CANCELLED' && f.est >= from && f.est < to).length,
      arr: flights.filter(f => f.type === 'ARR' && f.status !== 'CANCELLED' && f.est >= from && f.est < to).length,
    });
  }
  return {
    now, otp, movementsToday: depDone.length + arrDone.length, paxToday, cancelled, delayed,
    turnsActive: turnsActive.length, turnsAtRisk: db.turnarounds.filter(t => t.risk === 'HIGH' && t.status !== 'COMPLETED').length,
    avgWait, openAlerts: db.alerts.filter(a => !a.ack).length,
    openWorkorders: db.workorders.filter(w => w.status !== 'COMPLETED').length,
    revToday: Math.round(revToday), bagsLastHour: db.baggage.sortedLastHour,
    weather: db.weather, runways: db.resources.runways, upcoming, movements,
    alerts: db.alerts.filter(a => !a.ack).slice(0, 6),
    events: db.events.slice(0, 12),
  };
}

function billingSummary(db) {
  const byAirline = {};
  for (const c of db.charges) {
    byAirline[c.airline] = byAirline[c.airline] || { airline: c.airline, movements: 0, total: 0, uninvoiced: 0 };
    byAirline[c.airline].movements++;
    byAirline[c.airline].total += c.total;
    if (c.status === 'UNINVOICED') byAirline[c.airline].uninvoiced += c.total;
  }
  const rows = Object.values(byAirline).map(r => {
    const a = db.airlines.find(x => x.code === r.airline);
    return { ...r, name: a ? a.name : r.airline, total: Math.round(r.total * 100) / 100, uninvoiced: Math.round(r.uninvoiced * 100) / 100 };
  }).sort((a, b) => b.total - a.total);
  return {
    totalToday: Math.round(db.charges.reduce((s, c) => s + c.total, 0)),
    chargesCount: db.charges.length,
    invoicedTotal: Math.round(db.invoices.reduce((s, i) => s + i.total, 0)),
    tariffs: db.config.tariffs,
    byAirline: rows,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handle(req, res, pathname, query) {
  const db = store.get();
  const seg = pathname.split('/').filter(Boolean); // ['api', ...]
  const m = req.method;

  try {
    if (pathname === '/api/stream') return sse(req, res);
    if (pathname === '/api/bootstrap') return json(res, 200, { config: db.config, airlines: db.airlines, seededAt: db.seededAt });
    if (pathname === '/api/overview') return json(res, 200, overview(db));

    // ---- Flights / AODB ----
    if (pathname === '/api/flights' && m === 'GET') {
      let list = db.flights.map(f => flightView(db, f));
      if (query.type) list = list.filter(f => f.type === query.type);
      if (query.q) {
        const q = query.q.toLowerCase();
        list = list.filter(f => [f.fltNo, f.city, f.cityIata, f.airlineName, f.gate, f.reg, f.acType].join(' ').toLowerCase().includes(q));
      }
      return json(res, 200, list);
    }
    if (seg[1] === 'flights' && seg[2] && seg[3] === 'action' && m === 'POST') {
      const f = db.flights.find(x => x.id === seg[2]);
      if (!f) return json(res, 404, { error: 'flight not found' });
      const body = await readBody(req);
      const turn = db.turnarounds.find(t => t.arrId === f.id || t.depId === f.id);
      switch (body.action) {
        case 'delay': {
          const mins = Math.max(1, Math.min(600, +body.minutes || 15));
          f.est += mins * MIN;
          if (f.act == null && f.est - f.sched > 10 * MIN) f.status = 'DELAYED';
          f.remarks = body.reason || 'Operational delay';
          if (turn) { turn.eobt = db.flights.find(x => x.id === turn.depId)?.est; turn.tobt = turn.eobt; }
          logEvent(db, emit, 'Flights', `${f.fltNo} delayed ${mins} min by AOCC — ${f.remarks}`, { sev: 'warn' });
          break;
        }
        case 'cancel':
          f.status = 'CANCELLED'; f.remarks = body.reason || 'Cancelled by ops';
          logEvent(db, emit, 'Flights', `${f.fltNo} cancelled — ${f.remarks}`, { sev: 'warn' });
          raiseAlert(db, emit, `cnl:${f.id}`, 'MED', 'Flights', `${f.fltNo} ${f.type === 'DEP' ? '→' : '←'} ${f.cityIata} cancelled (${f.remarks})`);
          break;
        case 'reinstate':
          if (f.act == null) { f.status = 'SCHEDULED'; f.remarks = ''; }
          logEvent(db, emit, 'Flights', `${f.fltNo} reinstated by AOCC`, { sev: 'info' });
          break;
        case 'gate': {
          const old = f.gate;
          f.gate = body.gate || f.gate;
          f.stand = `S-${f.gate}`;
          const alloc = db.allocations.find(a => a.flightIds.includes(f.id));
          if (alloc) alloc.resource = f.gate;
          if (turn) { turn.gate = f.gate; turn.stand = f.stand; }
          logEvent(db, emit, 'Resources', `${f.fltNo} gate change ${old} → ${f.gate}`, { sev: 'warn' });
          break;
        }
        default: return json(res, 400, { error: 'unknown action' });
      }
      emit('flight', { id: f.id, fltNo: f.fltNo, status: f.status });
      store.save();
      return json(res, 200, flightView(db, f));
    }

    // ---- FIDS ----
    if (pathname === '/api/fids') {
      const type = query.type === 'ARR' ? 'ARR' : 'DEP';
      const now = Date.now();
      const list = db.flights
        .filter(f => f.type === type && f.est > now - 50 * MIN && f.est < now + 8 * HOUR)
        .sort((a, b) => a.est - b.est).slice(0, 18).map(f => flightView(db, f));
      return json(res, 200, { type, airport: db.config.airport, now, flights: list });
    }

    // ---- Turnarounds / A-CDM ----
    if (pathname === '/api/turnarounds') {
      const out = db.turnarounds.map(t => {
        const dep = db.flights.find(f => f.id === t.depId);
        const arr = db.flights.find(f => f.id === t.arrId);
        return { ...t, depFltNo: dep?.fltNo, arrFltNo: arr?.fltNo, depCity: dep?.city, arrCity: arr?.city, depStatus: dep?.status, arrStatus: arr?.status };
      }).sort((a, b) => a.sobt - b.sobt);
      return json(res, 200, out);
    }

    // ---- Resources ----
    if (pathname === '/api/resources') return json(res, 200, db.resources);
    if (pathname === '/api/allocations') {
      return json(res, 200, { gates: db.resources.gates.map(g => g.id), allocations: db.allocations, now: Date.now() });
    }
    if (seg[1] === 'runways' && seg[2] && m === 'POST') {
      const rwy = db.resources.runways.find(r => r.id === decodeURIComponent(seg[2]));
      if (!rwy) return json(res, 404, { error: 'runway not found' });
      const body = await readBody(req);
      rwy.status = body.status || rwy.status;
      if (body.note != null) rwy.note = body.note;
      logEvent(db, emit, 'Airfield', `RWY ${rwy.id} set to ${rwy.status}${rwy.note ? ' — ' + rwy.note : ''}`, { sev: 'warn' });
      if (rwy.status === 'CLOSED') raiseAlert(db, emit, `rwy:${rwy.id}:${Date.now()}`, 'HIGH', 'Airfield', `Runway ${rwy.id} CLOSED${rwy.note ? ' — ' + rwy.note : ''}`);
      store.save();
      return json(res, 200, rwy);
    }

    // ---- Simple collections ----
    const simple = {
      '/api/queues': db.queues, '/api/baggage': db.baggage, '/api/gse': db.gse,
      '/api/assets': db.assets, '/api/workorders': db.workorders, '/api/incidents': db.incidents,
      '/api/inspections': db.inspections, '/api/notams': db.notams, '/api/staff': db.staff,
      '/api/concessions': db.concessions, '/api/weather': db.weather,
      '/api/alerts': db.alerts, '/api/events': db.events,
    };
    if (m === 'GET' && simple[pathname]) return json(res, 200, simple[pathname]);

    // ---- Mutations ----
    if (pathname === '/api/incidents' && m === 'POST') {
      const b = await readBody(req);
      const inc = {
        id: `SMS-${4100 + db.incidents.length}`, type: b.type || 'General report',
        severity: ['LOW', 'MEDIUM', 'HIGH'].includes(b.severity) ? b.severity : 'LOW',
        location: b.location || 'Unspecified', status: 'REPORTED',
        reportedBy: b.reportedBy || 'AOCC', ts: Date.now(), description: b.description || '',
      };
      db.incidents.unshift(inc);
      logEvent(db, emit, 'Safety', `New SMS report ${inc.id}: ${inc.type} @ ${inc.location}`, { sev: 'warn' });
      if (inc.severity === 'HIGH') raiseAlert(db, emit, `sms:${inc.id}`, 'HIGH', 'Safety', `HIGH severity incident ${inc.id}: ${inc.type} @ ${inc.location}`);
      store.save();
      return json(res, 200, inc);
    }
    if (seg[1] === 'incidents' && seg[2] && m === 'PATCH') {
      const inc = db.incidents.find(x => x.id === seg[2]);
      if (!inc) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.status) inc.status = b.status;
      store.save();
      return json(res, 200, inc);
    }
    if (pathname === '/api/workorders' && m === 'POST') {
      const b = await readBody(req);
      const wo = {
        id: `WO-${2300 + db.workorders.length}`, asset: b.asset || '—', assetName: b.assetName || b.asset || 'General',
        location: b.location || 'Unspecified', title: b.title || 'New work order',
        priority: ['P1', 'P2', 'P3'].includes(b.priority) ? b.priority : 'P3',
        status: 'OPEN', assignee: b.assignee || 'Unassigned', created: Date.now(), due: Date.now() + 48 * HOUR,
      };
      db.workorders.unshift(wo);
      logEvent(db, emit, 'Maintenance', `${wo.id} created: ${wo.title}`, { sev: 'info' });
      store.save();
      return json(res, 200, wo);
    }
    if (seg[1] === 'workorders' && seg[2] && m === 'PATCH') {
      const wo = db.workorders.find(x => x.id === seg[2]);
      if (!wo) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.status) {
        wo.status = b.status;
        if (b.status === 'COMPLETED') {
          const asset = db.assets.find(a => a.id === wo.asset);
          if (asset) { asset.status = 'OK'; asset.health = Math.min(100, asset.health + 25); asset.lastService = Date.now(); }
        }
      }
      if (b.assignee) wo.assignee = b.assignee;
      store.save();
      return json(res, 200, wo);
    }
    if (seg[1] === 'alerts' && seg[2] === 'ack-all' && m === 'POST') {
      for (const a of db.alerts) a.ack = true;
      store.save();
      return json(res, 200, { ok: true });
    }
    if (seg[1] === 'alerts' && seg[2] && seg[3] === 'ack' && m === 'POST') {
      const a = db.alerts.find(x => x.id === seg[2]);
      if (!a) return json(res, 404, { error: 'not found' });
      a.ack = true;
      store.save();
      return json(res, 200, a);
    }
    if (seg[1] === 'queues' && seg[2] && m === 'PATCH') {
      const q = db.queues.find(x => x.id === seg[2]);
      if (!q) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      if (b.open != null) {
        q.open = Math.max(1, Math.min(q.lanes, +b.open));
        q.wait = Math.max(2, Math.round(q.wait * (1 - 0.08 * (q.open - 1))) );
        logEvent(db, emit, 'Passenger Flow', `${q.name}: ${q.open}/${q.lanes} lanes open`, { sev: 'info' });
      }
      store.save();
      return json(res, 200, q);
    }

    // ---- Billing ----
    if (pathname === '/api/billing/summary') return json(res, 200, billingSummary(db));
    if (pathname === '/api/billing/charges') return json(res, 200, db.charges.slice(0, 80));
    if (pathname === '/api/billing/invoices') return json(res, 200, db.invoices);
    if (pathname === '/api/billing/invoice' && m === 'POST') {
      const b = await readBody(req);
      const charges = db.charges.filter(c => c.airline === b.airline && c.status === 'UNINVOICED');
      if (!charges.length) return json(res, 400, { error: 'no uninvoiced charges for this airline' });
      const total = Math.round(charges.reduce((s, c) => s + c.total, 0) * 100) / 100;
      const a = db.airlines.find(x => x.code === b.airline);
      const inv = {
        id: `INV-${new Date().getFullYear()}-${String(1000 + db.invoices.length)}`,
        airline: b.airline, airlineName: a ? a.name : b.airline,
        ts: Date.now(), charges: charges.map(c => c.ref), movements: charges.length,
        total, currency: db.config.currency, status: 'ISSUED', terms: 'Net 30',
      };
      for (const c of charges) c.status = 'INVOICED';
      db.invoices.unshift(inv);
      logEvent(db, emit, 'Billing', `Invoice ${inv.id} issued to ${inv.airlineName} — $${total.toLocaleString('en-CA')} (${charges.length} movements)`, { sev: 'info' });
      store.save();
      return json(res, 200, inv);
    }

    // ---- Landing Fees Portal (airline self-service) ----
    if (pathname === '/api/portal/tariff' && m === 'GET') {
      return json(res, 200, { airport: db.config.airport, currency: db.config.currency, tariffs: db.config.tariffs, aircraft: db.aircraft });
    }
    if (pathname === '/api/portal/estimate' && m === 'POST') {
      const b = await readBody(req);
      return json(res, 200, estimateMovement(db, b));
    }
    if (pathname === '/api/portal/me' && m === 'GET') {
      const session = portalAuth(req, res);
      if (!session) return;
      return json(res, 200, portalSummary(db, session.airline));
    }
    if (pathname === '/api/portal/charges' && m === 'GET') {
      const session = portalAuth(req, res);
      if (!session) return;
      const list = chargeForAirline(db, session.airline).slice(0, 100).map(chargeView);
      return json(res, 200, list);
    }
    if (pathname === '/api/portal/invoices' && m === 'GET') {
      const session = portalAuth(req, res);
      if (!session) return;
      return json(res, 200, invoicesForAirline(db, session.airline));
    }
    if (pathname === '/api/portal/flights' && m === 'GET') {
      const session = portalAuth(req, res);
      if (!session) return;
      const now = Date.now();
      const list = db.flights
        .filter(f => f.airline === session.airline && f.est > now - 12 * HOUR && f.est < now + 24 * HOUR)
        .sort((a, b) => a.est - b.est)
        .map(f => flightView(db, f));
      return json(res, 200, list);
    }

    // ---- Admin ----
    if (pathname === '/api/admin/reseed' && m === 'POST') {
      store.reseed();
      emit('reseed', { ok: true });
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: `no route: ${m} ${pathname}` });
  } catch (e) {
    console.error('[api]', e);
    return json(res, 500, { error: e.message });
  }
}

module.exports = { handle, emit };
