'use strict';
// ── DATABASE LAYER (PostgreSQL) ───────────────────────────────────────────────
// Uses Railway Postgres via DATABASE_URL env var
// Falls back to in-memory JSON if unavailable — zero crash risk

let pool = null;
let ready = false;

async function initDB() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('ℹ️  No DATABASE_URL — running in JSON-only mode');
    return false;
  }
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    // Test connection
    await pool.query('SELECT 1');
    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS underwrites (
        uid        TEXT PRIMARY KEY,
        address    TEXT,
        city       TEXT,
        verdict    TEXT,
        score      INTEGER,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS brain_store (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_verdict    ON underwrites(verdict);
      CREATE INDEX IF NOT EXISTS idx_uw_updated_at ON underwrites(updated_at DESC);
    `);
    ready = true;
    console.log('✅ PostgreSQL connected and tables ready');
    return true;
  } catch(e) {
    console.warn('⚠️  PostgreSQL init failed: ' + e.message.slice(0,80) + ' — using JSON mode');
    pool = null;
    ready = false;
    return false;
  }
}

// ── UNDERWRITES ───────────────────────────────────────────────────────────────
async function saveUnderwrite(uid, uw) {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO underwrites (uid,address,city,verdict,score,data,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (uid) DO UPDATE SET
         address=EXCLUDED.address, city=EXCLUDED.city, verdict=EXCLUDED.verdict,
         score=EXCLUDED.score, data=EXCLUDED.data, updated_at=NOW()`,
      [uid, uw.deal?.address||'', uw.deal?.city||'', uw.verdict||'', uw.score||0, JSON.stringify(uw)]
    );
  } catch(e) { console.error('DB saveUnderwrite:', e.message); }
}

async function getUnderwrite(uid) {
  if (!pool || !ready) return null;
  try {
    const r = await pool.query('SELECT data FROM underwrites WHERE uid=$1', [uid]);
    return r.rows[0] ? r.rows[0].data : null;
  } catch { return null; }
}

async function getAllUnderwrites() {
  if (!pool || !ready) return {};
  try {
    const r = await pool.query('SELECT uid, data FROM underwrites ORDER BY updated_at DESC');
    const out = {};
    for (const row of r.rows) out[row.uid] = row.data;
    return out;
  } catch(e) { console.error('DB getAllUnderwrites:', e.message); return {}; }
}

// ── BRAIN ─────────────────────────────────────────────────────────────────────
async function saveBrainToDB(brain) {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO brain_store (key, value, updated_at) VALUES ('main', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
      [JSON.stringify(brain)]
    );
  } catch(e) { console.error('DB saveBrain:', e.message); }
}

async function loadBrainFromDB() {
  if (!pool || !ready) return null;
  try {
    const r = await pool.query("SELECT value FROM brain_store WHERE key='main'");
    return r.rows[0] ? r.rows[0].value : null;
  } catch { return null; }
}

function isAvailable() { return ready; }

module.exports = { initDB, isAvailable, saveUnderwrite, getUnderwrite, getAllUnderwrites, saveBrainToDB, loadBrainFromDB };
