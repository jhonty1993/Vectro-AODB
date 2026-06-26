// Module 13 — Maintenance & Assets · 14 — Safety (SMS)
import { get, send } from '../api.js';
import { el, panel, table, badge, kpi, modal, toast, formRow, ago, fmtDT } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 13 — Maintenance & Assets
// ---------------------------------------------------------------------------

function newWorkOrder(assets, after) {
  const title = el('input', { class: 'input', placeholder: 'What needs doing?' });
  const asset = el('select', { class: 'input' }, assets.map(a => el('option', { value: a.id }, `${a.id} — ${a.name} (${a.location})`)));
  const priority = el('select', { class: 'input' }, ['P3', 'P2', 'P1'].map(p => el('option', {}, p)));
  const assignee = el('input', { class: 'input', placeholder: 'Technician' });
  modal('New work order', el('div', {},
    formRow('Title', title), formRow('Asset', asset), formRow('Priority', priority), formRow('Assignee', assignee)),
    { actions: close => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => {
        const a = assets.find(x => x.id === asset.value);
        try {
          const wo = await send('/api/workorders', 'POST', {
            title: title.value || 'New work order', asset: asset.value, assetName: a?.name,
            location: a?.location, priority: priority.value, assignee: assignee.value || 'Unassigned' });
          toast(`${wo.id} created`); close(); after();
        } catch (e) { toast(e.message, 'bad'); }
      } }, 'Create'),
    ] });
}

export async function maintenanceView(root) {
  let tab = 'wo';
  async function draw() {
    const [workorders, assets] = await Promise.all([get('/api/workorders'), get('/api/assets')]);
    const open = workorders.filter(w => w.status !== 'COMPLETED');
    const down = assets.filter(a => a.status === 'DOWN');

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(open.length, 'Open work orders', open.some(w => w.priority === 'P1') ? 'warn' : ''),
      kpi(open.filter(w => w.priority === 'P1').length, 'P1 critical', open.some(w => w.priority === 'P1') ? 'bad' : 'ok'),
      kpi(down.length, 'Assets down', down.length ? 'bad' : 'ok'),
      kpi(Math.round(assets.reduce((s, a) => s + a.health, 0) / assets.length) + '%', 'Avg asset health', 'teal'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('div', { class: 'seg' },
        el('button', { class: tab === 'wo' ? 'on' : '', onclick: () => { tab = 'wo'; draw(); } }, `Work orders (${workorders.length})`),
        el('button', { class: tab === 'assets' ? 'on' : '', onclick: () => { tab = 'assets'; draw(); } }, `Asset registry (${assets.length})`)),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => newWorkOrder(assets, draw) }, '+ Work order')));

    if (tab === 'wo') {
      const advance = async (wo, status) => {
        try { await send(`/api/workorders/${wo.id}`, 'PATCH', { status }); toast(`${wo.id} → ${status}`); draw(); }
        catch (e) { toast(e.message, 'bad'); }
      };
      root.append(panel(null, table([
        { h: 'WO', r: w => el('span', { class: 'mono' }, w.id) },
        { h: 'Title', r: w => w.title },
        { h: 'Asset', r: w => el('span', { class: 'mono dim' }, w.asset) },
        { h: 'Location', r: w => el('span', { class: 'dim' }, w.location) },
        { h: 'Pri', r: w => badge(w.priority) },
        { h: 'Assignee', r: w => el('span', { class: 'dim' }, w.assignee) },
        { h: 'Due', r: w => el('span', { class: 'mono dim nowrap' }, fmtDT(w.due)) },
        { h: 'Status', r: w => badge(w.status) },
        { h: '', r: w => w.status === 'COMPLETED' ? null : el('div', { style: 'display:flex;gap:5px' },
            w.status === 'OPEN' && el('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); advance(w, 'IN_PROGRESS'); } }, 'Start'),
            el('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); advance(w, 'COMPLETED'); } }, 'Complete')) },
      ], workorders), { flush: true }));
    } else {
      root.append(panel(null, table([
        { h: 'Asset', r: a => el('span', { class: 'mono' }, a.id) },
        { h: 'Type', r: a => a.name },
        { h: 'Location', r: a => el('span', { class: 'dim' }, a.location) },
        { h: 'Health', r: a => el('div', { style: 'display:flex;align-items:center;gap:7px' },
            el('div', { class: 'prog' + (a.health < 70 ? ' warn' : ''), style: 'width:70px' }, el('div', { style: `width:${a.health}%` })),
            el('span', { class: 'mono dim', style: 'font-size:11px' }, a.health + '%')) },
        { h: 'Last service', r: a => el('span', { class: 'mono dim' }, ago(a.lastService)) },
        { h: 'Status', r: a => badge(a.status) },
      ], assets), { flush: true }));
    }
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 14 — Safety Management System
// ---------------------------------------------------------------------------

function newIncident(after) {
  const type = el('input', { class: 'input', placeholder: 'e.g. FOD found on taxiway' });
  const location = el('input', { class: 'input', placeholder: 'e.g. Apron V' });
  const severity = el('select', { class: 'input' }, ['LOW', 'MEDIUM', 'HIGH'].map(s => el('option', {}, s)));
  const description = el('textarea', { class: 'input', rows: 3, placeholder: 'What happened?' });
  modal('Report safety occurrence', el('div', {},
    formRow('Occurrence type', type), formRow('Location', location),
    formRow('Severity', severity), formRow('Description', description)),
    { actions: close => [
      el('button', { class: 'btn', onclick: close }, 'Cancel'),
      el('button', { class: 'btn primary', onclick: async () => {
        try {
          const inc = await send('/api/incidents', 'POST', {
            type: type.value || 'General report', location: location.value,
            severity: severity.value, description: description.value, reportedBy: 'AOCC console' });
          toast(`${inc.id} filed`); close(); after();
        } catch (e) { toast(e.message, 'bad'); }
      } }, 'File report'),
    ] });
}

export async function safetyView(root) {
  async function draw() {
    const incidents = await get('/api/incidents');
    const openInc = incidents.filter(i => i.status !== 'CLOSED');

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(openInc.length, 'Open occurrences', openInc.some(i => i.severity === 'HIGH') ? 'warn' : ''),
      kpi(incidents.filter(i => i.severity === 'HIGH' && i.status !== 'CLOSED').length, 'High severity', incidents.some(i => i.severity === 'HIGH' && i.status !== 'CLOSED') ? 'bad' : 'ok'),
      kpi(incidents.filter(i => i.status === 'CLOSED').length, 'Closed (30d)', 'teal'),
      kpi('0', 'Lost-time injuries', 'ok'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('span', { class: 'dim', style: 'font-size:12px' }, 'ICAO Annex 19-aligned occurrence log'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn primary', onclick: () => newIncident(draw) }, '+ Report occurrence')));

    const advance = async (i, status) => {
      try { await send(`/api/incidents/${i.id}`, 'PATCH', { status }); toast(`${i.id} → ${status}`); draw(); }
      catch (e) { toast(e.message, 'bad'); }
    };
    const NEXT = { REPORTED: 'INVESTIGATING', INVESTIGATING: 'MITIGATED', MITIGATED: 'CLOSED' };
    root.append(panel(null, table([
      { h: 'Case', r: i => el('span', { class: 'mono' }, i.id) },
      { h: 'Occurrence', r: i => i.type },
      { h: 'Location', r: i => el('span', { class: 'dim' }, i.location) },
      { h: 'Severity', r: i => badge(i.severity) },
      { h: 'Reported', r: i => el('span', { class: 'mono dim nowrap' }, ago(i.ts)) },
      { h: 'By', r: i => el('span', { class: 'dim' }, i.reportedBy) },
      { h: 'Status', r: i => badge(i.status) },
      { h: '', r: i => NEXT[i.status] ? el('button', { class: 'btn sm', onclick: e => { e.stopPropagation(); advance(i, NEXT[i.status]); } }, '→ ' + NEXT[i.status].replace('_', ' ')) : null },
    ], incidents), { flush: true }));
  }
  await draw();
  return draw;
}
