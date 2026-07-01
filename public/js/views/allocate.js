// Vectro Allocate — Allocation Manager · Gate · Stand · Check-in management
import { get, send } from '../api.js';
import { el, panel, table, badge, fmtT, kpi, toast, modal } from '../ui.js';

const colorOf = code => (window.VECTRO.airlines.find(a => a.code === code) || {}).color || '#5a6884';

// ---------------------------------------------------------------------------
// Shared Gantt board (gates or stands)
// ---------------------------------------------------------------------------

function ganttBoard(data, onBlock) {
  const { lanes, allocations, now, t0, t1 } = data;
  const span = t1 - t0;
  const x = ts => Math.max(0, Math.min(100, ((ts - t0) / span) * 100));

  const axis = el('div', { class: 'gantt-axis' });
  const hours = Math.round(span / 3600e3);
  for (let h = 0; h < hours; h++) axis.append(el('div', { class: 'hr' }, fmtT(t0 + h * 3600e3)));
  const gantt = el('div', { class: 'gantt' }, axis);

  for (const lane of lanes) {
    const laneEl = el('div', { class: 'lane' });
    for (const a of allocations.filter(a => a.resource === lane.id)) {
      const left = x(a.start), width = Math.max(1.4, x(a.end) - left);
      laneEl.append(el('div', {
        class: 'gantt-block' + (a.conflict ? ' conflict' : '') + (a.remote ? ' remote' : ''),
        style: `left:${left}%;width:${width}%;background:${colorOf(a.airline)}cc`,
        title: `${a.label} · ${a.reg} · ${a.acType} · ${fmtT(a.start)}–${fmtT(a.end)}${a.conflict ? ' · CONFLICT' : ''}`,
        onclick: onBlock ? () => onBlock(a, lane) : null,
      }, a.label));
    }
    const tag = lane.remote ? ' remote' : (lane.bridge === false ? ' walk-out' : '');
    gantt.append(el('div', { class: 'gantt-row' + (lane.remote ? ' remote-row' : '') },
      el('div', { class: 'lbl' }, lane.id, tag && el('span', { class: 'lane-tag' }, tag.trim())), laneEl));
  }
  gantt.append(el('div', { class: 'gantt-now', style: `left:calc(76px + (100% - 76px) * ${(now - t0) / span})` }));
  return el('div', { class: 'gantt-wrap' }, gantt);
}

// Free if no *other* allocation on a resource overlaps the window (+10 min buffer).
function isResourceFree(allocations, resourceId, start, end, exceptId) {
  const BUF = 10 * 60000;
  return !allocations.some(a => a.resource === resourceId && a.id !== exceptId &&
    start < a.end + BUF && end > a.start - BUF);
}

function reassignModal(data, a, after) {
  const gateLanes = data.lanes.filter(l => !l.remote);
  const remoteLanes = data.lanes.filter(l => l.remote);
  const free = l => isResourceFree(data.allocations, l.id, a.start, a.end, a.id) && l.id !== a.resource;
  const fit = l => !a.wide || l.wide;

  const opt = l => el('option', { value: l.id, disabled: !free(l) || !fit(l) },
    `${data.kind === 'stand' ? 'Stand' : 'Gate'} ${l.id}` +
    (l.remote ? ' (remote)' : l.bridge === false ? ' (walk-out)' : '') +
    (!fit(l) ? ' — narrow only' : !free(l) ? ' — occupied' : ' — free'));

  const sel = el('select', { class: 'input', style: 'width:100%' },
    el('optgroup', { label: 'Contact gates' }, gateLanes.map(opt)),
    remoteLanes.length ? el('optgroup', { label: 'Remote stands (tow)' }, remoteLanes.map(opt)) : null);
  // default to first free+fitting option
  const firstOk = [...gateLanes, ...remoteLanes].find(l => free(l) && fit(l));
  if (firstOk) sel.value = firstOk.id;

  modal(`Reassign ${a.label} — ${a.reg}`, el('div', {},
    el('div', { class: 'kv', style: 'margin-bottom:14px' },
      el('dt', {}, 'Aircraft'), el('dd', {}, `${a.acType}${a.wide ? ' · widebody' : ''}`),
      el('dt', {}, 'Window'), el('dd', {}, `${fmtT(a.start)} – ${fmtT(a.end)}`),
      el('dt', {}, 'Currently'), el('dd', {}, (a.remote ? 'Remote stand ' : 'Gate ') + a.resource),
      a.conflict && el('dt', {}, 'Status'), a.conflict && el('dd', {}, badge('CONFLICT', 'r'))),
    el('label', { style: 'font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px' }, 'Move to'),
    sel),
    { actions: close => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => {
        try {
          await send('/api/allocate/assign', 'POST', { flightId: a.flightIds[0], resource: sel.value });
          toast(`${a.label} → ${sel.value}`);
          close(); after();
        } catch (e) { toast(e.message, 'bad'); }
      } }, 'Reassign'),
    ] });
}

async function runOptimize(after) {
  try {
    const r = await send('/api/allocate/optimize', 'POST', {});
    if (!r.moves.length) toast('No conflicts to resolve — allocation is clean', '');
    else toast(`Resolved ${r.moves.length} conflict${r.moves.length > 1 ? 's' : ''}` + (r.remaining ? ` · ${r.remaining} remaining` : ''), r.remaining ? 'warn' : '');
    after();
  } catch (e) { toast(e.message, 'bad'); }
}

// ---------------------------------------------------------------------------
// Allocation Manager (overview + optimiser)
// ---------------------------------------------------------------------------

export async function allocateManager(root) {
  async function draw() {
    const o = await get('/api/allocate/overview');
    root.innerHTML = '';

    root.append(el('div', { class: 'kpis' },
      kpi(o.contactGates, 'Contact gates', ''),
      kpi(o.occupiedNow, 'Occupied now', 'accent'),
      kpi(o.utilisation + '%', 'Gate utilisation', o.utilisation > 85 ? 'warn' : 'teal'),
      kpi(o.conflicts, 'Allocation conflicts', o.conflicts ? 'bad' : 'ok'),
      kpi(o.remoteFree + '/' + o.remoteStands, 'Remote stands free', ''),
      kpi(o.checkin.countersOpen + '/' + o.checkin.countersTotal, 'Check-in counters open', 'accent'),
    ));

    root.append(el('div', { class: 'toolbar' },
      el('span', { class: 'dim', style: 'font-size:12px' },
        `${o.movementsPlanned} movements planned · ${o.bridges} bridges · ${o.walkout} walk-out · ${o.wideGates} widebody-capable`),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => runOptimize(draw) }, '⚡ Auto-resolve conflicts')));

    const conflictBody = o.conflictDetail.length
      ? el('div', {}, o.conflictDetail.map(c => el('div', { class: 'alert-row' },
          badge('CLASH', 'r'),
          el('div', { class: 'body' },
            el('div', {}, `Gate ${c.resource}: ${c.aLabel} (${c.aReg}) overlaps ${c.bLabel} (${c.bReg})`),
            el('div', { class: 'when' }, `${c.overlapMin} min overlap · from ${fmtT(c.start)}`)))))
      : el('div', { class: 'empty' }, 'No allocation conflicts — every movement has a clear stand');

    root.append(el('div', { class: 'grid cols-2' },
      panel(`Conflicts (${o.conflicts})`, conflictBody, { flush: true,
        right: o.conflicts ? el('button', { class: 'btn sm primary', onclick: () => runOptimize(draw) }, 'Resolve all') : null }),
      panel('Resource pools', el('div', { class: 'kv' },
        el('dt', {}, 'Contact gates'), el('dd', {}, `${o.occupiedNow} occupied / ${o.freeGates} free`),
        el('dt', {}, 'Boarding bridges'), el('dd', {}, String(o.bridges)),
        el('dt', {}, 'Walk-out stands'), el('dd', {}, String(o.walkout)),
        el('dt', {}, 'Remote stands'), el('dd', {}, `${o.remoteFree} free / ${o.remoteStands} total`),
        el('dt', {}, 'Check-in islands'), el('dd', {}, String(o.checkin.rows)),
        el('dt', {}, 'Check-in overloads'), el('dd', {}, o.checkin.overloaded ? `${o.checkin.overloaded} island(s)` : 'none'),
        el('dt', {}, 'Flights to check in'), el('dd', {}, String(o.checkin.assignedFlights)),
      ))));

    root.append(el('div', { class: 'grid cols-3', style: 'margin-top:14px' },
      navCard('Gate Management', 'Live gate Gantt, conflict resolution & re-gating', '#/gates', '⌗'),
      navCard('Stand Management', 'Contact + remote stand allocation and towing', '#/stands', '⊞'),
      navCard('Check-in Management', 'Counter demand forecast & auto-balancing', '#/checkin', '☰')));
  }
  await draw();
  return draw;
}

function navCard(title, sub, href, ico) {
  return el('a', { class: 'alloc-card', href },
    el('div', { class: 'alloc-card-ico' }, ico),
    el('div', {}, el('div', { class: 'alloc-card-t' }, title), el('div', { class: 'alloc-card-s' }, sub)));
}

// ---------------------------------------------------------------------------
// Gate Management
// ---------------------------------------------------------------------------

export async function gateManagement(root) {
  async function draw() {
    const data = await get('/api/allocate/board?kind=gate');
    const conflicts = data.conflicts.length;
    const now = data.now;
    const occupied = new Set(data.allocations.filter(a => a.start <= now && a.end >= now).map(a => a.resource));

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(data.lanes.length, 'Contact gates', ''),
      kpi(occupied.size, 'Occupied now', 'accent'),
      kpi(Math.round((occupied.size / data.lanes.length) * 100) + '%', 'Utilisation', 'teal'),
      kpi(conflicts, 'Conflicts', conflicts ? 'bad' : 'ok'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('span', { class: 'dim', style: 'font-size:12px' }, 'Click any block to re-gate · conflicts highlighted in red'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => runOptimize(draw) }, '⚡ Optimise gates')));

    root.append(panel('Gate allocation — rolling 10h window', ganttBoard(data, (a) => reassignModal(data, a, draw)),
      { sub: 'coloured by airline' }));

    const next = g => data.allocations
      .filter(a => a.resource === g.id && a.end >= now).sort((x, y) => x.start - y.start)[0];
    root.append(el('div', { style: 'margin-top:14px' }, panel('Gate status', table([
      { h: 'Gate', r: g => el('span', { class: 'mono' }, g.id) },
      { h: 'Type', r: g => badge(g.bridge ? 'BRIDGE' : 'WALK-OUT', g.bridge ? 'b' : '') },
      { h: 'Body', r: g => g.wide ? badge('WIDEBODY', 't') : el('span', { class: 'dim' }, 'Narrow') },
      { h: 'State', r: g => occupied.has(g.id) ? badge('OCCUPIED', 'y') : badge('AVAILABLE', 'g') },
      { h: 'Next / current', r: g => { const n = next(g); return n
        ? el('span', { class: 'mono' }, `${n.label} `, el('span', { class: 'dim' }, `${fmtT(n.start)}–${fmtT(n.end)}`))
        : el('span', { class: 'faint' }, '—'); } },
    ], data.lanes), { flush: true })));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Stand Management
// ---------------------------------------------------------------------------

export async function standManagement(root) {
  async function draw() {
    const data = await get('/api/allocate/board?kind=stand');
    const now = data.now;
    const remoteLanes = data.lanes.filter(l => l.remote);
    const remoteOcc = new Set(data.allocations.filter(a => a.remote && a.start <= now && a.end >= now).map(a => a.resource));
    const contactOcc = new Set(data.allocations.filter(a => !a.remote && a.start <= now && a.end >= now).map(a => a.resource));

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(data.lanes.length, 'Total stands', ''),
      kpi(contactOcc.size, 'Contact in use', 'accent'),
      kpi(remoteOcc.size + '/' + remoteLanes.length, 'Remote in use', remoteOcc.size ? 'warn' : 'ok'),
      kpi(data.conflicts.length, 'Conflicts', data.conflicts.length ? 'bad' : 'ok'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('span', { class: 'dim', style: 'font-size:12px' }, 'Contact stands (S-) plus remote stands (R) · click a block to move or tow'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => runOptimize(draw) }, '⚡ Optimise stands')));

    root.append(panel('Stand allocation — rolling 10h window', ganttBoard(data, (a) => reassignModal(data, a, draw)),
      { sub: 'remote stands shown below the divider' }));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Check-in Management
// ---------------------------------------------------------------------------

function demandBars(row, plan) {
  const max = Math.max(row.counters, row.peak, 1);
  const capPct = (row.counters / max) * 100;
  return el('div', { class: 'ci-chart' },
    el('div', { class: 'ci-cap', style: `bottom:${capPct}%`, title: `Capacity ${row.counters} counters` }),
    el('div', { class: 'ci-bars' }, row.demand.map((d, i) =>
      el('div', { class: 'ci-bar' + (d > row.counters ? ' over' : ''), style: `height:${(d / max) * 100}%`,
        title: `${fmtT(plan.samples[i])} · demand ${d} / ${row.counters} counters` }))));
}

export async function checkinManagement(root) {
  async function draw() {
    const plan = await get('/api/allocate/checkin');
    const k = plan.kpis;

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(k.rows, 'Check-in islands', ''),
      kpi(k.countersOpen + '/' + k.countersTotal, 'Counters open', 'accent'),
      kpi(k.peakDemand, 'Peak counter demand', k.peakDemand > k.countersTotal ? 'warn' : 'teal'),
      kpi(k.overloaded, 'Overloaded islands', k.overloaded ? 'bad' : 'ok'),
      kpi(k.assignedFlights, 'Departures to check in', ''),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('span', { class: 'dim', style: 'font-size:12px' }, 'Demand = concurrent counters required by checking-in departures (STD −2h45 to −45m)'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: async () => {
        try { const r = await send('/api/allocate/checkin/optimize', 'POST', {});
          toast(r.changes.length ? `Balanced ${r.changes.length} island(s) to demand` : 'Counters already match demand');
          draw();
        } catch (e) { toast(e.message, 'bad'); }
      } }, '⚡ Auto-balance counters')));

    const setOpen = (row, val) => send('/api/allocate/checkin/set', 'POST', { row: row.id, open: +val })
      .then(() => { toast(`${row.id}: ${val}/${row.counters} open`); draw(); })
      .catch(e => toast(e.message, 'bad'));

    root.append(el('div', { class: 'grid cols-2' }, plan.rows.map(row => {
      const sel = el('select', { class: 'input', style: 'padding:3px 6px;font-size:11.5px',
        onchange: e => setOpen(row, e.target.value) },
        Array.from({ length: row.counters + 1 }, (_, i) => el('option', { value: i, selected: i === row.open }, `${i} open`)));
      const body = el('div', {},
        el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:8px' },
          el('span', { class: 'mono', style: `font-size:22px;font-weight:750;color:${row.overloaded ? 'var(--bad)' : 'var(--accent2)'}` },
            `${row.peak}`),
          el('span', { class: 'dim', style: 'font-size:11.5px' }, `peak demand / ${row.counters} counters`),
          row.overloaded && badge('OVERLOAD', 'r'),
          el('div', { style: 'margin-left:auto' }, sel)),
        demandBars(row, plan),
        el('div', { class: 'faint', style: 'font-size:10.5px;margin:6px 0 2px' },
          `${row.assignments.length} flight(s) · recommend ${row.recommendedOpen} counters open`),
        row.assignments.length ? table([
          { h: 'Flight', r: a => el('span', { class: 'mono' }, a.flight) },
          { h: 'STD', r: a => el('span', { class: 'mono dim' }, fmtT(a.std)) },
          { h: 'Open', r: a => el('span', { class: 'mono dim' }, `${fmtT(a.open)}–${fmtT(a.close)}`) },
          { h: 'Pax', r: a => el('span', { class: 'mono dim' }, String(a.pax)) },
          { h: 'Ctrs', r: a => el('span', { class: 'mono' }, String(a.counters)) },
        ], row.assignments) : el('div', { class: 'faint', style: 'font-size:11.5px;padding:6px 0' }, 'No departures assigned in window'));
      return panel(row.id + (row.airline ? ` · ${row.airline}` : ' · common use'), body,
        { sub: `${row.open}/${row.counters} open`, cls: row.overloaded ? 'panel-warn' : '' });
    })));
  }
  await draw();
  return draw;
}
