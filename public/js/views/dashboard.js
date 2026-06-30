// Module 01 — Operations Dashboard: the AOCC single pane of glass
import { get } from '../api.js';
import { el, kpi, panel, table, badge, fmtT, ago, money, airlineDot, flightStatus } from '../ui.js';

function movementsChart(movements) {
  const max = Math.max(...movements.map(m => m.dep + m.arr), 1);
  return el('div', {},
    el('div', { class: 'bars' }, movements.map(m =>
      el('div', { class: 'bar-col', title: `${m.label} — ${m.dep} dep / ${m.arr} arr` },
        el('div', { class: 'b-dep', style: `height:${(m.dep / max) * 100}%` }),
        el('div', { class: 'b-arr', style: `height:${(m.arr / max) * 100}%` })))),
    el('div', { class: 'bars-x' }, movements.map(m => el('span', {}, m.label.slice(0, 5)))),
    el('div', { class: 'legend', style: 'margin-top:8px' },
      el('span', {}, el('i', { style: 'background:var(--accent)' }), 'Departures'),
      el('span', {}, el('i', { style: 'background:var(--accent2)' }), 'Arrivals')));
}

export default async function dashboard(root) {
  async function draw() {
    const o = await get('/api/overview');
    root.innerHTML = '';

    root.append(el('div', { class: 'kpis' },
      kpi(o.otp + '%', 'On-time performance', o.otp >= 80 ? 'ok' : o.otp >= 60 ? 'warn' : 'bad'),
      kpi(o.movementsToday, 'Movements today', 'accent'),
      kpi(o.paxToday.toLocaleString(), 'Passengers today', 'teal'),
      kpi(o.delayed, 'Delayed flights', o.delayed > 6 ? 'bad' : o.delayed > 2 ? 'warn' : 'ok'),
      kpi(o.turnsActive, 'Active turnarounds', 'accent'),
      kpi(o.turnsAtRisk, 'Turns at risk', o.turnsAtRisk ? 'bad' : 'ok'),
      kpi(o.avgWait + 'm', 'Avg security wait', o.avgWait > 20 ? 'bad' : o.avgWait > 12 ? 'warn' : 'ok'),
      kpi('$' + (o.revToday / 1000).toFixed(1) + 'k', 'Aero revenue today', 'teal'),
    ));

    const upcomingTbl = table([
      { h: 'Flight', r: f => el('span', { class: 'mono nowrap' }, airlineDot(f.airlineColor), f.fltNo) },
      { h: '', r: f => badge(f.type) },
      { h: 'City', r: f => f.city },
      { h: 'Sched', r: f => el('span', { class: 'mono' }, fmtT(f.sched)) },
      { h: 'Est', r: f => el('span', { class: 'mono' + (f.delay > 10 ? ' dim' : '') }, fmtT(f.est)) },
      { h: 'Gate', r: f => el('span', { class: 'mono' }, f.gate) },
      { h: 'Status', r: f => flightStatus(f) },
    ], o.upcoming, { empty: 'No upcoming movements' });

    const feed = el('div', { class: 'feed' }, o.events.map(ev =>
      el('div', { class: `feed-item ${ev.sev === 'cv' ? 'cv' : ev.sev === 'warn' ? 'warn' : ''}` },
        el('span', { class: 't' }, fmtT(ev.ts)),
        el('span', { class: 'mod' }, badge(ev.module, ev.sev === 'cv' ? 'p' : '')),
        el('span', { class: 'msg' }, ev.msg))));

    const alertsBox = o.alerts.length
      ? el('div', {}, o.alerts.map(a => el('div', { class: 'alert-row' },
          badge(a.sev),
          el('div', { class: 'body' }, el('div', {}, a.msg), el('div', { class: 'when' }, `${a.module} · ${ago(a.ts)}`)))))
      : el('div', { class: 'empty' }, 'No unacknowledged alerts');

    const runways = table([
      { h: 'Runway', r: r => el('span', { class: 'mono' }, r.id) },
      { h: 'Length', r: r => el('span', { class: 'mono dim' }, r.length + ' m') },
      { h: 'Mode', r: r => badge(r.mode) },
      { h: 'Status', r: r => badge(r.status) },
    ], o.runways);

    const wx = o.weather;
    const wxBox = el('div', {},
      el('div', { class: 'wx-big' },
        el('div', { class: 'wx-temp' }, `${wx.temp}°`),
        el('div', {},
          el('div', { class: 'wx-cond' }, wx.cond),
          el('div', { class: 'dim mono', style: 'font-size:11.5px;margin-top:3px' },
            `${String(wx.windDir).padStart(3, '0')}° / ${wx.windSpd}${wx.gust ? 'G' + wx.gust : ''} kt · vis ${wx.vis === 9999 ? '10+ km' : wx.vis + ' m'} · Q${wx.qnh}`),
          wx.deiceActive && el('div', { style: 'margin-top:5px' }, badge('DE-ICE ACTIVE', 'r')))),
      el('div', { class: 'metar-box' }, wx.metar));

    root.append(el('div', { class: 'grid cols-3' },
      panel('Movements by hour', movementsChart(o.movements), { sub: '−4h to +8h' }),
      panel('Runways', runways, { flush: true }),
      panel('Weather', wxBox, { sub: 'auto METAR' }),
      el('div', { class: 'span-2' }, panel('Next movements', upcomingTbl, { flush: true, sub: 'live AODB' })),
      panel('Active alerts', alertsBox, { flush: true, right: el('a', { href: '#/alerts', class: 'dim', style: 'font-size:11px' }, 'Alert Center →') }),
      el('div', { class: 'span-2' }, panel('Live activity', feed, { flush: true, sub: 'all modules · CV events in purple' })),
      panel('Platform pulse', el('div', { class: 'kv' },
        el('dt', {}, 'Open work orders'), el('dd', {}, String(o.openWorkorders)),
        el('dt', {}, 'Bags sorted (last hr)'), el('dd', {}, o.bagsLastHour.toLocaleString()),
        el('dt', {}, 'Cancellations today'), el('dd', {}, String(o.cancelled)),
        el('dt', {}, 'Open alerts'), el('dd', {}, String(o.openAlerts)),
        el('dt', {}, 'Aero revenue (today)'), el('dd', {}, money(o.revToday)),
      )),
    ));
  }
  await draw();
  return draw;
}
