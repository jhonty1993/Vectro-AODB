// Module 04 — Resource Allocation · 10 — Airfield · 11 — Weather · 12 — GSE
import { get, send } from '../api.js';
import { el, panel, table, badge, fmtT, kpi, toast, spark, modal } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 04 — Resource Allocation (gate Gantt + terminal resources)
// ---------------------------------------------------------------------------

export async function resourcesView(root) {
  async function draw() {
    const [{ gates, allocations, now }, res] = await Promise.all([get('/api/allocations'), get('/api/resources')]);
    const t0 = now - 2 * 3600e3, t1 = now + 8 * 3600e3, span = t1 - t0;
    const x = ts => Math.max(0, Math.min(100, ((ts - t0) / span) * 100));

    const colorOf = code => (window.VECTRO.airlines.find(a => a.code === code) || {}).color || '#5a6884';

    const axis = el('div', { class: 'gantt-axis' });
    for (let h = 0; h < 10; h++) {
      axis.append(el('div', { class: 'hr' }, fmtT(t0 + h * 3600e3)));
    }
    const gantt = el('div', { class: 'gantt' }, axis);
    const occupiedNow = new Set();
    for (const g of gates) {
      const lane = el('div', { class: 'lane' });
      for (const a of allocations.filter(a => a.resource === g && a.end > t0 && a.start < t1)) {
        if (a.start <= now && a.end >= now) occupiedNow.add(g);
        const left = x(a.start), width = Math.max(1.2, x(a.end) - left);
        lane.append(el('div', {
          class: 'gantt-block',
          style: `left:${left}%;width:${width}%;background:${colorOf(a.airline)}cc`,
          title: `${a.label} · ${a.reg} · ${fmtT(a.start)}–${fmtT(a.end)}`,
        }, a.label));
      }
      gantt.append(el('div', { class: 'gantt-row' }, el('div', { class: 'lbl' }, g), lane));
    }
    gantt.append(el('div', { class: 'gantt-now', style: `left:calc(76px + (100% - 76px) * ${(now - t0) / span})` }));

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(gates.length, 'Contact gates', ''),
      kpi(occupiedNow.size, 'Occupied now', 'accent'),
      kpi(Math.round((occupiedNow.size / gates.length) * 100) + '%', 'Gate utilisation', 'teal'),
      kpi(res.stands.filter(s => s.type === 'REMOTE').length, 'Remote stands', ''),
      kpi(res.belts.length, 'Arrival belts', ''),
    ));
    root.append(panel('Gate allocation — rolling 10h window', el('div', { class: 'gantt-wrap' }, gantt),
      { sub: 'blocks coloured by airline · drag-free auto-planner' }));

    root.append(el('div', { class: 'grid cols-2', style: 'margin-top:14px' },
      panel('Check-in rows', table([
        { h: 'Row', r: c => el('span', { class: 'mono' }, c.id) },
        { h: 'Counters', r: c => el('span', { class: 'mono dim' }, `${c.open}/${c.counters} open`) },
        { h: 'Status', r: c => badge(c.status) },
      ], res.checkin), { flush: true }),
      panel('Arrival belts', table([
        { h: 'Belt', r: b => el('span', { class: 'mono' }, b.id) },
        { h: 'Terminal', r: b => b.terminal },
        { h: 'Status', r: b => badge(b.status) },
      ], res.belts), { flush: true })));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 10 — Airfield Operations
// ---------------------------------------------------------------------------

export async function airfieldView(root) {
  async function draw() {
    const [res, inspections, notams] = await Promise.all([
      get('/api/resources'), get('/api/inspections'), get('/api/notams')]);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(res.runways.filter(r => r.status === 'OPEN').length + '/' + res.runways.length, 'Runways open',
        res.runways.some(r => r.status === 'CLOSED') ? 'warn' : 'ok'),
      kpi(inspections.filter(i => i.status === 'SCHEDULED').length, 'Inspections due', ''),
      kpi(notams.filter(n => n.status === 'ACTIVE').length, 'Active NOTAMs', 'accent'),
      kpi('NIL', 'FOD reports (24h)', 'ok'),
    ));

    const toggleRunway = async r => {
      const next = r.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      const note = next === 'CLOSED' ? prompt(`Close RWY ${r.id} — reason:`, 'Ops requirement') : '';
      if (next === 'CLOSED' && note == null) return;
      try {
        await send(`/api/runways/${encodeURIComponent(r.id)}`, 'POST', { status: next, note: note || '' });
        toast(`RWY ${r.id} → ${next}`, next === 'CLOSED' ? 'warn' : '');
        draw();
      } catch (e) { toast(e.message, 'bad'); }
    };

    root.append(el('div', { class: 'grid cols-2' },
      panel('Runways', table([
        { h: 'Runway', r: r => el('span', { class: 'mono' }, r.id) },
        { h: 'Length', r: r => el('span', { class: 'mono dim' }, r.length + ' m') },
        { h: 'Mode', r: r => badge(r.mode) },
        { h: 'Status', r: r => badge(r.status) },
        { h: 'Note', r: r => el('span', { class: 'dim', style: 'font-size:11.5px' }, r.note || '') },
        { h: '', r: r => el('button', { class: 'btn sm' + (r.status === 'OPEN' ? ' danger' : ''), onclick: e => { e.stopPropagation(); toggleRunway(r); } }, r.status === 'OPEN' ? 'Close' : 'Reopen') },
      ], res.runways), { flush: true }),
      panel('Inspections', table([
        { h: 'ID', r: i => el('span', { class: 'mono dim' }, i.id) },
        { h: 'Type', r: i => i.type },
        { h: 'Due / done', r: i => el('span', { class: 'mono' }, fmtT(i.due)) },
        { h: 'Inspector', r: i => el('span', { class: 'dim' }, i.inspector) },
        { h: 'Status', r: i => badge(i.result || i.status, i.result === 'PASS' ? 'g' : undefined) },
      ], inspections), { flush: true }),
    ));
    root.append(el('div', { style: 'margin-top:14px' }, panel('Active NOTAMs', table([
      { h: 'NOTAM', r: n => el('span', { class: 'mono' }, n.id) },
      { h: 'Text', r: n => n.text },
      { h: 'Valid', r: n => el('span', { class: 'mono dim nowrap' }, `${fmtT(n.from)} → ${fmtT(n.to)}`) },
      { h: '', r: n => badge(n.status) },
    ], notams), { flush: true })));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 11 — Weather
// ---------------------------------------------------------------------------

export async function weatherView(root) {
  async function draw() {
    const wx = await get('/api/weather');
    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(wx.temp + '°C', 'Temperature', wx.temp <= 0 ? 'warn' : ''),
      kpi(`${wx.windSpd}${wx.gust ? 'G' + wx.gust : ''} kt`, `Wind ${String(wx.windDir).padStart(3, '0')}°`, wx.windSpd >= 20 ? 'warn' : ''),
      kpi(wx.vis === 9999 ? '10+ km' : (wx.vis / 1000).toFixed(1) + ' km', 'Visibility', wx.vis < 3000 ? 'warn' : ''),
      kpi('Q' + wx.qnh, 'QNH', ''),
      kpi(wx.deiceActive ? 'ACTIVE' : 'OFF', 'De-ice program', wx.deiceActive ? 'warn' : 'ok'),
    ));
    root.append(el('div', { class: 'grid cols-2' },
      panel('Current conditions', el('div', {},
        el('div', { class: 'wx-big' },
          el('div', { class: 'wx-temp' }, wx.temp + '°'),
          el('div', {},
            el('div', { style: 'font-size:16px;font-weight:650' }, wx.cond),
            el('div', { class: 'dim', style: 'margin-top:4px' }, `Dewpoint ${wx.dew}° · Cloud ${wx.cloud}`))),
        el('div', { class: 'metar-box' }, wx.metar),
        el('div', { class: 'faint', style: 'font-size:11px;margin-top:8px' }, 'Auto-refreshed every 30 minutes from AWOS')),
      ),
      panel('Trend — last 24h', el('div', {},
        el('div', { class: 'dim', style: 'font-size:11px;margin-bottom:4px' }, 'Temperature'),
        spark(wx.history.map(h => h.temp), 420, 60, 'var(--warn)'),
        el('div', { class: 'dim', style: 'font-size:11px;margin:10px 0 4px' }, 'Wind (kt)'),
        spark(wx.history.map(h => h.wind), 420, 60, 'var(--accent)'))),
    ));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 12 — GSE Fleet
// ---------------------------------------------------------------------------

export async function gseView(root) {
  let filter = '';
  async function draw() {
    const gse = await get('/api/gse');
    const types = [...new Set(gse.map(g => g.type))];
    const shown = filter ? gse.filter(g => g.type === filter) : gse;

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(gse.length, 'Fleet size', ''),
      kpi(gse.filter(g => g.status === 'IN_SERVICE').length, 'In service', 'accent'),
      kpi(gse.filter(g => g.status === 'MAINTENANCE').length, 'In maintenance', 'warn'),
      kpi(gse.filter(g => g.battery <= 20).length, 'Low battery', gse.some(g => g.battery <= 20) ? 'bad' : 'ok'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('div', { class: 'seg' }, [el('button', { class: filter === '' ? 'on' : '', onclick: () => { filter = ''; draw(); } }, 'All'),
        ...types.map(t => el('button', { class: filter === t ? 'on' : '', onclick: () => { filter = t; draw(); } }, t))])));
    root.append(panel(null, table([
      { h: 'Unit', r: g => el('span', { class: 'mono' }, g.id) },
      { h: 'Type', r: g => g.name },
      { h: 'Location', r: g => el('span', { class: 'dim' }, g.location) },
      { h: 'Operator', r: g => el('span', { class: 'dim' }, g.operator || '—') },
      { h: 'Charge', r: g => el('div', { style: 'display:flex;align-items:center;gap:7px' },
          el('div', { class: 'prog' + (g.battery <= 20 ? ' bad' : g.battery <= 40 ? ' warn' : ''), style: 'width:64px' }, el('div', { style: `width:${g.battery}%` })),
          el('span', { class: 'mono dim', style: 'font-size:11px' }, g.battery + '%')) },
      { h: 'Hours', r: g => el('span', { class: 'mono dim' }, g.hours.toLocaleString()) },
      { h: 'Status', r: g => badge(g.status) },
    ], shown), { flush: true }));
  }
  await draw();
  return draw;
}
