'use strict';

let counter = 0;
function id(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Weighted pick: [[item, weight], ...]
function wpick(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [item, w] of pairs) {
    if ((r -= w) <= 0) return item;
  }
  return pairs[pairs.length - 1][0];
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

module.exports = { id, rand, randInt, pick, chance, clamp, wpick, MIN, HOUR };
