// Module 05 — Turnaround AI (apron computer vision) · Module 06 — A-CDM
import { get } from '../api.js';
import { el, panel, table, badge, fmtT, modal, kpi } from '../ui.js';

const RISK_CLS = { LOW: 'g', MED: 'y', HIGH: 'r' };

function turnDetail(t) {
  const now = Date.now();
  const rows = t.milestones.map(m => {
    const done = m.actual != null;
    const late = done ? m.actual - m.planned > 5 * 60000 : m.planned < now;
    return el('div', { class: `ms-row ${done ? 'done' : ''} ${done && late ? 'late' : ''}` },
      el('span', { class: 'ms-dot' }),
      el('span', { class: 'ms-name' }, m.name),
      badge(m.src, m.src === 'CV' ? 'p' : ''),
      el('span', { class: 'mono faint', style: 'width:52px;text-align:right' }, fmtT(m.planned)),
      el('span', { class: 'mono', style: `width:52px;text-align:right;color:${done ? (late ? 'var(--warn)' : 'var(--ok)') : 'var(--faint)'}` },
        done ? fmtT(m.actual) : '—'));
  });
  modal(`Turnaround ${t.arrFltNo} → ${t.depFltNo} @ ${t.stand}`, el('div', {},
    el('div', { class: 'kv', style: 'margin-bottom:14px' },
      el('dt', {}, 'Aircraft'), el('dd', {}, `${t.acType} · ${t.reg}`),
      el('dt', {}, 'Inbound'), el('dd', {}, `${t.arrFltNo} from ${t.arrCity} · SIBT ${fmtT(t.sibt)} / EIBT ${fmtT(t.eibt)}`),
      el('dt', {}, 'Outbound'), el('dd', {}, `${t.depFltNo} to ${t.depCity} · SOBT ${fmtT(t.sobt)} / EOBT ${fmtT(t.eobt)}`),
      el('dt', {}, 'TOBT / TSAT'), el('dd', {}, `${fmtT(t.tobt)} / ${fmtT(t.tsat)}`),
      el('dt', {}, 'Risk'), el('dd', {}, badge(t.risk, RISK_CLS[t.risk])),
    ),
    el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
      el('div', { class: `prog ${t.risk === 'HIGH' ? 'bad' : t.risk === 'MED' ? 'warn' : ''}`, style: 'flex:1' }, el('div', { style: `width:${t.progress}%` })),
      el('span', { class: 'mono dim' }, t.progress + '%')),
    el('h3', { class: 'sec', style: 'margin-top:4px' }, 'Milestones — planned vs detected'),
    el('div', {}, rows),
    el('div', { class: 'faint', style: 'font-size:11px;margin-top:12px' },
      'Source CV = detected by Vectro apron computer vision · MANUAL = ground handler input')), { wide: true });
}

export async function turnaroundView(root) {
  async function draw() {
    const turns = await get('/api/turnarounds');
    const now = Date.now();
    const active = turns.filter(t => t.status === 'IN_PROGRESS');
    const upcoming = turns.filter(t => t.status === 'PLANNED' && t.sibt < now + 4 * 3600e3);
    const done = turns.filter(t => t.status === 'COMPLETED');

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(active.length, 'In progress', 'accent'),
      kpi(active.filter(t => t.risk === 'HIGH').length, 'At risk (EOBT)', active.some(t => t.risk === 'HIGH') ? 'bad' : 'ok'),
      kpi(upcoming.length, 'Starting < 4h', ''),
      kpi(done.length, 'Completed today', 'teal'),
      kpi('22', 'CV detections / turn', 'teal'),
    ));

    const card = t => el('div', { class: 'turn-card', onclick: () => turnDetail(t) },
      el('div', { class: 'hd' },
        el('span', { class: 'turn-flights' }, `${t.arrFltNo} → ${t.depFltNo}`),
        badge(t.risk, RISK_CLS[t.risk])),
      el('div', { class: 'turn-meta' },
        `${t.stand} · ${t.acType} ${t.reg} · EIBT ${fmtT(t.eibt)} → EOBT ${fmtT(t.eobt)}`),
      el('div', { style: 'display:flex;align-items:center;gap:9px' },
        el('div', { class: `prog ${t.risk === 'HIGH' ? 'bad' : t.risk === 'MED' ? 'warn' : ''}`, style: 'flex:1' },
          el('div', { style: `width:${t.progress}%` })),
        el('span', { class: 'mono dim', style: 'font-size:11px' }, t.progress + '%')));

    root.append(el('h3', { class: 'sec' }, `Live on the apron (${active.length})`));
    root.append(active.length
      ? el('div', { class: 'grid cols-3' }, active.map(card))
      : el('div', { class: 'empty' }, 'No turnarounds in progress right now'));

    root.append(el('h3', { class: 'sec' }, 'Next up'));
    root.append(panel(null, table([
      { h: 'Rotation', r: t => el('span', { class: 'mono' }, `${t.arrFltNo} → ${t.depFltNo}`) },
      { h: 'Stand', r: t => el('span', { class: 'mono' }, t.stand) },
      { h: 'A/C', r: t => el('span', { class: 'mono dim' }, `${t.acType} ${t.reg}`) },
      { h: 'EIBT', r: t => el('span', { class: 'mono' }, fmtT(t.eibt)) },
      { h: 'EOBT', r: t => el('span', { class: 'mono' }, fmtT(t.eobt)) },
      { h: 'Status', r: t => badge(t.status) },
    ], upcoming.slice(0, 12), { onRow: turnDetail, empty: 'Nothing scheduled in the next 4 hours' }), { flush: true }));
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 06 — A-CDM pre-departure sequence
// ---------------------------------------------------------------------------

export async function acdmView(root) {
  async function draw() {
    const turns = await get('/api/turnarounds');
    const now = Date.now();
    const seq = turns
      .filter(t => t.status !== 'CANCELLED' && t.eobt > now - 10 * 60000 && t.eobt < now + 6 * 3600e3)
      .sort((a, b) => a.tsat - b.tsat);

    const within = seq.filter(t => Math.abs(t.tsat - t.tobt) <= 5 * 60000).length;
    const compliance = seq.length ? Math.round((within / seq.length) * 100) : 100;

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(seq.length, 'In pre-departure sequence', 'accent'),
      kpi(compliance + '%', 'TOBT/TSAT compliance', compliance >= 85 ? 'ok' : 'warn'),
      kpi(seq.filter(t => t.risk === 'HIGH').length, 'TOBT at risk', seq.some(t => t.risk === 'HIGH') ? 'bad' : 'ok'),
      kpi('A-CDM', 'Milestone approach', 'teal'),
    ));

    root.append(panel('Pre-departure sequence (ordered by TSAT)', table([
      { h: '#', r: t => el('span', { class: 'mono faint' }, String(seq.indexOf(t) + 1)) },
      { h: 'Flight', r: t => el('span', { class: 'mono' }, t.depFltNo) },
      { h: 'Dest', r: t => t.depCity },
      { h: 'Stand', r: t => el('span', { class: 'mono dim' }, t.stand) },
      { h: 'SOBT', r: t => el('span', { class: 'mono' }, fmtT(t.sobt)) },
      { h: 'EOBT', r: t => el('span', { class: 'mono' }, fmtT(t.eobt)) },
      { h: 'TOBT', r: t => el('span', { class: 'mono', style: 'color:var(--accent)' }, fmtT(t.tobt)) },
      { h: 'TSAT', r: t => el('span', { class: 'mono', style: 'color:var(--accent2)' }, fmtT(t.tsat)) },
      { h: 'Turn', r: t => el('div', { class: 'prog', style: 'width:70px' }, el('div', { style: `width:${t.progress}%` })) },
      { h: 'Risk', r: t => badge(t.risk, RISK_CLS[t.risk]) },
    ], seq, { onRow: t => location.hash = '#/turnaround', empty: 'Sequence empty' }), { flush: true, sub: 'TOBT = target off-block · TSAT = target start-up approval' }));

    root.append(el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:12px' },
      'Vectro A-CDM exchanges these milestones with the ANSP network so en-route slots match what is really happening on the stand.'));
  }
  await draw();
  return draw;
}
