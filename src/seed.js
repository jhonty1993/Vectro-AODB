'use strict';

const { id, rand, randInt, pick, chance, wpick, clamp, MIN, HOUR } = require('./util');

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const AIRLINES = [
  { code: 'AC', name: 'Air Canada',      color: '#e01933', share: 30 },
  { code: 'WS', name: 'WestJet',         color: '#00aada', share: 14 },
  { code: 'PD', name: 'Porter Airlines', color: '#7a9bb3', share: 8 },
  { code: 'TS', name: 'Air Transat',     color: '#00b0b9', share: 5 },
  { code: 'F8', name: 'Flair Airlines',  color: '#8bc53f', share: 4 },
  { code: 'AA', name: 'American',        color: '#9da6ab', share: 6 },
  { code: 'UA', name: 'United',          color: '#005daa', share: 6 },
  { code: 'DL', name: 'Delta',           color: '#c8102e', share: 5 },
  { code: 'B6', name: 'JetBlue',         color: '#0033a0', share: 2 },
  { code: 'BA', name: 'British Airways', color: '#075aaa', share: 3 },
  { code: 'LH', name: 'Lufthansa',       color: '#f9ba00', share: 3 },
  { code: 'AF', name: 'Air France',      color: '#002157', share: 2 },
  { code: 'KL', name: 'KLM',             color: '#00a1de', share: 2 },
  { code: 'LX', name: 'SWISS',           color: '#d52b1e', share: 2 },
  { code: 'EK', name: 'Emirates',        color: '#d71921', share: 2 },
  { code: 'QR', name: 'Qatar Airways',   color: '#5c0632', share: 2 },
  { code: 'TK', name: 'Turkish Airlines',color: '#c90119', share: 2 },
  { code: 'CX', name: 'Cathay Pacific',  color: '#00645a', share: 1 },
  { code: 'NH', name: 'ANA',             color: '#10448c', share: 1 },
];

// MTOW in tonnes drives the billing engine.
const AIRCRAFT = {
  DH8D: { name: 'Dash 8-400',        mtow: 30.5,  pax: 78,   body: 'N' },
  E75L: { name: 'Embraer E175',      mtow: 38.8,  pax: 76,   body: 'N' },
  BCS3: { name: 'Airbus A220-300',   mtow: 69.9,  pax: 137,  body: 'N' },
  A320: { name: 'Airbus A320',       mtow: 73.5,  pax: 146,  body: 'N' },
  A321: { name: 'Airbus A321',       mtow: 93.5,  pax: 190,  body: 'N' },
  B38M: { name: 'Boeing 737 MAX 8',  mtow: 82.6,  pax: 174,  body: 'N' },
  B738: { name: 'Boeing 737-800',    mtow: 79.0,  pax: 168,  body: 'N' },
  A333: { name: 'Airbus A330-300',   mtow: 242,   pax: 297,  body: 'W' },
  B788: { name: 'Boeing 787-8',      mtow: 228,   pax: 255,  body: 'W' },
  B789: { name: 'Boeing 787-9',      mtow: 254,   pax: 298,  body: 'W' },
  B77W: { name: 'Boeing 777-300ER',  mtow: 351.5, pax: 400,  body: 'W' },
  A359: { name: 'Airbus A350-900',   mtow: 280,   pax: 325,  body: 'W' },
  B77L: { name: 'Boeing 777-200LR',  mtow: 347.5, pax: 300,  body: 'W' },
};

const FLEETS = {
  AC: ['A320', 'A321', 'BCS3', 'B38M', 'B788', 'B789', 'B77W', 'A333', 'E75L', 'DH8D'],
  WS: ['B738', 'B38M', 'B789', 'DH8D'],
  PD: ['E75L', 'DH8D'],
  TS: ['A321', 'A333'],
  F8: ['B38M', 'B738'],
  AA: ['A321', 'B738', 'E75L'],
  UA: ['A320', 'B738', 'E75L'],
  DL: ['A321', 'A320', 'E75L'],
  B6: ['A320', 'A321'],
  BA: ['B77W', 'B789'],
  LH: ['A359', 'A333'],
  AF: ['B77W', 'A359'],
  KL: ['B789', 'A333'],
  LX: ['B77W', 'A333'],
  EK: ['B77W', 'A359'],
  QR: ['B77W', 'A359'],
  TK: ['B77W', 'A359'],
  CX: ['B77W', 'A359'],
  NH: ['B789', 'B77W'],
};

const CITIES = {
  domestic: [
    ['YVR', 'Vancouver'], ['YYC', 'Calgary'], ['YEG', 'Edmonton'], ['YUL', 'Montréal'],
    ['YOW', 'Ottawa'], ['YHZ', 'Halifax'], ['YWG', 'Winnipeg'], ['YQB', 'Québec City'],
    ['YXE', 'Saskatoon'], ['YQR', 'Regina'], ['YYJ', 'Victoria'], ['YTS', 'Timmins'],
    ['YQT', 'Thunder Bay'], ['YSB', 'Sudbury'], ['YKF', 'Waterloo'],
  ],
  transborder: [
    ['JFK', 'New York–JFK'], ['EWR', 'Newark'], ['LGA', 'New York–LGA'], ['BOS', 'Boston'],
    ['ORD', 'Chicago'], ['DFW', 'Dallas–Fort Worth'], ['LAX', 'Los Angeles'], ['SFO', 'San Francisco'],
    ['MIA', 'Miami'], ['MCO', 'Orlando'], ['DEN', 'Denver'], ['ATL', 'Atlanta'],
    ['SEA', 'Seattle'], ['LAS', 'Las Vegas'], ['IAD', 'Washington–Dulles'], ['PHL', 'Philadelphia'],
    ['TPA', 'Tampa'], ['FLL', 'Fort Lauderdale'],
  ],
  international: [
    ['LHR', 'London–Heathrow'], ['CDG', 'Paris–CDG'], ['FRA', 'Frankfurt'], ['AMS', 'Amsterdam'],
    ['ZRH', 'Zürich'], ['DXB', 'Dubai'], ['DOH', 'Doha'], ['IST', 'Istanbul'],
    ['HKG', 'Hong Kong'], ['HND', 'Tokyo–Haneda'], ['MEX', 'Mexico City'], ['CUN', 'Cancún'],
    ['PUJ', 'Punta Cana'], ['MBJ', 'Montego Bay'], ['KIN', 'Kingston'], ['BGI', 'Barbados'],
    ['DUB', 'Dublin'], ['FCO', 'Rome'], ['GRU', 'São Paulo'], ['DEL', 'Delhi'],
  ],
};

const SECTOR_FOR = {};
for (const sector of Object.keys(CITIES)) {
  for (const [iata] of CITIES[sector]) SECTOR_FOR[iata] = sector;
}

const FIRST = ['Aisha', 'Marco', 'Priya', 'Dan', 'Sofia', 'Liam', 'Noor', 'Carlos', 'Emma', 'Raj',
  'Olivia', 'Sam', 'Fatima', 'Jake', 'Mei', 'Tom', 'Ana', 'Kwame', 'Lena', 'Omar',
  'Grace', 'Felix', 'Ines', 'Yuki', 'Pavel', 'Tara', 'Diego', 'Hana', 'Erik', 'Zoe'];
const LAST = ['Khan', 'Rossi', 'Sharma', 'Tremblay', 'Martin', 'Nguyen', 'Haddad', 'Silva', 'Wilson',
  'Patel', 'Brown', 'Lee', 'Hassan', 'Olsen', 'Chen', 'Walker', 'Costa', 'Mensah', 'Weber', 'Farouk',
  'Bouchard', 'Wagner', 'Moreau', 'Tanaka', 'Novak', 'Singh', 'Garcia', 'Kim', 'Larsen', 'Adams'];

function personName() { return `${pick(FIRST)} ${pick(LAST)}`; }

// ---------------------------------------------------------------------------
// Tariffs (aeronautical billing) — Vector-style automated landing fee model
// ---------------------------------------------------------------------------

const TARIFFS = {
  currency: 'CAD',
  landingPerTonne: 14.25,        // per tonne MTOW
  landingMinimum: 175.0,
  terminalPerDepPax: 32.5,       // AIF-style terminal/improvement fee per departing pax
  parkingPer15Min: { N: 18.5, W: 41.0 }, // after free period, by body type
  parkingFreeMinutes: 90,
  bridgePerUse: 165.0,           // passenger boarding bridge
  apronHandlingPerTurn: { N: 240.0, W: 610.0 },
  deicePerApplication: { N: 1450.0, W: 3900.0 },
  nightSurchargePct: 0.25,       // 23:00–06:59 local
};

// ---------------------------------------------------------------------------
// Turnaround milestone template (CV = computer vision on the apron)
// Offsets in minutes: negative from off-blocks (departure), positive from on-blocks.
// ---------------------------------------------------------------------------

const MILESTONES = [
  { code: 'AIBT', name: 'On-blocks (AIBT)',          ref: 'on',  off: 0,   src: 'CV' },
  { code: 'GPU',  name: 'GPU / PCA connected',       ref: 'on',  off: 3,   src: 'CV' },
  { code: 'PAXO', name: 'Pax door open',             ref: 'on',  off: 4,   src: 'CV' },
  { code: 'DBS',  name: 'Deboarding started',        ref: 'on',  off: 5,   src: 'CV' },
  { code: 'CGO',  name: 'Cargo door open',           ref: 'on',  off: 6,   src: 'CV' },
  { code: 'ULS',  name: 'Unloading started',         ref: 'on',  off: 8,   src: 'CV' },
  { code: 'DBE',  name: 'Deboarding completed',      ref: 'on',  off: 17,  src: 'CV' },
  { code: 'FUS',  name: 'Fueling started',           ref: 'on',  off: 14,  src: 'CV' },
  { code: 'CLS',  name: 'Cabin cleaning started',    ref: 'on',  off: 19,  src: 'MANUAL' },
  { code: 'CTS',  name: 'Catering started',          ref: 'on',  off: 16,  src: 'CV' },
  { code: 'ULE',  name: 'Unloading completed',       ref: 'on',  off: 24,  src: 'CV' },
  { code: 'FUE',  name: 'Fueling completed',         ref: 'on',  off: 30,  src: 'CV' },
  { code: 'CTE',  name: 'Catering completed',        ref: 'on',  off: 32,  src: 'CV' },
  { code: 'CLE',  name: 'Cabin cleaning completed',  ref: 'on',  off: 34,  src: 'MANUAL' },
  { code: 'BRS',  name: 'Boarding started',          ref: 'off', off: -28, src: 'CV' },
  { code: 'LDS',  name: 'Loading started',           ref: 'off', off: -26, src: 'CV' },
  { code: 'LDE',  name: 'Loading completed',         ref: 'off', off: -12, src: 'CV' },
  { code: 'CGC',  name: 'Cargo door closed',         ref: 'off', off: -9,  src: 'CV' },
  { code: 'BRE',  name: 'Boarding completed',        ref: 'off', off: -8,  src: 'CV' },
  { code: 'PAXC', name: 'Pax door closed',           ref: 'off', off: -6,  src: 'CV' },
  { code: 'TUG',  name: 'Pushback tug connected',    ref: 'off', off: -4,  src: 'CV' },
  { code: 'AOBT', name: 'Off-blocks (AOBT)',         ref: 'off', off: 0,   src: 'CV' },
];

// ---------------------------------------------------------------------------
// Seed builder
// ---------------------------------------------------------------------------

function buildResources() {
  const gates = [];
  for (let i = 1; i <= 12; i++) gates.push({ id: `A${i}`, terminal: 'T1', pier: 'A', bridge: true, wide: i >= 9, status: 'AVAILABLE' });
  for (let i = 1; i <= 12; i++) gates.push({ id: `B${i}`, terminal: 'T1', pier: 'B', bridge: true, wide: i >= 10, status: 'AVAILABLE' });
  for (let i = 1; i <= 10; i++) gates.push({ id: `C${i}`, terminal: 'T3', pier: 'C', bridge: true, wide: i >= 8, status: 'AVAILABLE' });
  const stands = gates.map(g => ({ id: `S-${g.id}`, type: 'CONTACT', gate: g.id, wide: g.wide, status: 'AVAILABLE' }));
  for (let i = 1; i <= 8; i++) stands.push({ id: `R${i}`, type: 'REMOTE', gate: null, wide: i >= 6, status: 'AVAILABLE' });
  const belts = [];
  for (let i = 1; i <= 5; i++) belts.push({ id: `T1-B${i}`, terminal: 'T1', status: 'OK' });
  for (let i = 1; i <= 3; i++) belts.push({ id: `T3-B${i}`, terminal: 'T3', status: 'OK' });
  const checkin = [];
  for (const row of ['T1-Row 1', 'T1-Row 2', 'T1-Row 3', 'T1-Row 4', 'T3-Row 1', 'T3-Row 2']) {
    checkin.push({ id: row, counters: 12, open: randInt(4, 12), status: 'OPEN' });
  }
  const runways = [
    { id: '05/23',   length: 3389, status: 'OPEN', mode: 'DEP' },
    { id: '06L/24R', length: 2956, status: 'OPEN', mode: 'ARR' },
    { id: '06R/24L', length: 2743, status: 'OPEN', mode: 'MIXED' },
    { id: '15L/33R', length: 3368, status: 'OPEN', mode: 'STANDBY' },
    { id: '15R/33L', length: 2770, status: 'CLOSED', mode: 'MAINT', note: 'Scheduled pavement work until 14:00' },
  ];
  return { gates, stands, belts, checkin, runways };
}

function makeReg(airline) {
  const c = () => String.fromCharCode(65 + randInt(0, 25));
  if (['AA', 'UA', 'DL', 'B6'].includes(airline)) return `N${randInt(100, 999)}${c()}${c()}`;
  return `C-F${c()}${c()}${c()}`;
}

function pickGateFor(db, acBody, sector, busyWindows, start, end) {
  // International prefers pier C/B-high; keep it simple: wide-body needs wide gate.
  const candidates = db.resources.gates.filter(g => (acBody !== 'W' || g.wide));
  const free = candidates.filter(g => {
    const wins = busyWindows.get(g.id) || [];
    return !wins.some(w => start < w[1] + 10 * MIN && end > w[0] - 10 * MIN);
  });
  const g = free.length ? pick(free) : pick(candidates);
  const wins = busyWindows.get(g.id) || [];
  wins.push([start, end]);
  busyWindows.set(g.id, wins);
  return g;
}

function buildFlights(db, now) {
  const dayStart = now - 4 * HOUR;
  const gateBusy = new Map();
  let fltSerial = {};

  const flights = [];
  const turnarounds = [];
  const allocations = [];

  // ~46 turnaround pairs + ~14 singles over a 24h window
  const slots = [];
  for (let i = 0; i < 46; i++) slots.push(Math.round(dayStart + rand(0, 20 * HOUR)));
  slots.sort((a, b) => a - b);

  for (const arrSched of slots) {
    const airline = wpick(AIRLINES.map(a => [a, a.share]));
    const acType = pick(FLEETS[airline.code]);
    const ac = AIRCRAFT[acType];
    const sector = ac.body === 'W'
      ? wpick([['international', 8], ['transborder', 1]])
      : wpick([['domestic', 5], ['transborder', 3], ['international', 1]]);
    const [origIata, origCity] = pick(CITIES[sector]);
    let [destIata, destCity] = pick(CITIES[sector]);
    if (destIata === origIata) [destIata, destCity] = pick(CITIES[sector]);

    const reg = makeReg(airline.code);
    const turnMins = ac.body === 'W' ? randInt(95, 160) : randInt(50, 95);
    const depSched = arrSched + turnMins * MIN;

    const n = (fltSerial[airline.code] = (fltSerial[airline.code] || randInt(10, 80)) + randInt(2, 9));
    const arrDelay = chance(0.30) ? randInt(5, 75) : 0;
    const depDelay = arrDelay > 30 ? arrDelay - randInt(5, 20) : (chance(0.22) ? randInt(5, 55) : 0);

    const gate = pickGateFor(db, ac.body, sector, gateBusy, arrSched, depSched + 20 * MIN);
    const stand = `S-${gate.id}`;
    const belt = pick(db.resources.belts.filter(b => b.terminal === gate.terminal)).id;

    const paxArr = Math.round(ac.pax * rand(0.62, 0.98));
    const paxDep = Math.round(ac.pax * rand(0.62, 0.98));

    const arr = {
      id: id('flt'), fltNo: `${airline.code}${n}`, airline: airline.code, type: 'ARR',
      cityIata: origIata, city: origCity, sector,
      sched: arrSched, est: arrSched + arrDelay * MIN, act: null, onBlocks: null,
      status: 'SCHEDULED', gate: gate.id, stand, belt, runway: '06L/24R',
      acType, acName: ac.name, reg, mtow: ac.mtow, body: ac.body,
      pax: paxArr, bags: Math.round(paxArr * rand(0.7, 1.2)), remarks: '',
    };
    const dep = {
      id: id('flt'), fltNo: `${airline.code}${n + 1}`, airline: airline.code, type: 'DEP',
      cityIata: destIata, city: destCity, sector,
      sched: depSched, est: depSched + depDelay * MIN, act: null, offBlocks: null,
      status: 'SCHEDULED', gate: gate.id, stand, checkin: pick(db.resources.checkin).id, runway: '05/23',
      acType, acName: ac.name, reg, mtow: ac.mtow, body: ac.body,
      pax: paxDep, bags: Math.round(paxDep * rand(0.7, 1.2)), remarks: '',
    };
    arr.linkId = dep.id; dep.linkId = arr.id;
    flights.push(arr, dep);

    const turn = {
      id: id('trn'), arrId: arr.id, depId: dep.id, stand, gate: gate.id,
      reg, acType, airline: airline.code,
      sibt: arrSched, sobt: depSched, eibt: arr.est, eobt: dep.est,
      tobt: dep.est, tsat: dep.est + randInt(0, 8) * MIN,
      status: 'PLANNED', risk: 'LOW', progress: 0,
      milestones: MILESTONES.map(m => ({ ...m, planned: null, actual: null })),
    };
    turnarounds.push(turn);

    allocations.push({
      id: id('alc'), kind: 'gate', resource: gate.id, flightIds: [arr.id, dep.id],
      label: `${arr.fltNo} / ${dep.fltNo}`, airline: airline.code, reg,
      start: arr.est, end: dep.est + 15 * MIN,
    });
  }

  // Singles: originating departures & terminating arrivals (aircraft based here / overnighting)
  for (let i = 0; i < 14; i++) {
    const airline = wpick(AIRLINES.map(a => [a, a.share]));
    const acType = pick(FLEETS[airline.code]);
    const ac = AIRCRAFT[acType];
    const type = chance(0.5) ? 'DEP' : 'ARR';
    const sector = ac.body === 'W' ? 'international' : wpick([['domestic', 5], ['transborder', 3]]);
    const [iata, city] = pick(CITIES[sector]);
    const sched = Math.round(dayStart + rand(0, 20 * HOUR));
    const delay = chance(0.25) ? randInt(5, 60) : 0;
    const gate = pickGateFor(db, ac.body, sector, gateBusy, sched - 50 * MIN, sched + 50 * MIN);
    const n = (fltSerial[airline.code] = (fltSerial[airline.code] || randInt(10, 80)) + randInt(2, 9));
    const pax = Math.round(ac.pax * rand(0.6, 0.98));
    const f = {
      id: id('flt'), fltNo: `${airline.code}${n}`, airline: airline.code, type,
      cityIata: iata, city, sector,
      sched, est: sched + delay * MIN, act: null,
      status: 'SCHEDULED', gate: gate.id, stand: `S-${gate.id}`,
      runway: type === 'DEP' ? '05/23' : '06L/24R',
      acType, acName: ac.name, reg: makeReg(airline.code), mtow: ac.mtow, body: ac.body,
      pax, bags: Math.round(pax * rand(0.7, 1.2)), remarks: '', linkId: null,
    };
    if (type === 'ARR') { f.belt = pick(db.resources.belts.filter(b => b.terminal === gate.terminal)).id; f.onBlocks = null; }
    else { f.checkin = pick(db.resources.checkin).id; f.offBlocks = null; }
    flights.push(f);
    allocations.push({
      id: id('alc'), kind: 'gate', resource: gate.id, flightIds: [f.id],
      label: f.fltNo, airline: airline.code, reg: f.reg,
      start: f.est - (type === 'DEP' ? 45 * MIN : 0),
      end: f.est + (type === 'DEP' ? 10 * MIN : 35 * MIN),
    });
  }

  // A couple of cancellations for realism
  for (const f of flights) {
    if (chance(0.025) && f.sched > now + HOUR) {
      f.status = 'CANCELLED';
      f.remarks = pick(['Crew availability', 'Aircraft technical', 'Weather at origin']);
      if (f.linkId) {
        const other = flights.find(x => x.id === f.linkId);
        if (other) { other.status = 'CANCELLED'; other.remarks = f.remarks; }
      }
    }
  }

  flights.sort((a, b) => a.sched - b.sched);
  return { flights, turnarounds, allocations };
}

function buildSupportData(db, now) {
  // --- GSE fleet ---
  const gseTypes = [
    ['TUG', 'Pushback tug', 8], ['BLD', 'Belt loader', 10], ['GPU', 'Ground power unit', 9],
    ['DEICE', 'De-icing truck', 4], ['FUEL', 'Fuel bowser', 6], ['CAT', 'Catering truck', 5],
    ['BUS', 'Apron bus', 6], ['STR', 'Pax stairs', 5], ['LAV', 'Lavatory cart', 4], ['WTR', 'Water cart', 4],
  ];
  db.gse = [];
  let gn = 100;
  for (const [code, name, count] of gseTypes) {
    for (let i = 0; i < count; i++) {
      db.gse.push({
        id: `${code}-${gn++}`, type: code, name,
        status: wpick([['IN_SERVICE', 6], ['IDLE', 3], ['MAINTENANCE', 1]]),
        battery: randInt(35, 100), hours: randInt(1200, 18000),
        location: pick(['Apron I', 'Apron II', 'Apron V', 'Pier A', 'Pier B', 'Pier C', 'GSE Depot']),
        operator: chance(0.6) ? personName() : null,
      });
    }
  }

  // --- Assets & work orders ---
  const assetDefs = [
    ['PBB', 'Passenger boarding bridge', 34], ['ESC', 'Escalator', 18], ['ELV', 'Elevator', 14],
    ['HVAC', 'HVAC unit', 12], ['BHS', 'Baggage line drive', 16], ['DOOR', 'Automatic door', 20],
  ];
  db.assets = [];
  let an = 1;
  for (const [code, name, count] of assetDefs) {
    for (let i = 0; i < count; i++) {
      db.assets.push({
        id: `${code}-${String(an++).padStart(3, '0')}`, type: code, name,
        location: pick(['T1 Pier A', 'T1 Pier B', 'T3 Pier C', 'T1 Departures', 'T3 Arrivals', 'T1 Baggage hall']),
        health: randInt(62, 100),
        status: wpick([['OK', 12], ['DEGRADED', 2], ['DOWN', 1]]),
        lastService: now - randInt(2, 120) * 24 * HOUR,
      });
    }
  }
  db.workorders = [];
  const woTitles = [
    'Hydraulic leak on bridge drive column', 'Comb plate replacement', 'Carousel motor bearing noise',
    'HVAC compressor fault code 17', 'Door sensor misalignment', 'Annual inspection', 'Belt tracking adjustment',
    'Cab levelling fault', 'Preventive lubrication service', 'Emergency stop test',
  ];
  for (let i = 0; i < 18; i++) {
    const asset = pick(db.assets);
    const status = wpick([['OPEN', 4], ['IN_PROGRESS', 3], ['ON_HOLD', 1], ['COMPLETED', 5]]);
    db.workorders.push({
      id: `WO-${2300 + i}`, asset: asset.id, assetName: asset.name, location: asset.location,
      title: pick(woTitles), priority: wpick([['P1', 1], ['P2', 3], ['P3', 5]]),
      status, assignee: personName(),
      created: now - randInt(1, 96) * HOUR,
      due: now + randInt(-12, 96) * HOUR,
    });
  }

  // --- Safety / SMS ---
  const incidentTypes = ['Ground collision (no injury)', 'FOD found on taxiway', 'Vehicle speeding airside',
    'Fuel spill < 20L', 'Slip/trip in terminal', 'Wildlife strike', 'Jet blast incident',
    'Baggage cart runaway', 'Unauthorized airside access', 'Lithium battery smoke event'];
  db.incidents = [];
  for (let i = 0; i < 12; i++) {
    const sev = wpick([['LOW', 5], ['MEDIUM', 3], ['HIGH', 1]]);
    db.incidents.push({
      id: `SMS-${4100 + i}`, type: pick(incidentTypes), severity: sev,
      location: pick(['Apron I', 'Apron V', 'Taxiway H', 'Runway 05/23', 'T1 Check-in', 'Gate B7', 'Cargo apron']),
      status: wpick([['REPORTED', 2], ['INVESTIGATING', 3], ['MITIGATED', 2], ['CLOSED', 4]]),
      reportedBy: personName(), ts: now - randInt(1, 240) * HOUR,
      description: 'Auto-seeded report. See attachments and witness statements in case file.',
    });
  }
  db.inspections = [
    { id: 'INSP-881', type: 'Runway 05/23 surface', due: now + 2 * HOUR, status: 'SCHEDULED', inspector: personName() },
    { id: 'INSP-880', type: 'Runway 06L/24R surface', due: now - 1 * HOUR, status: 'COMPLETED', inspector: personName(), result: 'PASS' },
    { id: 'INSP-879', type: 'Perimeter fence — north', due: now - 5 * HOUR, status: 'COMPLETED', inspector: personName(), result: 'PASS' },
    { id: 'INSP-878', type: 'Apron lighting lux survey', due: now + 9 * HOUR, status: 'SCHEDULED', inspector: personName() },
    { id: 'INSP-877', type: 'Wildlife patrol — infield', due: now + 30 * MIN, status: 'SCHEDULED', inspector: personName() },
    { id: 'INSP-876', type: 'Friction test 15L/33R', due: now - 26 * HOUR, status: 'COMPLETED', inspector: personName(), result: 'PASS' },
  ];
  db.notams = [
    { id: 'A1042/26', text: 'RWY 15R/33L CLSD due WIP. Pavement rehabilitation.', from: now - 30 * HOUR, to: now + 9 * HOUR, status: 'ACTIVE' },
    { id: 'A1038/26', text: 'TWY J CL lights U/S between H and K. Caution advised.', from: now - 50 * HOUR, to: now + 70 * HOUR, status: 'ACTIVE' },
    { id: 'A1031/26', text: 'Crane operating 1.2NM NE of ARP, 280ft AGL, lighted.', from: now - 5 * 24 * HOUR, to: now + 9 * 24 * HOUR, status: 'ACTIVE' },
    { id: 'A1027/26', text: 'ILS RWY 05 GP maintenance daily 0200-0400Z.', from: now - 2 * 24 * HOUR, to: now + 3 * 24 * HOUR, status: 'ACTIVE' },
  ];

  // --- Workforce ---
  const roles = [['Ramp agent', 26], ['Gate agent', 18], ['Check-in agent', 16], ['Baggage handler', 18],
    ['AOCC duty officer', 6], ['Airside ops officer', 8], ['Maintenance tech', 10], ['Security screening', 22],
    ['De-ice crew', 6], ['Wildlife control', 3]];
  db.staff = [];
  let sn = 1;
  for (const [role, count] of roles) {
    for (let i = 0; i < count; i++) {
      const shift = pick(['06:00–14:00', '10:00–18:00', '14:00–22:00', '22:00–06:00']);
      db.staff.push({
        id: `EMP-${String(sn++).padStart(4, '0')}`, name: personName(), role, shift,
        status: wpick([['ON_DUTY', 6], ['BREAK', 1], ['OFF', 3]]),
        zone: pick(['T1', 'T3', 'Airside', 'AOCC', 'Baggage hall']),
        certExpiry: now + randInt(10, 700) * 24 * HOUR,
      });
    }
  }

  // --- Passenger flow checkpoints ---
  db.queues = [
    { id: 'T1-DOM',   name: 'T1 Security — Domestic',     lanes: 8, open: 5, wait: 9,  throughput: 410 },
    { id: 'T1-INTL',  name: 'T1 Security — International', lanes: 10, open: 7, wait: 14, throughput: 520 },
    { id: 'T1-TB',    name: 'T1 US Transborder (CBP)',     lanes: 12, open: 8, wait: 18, throughput: 470 },
    { id: 'T3-DOM',   name: 'T3 Security — Domestic',      lanes: 6, open: 4, wait: 7,  throughput: 300 },
    { id: 'T3-INTL',  name: 'T3 Security — International', lanes: 6, open: 4, wait: 11, throughput: 280 },
    { id: 'CBSA',     name: 'Customs hall (CBSA)',         lanes: 20, open: 12, wait: 12, throughput: 900 },
  ].map(q => ({ ...q, history: Array.from({ length: 48 }, () => Math.max(2, q.wait + randInt(-5, 6))) }));

  // --- Baggage ---
  db.baggage = {
    sortedLastHour: randInt(2600, 4200), readRate: 99.1, onTimeDelivery: 96.4,
    mishandled: Array.from({ length: 7 }, (_, i) => ({
      id: `BAG-${77100 + i}`, tag: `0014${randInt(100000, 999999)}`,
      flight: '', reason: pick(['Missed transfer connection', 'Tag damaged/unreadable', 'Loaded to wrong ULD', 'Left behind — weight restriction', 'Late check-in']),
      status: wpick([['TRACING', 3], ['LOCATED', 2], ['FORWARDED', 2], ['DELIVERED', 2]]),
      ts: now - randInt(1, 30) * HOUR,
    })),
  };

  // --- Concessions ---
  const units = [['Maple & Crane Coffee', 'F&B'], ['North Gate Bar', 'F&B'], ['Boreal Bistro', 'F&B'],
    ['Duty Free Americas', 'Retail'], ['Relay News', 'Retail'], ['iStore Express', 'Retail'],
    ['Aspire Lounge', 'Lounge'], ['Plaza Premium Lounge', 'Lounge'], ['ParkFast P1', 'Parking'], ['ValetPlus', 'Parking']];
  db.concessions = units.map(([name, cat], i) => ({
    id: `CON-${100 + i}`, name, category: cat,
    location: pick(['T1 Pier A', 'T1 Pier B', 'T3 Pier C', 'T1 Transborder', 'Landside T1']),
    todaySales: Math.round(rand(3000, 52000)),
    txns: randInt(80, 1400),
    perPax: 0, trend: rand(-8, 14).toFixed(1),
  }));

  // --- Weather ---
  db.weather = makeWeather(now);

  db.alerts = [];
  db.events = [];
  db.charges = [];
  db.invoices = [];
}

function makeWeather(now) {
  const conditions = wpick([
    [{ cond: 'CAVOK', vis: 9999, cloud: 'SKC' }, 5],
    [{ cond: 'Few clouds', vis: 9999, cloud: 'FEW035' }, 4],
    [{ cond: 'Scattered', vis: 9000, cloud: 'SCT025' }, 3],
    [{ cond: 'Overcast', vis: 7000, cloud: 'OVC012' }, 2],
    [{ cond: 'Light rain', vis: 5000, cloud: 'OVC008' }, 2],
    [{ cond: 'Light snow', vis: 2400, cloud: 'OVC006' }, 1],
  ]);
  const temp = randInt(-4, 26);
  const windDir = randInt(0, 35) * 10;
  const windSpd = randInt(3, 22);
  const d = new Date(now);
  const ddhhmm = `${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
  return {
    ts: now, temp, dew: temp - randInt(2, 9),
    windDir, windSpd, gust: windSpd > 15 ? windSpd + randInt(5, 12) : null,
    vis: conditions.vis, cloud: conditions.cloud, cond: conditions.cond,
    qnh: (1000 + randInt(-18, 25)),
    metar: `CYYZ ${ddhhmm} ${String(windDir).padStart(3, '0')}${String(windSpd).padStart(2, '0')}${windSpd > 15 ? 'G' + (windSpd + 8) : ''}KT ${conditions.vis === 9999 ? '9999' : conditions.vis} ${conditions.cloud} ${temp < 0 ? 'M' + Math.abs(temp) : temp}/${temp - 4 < 0 ? 'M' + Math.abs(temp - 4) : temp - 4} Q${1000 + randInt(-18, 25)} NOSIG`,
    deiceActive: temp <= 1,
    history: Array.from({ length: 24 }, (_, i) => ({ h: i, temp: temp + randInt(-4, 3), wind: Math.max(2, windSpd + randInt(-6, 7)) })),
  };
}

function seed() {
  const now = Date.now();
  const db = {
    seededAt: now,
    config: {
      airport: { iata: 'YYZ', icao: 'CYYZ', name: 'Toronto Pearson International', city: 'Toronto', tz: 'America/Toronto' },
      operator: 'TechHouseCa Inc.',
      platform: 'Vectro',
      currency: 'CAD',
      tariffs: TARIFFS,
      users: [
        { id: 'u1', name: 'Jhonty (you)', email: 'jhonty1993@gmail.com', role: 'Platform Owner' },
        { id: 'u2', name: 'AOCC Duty Manager', email: 'aocc@vectro.ca', role: 'Operations' },
        { id: 'u3', name: 'Airside Supervisor', email: 'airside@vectro.ca', role: 'Airside' },
        { id: 'u4', name: 'Finance Analyst', email: 'billing@vectro.ca', role: 'Finance' },
      ],
    },
    airlines: AIRLINES,
    aircraft: AIRCRAFT,
    resources: buildResources(),
  };

  const { flights, turnarounds, allocations } = buildFlights(db, now);
  db.flights = flights;
  db.turnarounds = turnarounds;
  db.allocations = allocations;

  buildSupportData(db, now);

  // Attach mishandled bags to real arrivals
  const arrs = flights.filter(f => f.type === 'ARR');
  for (const bag of db.baggage.mishandled) bag.flight = pick(arrs).fltNo;

  return db;
}

module.exports = { seed, MILESTONES, TARIFFS, AIRCRAFT, makeWeather };
