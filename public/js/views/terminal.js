// Module 07 — Passenger Flow · 08 — Baggage Operations · 09 — Workforce
import { get, send } from '../api.js';
import { el, panel, table, badge, kpi, spark, toast, ago, fmtDT } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 07 — Passenger Flow (Veovo-style queue intelligence)
// ---------------------------------------------------------------------------

export async function paxView(root) {
  async function draw() {
    const queues = await get('/api/queues');
    const worst = queues.reduce((a, b) => (a.wait > b.wait ? a : b));
    const totalTput = queues.reduce((s, q) => s + q.throughput, 0);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(Math.round(queues.reduce((s, q) => s + q.wait, 0) / queues.length) + 'm', 'Avg wait (all checkpoints)', ''),
      kpi(worst.wait + 'm', `Worst: ${worst.id}`, worst.wait > 25 ? 'bad' : worst.wait > 15 ? 'warn' : 'ok'),
      kpi(totalTput.toLocaleString(), 'Pax/hr throughput', 'teal'),
      kpi(queues.reduce((s, q) => s + q.open, 0) + '/' + queues.reduce((s, q) => s + q.lanes, 0), 'Lanes open', 'accent'),
    ));

    const lanes = q => {
      const sel = el('select', { class: 'input', style: 'padding:3px 6px;font-size:11.5px' },
        Array.from({ length: q.lanes }, (_, i) => el('option', { value: i + 1, selected: i + 1 === q.open }, `${i + 1} open`)));
      sel.addEventListener('change', async () => {
        try { await send(`/api/queues/${q.id}`, 'PATCH', { open: +sel.value }); toast(`${q.name}: ${sel.value} lanes open`); draw(); }
        catch (e) { toast(e.message, 'bad'); }
      });
      return sel;
    };

    root.append(el('div', { class: 'grid cols-2' }, queues.map(q =>
      panel(q.name, el('div', {},
        el('div', { style: 'display:flex;align-items:baseline;gap:14px;margin-bottom:6px' },
          el('span', { class: 'mono', style: `font-size:30px;font-weight:750;color:${q.wait > 25 ? 'var(--bad)' : q.wait > 15 ? 'var(--warn)' : 'var(--ok)'}` }, q.wait + 'm'),
          el('span', { class: 'dim' }, `${q.throughput} pax/hr`),
          el('div', { style: 'margin-left:auto' }, lanes(q))),
        spark(q.history, 430, 44, q.wait > 20 ? 'var(--warn)' : 'var(--accent2)'),
        el('div', { class: 'faint', style: 'font-size:10.5px;margin-top:4px' }, 'Wait-time trend · last 48 samples')),
        { sub: `${q.open}/${q.lanes} lanes` }))));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 08 — Baggage Operations
// ---------------------------------------------------------------------------

export async function baggageView(root) {
  async function draw() {
    const [bag, res] = await Promise.all([get('/api/baggage'), get('/api/resources')]);
    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(bag.sortedLastHour.toLocaleString(), 'Bags sorted (last hr)', 'accent'),
      kpi(bag.readRate + '%', 'ATR read rate', bag.readRate >= 98.5 ? 'ok' : 'warn'),
      kpi(bag.onTimeDelivery + '%', 'On-time delivery', bag.onTimeDelivery >= 95 ? 'ok' : 'warn'),
      kpi(bag.mishandled.filter(b => b.status === 'TRACING').length, 'Bags tracing', 'warn'),
    ));
    root.append(el('div', { class: 'grid cols-2' },
      panel('Mishandled baggage queue', table([
        { h: 'Case', r: b => el('span', { class: 'mono' }, b.id) },
        { h: 'Tag', r: b => el('span', { class: 'mono dim' }, b.tag) },
        { h: 'Flight', r: b => el('span', { class: 'mono' }, b.flight) },
        { h: 'Reason', r: b => el('span', { style: 'font-size:12px' }, b.reason) },
        { h: 'Age', r: b => el('span', { class: 'dim mono' }, ago(b.ts)) },
        { h: 'Status', r: b => badge(b.status) },
      ], bag.mishandled), { flush: true, sub: 'WorldTracer-synced' }),
      panel('Reclaim belts', table([
        { h: 'Belt', r: b => el('span', { class: 'mono' }, b.id) },
        { h: 'Terminal', r: b => b.terminal },
        { h: 'Status', r: b => badge(b.status) },
      ], res.belts), { flush: true }),
    ));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 09 — Workforce
// ---------------------------------------------------------------------------

export async function workforceView(root) {
  let roleFilter = '';
  async function draw() {
    const staff = await get('/api/staff');
    const roles = [...new Set(staff.map(s => s.role))];
    const shown = roleFilter ? staff.filter(s => s.role === roleFilter) : staff;
    const expiring = staff.filter(s => s.certExpiry < Date.now() + 30 * 86400e3);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(staff.length, 'Rostered headcount', ''),
      kpi(staff.filter(s => s.status === 'ON_DUTY').length, 'On duty now', 'accent'),
      kpi(staff.filter(s => s.status === 'BREAK').length, 'On break', ''),
      kpi(expiring.length, 'Certs expiring <30d', expiring.length ? 'warn' : 'ok'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('select', {
        class: 'input', onchange: e => { roleFilter = e.target.value; draw(); },
      }, el('option', { value: '' }, 'All roles'),
        roles.map(r => el('option', { value: r, selected: r === roleFilter }, r)))));
    root.append(panel(null, table([
      { h: 'ID', r: s => el('span', { class: 'mono dim' }, s.id) },
      { h: 'Name', r: s => s.name },
      { h: 'Role', r: s => s.role },
      { h: 'Zone', r: s => badge(s.zone, 'b') },
      { h: 'Shift', r: s => el('span', { class: 'mono dim' }, s.shift) },
      { h: 'Cert expiry', r: s => el('span', { class: 'mono' + (s.certExpiry < Date.now() + 30 * 86400e3 ? '' : ' dim'), style: s.certExpiry < Date.now() + 30 * 86400e3 ? 'color:var(--warn)' : '' }, fmtDT(s.certExpiry)) },
      { h: 'Status', r: s => badge(s.status) },
    ], shown), { flush: true }));
  }
  await draw();
  return draw;
}
