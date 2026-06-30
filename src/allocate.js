'use strict';

/*
 * Vectro Allocate — intelligent airport resource allocation.
 *
 * One engine across the three resource pools an airport operations team plans
 * every day: gates (contact), aircraft stands (contact + remote), and
 * passenger check-in islands. It surfaces allocation conflicts, runs an
 * auto-optimiser that resolves them (re-gating, or towing to a remote stand),
 * and balances check-in counters against forecast demand.
 *
 * State of record lives in db.allocations (gate/stand windows, mutated in place
 * by AOCC gate changes) and db.resources.checkin (counter banks). Everything
 * here is derived from flights + allocations so it always matches the AODB.
 */

const { MIN, HOUR, clamp } = require('./util');
const store = require('./store');
const { logEvent } = require('./simulator');

const BUFFER = 10 * MIN;          // min separation between two allocations on one resource
const CHECKIN_OPEN = 165 * MIN;   // counters open ~2h45 before STD
const CHECKIN_CLOSE = 45 * MIN;   // counters close 45 min before STD
const PAX_PER_COUNTER = 60;       // pax one counter clears over a check-in window

const isRemote = res => typeof res === 'string' && /^R\d+/.test(res);

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

function enrichAllocs(db) {
  const out = [];
  for (const a of db.allocations) {
    const flights = a.flightIds.map(id => db.flights.find(f => f.id === id)).filter(Boolean);
    if (!flights.length) continue;
    if (flights.every(f => f.status === 'CANCELLED')) continue; // dropped from the plan
    const f = flights[0];
    out.push({
      id: a.id, resource: a.resource, flightIds: a.flightIds.slice(),
      label: a.label, airline: a.airline, reg: a.reg,
      acType: f.acType, body: f.body, wide: f.body === 'W',
      start: a.start, end: a.end,
    });
  }
  return out;
}

// Detect overlapping allocations sharing a resource (running-max sweep).
function detectConflicts(allocs) {
  const byRes = {};
  for (const a of allocs) (byRes[a.resource] = byRes[a.resource] || []).push(a);
  const conflicts = [];
  for (const res of Object.keys(byRes)) {
    const list = byRes[res].slice().sort((x, y) => x.start - y.start);
    let hold = list[0];
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      if (hold && cur.start < hold.end) {
        conflicts.push({
          resource: res,
          aId: hold.id, bId: cur.id,
          aLabel: hold.label, bLabel: cur.label,
          aReg: hold.reg, bReg: cur.reg,
          start: cur.start, end: Math.min(hold.end, cur.end),
          overlapMin: Math.max(1, Math.round((Math.min(hold.end, cur.end) - cur.start) / MIN)),
        });
        if (cur.end > hold.end) hold = cur; // keep the latest-ending as the new anchor
      } else {
        hold = cur;
      }
    }
  }
  return conflicts;
}

function isFree(allocs, resource, start, end, exceptId) {
  return !allocs.some(a =>
    a.resource === resource && a.id !== exceptId &&
    start < a.end + BUFFER && end > a.start - BUFFER);
}

function findAlternative(db, allocs, alloc) {
  const need = alloc.wide;
  // Prefer a free contact gate (bridge gates first for passenger comfort).
  const gates = db.resources.gates
    .filter(g => (!need || g.wide))
    .sort((a, b) => (b.bridge === a.bridge ? 0 : b.bridge ? 1 : -1));
  for (const g of gates) {
    if (g.id === alloc.resource) continue;
    if (isFree(allocs, g.id, alloc.start, alloc.end, alloc.id)) return g.id;
  }
  // Fallback: tow to a remote stand.
  for (const s of db.resources.stands.filter(s => s.type === 'REMOTE' && (!need || s.wide))) {
    if (isFree(allocs, s.id, alloc.start, alloc.end, alloc.id)) return s.id;
  }
  return null;
}

function applyResource(db, alloc, newRes) {
  const remote = isRemote(newRes);
  const stand = remote ? newRes : `S-${newRes}`;
  for (const fid of alloc.flightIds) {
    const f = db.flights.find(x => x.id === fid);
    if (!f) continue;
    f.gate = newRes;
    f.stand = stand;
  }
  const turn = db.turnarounds.find(t => alloc.flightIds.includes(t.arrId) || alloc.flightIds.includes(t.depId));
  if (turn) { turn.gate = newRes; turn.stand = stand; }
  alloc.resource = newRes;
}

// ---------------------------------------------------------------------------
// Check-in demand model
// ---------------------------------------------------------------------------

function checkinPlan(db) {
  const now = Date.now();
  const t0 = now - 1 * HOUR, t1 = now + 10 * HOUR;
  const rows = db.resources.checkin.map(r => ({
    id: r.id, airline: r.airline || null, counters: r.counters, open: r.open, status: r.status,
    assignments: [], demand: [],
  }));
  const rowById = Object.fromEntries(rows.map(r => [r.id, r]));
  const homeFor = code => rows.find(r => r.airline === code);
  const sharedRows = rows.filter(r => !r.airline);
  let rr = 0;

  const deps = db.flights
    .filter(f => f.type === 'DEP' && f.status !== 'CANCELLED' && f.est > t0 - CHECKIN_OPEN && f.est < t1)
    .sort((a, b) => a.est - b.est);

  for (const f of deps) {
    const counters = clamp(Math.ceil(f.pax / PAX_PER_COUNTER), 1, 6);
    let row = homeFor(f.airline);
    if (!row) row = sharedRows.length ? sharedRows[rr++ % sharedRows.length] : rows[rr++ % rows.length];
    row.assignments.push({
      flight: f.fltNo, airline: f.airline, reg: f.reg, pax: f.pax, acType: f.acType,
      open: f.est - CHECKIN_OPEN, close: f.est - CHECKIN_CLOSE, std: f.est, counters,
    });
  }

  // Sample concurrent counter demand every 20 minutes.
  const samples = [];
  for (let t = t0; t <= t1; t += 20 * MIN) samples.push(t);
  for (const row of rows) {
    row.demand = samples.map(t =>
      row.assignments.filter(a => a.open <= t && t < a.close).reduce((s, a) => s + a.counters, 0));
    row.peak = row.demand.length ? Math.max(...row.demand) : 0;
    row.recommendedOpen = clamp(row.peak, row.assignments.length ? 1 : 0, row.counters);
    row.overloaded = row.peak > row.counters;
    row.assignments.sort((a, b) => a.std - b.std);
  }

  return {
    now, t0, t1, samples, rows,
    kpis: {
      rows: rows.length,
      countersTotal: rows.reduce((s, r) => s + r.counters, 0),
      countersOpen: rows.reduce((s, r) => s + r.open, 0),
      peakDemand: rows.reduce((s, r) => Math.max(s, r.peak), 0),
      overloaded: rows.filter(r => r.overloaded).length,
      assignedFlights: deps.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Public read models
// ---------------------------------------------------------------------------

function overview(db) {
  const now = Date.now();
  const allocs = enrichAllocs(db);
  const gates = db.resources.gates;
  const contact = allocs.filter(a => !isRemote(a.resource));
  const occupiedNow = new Set(contact.filter(a => a.start <= now && a.end >= now).map(a => a.resource));
  const conflicts = detectConflicts(allocs);
  const remoteStands = db.resources.stands.filter(s => s.type === 'REMOTE');
  const remoteOcc = new Set(allocs.filter(a => isRemote(a.resource) && a.start <= now && a.end >= now).map(a => a.resource));
  const cplan = checkinPlan(db);

  return {
    now,
    contactGates: gates.length,
    occupiedNow: occupiedNow.size,
    freeGates: gates.length - occupiedNow.size,
    utilisation: gates.length ? Math.round((occupiedNow.size / gates.length) * 100) : 0,
    bridges: gates.filter(g => g.bridge).length,
    walkout: gates.filter(g => !g.bridge).length,
    wideGates: gates.filter(g => g.wide).length,
    remoteStands: remoteStands.length,
    remoteFree: remoteStands.length - remoteOcc.size,
    movementsPlanned: allocs.length,
    conflicts: conflicts.length,
    conflictDetail: conflicts.slice(0, 25),
    checkin: cplan.kpis,
  };
}

function board(db, kind) {
  const now = Date.now();
  const t0 = now - 2 * HOUR, t1 = now + 8 * HOUR;
  let allocs = enrichAllocs(db);
  let lanes;

  if (kind === 'stand') {
    lanes = db.resources.stands.map(s => ({
      id: s.id, type: s.type, wide: s.wide, remote: s.type === 'REMOTE', status: s.status,
    }));
    allocs = allocs.map(a => ({ ...a, resource: isRemote(a.resource) ? a.resource : `S-${a.resource}` }));
  } else {
    lanes = db.resources.gates.map(g => ({
      id: g.id, bridge: g.bridge, wide: g.wide, remote: false, status: g.status,
    }));
    allocs = allocs.filter(a => !isRemote(a.resource));
  }

  const conflicts = detectConflicts(allocs);
  const conflictIds = new Set();
  for (const c of conflicts) { conflictIds.add(c.aId); conflictIds.add(c.bId); }

  const visible = allocs
    .filter(a => a.end > t0 && a.start < t1)
    .map(a => ({
      id: a.id, resource: a.resource, flightIds: a.flightIds, label: a.label, airline: a.airline, reg: a.reg,
      acType: a.acType, wide: a.wide, remote: isRemote(a.resource),
      start: a.start, end: a.end, conflict: conflictIds.has(a.id),
    }));

  return { kind, now, t0, t1, lanes, allocations: visible, conflicts };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function optimize(db, emit) {
  const moves = [];
  for (let pass = 0; pass < 6; pass++) {
    const allocs = enrichAllocs(db);
    const conflicts = detectConflicts(allocs);
    if (!conflicts.length) break;
    let movedAny = false;
    for (const c of conflicts) {
      const real = db.allocations.find(a => a.id === c.bId);
      const snap = allocs.find(a => a.id === c.bId);
      if (!real || !snap) continue;
      const target = findAlternative(db, allocs, snap);
      if (!target) continue;
      const from = real.resource;
      applyResource(db, real, target);
      snap.resource = target; // keep this pass's snapshot consistent
      moves.push({
        flight: real.label, reg: real.reg, from, to: target,
        remote: isRemote(target), start: real.start, end: real.end,
      });
      movedAny = true;
    }
    if (!movedAny) break;
  }
  if (moves.length) {
    const towed = moves.filter(m => m.remote).length;
    logEvent(db, emit, 'Allocate',
      `Auto-optimiser resolved ${moves.length} gate conflict${moves.length > 1 ? 's' : ''}` +
      (towed ? ` (${towed} towed to remote stands)` : ''), { sev: 'info' });
    emit('alloc', { kind: 'optimize', moves: moves.length });
    store.save();
  }
  return { moves, remaining: detectConflicts(enrichAllocs(db)).length };
}

function assign(db, emit, flightId, resource) {
  const f = db.flights.find(x => x.id === flightId);
  if (!f) return { error: 'flight not found', code: 404 };
  const validGate = db.resources.gates.some(g => g.id === resource);
  const validStand = db.resources.stands.some(s => s.id === resource);
  if (!validGate && !validStand) return { error: 'unknown gate or stand', code: 400 };

  const alloc = db.allocations.find(a => a.flightIds.includes(flightId));
  if (alloc) applyResource(db, alloc, resource);
  else { f.gate = resource; f.stand = isRemote(resource) ? resource : `S-${resource}`; }

  logEvent(db, emit, 'Allocate',
    `${f.fltNo} reassigned to ${isRemote(resource) ? 'remote stand' : 'gate'} ${resource}`, { sev: 'warn' });
  emit('alloc', { kind: 'assign', flight: f.fltNo, resource });
  store.save();
  return { ok: true, flight: { id: f.id, fltNo: f.fltNo, gate: f.gate, stand: f.stand } };
}

function setCheckin(db, emit, rowId, open) {
  const row = db.resources.checkin.find(r => r.id === rowId);
  if (!row) return { error: 'check-in island not found', code: 404 };
  row.open = clamp(Math.round(+open), 0, row.counters);
  row.status = row.open > 0 ? 'OPEN' : 'CLOSED';
  logEvent(db, emit, 'Allocate', `Check-in ${row.id}: ${row.open}/${row.counters} counters open`, { sev: 'info' });
  store.save();
  return row;
}

function optimizeCheckin(db, emit) {
  const plan = checkinPlan(db);
  const changes = [];
  for (const r of plan.rows) {
    const row = db.resources.checkin.find(x => x.id === r.id);
    if (!row) continue;
    const target = clamp(r.recommendedOpen, r.assignments.length ? 1 : 0, row.counters);
    if (row.open !== target) {
      changes.push({ row: row.id, from: row.open, to: target });
      row.open = target;
      row.status = target > 0 ? 'OPEN' : 'CLOSED';
    }
  }
  if (changes.length) {
    logEvent(db, emit, 'Allocate', `Check-in counters auto-balanced across ${changes.length} island${changes.length > 1 ? 's' : ''} to forecast demand`, { sev: 'info' });
    emit('alloc', { kind: 'checkin', changes: changes.length });
    store.save();
  }
  return { changes, plan: checkinPlan(db) };
}

module.exports = {
  overview, board, checkinPlan,
  optimize, assign, setCheckin, optimizeCheckin,
  isRemote, detectConflicts, enrichAllocs,
};
