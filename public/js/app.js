// Vectro shell: router, navigation, topbar, live stream wiring
import { get, stream, on } from './api.js';
import { el, setTZ, fmtT, toast, TZ } from './ui.js';

import dashboard from './views/dashboard.js';
import { flightsView, fidsView, fidsDisplay } from './views/flights.js';
import { allocateManager, gateManagement, standManagement, checkinManagement } from './views/allocate.js';
import { turnaroundView, acdmView } from './views/turnaround.js';
import { airfieldView, weatherView, gseView } from './views/airside.js';
import { paxView, baggageView, workforceView } from './views/terminal.js';
import { billingView, concessionsView } from './views/business.js';
import { maintenanceView, safetyView } from './views/care.js';
import { alertsView, settingsView } from './views/system.js';

const MODULES = [
  { group: 'Operate' },
  { route: 'dashboard',   n: '01', ico: '◉', name: 'Operations Dashboard', view: dashboard },
  { route: 'flights',     n: '02', ico: '✈', name: 'Flight Ops (AODB)',    view: flightsView },
  { route: 'fids',        n: '03', ico: '▤', name: 'FIDS & Displays',      view: fidsView },
  { group: 'Vectro Allocate' },
  { route: 'allocate',    n: '04', ico: '⌗', name: 'Allocation Manager',   view: allocateManager },
  { route: 'gates',       n: '05', ico: '⊓', name: 'Gate Management',      view: gateManagement },
  { route: 'stands',      n: '06', ico: '⊞', name: 'Stand Management',     view: standManagement },
  { route: 'checkin',     n: '07', ico: '☰', name: 'Check-in Management',  view: checkinManagement },
  { group: 'Apron & CDM' },
  { route: 'turnaround',  n: '08', ico: '⟳', name: 'Turnaround AI',        view: turnaroundView },
  { route: 'acdm',        n: '09', ico: '◷', name: 'A-CDM',                view: acdmView },
  { group: 'Terminal' },
  { route: 'pax',         n: '10', ico: '⇶', name: 'Passenger Flow',       view: paxView },
  { route: 'baggage',     n: '11', ico: '◫', name: 'Baggage Operations',   view: baggageView },
  { route: 'workforce',   n: '12', ico: '♟', name: 'Workforce',            view: workforceView },
  { group: 'Airside' },
  { route: 'airfield',    n: '13', ico: '⊕', name: 'Airfield Operations',  view: airfieldView },
  { route: 'weather',     n: '14', ico: '☂', name: 'Weather',              view: weatherView },
  { route: 'gse',         n: '15', ico: '⛟', name: 'GSE Fleet',            view: gseView },
  { group: 'Assets & Safety' },
  { route: 'maintenance', n: '16', ico: '⚒', name: 'Maintenance & Assets', view: maintenanceView },
  { route: 'safety',      n: '17', ico: '✚', name: 'Safety (SMS)',         view: safetyView },
  { group: 'Business' },
  { route: 'billing',     n: '18', ico: '⌬', name: 'Aeronautical Billing', view: billingView },
  { route: 'concessions', n: '19', ico: '⌂', name: 'Concessions',          view: concessionsView },
  { group: 'Platform' },
  { route: 'alerts',      n: '20', ico: '⚠', name: 'Alert Center',         view: alertsView },
  { route: 'settings',    n: '21', ico: '⚙', name: 'Admin & Settings',     view: settingsView },
];

const MODULE_COUNT = MODULES.filter(m => m.route).length;

const HIDDEN_ROUTES = { 'fids-display': fidsDisplay };

let config = null;
let currentRefresh = null;
let currentRoute = null;

function routeOf() {
  const h = location.hash.replace(/^#\/?/, '');
  return h || 'dashboard';
}

function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  for (const m of MODULES) {
    if (m.group) { nav.append(el('div', { class: 'nav-group' }, el('div', { class: 'nav-group-label' }, m.group))); continue; }
    nav.append(el('a', { class: 'nav-item', id: `nav-${m.route}`, href: `#/${m.route}` },
      el('span', { class: 'ico' }, m.ico), m.name, el('span', { class: 'n' }, m.n)));
  }
}

async function render() {
  const route = routeOf();
  currentRoute = route;
  const viewEl = document.getElementById('view');
  document.body.classList.toggle('fids-mode', route === 'fids-display');

  for (const m of MODULES) {
    if (m.route) document.getElementById(`nav-${m.route}`)?.classList.toggle('active', m.route === route);
  }
  const mod = MODULES.find(m => m.route === route);
  document.getElementById('crumb').innerHTML = '';
  document.getElementById('crumb').append(
    el('span', {}, mod ? mod.name : 'Vectro'),
    el('span', { class: 'crumb-sub' }, mod ? `Module ${mod.n} of ${MODULE_COUNT}` : ''));

  viewEl.innerHTML = '';
  currentRefresh = null;
  const fn = mod ? mod.view : HIDDEN_ROUTES[route];
  if (!fn) { location.hash = '#/dashboard'; return; }
  try {
    currentRefresh = await fn(viewEl) || null;
  } catch (e) {
    viewEl.append(el('div', { class: 'empty' }, `Failed to load module: ${e.message}`));
  }
}

function startClock() {
  const clock = document.getElementById('clock');
  setInterval(() => {
    const now = new Date();
    const loc = now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ });
    const utc = now.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    clock.innerHTML = `<b>${loc}</b> LOC · ${utc}Z`;
  }, 1000);
}

async function refreshTopbar() {
  try {
    const [wx, alerts] = await Promise.all([get('/api/weather'), get('/api/alerts')]);
    const open = alerts.filter(a => !a.ack).length;
    const bc = document.getElementById('bell-count');
    bc.hidden = open === 0;
    bc.textContent = open > 99 ? '99+' : open;
    document.getElementById('wx-chip').textContent =
      `${wx.temp}°C · ${String(wx.windDir).padStart(3, '0')}/${wx.windSpd}kt · ${wx.cond}`;
  } catch {}
}

function safeRefresh() {
  if (!currentRefresh) return;
  if (document.getElementById('modal-root').childElementCount > 0) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
  Promise.resolve(currentRefresh()).catch(() => {});
}

async function boot() {
  const bs = await get('/api/bootstrap');
  config = bs.config;
  setTZ(config.airport.tz);
  window.VECTRO = { config, airlines: bs.airlines };
  document.getElementById('airport-chip').textContent =
    `${config.airport.iata} · ${config.airport.icao} — ${config.airport.city}`;
  document.title = `Vectro · ${config.airport.iata} Operations`;

  buildNav();
  startClock();
  refreshTopbar();
  document.getElementById('bell').addEventListener('click', () => { location.hash = '#/alerts'; });

  stream(up => {
    const live = document.getElementById('live-dot');
    live.classList.toggle('down', !up);
    live.innerHTML = `<span class="dot"></span>${up ? 'LIVE' : 'RECONNECTING'}`;
  });

  let tickCount = 0;
  on('tick', () => {
    tickCount++;
    if (tickCount % 2 === 0) safeRefresh(); // refresh view every ~8s
    if (tickCount % 4 === 0) refreshTopbar();
  });
  on('alert', a => {
    refreshTopbar();
    if (currentRoute !== 'fids-display') toast(`${a.module}: ${a.msg}`, a.sev === 'HIGH' ? 'bad' : 'warn');
  });
  on('reseed', () => location.reload());

  window.addEventListener('hashchange', render);
  await render();
}

boot().catch(e => {
  document.getElementById('view').innerHTML = `<div class="empty">Could not reach Vectro core: ${e.message}</div>`;
});
