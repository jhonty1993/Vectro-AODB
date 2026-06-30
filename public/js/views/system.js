// Module 17 — Alert Center · 18 — Admin & Settings
import { get, send } from '../api.js';
import { el, panel, table, badge, kpi, toast, ago, fmtT, money } from '../ui.js';

// ---------------------------------------------------------------------------
// Module 17 — Alert Center (plus full activity stream)
// ---------------------------------------------------------------------------

export async function alertsView(root) {
  let tab = 'alerts';
  async function draw() {
    const [alerts, events] = await Promise.all([get('/api/alerts'), get('/api/events')]);
    const open = alerts.filter(a => !a.ack);

    root.innerHTML = '';
    root.append(el('div', { class: 'kpis' },
      kpi(open.length, 'Unacknowledged', open.length ? 'warn' : 'ok'),
      kpi(open.filter(a => a.sev === 'HIGH').length, 'High severity', open.some(a => a.sev === 'HIGH') ? 'bad' : 'ok'),
      kpi(alerts.length, 'Total (rolling)', ''),
      kpi(events.length, 'Activity events', 'accent'),
    ));
    root.append(el('div', { class: 'toolbar' },
      el('div', { class: 'seg' },
        el('button', { class: tab === 'alerts' ? 'on' : '', onclick: () => { tab = 'alerts'; draw(); } }, `Alerts (${open.length})`),
        el('button', { class: tab === 'feed' ? 'on' : '', onclick: () => { tab = 'feed'; draw(); } }, 'Activity stream')),
      el('div', { class: 'spacer' }),
      tab === 'alerts' && open.length > 0 && el('button', { class: 'btn', onclick: async () => {
        await send('/api/alerts/ack-all', 'POST', {});
        toast('All alerts acknowledged'); draw();
      } }, 'Acknowledge all')));

    if (tab === 'alerts') {
      root.append(panel(null, alerts.length ? el('div', {}, alerts.slice(0, 60).map(a =>
        el('div', { class: 'alert-row' + (a.ack ? ' acked' : '') },
          badge(a.sev),
          el('div', { class: 'body' },
            el('div', {}, a.msg),
            el('div', { class: 'when' }, `${a.module} · ${ago(a.ts)}`)),
          !a.ack && el('button', { class: 'btn sm', onclick: async () => {
            await send(`/api/alerts/${a.id}/ack`, 'POST', {});
            draw();
          } }, 'Ack'))))
        : el('div', { class: 'empty' }, 'All clear — no alerts'), { flush: true }));
    } else {
      root.append(panel(null, el('div', { class: 'feed' }, events.map(ev =>
        el('div', { class: `feed-item ${ev.sev === 'cv' ? 'cv' : ev.sev === 'warn' ? 'warn' : ''}` },
          el('span', { class: 't' }, fmtT(ev.ts)),
          el('span', { class: 'mod' }, badge(ev.module, ev.sev === 'cv' ? 'p' : '')),
          el('span', { class: 'msg' }, ev.msg)))), { flush: true }));
    }
  }
  await draw();
  return draw;
}

// ---------------------------------------------------------------------------
// Module 18 — Admin & Settings
// ---------------------------------------------------------------------------

export async function settingsView(root) {
  const { config } = await get('/api/bootstrap');
  root.innerHTML = '';
  root.append(el('div', { class: 'grid cols-2' },
    panel('Airport profile', el('div', { class: 'kv' },
      el('dt', {}, 'Airport'), el('dd', {}, `${config.airport.name}`),
      el('dt', {}, 'Codes'), el('dd', {}, `${config.airport.iata} / ${config.airport.icao}`),
      el('dt', {}, 'Timezone'), el('dd', {}, config.airport.tz),
      el('dt', {}, 'Currency'), el('dd', {}, config.currency),
      el('dt', {}, 'Operator'), el('dd', {}, config.operator),
      el('dt', {}, 'Platform'), el('dd', {}, `${config.platform} v1.0 — The Airport Operating System`),
    )),
    panel('Users & roles', table([
      { h: 'Name', r: u => u.name },
      { h: 'Email', r: u => el('span', { class: 'mono dim' }, u.email) },
      { h: 'Role', r: u => badge(u.role, u.role === 'Platform Owner' ? 'p' : 'b') },
    ], config.users), { flush: true }),
    panel('Integrations', el('div', {}, [
      ['AODB feed (internal)', 'CONNECTED', 'g'], ['SSIM schedule import', 'CONNECTED', 'g'],
      ['A-CDM / NAV CANADA', 'CONNECTED', 'g'], ['Apron CV cameras (42)', 'STREAMING', 'p'],
      ['AWOS weather', 'CONNECTED', 'g'], ['BHS / sortation PLC', 'CONNECTED', 'g'],
      ['WorldTracer', 'CONNECTED', 'g'], ['Billing → ERP export', 'STANDBY', 'y'],
    ].map(([name, st, cls]) => el('div', { style: 'display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(31,41,64,.5)' },
      el('span', {}, name), badge(st, cls))))),
    panel('Operating day', el('div', {},
      el('p', { class: 'dim', style: 'margin-bottom:12px;font-size:12.5px' },
        'Regenerate the simulated operating day: fresh schedule, turnarounds, resources and live events. The console reloads automatically.'),
      el('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('Reseed the entire operating day? Current data will be replaced.')) return;
        await send('/api/admin/reseed', 'POST', {});
        toast('Reseeding…');
      } }, '↻ Reseed operating day'))),
  ));
  return null;
}
