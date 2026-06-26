'use strict';

const { MIN } = require('./util');

function localHour(ts, tz) {
  return Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hour12: false, timeZone: tz || 'UTC' }).format(new Date(ts)));
}

function calcLandingFee(tariffs, mtow) {
  return Math.round(Math.max(tariffs.landingMinimum, mtow * tariffs.landingPerTonne) * 100) / 100;
}

function estimateMovement(db, { acType, mtow, pax, body, night }) {
  const t = db.config.tariffs;
  const ac = db.aircraft[acType] || {};
  const weight = mtow || ac.mtow || 75;
  const paxCount = pax || ac.pax || 150;
  const bodyType = body || ac.body || 'N';
  const lines = [
    { desc: `Landing fee (${weight}t MTOW)`, amount: calcLandingFee(t, weight) },
    { desc: `Terminal & improvement fee — ${paxCount} dep pax`, amount: Math.round(paxCount * t.terminalPerDepPax * 100) / 100 },
    { desc: 'Apron handling & marshalling', amount: t.apronHandlingPerTurn[bodyType] },
    { desc: 'Passenger boarding bridge', amount: t.bridgePerUse },
  ];
  let subtotal = lines.reduce((s, l) => s + l.amount, 0);
  if (night) {
    const surcharge = Math.round(subtotal * t.nightSurchargePct * 100) / 100;
    lines.push({ desc: `Night movement surcharge (${Math.round(t.nightSurchargePct * 100)}%)`, amount: surcharge });
    subtotal += surcharge;
  }
  return {
    currency: t.currency,
    acType: acType || null,
    mtow: weight,
    pax: paxCount,
    lines,
    total: Math.round(subtotal * 100) / 100,
  };
}

function chargeForAirline(db, airline) {
  return db.charges.filter(c => c.airline === airline);
}

function invoicesForAirline(db, airline) {
  return db.invoices.filter(i => i.airline === airline);
}

function portalSummary(db, airline) {
  const charges = chargeForAirline(db, airline);
  const invoices = invoicesForAirline(db, airline);
  const uninvoiced = charges.filter(c => c.status === 'UNINVOICED');
  const landingTotal = charges.reduce((s, c) => {
    const landing = (c.lines || []).find(l => /landing fee/i.test(l.desc));
    return s + (landing ? landing.amount : 0);
  }, 0);
  return {
    airline,
    airlineName: db.airlines.find(a => a.code === airline)?.name || airline,
    movements: charges.length,
    totalCharges: Math.round(charges.reduce((s, c) => s + c.total, 0) * 100) / 100,
    uninvoicedTotal: Math.round(uninvoiced.reduce((s, c) => s + c.total, 0) * 100) / 100,
    uninvoicedCount: uninvoiced.length,
    invoicedTotal: Math.round(invoices.reduce((s, i) => s + i.total, 0) * 100) / 100,
    landingFeesTotal: Math.round(landingTotal * 100) / 100,
    invoiceCount: invoices.length,
    currency: db.config.currency,
    tariffs: db.config.tariffs,
    airport: db.config.airport,
  };
}

module.exports = {
  localHour, calcLandingFee, estimateMovement,
  chargeForAirline, invoicesForAirline, portalSummary,
};
