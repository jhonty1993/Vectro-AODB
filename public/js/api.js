// API client + SSE stream
export async function get(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

export async function send(path, method = 'POST', body) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

const listeners = new Map(); // type -> Set<fn>
let es = null;

export function stream(onStateChange) {
  let retryMs = 1000;
  function connect() {
    if (es) { try { es.close(); } catch {} }
    es = new EventSource('/api/stream');
    es.onopen = () => { retryMs = 1000; onStateChange && onStateChange(true); };
    es.onerror = () => {
      onStateChange && onStateChange(false);
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30000);
    };
    for (const type of ['tick', 'alert', 'event', 'flight', 'reseed', 'hello', 'alloc']) {
      es.addEventListener(type, e => {
        const set = listeners.get(type);
        if (!set) return;
        let data = {};
        try { data = JSON.parse(e.data); } catch {}
        for (const fn of set) fn(data);
      });
    }
  }
  connect();
}

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}
