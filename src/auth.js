'use strict';

const crypto = require('crypto');

// Portal keys: PORTAL_API_KEYS='{"AC":"key-...","WS":"key-..."}'
// Admin console: ADMIN_API_KEY (optional, for protected admin routes)

let portalKeys = null;
let adminKey = null;

function loadKeys() {
  if (portalKeys) return;
  portalKeys = {};
  try {
    const raw = process.env.PORTAL_API_KEYS || '{}';
    const parsed = JSON.parse(raw);
    for (const [airline, key] of Object.entries(parsed)) {
      if (key) portalKeys[String(key)] = String(airline).toUpperCase();
    }
  } catch (e) {
    console.warn('[auth] invalid PORTAL_API_KEYS JSON:', e.message);
  }
  // Demo keys when unset (local dev only)
  if (!Object.keys(portalKeys).length && process.env.NODE_ENV !== 'production') {
    portalKeys['demo-ac-key'] = 'AC';
    portalKeys['demo-ws-key'] = 'WS';
    portalKeys['demo-pd-key'] = 'PD';
  }
  adminKey = process.env.ADMIN_API_KEY || null;
}

function tokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return (req.headers['x-api-key'] || '').trim() || null;
}

function authenticatePortal(req) {
  loadKeys();
  const token = tokenFromReq(req);
  if (!token) return null;
  const airline = portalKeys[token];
  if (!airline) return null;
  return { airline, token, role: 'airline' };
}

function authenticateAdmin(req) {
  loadKeys();
  const token = tokenFromReq(req);
  if (!token) return false;
  if (adminKey && token === adminKey) return true;
  return false;
}

function portalKeyHint() {
  loadKeys();
  return Object.entries(portalKeys).map(([key, airline]) => ({ airline, keyPreview: key.slice(0, 6) + '…' }));
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

module.exports = { authenticatePortal, authenticateAdmin, portalKeyHint, hashToken, loadKeys };
