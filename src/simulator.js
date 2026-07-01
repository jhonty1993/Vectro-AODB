'use strict';

const { id, rand, randInt, pick, chance, clamp, MIN, HOUR } = require('./util');
const { makeWeather } = require('./seed');
const { localHour, calcLandingFee } = require('./billing');

// ---------------------------------------------------------------------------
// Alerting
// ---------------------------------------------------------------------------

function raiseAlert(db, emit, key, sev, module, msg) {
  if (db.alerts.some(a => a.key === key && !a.ack)) return;
  const alert = { id: id('alr'), key, sev, module, msg, ts: Date.now(), ack: false };
  db.alerts.unshift(alert);
  if (db.alerts.length > 120) db.alerts.length = 120;
  emit('alert', alert);
}

function logEvent(db, emit, module, msg, meta = {}) {
  const ev = { id: id('evt'), ts: Date.now(), module, msg, ...meta };
  db.events.unshift(ev);
  if (db.events.length > 250) db.events.length = 250;
  emit('event', ev);
}

// ---------------------------------------------------------------------------
// Billing engine (runs when a departure goes off-blocks)
// ---------------------------------------------------------------------------

function billStandaloneArrival(db, emit, arr) {
  if (arr.landingBilled || arr.linkId) return;
  const t = db.config.tariffs;
  const landing = calcLandingFee(t, arr.mtow);
  const charge = {
    id: id('chg'), ref: `CHG-${String(7000 + db.charges.length)}`,
    airline: arr.airline, flight: arr.fltNo, arrFlight: arr.fltNo,
    reg: arr.reg, acType: arr.acType, ts: arr.onBlocks || Date.now(),
    lines: [{ desc: `Landing fee — ${arr.fltNo} (${arr.acType}, ${arr.mtow}t MTOW)`, amount: landing }],
    total: landing, status: 'UNINVOICED',
  };
  arr.landingBilled = true;
  db.charges.unshift(charge);
  logEvent(db, emit, 'Billing', `Landing fee captured for ${arr.fltNo} — $${landing.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD`, { sev: 'info' });
}

function billTurn(db, emit, dep) {
  const t = db.config.tariffs;
  const arr = dep.linkId ? db.flights.find(f => f.id === dep.linkId) : null;
  const lines = [];
  const landing = calcLandingFee(t, dep.mtow);
  if (arr && !arr.landingBilled) {
    lines.push({ desc: `Landing fee — ${arr.fltNo} (${dep.acType}, ${dep.mtow}t MTOW)`, amount: landing });
    arr.landingBilled = true;
  }
  lines.push({ desc: `Terminal & improvement fee — ${dep.pax} dep pax`, amount: dep.pax * t.terminalPerDepPax });
  const occMin = arr && arr.onBlocks ? Math.round(((dep.offBlocks || dep.est) - arr.onBlocks) / MIN) : 60;
  const billable = Math.max(0, occMin - t.parkingFreeMinutes);
  if (billable > 0) {
    lines.push({ desc: `Aircraft parking — ${occMin} min on ${dep.stand} (${billable} min billable)`, amount: Math.ceil(billable / 15) * t.parkingPer15Min[dep.body] });
  }
  if (!String(dep.stand || '').startsWith('R')) lines.push({ desc: 'Passenger boarding bridge', amount: t.bridgePerUse });
  lines.push({ desc: 'Apron handling & marshalling', amount: t.apronHandlingPerTurn[dep.body] });
  if (db.weather.deiceActive && chance(0.8)) lines.push({ desc: 'De-icing — Type I/IV application', amount: t.deicePerApplication[dep.body] });
  const hour = localHour(dep.offBlocks || dep.est, db.config.airport.tz);
  let subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (hour >= 23 || hour < 7) {
    lines.push({ desc: `Night movement surcharge (${Math.round(t.nightSurchargePct * 100)}%)`, amount: subtotal * t.nightSurchargePct });
    subtotal += subtotal * t.nightSurchargePct;
  }
  const charge = {
    id: id('chg'), ref: `CHG-${String(7000 + db.charges.length)}`,
    airline: dep.airline, flight: dep.fltNo, arrFlight: arr ? arr.fltNo : null,
    reg: dep.reg, acType: dep.acType, ts: dep.offBlocks || Date.now(),
    lines: lines.map(l => ({ ...l, amount: Math.round(l.amount * 100) / 100 })),
    total: Math.round(subtotal * 100) / 100, status: 'UNINVOICED',
  };
  db.charges.unshift(charge);
  logEvent(db, emit, 'Billing', `Movement charges captured for ${dep.fltNo} — $${charge.total.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD`, { sev: 'info' });
}

// ---------------------------------------------------------------------------
// Flight lifecycle
// ---------------------------------------------------------------------------

function setStatus(db, emit, f, status, msg) {
  if (f.status === status) return false;
  f.status = status;
  emit('flight', { id: f.id, fltNo: f.fltNo, status });
  if (msg) logEvent(db, emit, 'Flights', msg, { sev: 'info' });
  return true;
}

function tickFlights(db, emit, now) {
  for (const f of db.flights) {
    if (f.status === 'CANCELLED') continue;

    // Occasionally inject fresh delays on near-future flights
    if (f.act == null && f.est > now + 20 * MIN && f.est < now + 4 * HOUR && chance(0.0015)) {
      const add = randInt(10, 45);
      f.est += add * MIN;
      f.remarks = pick(['Inbound aircraft late', 'ATC flow restriction', 'Crew connection', 'Weather en route', 'Technical check']);
      setStatus(db, emit, f, 'DELAYED');
      logEvent(db, emit, 'Flights', `${f.fltNo} ${f.type === 'DEP' ? 'to' : 'from'} ${f.city} delayed ${add} min — ${f.remarks}`, { sev: 'warn' });
      const delay = Math.round((f.est - f.sched) / MIN);
      if (delay >= 30) raiseAlert(db, emit, `dly:${f.id}`, delay >= 60 ? 'HIGH' : 'MED', 'Flights', `${f.fltNo} ${f.type === 'DEP' ? '→' : '←'} ${f.cityIata} delayed ${delay} min (${f.remarks})`);
      if (f.linkId) {
        const turn = db.turnarounds.find(x => x.arrId === f.id || x.depId === f.id);
        if (turn) { turn.eibt = db.flights.find(x => x.id === turn.arrId)?.est; turn.eobt = db.flights.find(x => x.id === turn.depId)?.est; turn.tobt = turn.eobt; }
      }
    }

    if (f.type === 'DEP') {
      if (f.act == null) {
        if (now >= f.est) {
          f.act = f.est + randInt(0, 4) * MIN;
          f.offBlocks = f.act;
          setStatus(db, emit, f, 'DEPARTED', `${f.fltNo} to ${f.city} departed RWY ${f.runway} (${f.reg})`);
          billTurn(db, emit, f);
        } else if (now >= f.est - 12 * MIN) setStatus(db, emit, f, 'GATE_CLOSED');
        else if (now >= f.est - 18 * MIN) setStatus(db, emit, f, 'FINAL_CALL');
        else if (now >= f.est - 38 * MIN) setStatus(db, emit, f, 'BOARDING', `${f.fltNo} boarding at gate ${f.gate}`);
        else if (f.est > f.sched + 10 * MIN) setStatus(db, emit, f, 'DELAYED');
      }
    } else { // ARR
      if (f.act == null) {
        if (now >= f.est) {
          f.act = f.est;
          setStatus(db, emit, f, 'LANDED', `${f.fltNo} from ${f.city} landed RWY ${f.runway} (${f.reg})`);
        } else if (now >= f.est - 25 * MIN) setStatus(db, emit, f, 'APPROACH');
        else if (now >= f.est - 3 * HOUR) setStatus(db, emit, f, 'EN_ROUTE');
        else if (f.est > f.sched + 10 * MIN) setStatus(db, emit, f, 'DELAYED');
      } else if (!f.onBlocks && now >= f.act + 7 * MIN) {
        f.onBlocks = f.act + 7 * MIN;
        setStatus(db, emit, f, 'ON_STAND', `${f.fltNo} on stand ${f.stand}, bags to belt ${f.belt}`);
        if (!f.linkId) billStandaloneArrival(db, emit, f);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Turnaround milestones (Assaia-style apron CV)
// ---------------------------------------------------------------------------

const CV_PHRASES = {
  GPU: 'GPU positioned and cable connected', PAXO: 'L1 door open detected', DBS: 'passenger deboarding flow detected',
  CGO: 'fwd cargo door open detected', ULS: 'belt loader engaged, ULD movement detected', DBE: 'cabin clear — deboarding complete',
  FUS: 'fuel bowser connected, vent open', CTS: 'catering truck docked at R2 door', ULE: 'hold empty — unloading complete',
  FUE: 'fueling complete, bowser departing', CTE: 'catering truck departing stand', BRS: 'boarding flow detected at bridge',
  LDS: 'outbound ULD loading detected', LDE: 'loading complete, belt loader retracting', CGC: 'cargo doors closed and latched',
  BRE: 'boarding complete — bridge clear', PAXC: 'L1 door closed detected', TUG: 'pushback tug coupled to nose gear',
  AIBT: 'aircraft stopped on stand centerline', AOBT: 'pushback movement detected',
};

function tickTurnarounds(db, emit, now) {
  for (const turn of db.turnarounds) {
    const arr = db.flights.find(f => f.id === turn.arrId);
    const dep = db.flights.find(f => f.id === turn.depId);
    if (!arr || !dep || arr.status === 'CANCELLED' || dep.status === 'CANCELLED') { turn.status = 'CANCELLED'; continue; }

    const onBase = arr.onBlocks || arr.est + 7 * MIN;
    const offBase = dep.est;
    turn.eibt = arr.est; turn.eobt = dep.est; turn.tobt = dep.est;

    let done = 0;
    for (const m of turn.milestones) {
      m.planned = m.ref === 'on' ? onBase + m.off * MIN : offBase + m.off * MIN;
      if (m.jitter == null) m.jitter = chance(0.12) ? randInt(6, 18) : randInt(-2, 5);
      if (m.actual == null) {
        const due = m.planned + m.jitter * MIN;
        const gated = m.ref === 'on' ? arr.onBlocks != null || now >= onBase : true;
        if (gated && now >= due) {
          m.actual = due;
          if (turn.status === 'PLANNED') turn.status = 'IN_PROGRESS';
          if (now - due < 2 * MIN) { // only narrate fresh detections, not backfill
            logEvent(db, emit, 'Turnaround', `CV @ ${turn.stand}: ${CV_PHRASES[m.code] || m.name} — ${dep.fltNo} (${turn.reg})`, { sev: 'cv', stand: turn.stand });
          }
        } else if (gated && now < due && now > m.planned + 10 * MIN && m.jitter > 8) {
          // service is running late and CV has still not detected completion
          raiseAlert(db, emit, `ms:${turn.id}:${m.code}`, 'MED', 'Turnaround', `${dep.fltNo} @ ${turn.stand}: ${m.name} running ${Math.round((now - m.planned) / MIN)} min late`);
        }
      }
      if (m.actual != null) done++;
    }
    turn.progress = Math.round((done / turn.milestones.length) * 100);
    if (turn.milestones.find(m => m.code === 'AOBT').actual) turn.status = 'COMPLETED';

    // Risk scoring: time-to-EOBT vs remaining work
    if (turn.status === 'IN_PROGRESS') {
      const minsToOff = (offBase - now) / MIN;
      const remaining = 100 - turn.progress;
      turn.risk = (minsToOff < 20 && remaining > 35) ? 'HIGH' : (minsToOff < 35 && remaining > 50) ? 'MED' : 'LOW';
      if (turn.risk === 'HIGH') raiseAlert(db, emit, `risk:${turn.id}`, 'HIGH', 'Turnaround', `${dep.fltNo} @ ${turn.stand} at risk of missing EOBT — ${remaining}% of services outstanding, ${Math.max(0, Math.round(minsToOff))} min to off-blocks`);
    } else if (turn.status === 'COMPLETED') turn.risk = 'LOW';
  }
}

// ---------------------------------------------------------------------------
// Terminal, airside, support systems
// ---------------------------------------------------------------------------

function tickSupport(db, emit, now) {
  // Passenger queues random-walk
  for (const q of db.queues) {
    q.wait = clamp(q.wait + randInt(-2, 2), 2, 55);
    q.throughput = clamp(q.throughput + randInt(-25, 25), 80, 1400);
    q.history.push(q.wait);
    if (q.history.length > 48) q.history.shift();
    if (q.wait >= 25) raiseAlert(db, emit, `q:${q.id}`, q.wait >= 35 ? 'HIGH' : 'MED', 'Passenger Flow', `${q.name} wait time ${q.wait} min — consider opening lanes (${q.open}/${q.lanes} open)`);
  }

  // Baggage stats drift
  db.baggage.sortedLastHour = clamp(db.baggage.sortedLastHour + randInt(-120, 120), 1500, 5200);
  db.baggage.readRate = clamp(+(db.baggage.readRate + rand(-0.15, 0.15)).toFixed(1), 97.0, 99.9);
  db.baggage.onTimeDelivery = clamp(+(db.baggage.onTimeDelivery + rand(-0.2, 0.2)).toFixed(1), 90, 99.5);

  // GSE battery drain / status churn
  for (const g of db.gse) {
    if (g.status === 'IN_SERVICE') g.battery = clamp(g.battery - (chance(0.3) ? 1 : 0), 5, 100);
    else if (g.status === 'IDLE' && chance(0.2)) g.battery = clamp(g.battery + 1, 5, 100);
    if (g.battery <= 15 && g.status === 'IN_SERVICE') raiseAlert(db, emit, `gse:${g.id}`, 'LOW', 'GSE', `${g.name} ${g.id} battery at ${g.battery}% — return to charge point`);
    if (chance(0.002)) g.status = pick(['IN_SERVICE', 'IDLE']);
  }

  // Asset health drift; occasional failure
  for (const a of db.assets) {
    if (chance(0.001) && a.status === 'OK') {
      a.status = 'DOWN'; a.health = clamp(a.health - 30, 5, 100);
      const wo = {
        id: `WO-${2300 + db.workorders.length}`, asset: a.id, assetName: a.name, location: a.location,
        title: `Unplanned outage — ${a.name} ${a.id}`, priority: 'P1', status: 'OPEN',
        assignee: 'Unassigned', created: now, due: now + 4 * HOUR,
      };
      db.workorders.unshift(wo);
      raiseAlert(db, emit, `ast:${a.id}`, 'HIGH', 'Maintenance', `${a.name} ${a.id} reported DOWN at ${a.location} — ${wo.id} auto-created`);
      logEvent(db, emit, 'Maintenance', `${wo.id} created for ${a.id} (${a.location})`, { sev: 'warn' });
    }
  }

  // Weather refresh every ~30 min
  if (now - db.weather.ts > 30 * MIN) {
    const prevTemp = db.weather.temp;
    db.weather = makeWeather(now, db.config.airport.icao);
    db.weather.temp = clamp(prevTemp + randInt(-2, 2), -15, 32);
    logEvent(db, emit, 'Weather', `METAR updated: ${db.weather.metar}`, { sev: 'info' });
    if (db.weather.windSpd >= 20) raiseAlert(db, emit, `wx:wind:${Math.floor(now / HOUR)}`, 'MED', 'Weather', `Strong winds ${db.weather.windSpd}${db.weather.gust ? 'G' + db.weather.gust : ''} kt — single-runway ops possible`);
  }

  // Occasional airside happenings
  if (chance(0.004)) {
    const what = pick([
      ['Airfield', 'Wildlife patrol dispersed gulls near RWY 06L threshold', 'info'],
      ['Airfield', 'FOD walk completed on Apron V — nil findings', 'info'],
      ['Airfield', 'Friction tester deployed to RWY 05/23', 'info'],
      ['Passenger Flow', 'CATSA opened 2 additional lanes at T1 International', 'info'],
      ['Baggage', 'BHS line 4 diverter cleared after brief jam', 'warn'],
      ['GSE', 'De-ice fluid stock at 82% — resupply scheduled', 'info'],
    ]);
    logEvent(db, emit, what[0], what[1], { sev: what[2] });
  }
}

// ---------------------------------------------------------------------------

function tick(db, emit) {
  const now = Date.now();
  tickFlights(db, emit, now);
  tickTurnarounds(db, emit, now);
  tickSupport(db, emit, now);
  db.lastTick = now;
}

module.exports = { tick, raiseAlert, logEvent };
