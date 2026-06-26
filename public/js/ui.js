// DOM + formatting helpers shared by all 18 modules

export let TZ = 'America/Toronto';
export function setTZ(tz) { TZ = tz; }

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export const fmtT = ts => ts == null ? '—'
  : new Date(ts).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
export const fmtDT = ts => ts == null ? '—'
  : new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const money = n => '$' + (+n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------

const STATUS_CLASS = {
  SCHEDULED: '', EN_ROUTE: 'b', APPROACH: 'b', LANDED: 't', ON_STAND: 'g',
  BOARDING: 'b', FINAL_CALL: 'y', GATE_CLOSED: 'y', DEPARTED: 'g',
  DELAYED: 'y', CANCELLED: 'r', DIVERTED: 'r',
  OK: 'g', OPEN: 'g', AVAILABLE: 'g', IN_SERVICE: 'b', IDLE: '', MAINTENANCE: 'y',
  DEGRADED: 'y', DOWN: 'r', CLOSED: 'r', STANDBY: '', MAINT: 'y', MIXED: 'b', ARR: 't', DEP: 'b',
  PLANNED: '', IN_PROGRESS: 'b', COMPLETED: 'g',
  LOW: 'g', MED: 'y', MEDIUM: 'y', HIGH: 'r',
  REPORTED: 'y', INVESTIGATING: 'b', MITIGATED: 't', P1: 'r', P2: 'y', P3: '',
  ON_HOLD: 'y', ON_DUTY: 'g', BREAK: 'y', OFF: '',
  TRACING: 'y', LOCATED: 'b', FORWARDED: 't', DELIVERED: 'g',
  UNINVOICED: 'y', INVOICED: 'g', ISSUED: 'b', ACTIVE: 'y', PASS: 'g',
};
export const badge = (text, cls) =>
  el('span', { class: `bdg ${cls != null ? cls : (STATUS_CLASS[text] || '')}` }, String(text).replace(/_/g, ' '));

export function table(cols, rows, opts = {}) {
  const t = el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {}, cols.map(c => el('th', { class: c.cls || '' }, c.h)))),
    el('tbody', {}, rows.length ? rows.map(r =>
      el('tr', { class: opts.onRow ? 'click' : '', onclick: opts.onRow ? () => opts.onRow(r) : null },
        cols.map(c => {
          const v = c.r(r);
          return el('td', { class: c.cls || '' }, v == null ? '—' : v);
        }))
    ) : el('tr', {}, el('td', { colspan: cols.length, class: 'empty' }, opts.empty || 'Nothing to show')))
  );
  return t;
}

export function panel(title, body, opts = {}) {
  return el('div', { class: 'panel' + (opts.cls ? ' ' + opts.cls : '') },
    title != null && el('div', { class: 'panel-h' }, el('span', {}, title), opts.right || (opts.sub ? el('span', { class: 'sub' }, opts.sub) : null)),
    el('div', { class: 'panel-b' + (opts.flush ? ' flush' : '') }, body));
}

export function kpi(value, label, cls = '') {
  return el('div', { class: `kpi ${cls}` }, el('div', { class: 'v' }, String(value)), el('div', { class: 'l' }, label));
}

// ---------------------------------------------------------------------------

export function modal(title, body, opts = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const close = () => { root.innerHTML = ''; };
  const box = el('div', { class: 'modal' + (opts.wide ? ' wide' : '') },
    el('div', { class: 'modal-h' }, el('span', {}, title), el('button', { class: 'modal-x', onclick: close }, '✕')),
    el('div', { class: 'modal-b' }, body),
    opts.actions ? el('div', { class: 'modal-f' }, opts.actions(close)) : null);
  const back = el('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } }, box);
  root.append(back);
  return close;
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: `toast ${kind}` }, msg);
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, 4200);
}

export function spark(values, w = 120, h = 28, color = 'var(--accent2)') {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(' ');
  const svg = el('svg', { class: 'spark', width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
  return svg;
}

export function airlineDot(color) {
  return el('span', { class: 'airline-dot', style: `background:${color || '#888'}` });
}

export function formRow(label, input) {
  return el('div', { class: 'form-row' }, el('label', {}, label), input);
}

export function flightStatus(f) {
  return badge(f.status === 'DELAYED' && f.delay > 0 ? `DELAYED ${f.delay}m` : f.status, STATUS_CLASS[f.status]);
}
