// Module 02 — Flight Ops (AODB) · Module 03 — FIDS & Displays
import { get, send } from '../api.js';
import { el, panel, table, badge, fmtT, modal, toast, formRow, airlineDot, flightStatus } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 02 — AODB
// ---------------------------------------------------------------------------

let fltFilter = { type: '', q: '' };

function flightModal(f, after) {
  const minutes = el('input', { class: 'input', type: 'number', value: 15, min: 1, max: 600 });
  const reason = el('select', { class: 'input' },
    ['ATC flow restriction', 'Late inbound aircraft', 'Crew connection', 'Technical check', 'Weather', 'Ground handling'].map(r => el('option', {}, r)));
  const gate = el('input', { class: 'input', value: f.gate || '', placeholder: 'e.g. B7' });

  const act = async (action, body = {}) => {
    try {
      await send(`/api/flights/${f.id}/action`, 'POST', { action, ...body });
      toast(`${f.fltNo}: ${action} applied`);
      after();
    } catch (e) { toast(e.message, 'bad'); }
  };

  modal(`${f.fltNo} — ${f.type === 'DEP' ? 'to' : 'from'} ${f.city}`, el('div', {},
    el('div', { class: 'kv', style: 'margin-bottom:16px' },
      el('dt', {}, 'Airline'), el('dd', {}, f.airlineName),
      el('dt', {}, 'Aircraft'), el('dd', {}, `${f.acName} (${f.acType}) · ${f.reg} · MTOW ${f.mtow}t`),
      el('dt', {}, 'Schedule'), el('dd', {}, `STD/STA ${fmtT(f.sched)} → EST ${fmtT(f.est)}${f.act ? ` → ACT ${fmtT(f.act)}` : ''}`),
      el('dt', {}, 'Resources'), el('dd', {}, `Gate ${f.gate} · Stand ${f.stand}${f.belt ? ' · Belt ' + f.belt : ''}${f.checkin ? ' · Check-in ' + f.checkin : ''}`),
      el('dt', {}, 'Load'), el('dd', {}, `${f.pax} pax · ${f.bags} bags`),
      el('dt', {}, 'Status'), el('dd', {}, flightStatus(f)),
      f.remarks && el('dt', {}, 'Remarks'), f.remarks && el('dd', {}, f.remarks),
    ),
    f.act == null && f.status !== 'CANCELLED' && el('div', {},
      el('h3', { class: 'sec' }, 'AOCC actions'),
      el('div', { class: 'grid cols-3' },
        formRow('Delay (minutes)', minutes), formRow('Reason', reason), formRow('Gate change', gate)),
      el('div', { style: 'display:flex;gap:8px;margin-top:6px;flex-wrap:wrap' },
        el('button', { class: 'btn', onclick: () => act('delay', { minutes: +minutes.value, reason: reason.value }) }, 'Apply delay'),
        el('button', { class: 'btn', onclick: () => act('gate', { gate: gate.value.trim().toUpperCase() }) }, 'Change gate'),
        el('button', { class: 'btn danger', onclick: () => act('cancel', { reason: reason.value }) }, 'Cancel flight'))),
    f.status === 'CANCELLED' && el('button', { class: 'btn', style: 'margin-top:8px', onclick: () => act('reinstate') }, 'Reinstate flight'),
  ));
}

export async function flightsView(root) {
  async function draw() {
    const qs = new URLSearchParams();
    if (fltFilter.type) qs.set('type', fltFilter.type);
    if (fltFilter.q) qs.set('q', fltFilter.q);
    const flights = await get('/api/flights?' + qs);
    const now = Date.now();
    const active = flights.filter(f => f.act == null && f.status !== 'CANCELLED').length;

    root.innerHTML = '';
    const search = el('input', {
      class: 'input', placeholder: 'Search flight, city, reg, gate…', value: fltFilter.q, style: 'width:260px',
      oninput: e => { fltFilter.q = e.target.value; clearTimeout(search._t); search._t = setTimeout(draw, 280); },
    });
    const seg = el('div', { class: 'seg' }, ['', 'ARR', 'DEP'].map(t =>
      el('button', { class: fltFilter.type === t ? 'on' : '', onclick: () => { fltFilter.type = t; draw(); } },
        t === '' ? 'All' : t === 'ARR' ? 'Arrivals' : 'Departures')));

    root.append(el('div', { class: 'toolbar' }, seg, search,
      el('div', { class: 'spacer' }),
      el('span', { class: 'dim', style: 'font-size:12px' }, `${flights.length} flights · ${active} active in plan`)));

    // auto-scroll target: first not-yet-departed row near "now"
    const rows = flights.sort((a, b) => a.sched - b.sched);
    root.append(panel(null, table([
      { h: 'Flight', r: f => el('span', { class: 'mono nowrap' }, airlineDot(f.airlineColor), f.fltNo) },
      { h: '', r: f => badge(f.type) },
      { h: 'City', r: f => el('span', {}, f.city + ' ', el('span', { class: 'faint mono' }, f.cityIata)) },
      { h: 'Sched', r: f => el('span', { class: 'mono' }, fmtT(f.sched)) },
      { h: 'Est', r: f => el('span', { class: 'mono' + (f.delay > 10 ? ' dim' : '') }, fmtT(f.est)) },
      { h: 'Act', r: f => el('span', { class: 'mono' }, fmtT(f.act)) },
      { h: 'A/C', r: f => el('span', { class: 'mono dim' }, f.acType) },
      { h: 'Reg', r: f => el('span', { class: 'mono dim' }, f.reg) },
      { h: 'Gate', r: f => el('span', { class: 'mono' }, f.gate || '—') },
      { h: 'Belt/Row', r: f => el('span', { class: 'mono dim' }, f.belt || f.checkin || '—') },
      { h: 'Pax', r: f => el('span', { class: 'mono dim' }, String(f.pax)) },
      { h: 'Status', r: f => flightStatus(f) },
    ], rows, { onRow: f => flightModal(f, draw), empty: 'No flights match' }), { flush: true }));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 03 — FIDS
// ---------------------------------------------------------------------------

const ST_CLS = { DEPARTED: 'st-ok', LANDED: 'st-ok', ON_STAND: 'st-ok', BOARDING: 'st-blue', APPROACH: 'st-blue', EN_ROUTE: 'st-blue', FINAL_CALL: 'st-warn', GATE_CLOSED: 'st-warn', DELAYED: 'st-warn', CANCELLED: 'st-bad', DIVERTED: 'st-bad' };
const FIDS_TEXT = { SCHEDULED: 'ON TIME', EN_ROUTE: 'EN ROUTE', APPROACH: 'APPROACHING', LANDED: 'LANDED', ON_STAND: 'ARRIVED', BOARDING: 'BOARDING', FINAL_CALL: 'FINAL CALL', GATE_CLOSED: 'GATE CLOSED', DEPARTED: 'DEPARTED', DELAYED: 'DELAYED', CANCELLED: 'CANCELLED' };

function fidsTable(data) {
  const dep = data.type === 'DEP';
  return el('table', { class: 'fids-table' },
    el('thead', {}, el('tr', {},
      ['TIME', 'EST', 'FLIGHT', dep ? 'DESTINATION' : 'ORIGIN', dep ? 'GATE' : 'BELT', 'STATUS'].map(h => el('th', {}, h)))),
    el('tbody', {}, data.flights.map(f => el('tr', {},
      el('td', {}, fmtT(f.sched)),
      el('td', { class: f.delay > 10 ? 'st-warn' : '' }, f.delay > 10 ? fmtT(f.est) : ''),
      el('td', { class: 'white' }, f.fltNo),
      el('td', {}, f.city.toUpperCase()),
      el('td', { class: 'white' }, (dep ? f.gate : f.belt) || '—'),
      el('td', { class: ST_CLS[f.status] || '' }, FIDS_TEXT[f.status] || f.status)))));
}

export async function fidsView(root) {
  let mode = 'DEP';
  async function draw() {
    const data = await get('/api/fids?type=' + mode);
    root.innerHTML = '';
    root.append(el('div', { class: 'toolbar' },
      el('div', { class: 'seg' }, ['DEP', 'ARR'].map(t =>
        el('button', { class: mode === t ? 'on' : '', onclick: () => { mode = t; draw(); } }, t === 'DEP' ? 'Departures' : 'Arrivals'))),
      el('div', { class: 'spacer' }),
      el('a', { class: 'btn', href: '#/fids-display', target: '_blank' }, '⛶ Open full-screen display')));
    root.append(el('div', { class: 'panel', style: 'background:#05080f;padding:18px 22px' },
      el('div', { class: 'fids-head', style: 'margin-bottom:0' },
        el('div', { class: 'fids-title', style: 'font-size:22px' }, mode === 'DEP' ? '⬈ DEPARTURES' : '⬊ ARRIVALS'),
        el('div', { class: 'fids-clock', style: 'font-size:20px' }, fmtT(data.now))),
      fidsTable(data)));
  }
  await draw();
  return draw;
}

// Standalone display (#/fids-display) — cycles DEP/ARR every 12s
export async function fidsDisplay(root) {
  let mode = 'DEP';
  let timer = null;
  async function draw() {
    const data = await get('/api/fids?type=' + mode);
    root.innerHTML = '';
    root.append(el('div', { class: 'fids-screen' },
      el('div', { class: 'fids-head' },
        el('div', { class: 'fids-title' }, mode === 'DEP' ? '⬈ DEPARTURES' : '⬊ ARRIVALS'),
        el('div', {},
          el('span', { style: 'color:var(--faint);font-size:15px;margin-right:18px;letter-spacing:2px' }, `${data.airport.name.toUpperCase()} · ${data.airport.iata}`),
          el('span', { class: 'fids-clock' }, fmtT(Date.now())))),
      fidsTable(data),
      el('div', { class: 'fids-foot' },
        el('span', {}, 'VECTRO FIDS · CHANNEL 1'),
        el('span', {}, `AUTO-CYCLING · NEXT: ${mode === 'DEP' ? 'ARRIVALS' : 'DEPARTURES'}`))));
  }
  await draw();
  timer = setInterval(() => { mode = mode === 'DEP' ? 'ARR' : 'DEP'; draw(); }, 12000);
  window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
  return draw;
}
