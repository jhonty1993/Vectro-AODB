// Vectro Landing Fees Portal — airline self-service
import { el, fmtT, fmtDT, money, table, panel, modal, toast, TZ } from './ui.js';

const STORAGE_KEY = 'vectro_portal_key';

function api(path, opts = {}) {
  const key = localStorage.getItem(STORAGE_KEY);
  const headers = { ...(opts.headers || {}) };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...opts, headers }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  });
}

function logout() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function chargeDetail(c) {
  modal('Movement charge', el('div', {},
    el('div', { class: 'kv' },
      el('dt', {}, 'Reference'), el('dd', { class: 'mono' }, c.ref),
      el('dt', {}, 'Flight'), el('dd', {}, c.flight),
      el('dt', {}, 'Aircraft'), el('dd', {}, `${c.acType} · ${c.reg}`),
      el('dt', {}, 'Total'), el('dd', {}, money(c.total)),
      el('dt', {}, 'Landing fee'), el('dd', {}, money(c.landingFee)),
      el('dt', {}, 'Status'), el('dd', {}, c.status),
    ),
    panel('Rated lines', table([
      { h: 'Description', r: l => l.desc },
      { h: 'Amount', cls: 'right', r: l => el('span', { class: 'mono' }, money(l.amount)) },
    ], c.lines), { flush: true }),
  ));
}

async function estimateForm(root, aircraft) {
  const acTypes = Object.keys(aircraft).sort();
  const sel = el('select', {}, ...acTypes.map(t => el('option', { value: t }, `${t} — ${aircraft[t].name}`)));
  const night = el('input', { type: 'checkbox' });
  const out = el('div', { class: 'portal-card', style: 'margin-top:12px;display:none' });
  const form = el('div', { class: 'portal-estimate-grid' },
    el('div', {},
      el('label', {}, 'Aircraft type'),
      sel,
      el('label', {}, 'Night movement (23:00–06:59)'),
      el('div', {}, night),
    ),
    el('div', { style: 'display:flex;align-items:flex-end' },
      el('button', {
        class: 'primary',
        style: 'width:100%;padding:10px;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer',
        onclick: async () => {
          try {
            const est = await api('/api/portal/estimate', {
              method: 'POST',
              body: JSON.stringify({ acType: sel.value, night: night.checked }),
            });
            out.style.display = 'block';
            out.innerHTML = '';
            out.append(
              el('h2', {}, 'Estimated movement charges'),
              el('div', { class: 'sub' }, `${est.acType} · ${est.mtow}t MTOW · ${est.pax} pax`),
              table([
                { h: 'Line', r: l => l.desc },
                { h: 'Amount', cls: 'right', r: l => el('span', { class: 'mono' }, money(l.amount)) },
              ], est.lines),
              el('div', { style: 'text-align:right;margin-top:10px;font-weight:700' }, `Total: ${money(est.total)} ${est.currency}`),
            );
          } catch (e) { toast(e.message, 'bad'); }
        },
      }, 'Calculate estimate'),
    ),
  );
  root.append(panel('Landing fee calculator', el('div', {}, form, out), { sub: 'Pre-arrival estimate using published tariff' }));
}

async function dashboard(root) {
  const [me, charges, invoices, tariff] = await Promise.all([
    api('/api/portal/me'),
    api('/api/portal/charges'),
    api('/api/portal/invoices'),
    api('/api/portal/tariff'),
  ]);

  root.append(el('div', { class: 'portal-toolbar' },
    el('div', {}, el('strong', {}, me.airlineName), el('span', { style: 'color:#64748b;margin-left:8px' }, me.airline)),
    el('div', {},
      el('button', { onclick: () => location.href = '/' }, 'AODB Console'),
      el('button', { onclick: logout, style: 'margin-left:8px' }, 'Sign out'),
    ),
  ));

  root.append(el('div', { class: 'portal-kpis' },
    el('div', { class: 'portal-kpi' }, el('div', { class: 'val' }, money(me.landingFeesTotal)), el('div', { class: 'lbl' }, 'Landing fees (period)')),
    el('div', { class: 'portal-kpi' }, el('div', { class: 'val' }, String(me.movements)), el('div', { class: 'lbl' }, 'Movements charged')),
    el('div', { class: 'portal-kpi' }, el('div', { class: 'val' }, money(me.uninvoicedTotal)), el('div', { class: 'lbl' }, 'Uninvoiced')),
    el('div', { class: 'portal-kpi' }, el('div', { class: 'val' }, money(me.invoicedTotal)), el('div', { class: 'lbl' }, 'Invoiced')),
  ));

  await estimateForm(root, tariff.aircraft);

  root.append(panel('Published landing tariff', el('div', { class: 'kv' },
    el('dt', {}, 'Landing fee'), el('dd', {}, `${money(me.tariffs.landingPerTonne)} / tonne MTOW (min ${money(me.tariffs.landingMinimum)})`),
    el('dt', {}, 'Terminal fee'), el('dd', {}, `${money(me.tariffs.terminalPerDepPax)} / departing pax`),
    el('dt', {}, 'Currency'), el('dd', {}, me.currency),
  ), { sub: `${me.airport.name} (${me.airport.iata})` }));

  root.append(panel('Your movement charges', table([
    { h: 'Time', r: c => el('span', { class: 'mono' }, fmtT(c.ts)) },
    { h: 'Flight', r: c => el('span', { class: 'mono' }, c.flight) },
    { h: 'Landing', cls: 'right', r: c => el('span', { class: 'mono' }, money(c.landingFee)) },
    { h: 'Total', cls: 'right', r: c => el('span', { class: 'mono' }, money(c.total)) },
    { h: 'Status', r: c => c.status },
  ], charges, { onRow: chargeDetail, empty: 'No charges yet — fees post automatically after movements' }), { flush: true }));

  root.append(panel('Invoices', table([
    { h: 'Invoice', r: i => el('span', { class: 'mono' }, i.id) },
    { h: 'Date', r: i => fmtDT(i.ts) },
    { h: 'Movements', cls: 'right', r: i => i.movements },
    { h: 'Total', cls: 'right', r: i => el('span', { class: 'mono' }, money(i.total)) },
    { h: 'Terms', r: i => i.terms || '—' },
  ], invoices, { empty: 'No invoices issued yet' }), { flush: true }));
}

function loginView(root, airport) {
  const err = el('div', { class: 'portal-error', hidden: true });
  const keyInput = el('input', { type: 'password', placeholder: 'Paste your airline API key', autocomplete: 'off' });
  root.append(el('div', { class: 'portal-card portal-login' },
    el('h2', {}, 'Airline sign-in'),
    el('div', { class: 'sub' }, `Access charges and landing fees for ${airport?.name || 'your airport'}`),
    el('label', {}, 'API key'),
    keyInput,
    err,
    el('button', {
      onclick: async () => {
        err.hidden = true;
        try {
          localStorage.setItem(STORAGE_KEY, keyInput.value.trim());
          await api('/api/portal/me');
          location.reload();
        } catch (e) {
          localStorage.removeItem(STORAGE_KEY);
          err.hidden = false;
          err.textContent = e.message;
        }
      },
    }, 'Sign in to portal'),
    el('div', { class: 'portal-note' },
      'Your airport issues API keys per airline. Set ',
      el('code', {}, 'PORTAL_API_KEYS'),
      ' on the server (Railway variables). Demo keys in local dev: ',
      el('code', {}, 'demo-ac-key'),
      ', ',
      el('code', {}, 'demo-ws-key'),
      ', ',
      el('code', {}, 'demo-pd-key'),
      '.',
    ),
  ));
}

async function boot() {
  const main = document.getElementById('portal-main');
  const tariff = await fetch('/api/portal/tariff').then(r => r.json());
  document.getElementById('portal-airport').textContent =
    `${tariff.airport.iata} · ${tariff.airport.name}`;
  document.title = `Vectro · ${tariff.airport.iata} Landing Fees`;

  if (!localStorage.getItem(STORAGE_KEY)) {
    loginView(main, tariff.airport);
    return;
  }
  try {
    await dashboard(main);
  } catch (e) {
    localStorage.removeItem(STORAGE_KEY);
    loginView(main, tariff.airport);
  }
}

boot().catch(e => {
  document.getElementById('portal-main').innerHTML = `<div class="portal-card portal-error">Portal unavailable: ${e.message}</div>`;
});
