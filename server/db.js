'use strict';
// ── DATABASE LAYER ────────────────────────────────────────────────────────────
// SQLite via better-sqlite3 on a Railway Volume at /data
// Falls back to in-memory JSON if SQLite is unavailable (first deploy before volume mounted)

const fs   = require('fs');
const path = require('path');

const DB_DIR  = process.env.DB_DIR || '/data';
const DB_PATH = path.join(DB_DIR, 'urban.db');

let db = null;

function initDB() {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // faster writes
    db.pragma('synchronous = NORMAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS underwrites (
        uid        TEXT PRIMARY KEY,
        address    TEXT,
        city       TEXT,
        verdict    TEXT,
        score      INTEGER,
        data       TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS brain (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS deals_cache (
        uid        TEXT PRIMARY KEY,
        address    TEXT,
        data       TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_uw_verdict ON underwrites(verdict);
      CREATE INDEX IF NOT EXISTS idx_uw_city    ON underwrites(city);
      CREATE INDEX IF NOT EXISTS idx_uw_updated ON underwrites(updated_at DESC);
    `);

    console.log('✅ SQLite database ready at ' + DB_PATH);
    return true;
  } catch(e) {
    console.warn('⚠️  SQLite unavailable (' + e.message.slice(0,60) + ') — using in-memory mode');
    db = null;
    return false;
  }
}

// ── UNDERWRITES ───────────────────────────────────────────────────────────────
function saveUnderwrite(uid, uw) {
  if (!db) return;
  try {
    db.prepare(`
      INSERT OR REPLACE INTO underwrites (uid, address, city, verdict, score, data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    `).run(uid, uw.deal?.address || '', uw.deal?.city || '', uw.verdict || '', uw.score || 0, JSON.stringify(uw));
  } catch(e) { console.error('DB saveUnderwrite error:', e.message); }
}

function getUnderwrite(uid) {
  if (!db) return null;
  try {
    const row = db.prepare('SELECT data FROM underwrites WHERE uid = ?').get(uid);
    return row ? JSON.parse(row.data) : null;
  } catch(e) { return null; }
}

function getAllUnderwrites() {
  if (!db) return {};
  try {
    const rows = db.prepare('SELECT uid, data FROM underwrites').all();
    const out = {};
    for (const r of rows) {
      try { out[r.uid] = JSON.parse(r.data); } catch {}
    }
    return out;
  } catch(e) { return {}; }
}

function deleteUnderwrite(uid) {
  if (!db) return;
  try { db.prepare('DELETE FROM underwrites WHERE uid = ?').run(uid); } catch {}
}

function getUnderwriteCount() {
  if (!db) return 0;
  try { return db.prepare('SELECT COUNT(*) as c FROM underwrites').get().c; } catch { return 0; }
}

// ── BRAIN ─────────────────────────────────────────────────────────────────────
function saveBrainKey(key, value) {
  if (!db) return;
  try {
    db.prepare('INSERT OR REPLACE INTO brain (key, value, updated_at) VALUES (?, ?, unixepoch())')
      .run(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch(e) { console.error('DB saveBrainKey error:', e.message); }
}

function getBrainKey(key) {
  if (!db) return null;
  try {
    const row = db.prepare('SELECT value FROM brain WHERE key = ?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  } catch { return null; }
}

function getAllBrainKeys() {
  if (!db) return {};
  try {
    const rows = db.prepare('SELECT key, value FROM brain').all();
    const out = {};
    for (const r of rows) {
      try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
    }
    return out;
  } catch { return {}; }
}

function isAvailable() { return !!db; }

module.exports = { initDB, isAvailable, saveUnderwrite, getUnderwrite, getAllUnderwrites, deleteUnderwrite, getUnderwriteCount, saveBrainKey, getBrainKey, getAllBrainKeys };
