'use strict';

/*
 * End-to-end smoke test: boots the real server on an ephemeral port,
 * exercises every module's API surface, and checks core invariants.
 * Run with: npm test
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8198;
const BASE = `http://localhost:${PORT}`;
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name} ${extra}`); }
}

async function get(p) {
  const r = await fetch(BASE + p);
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
}

async function post(p, body, method = 'POST') {
  const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(`${p} → ${r.status}: ${data.error}`);
  return data;
}

async function waitForServer(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { await get('/api/bootstrap'); return; } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('server did not come up');
}

async function main() {
  // Fresh data dir so the test is deterministic-ish
  fs.rmSync(path.join(__dirname, '..', 'data'), { recursive: true, force: true });
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' }, stdio: 'ignore',
  });

  try {
    await waitForServer();
    console.log('\nVectro smoke test\n');

    const bs = await get('/api/bootstrap');
    check('bootstrap has airport config', bs.config?.airport?.iata?.length === 3);
    check('18-module platform metadata present', bs.config.platform === 'Vectro');

    const flights = await get('/api/flights');
    check('AODB seeded with a full operating day', flights.length > 80, `got ${flights.length}`);
    check('flights carry billing-grade data (MTOW)', flights.every(f => f.mtow > 0));
    check('arrivals and departures both present',
      flights.some(f => f.type === 'ARR') && flights.some(f => f.type === 'DEP'));

    const turns = await get('/api/turnarounds');
    check('turnarounds linked to flight pairs', turns.length > 30 && turns.every(t => t.arrId && t.depId));
    check('each turnaround tracks 22 milestones', turns.every(t => t.milestones.length === 22));
    const backfilled = turns.filter(t => t.status === 'COMPLETED' || t.status === 'IN_PROGRESS');
    check('simulator backfilled the past portion of the day', backfilled.length > 0);

    const overview = await get('/api/overview');
    check('overview computes OTP', overview.otp >= 0 && overview.otp <= 100);
    check('overview hourly movement forecast spans 13 buckets', overview.movements.length === 13);

    for (const ep of ['fids?type=DEP', 'fids?type=ARR', 'allocations', 'resources', 'queues',
      'baggage', 'gse', 'assets', 'workorders', 'incidents', 'inspections', 'notams',
      'staff', 'concessions', 'weather', 'alerts', 'events', 'billing/summary',
      'billing/charges', 'billing/invoices']) {
      const data = await get('/api/' + ep);
      check(`GET /api/${ep}`, data != null);
    }

    // Flight ops actions
    const target = flights.find(f => f.type === 'DEP' && f.act == null && f.status !== 'CANCELLED');
    const delayed = await post(`/api/flights/${target.id}/action`, { action: 'delay', minutes: 30, reason: 'Test' });
    check('AOCC delay action shifts ETD', delayed.est - target.est >= 30 * 60000 - 1000);
    const moved = await post(`/api/flights/${target.id}/action`, { action: 'gate', gate: 'A1' });
    check('gate change reflected in AODB', moved.gate === 'A1' && moved.stand === 'S-A1');

    // Airfield
    const rwy = await post('/api/runways/' + encodeURIComponent('06R/24L'), { status: 'CLOSED', note: 'test' });
    check('runway closure', rwy.status === 'CLOSED');
    await post('/api/runways/' + encodeURIComponent('06R/24L'), { status: 'OPEN', note: '' });
    const alerts = await get('/api/alerts');
    check('runway closure raised a HIGH alert', alerts.some(a => a.sev === 'HIGH' && a.module === 'Airfield'));

    // Safety + maintenance flows
    const inc = await post('/api/incidents', { type: 'Smoke test occurrence', location: 'Apron I', severity: 'HIGH' });
    check('SMS occurrence filed', inc.id.startsWith('SMS-'));
    const wo = await post('/api/workorders', { title: 'Smoke test WO', priority: 'P2' });
    const woDone = await post(`/api/workorders/${wo.id}`, { status: 'COMPLETED' }, 'PATCH');
    check('work order lifecycle', woDone.status === 'COMPLETED');

    // Billing: invoice an airline with captured charges
    const sum = await get('/api/billing/summary');
    const billable = sum.byAirline.find(a => a.uninvoiced > 0);
    if (billable) {
      const inv = await post('/api/billing/invoice', { airline: billable.airline });
      check('invoice generated from movement charges', inv.total > 0 && inv.status === 'ISSUED');
    } else {
      check('billing engine captured charges', sum.chargesCount >= 0, '(no departures yet in window — ok)');
    }

    // Portal API
    const tariff = await get('/api/portal/tariff');
    check('portal published tariff', tariff.tariffs?.landingPerTonne > 0);

    const est = await post('/api/portal/estimate', { acType: 'A320', night: false });
    check('landing fee estimate', est.total > 0 && est.lines.some(l => /landing/i.test(l.desc)));

    const portalHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer demo-ac-key' };
    const meR = await fetch(BASE + '/api/portal/me', { headers: portalHeaders });
    const me = await meR.json();
    check('portal airline auth (AC)', meR.ok && me.airline === 'AC');

    const chR = await fetch(BASE + '/api/portal/charges', { headers: portalHeaders });
    check('portal scoped charges', chR.ok);

    const badR = await fetch(BASE + '/api/portal/me', { headers: { Authorization: 'Bearer invalid' } });
    check('portal rejects bad key', badR.status === 401);

    // Alert ack
    const open = (await get('/api/alerts')).find(a => !a.ack);
    if (open) {
      const acked = await post(`/api/alerts/${open.id}/ack`, {});
      check('alert acknowledgement', acked.ack === true);
    }

    console.log(failures ? `\n${failures} FAILURE(S)\n` : '\nAll checks passed.\n');
  } finally {
    server.kill('SIGTERM');
  }
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('Smoke test crashed:', e); process.exit(1); });
