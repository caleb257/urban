'use strict';
// ── DATABASE LAYER ────────────────────────────────────────────────────────────
// Tries to load better-sqlite3 (available if Railway Volume + build tools present)
// Falls back to in-memory JSON if unavailable — no crash, no login failure

const fs   = require('fs');
const path = require('path');

const DB_DIR  = process.env.DB_DIR || '/data';
const DB_PATH = path.join(DB_DIR, 'urban.db');

let db = null;

function initDB() {
  try {
    // better-sqlite3 must be installed separately (Railway Volume setup)
    // If not available, we run in JSON-only mode — that's fine
    fs.mkdirSync(DB_DIR, { recursive: true });
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS underwrites (
        uid TEXT PRIMARY KEY, address TEXT, city TEXT,
        verdict TEXT, score INTEGER, data TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS brain (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_uw_updated ON underwrites(updated_at DESC);
    `);
    console.log('✅ SQLite database ready at ' + DB_PATH);
    return true;
  } catch(e) {
    // Not installed or Volume not mounted — run in JSON mode
    if (!e.message.includes('Cannot find module')) {
      console.warn('⚠️  SQLite: ' + e.message.slice(0,80) + ' — using JSON mode');
    } else {
      console.log('ℹ️  SQLite not installed — using JSON persistence (add Volume to enable SQLite)');
    }
    db = null;
    return false;
  }
}

function saveUnderwrite(uid, uw) {
  if (!db) return;
  try {
    db.prepare(`INSERT OR REPLACE INTO underwrites (uid,address,city,verdict,score,data,updated_at) VALUES (?,?,?,?,?,?,unixepoch())`)
      .run(uid, uw.deal?.address||'', uw.deal?.city||'', uw.verdict||'', uw.score||0, JSON.stringify(uw));
  } catch(e) { /* non-critical */ }
}

function getUnderwrite(uid) {
  if (!db) return null;
  try { const r = db.prepare('SELECT data FROM underwrites WHERE uid=?').get(uid); return r ? JSON.parse(r.data) : null; }
  catch { return null; }
}

function getAllUnderwrites() {
  if (!db) return {};
  try {
    const rows = db.prepare('SELECT uid,data FROM underwrites').all();
    const out = {};
    for (const r of rows) { try { out[r.uid] = JSON.parse(r.data); } catch {} }
    return out;
  } catch { return {}; }
}

function isAvailable() { return !!db; }

module.exports = { initDB, isAvailable, saveUnderwrite, getUnderwrite, getAllUnderwrites };
