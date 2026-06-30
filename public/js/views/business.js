// Module 15 — Aeronautical Billing · 16 — Concessions
import { get, send } from '../api.js';
import { el, panel, table, badge, kpi, money, fmtT, fmtDT, modal, toast, airlineDot } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 15 — Aeronautical Billing (Vector-style automated movement charging)
// ---------------------------------------------------------------------------

function chargeDetail(c) {
  modal(`${c.ref} — ${c.flight} (${c.reg})`, el('div', {},
    el('div', { class: 'kv', style: 'margin-bottom:14px' },
      el('dt', {}, 'Movement'), el('dd', {}, `${c.arrFlight ? c.arrFlight + ' → ' : ''}${c.flight} · ${c.acType}`),
      el('dt', {}, 'Captured'), el('dd', {}, fmtDT(c.ts)),
      el('dt', {}, 'Status'), el('dd', {}, badge(c.status))),
    table([
      { h: 'Charge line', r: l => l.desc },
      { h: 'Amount', cls: 'right', r: l => el('span', { class: 'mono' }, money(l.amount)) },
    ], c.lines),
    el('div', { class: 'right', style: 'margin-top:12px;font-size:15px;font-weight:700' },
      'Total ', el('span', { class: 'mono', style: 'color:var(--accent2)' }, money(c.total)), ' CAD')));
}

export async function billingView(root) {
  async function draw() {
    const [sum, charges, invoices] = await Promise.all([
      get('/api/billing/summary'), get('/api/billing/charges'), get('/api/billing/invoices')]);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(money(sum.totalToday), 'Captured today', 'teal'),
      kpi(sum.chargesCount, 'Movements charged', 'accent'),
      kpi(money(sum.byAirline.reduce((s, a) => s + a.uninvoiced, 0)), 'Uninvoiced', 'warn'),
      kpi(money(sum.invoicedTotal), 'Invoiced', 'ok'),
    ));

    const invoiceBtn = a => el('button', {
      class: 'btn sm primary',
      disabled: a.uninvoiced <= 0,
      onclick: async e => {
        e.stopPropagation();
        try {
          const inv = await send('/api/billing/invoice', 'POST', { airline: a.airline });
          toast(`Invoice ${inv.id} issued to ${inv.airlineName} — ${money(inv.total)}`);
          draw();
        } catch (err) { toast(err.message, 'bad'); }
      },
    }, 'Generate invoice');

    root.append(el('div', { class: 'grid cols-2' },
      panel('Receivables by airline', table([
        { h: 'Airline', r: a => el('span', {}, airlineDot((window.VECTRO.airlines.find(x => x.code === a.airline) || {}).color), a.name) },
        { h: 'Movements', r: a => el('span', { class: 'mono dim' }, String(a.movements)) },
        { h: 'Total', cls: 'right', r: a => el('span', { class: 'mono' }, money(a.total)) },
        { h: 'Uninvoiced', cls: 'right', r: a => el('span', { class: 'mono', style: a.uninvoiced ? 'color:var(--warn)' : '' }, money(a.uninvoiced)) },
        { h: '', r: invoiceBtn },
      ], sum.byAirline, { empty: 'No charges captured yet — they post automatically at off-blocks' }), { flush: true }),
      panel('Published tariff', el('div', { class: 'kv' },
        el('dt', {}, 'Landing fee'), el('dd', {}, `${money(sum.tariffs.landingPerTonne)} / tonne MTOW (min ${money(sum.tariffs.landingMinimum)})`),
        el('dt', {}, 'Terminal fee'), el('dd', {}, `${money(sum.tariffs.terminalPerDepPax)} / departing pax`),
        el('dt', {}, 'Parking (NB/WB)'), el('dd', {}, `${money(sum.tariffs.parkingPer15Min.N)} / ${money(sum.tariffs.parkingPer15Min.W)} per 15 min after ${sum.tariffs.parkingFreeMinutes} min`),
        el('dt', {}, 'Boarding bridge'), el('dd', {}, `${money(sum.tariffs.bridgePerUse)} / use`),
        el('dt', {}, 'Apron handling'), el('dd', {}, `${money(sum.tariffs.apronHandlingPerTurn.N)} / ${money(sum.tariffs.apronHandlingPerTurn.W)} per turn`),
        el('dt', {}, 'De-icing'), el('dd', {}, `${money(sum.tariffs.deicePerApplication.N)} / ${money(sum.tariffs.deicePerApplication.W)} per application`),
        el('dt', {}, 'Night surcharge'), el('dd', {}, `${Math.round(sum.tariffs.nightSurchargePct * 100)}% (23:00–06:59)`),
      ), { sub: sum.tariffs.currency }),
    ));

    root.append(el('div', { class: 'grid cols-2', style: 'margin-top:14px' },
      panel('Movement charges (latest)', table([
        { h: 'Ref', r: c => el('span', { class: 'mono dim' }, c.ref) },
        { h: 'Flight', r: c => el('span', { class: 'mono' }, c.flight) },
        { h: 'A/C', r: c => el('span', { class: 'mono dim' }, c.acType) },
        { h: 'Time', r: c => el('span', { class: 'mono dim' }, fmtT(c.ts)) },
        { h: 'Total', cls: 'right', r: c => el('span', { class: 'mono' }, money(c.total)) },
        { h: '', r: c => badge(c.status) },
      ], charges.slice(0, 25), { onRow: chargeDetail, empty: 'Charges post automatically when flights go off-blocks' }), { flush: true, sub: 'click a row for the rated lines' }),
      panel('Issued invoices', table([
        { h: 'Invoice', r: i => el('span', { class: 'mono' }, i.id) },
        { h: 'Airline', r: i => i.airlineName },
        { h: 'Movements', r: i => el('span', { class: 'mono dim' }, String(i.movements)) },
        { h: 'Issued', r: i => el('span', { class: 'mono dim' }, fmtDT(i.ts)) },
        { h: 'Terms', r: i => el('span', { class: 'dim' }, i.terms) },
        { h: 'Total', cls: 'right', r: i => el('span', { class: 'mono', style: 'color:var(--accent2)' }, money(i.total)) },
      ], invoices, { empty: 'No invoices issued yet' }), { flush: true }),
    ));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 16 — Concessions & non-aeronautical revenue
// ---------------------------------------------------------------------------

export async function concessionsView(root) {
  async function draw() {
    const cons = await get('/api/concessions');
    const total = cons.reduce((s, c) => s + c.todaySales, 0);
    const txns = cons.reduce((s, c) => s + c.txns, 0);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(money(total), 'Non-aero revenue today', 'teal'),
      kpi(txns.toLocaleString(), 'Transactions', 'accent'),
      kpi(money(total / Math.max(1, txns)), 'Avg basket', ''),
      kpi(cons.length, 'Active units', ''),
    ));
    const max = Math.max(...cons.map(c => c.todaySales));
    root.append(panel('Sales by unit (today)', table([
      { h: 'Unit', r: c => c.name },
      { h: 'Category', r: c => badge(c.category, c.category === 'F&B' ? 't' : c.category === 'Retail' ? 'b' : c.category === 'Lounge' ? 'p' : '') },
      { h: 'Location', r: c => el('span', { class: 'dim' }, c.location) },
      { h: 'Txns', r: c => el('span', { class: 'mono dim' }, String(c.txns)) },
      { h: 'vs LW', r: c => el('span', { class: 'mono', style: `color:${+c.trend >= 0 ? 'var(--ok)' : 'var(--bad)'}` }, (+c.trend >= 0 ? '+' : '') + c.trend + '%') },
      { h: 'Sales', r: c => el('div', { style: 'display:flex;align-items:center;gap:9px;min-width:220px' },
          el('div', { class: 'prog', style: 'flex:1' }, el('div', { style: `width:${(c.todaySales / max) * 100}%` })),
          el('span', { class: 'mono' }, money(c.todaySales))) },
    ], cons.sort((a, b) => b.todaySales - a.todaySales)), { flush: true }));
  }
  await draw();
  return draw;
}
