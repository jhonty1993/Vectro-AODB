'use strict';

const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');
const { HOUR } = require('./util');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = null;

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // A seeded operating day goes stale; reseed after 20h so the demo is always live.
      if (parsed.seededAt && Date.now() - parsed.seededAt < 20 * HOUR) {
        db = parsed;
        return db;
      }
    }
  } catch (e) {
    console.warn('[store] could not read snapshot, reseeding:', e.message);
  }
  db = seed();
  save();
  return db;
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  } catch (e) {
    console.warn('[store] snapshot failed:', e.message);
  }
}

function reseed() {
  db = seed();
  save();
  return db;
}

function get() {
  if (!db) load();
  return db;
}

module.exports = { get, load, save, reseed };
