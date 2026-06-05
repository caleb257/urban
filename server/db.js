'use strict';
// ── DATABASE LAYER (PostgreSQL) ───────────────────────────────────────────────
// Uses Railway Postgres via DATABASE_URL env var
// Falls back to JSON-only mode if unavailable — zero crash risk

let pool = null;
let ready = false;

async function initDB() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log('ℹ️  No DATABASE_URL — JSON-only mode'); return false; }
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await pool.query('SELECT 1');
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
    console.log('✅ PostgreSQL connected');
    return true;
  } catch(e) {
    console.warn('⚠️  PostgreSQL unavailable:', e.message.slice(0,80));
    pool = null; ready = false; return false;
  }
}

// ── COMP CACHE ─────────────────────────────────────────────────────────────────
// Store comps by address key. Never fetch the same address twice (30-day cache).
async function initCompCache() {
  if (!pool || !ready) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comp_cache (
        address_key TEXT PRIMARY KEY,
        comps       JSONB NOT NULL,
        fetched_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch(e) { console.warn('comp_cache init:', e.message); }
}

async function getCachedComps(addressKey) {
  if (!pool || !ready) return null;
  try {
    const r = await pool.query(
      "SELECT comps FROM comp_cache WHERE address_key=$1 AND fetched_at > NOW() - INTERVAL '30 days'",
      [addressKey]
    );
    return r.rows[0] ? r.rows[0].comps : null;
  } catch { return null; }
}

async function saveComps(addressKey, comps) {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO comp_cache (address_key, comps, fetched_at) VALUES ($1, $2, NOW())
       ON CONFLICT (address_key) DO UPDATE SET comps=EXCLUDED.comps, fetched_at=NOW()`,
      [addressKey, JSON.stringify(comps)]
    );
  } catch(e) { console.error('saveComps:', e.message); }
}

// ── UNDERWRITES ────────────────────────────────────────────────────────────────
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

// ── BRAIN ──────────────────────────────────────────────────────────────────────
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

// ── MARKET DATA ───────────────────────────────────────────────────────────────
async function saveMarketData(r) {
  if (!pool || !ready) return;
  await pool.query(
    `INSERT INTO market_data (zip_code,city,county,state,median_sold,avg_ppsf,median_dom,sold_count,comps,fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (zip_code) DO UPDATE SET
       city=COALESCE(EXCLUDED.city,market_data.city),
       county=COALESCE(EXCLUDED.county,market_data.county),
       median_sold=COALESCE(EXCLUDED.median_sold,market_data.median_sold),
       avg_ppsf=COALESCE(EXCLUDED.avg_ppsf,market_data.avg_ppsf),
       median_dom=COALESCE(EXCLUDED.median_dom,market_data.median_dom),
       sold_count=COALESCE(EXCLUDED.sold_count,market_data.sold_count),
       comps=COALESCE(EXCLUDED.comps,market_data.comps),
       fetched_at=NOW()`,
    [r.zip_code, r.city||null, r.county||null, r.state||'FL',
     r.median_sold||null, r.avg_ppsf||null, r.median_dom||null,
     r.sold_count||null, r.comps ? JSON.stringify(r.comps) : null]
  );
}

async function getMarketData(zip) {
  if (!pool || !ready) return null;
  const res = await pool.query('SELECT * FROM market_data WHERE zip_code=$1', [zip]);
  return res.rows[0] || null;
}

async function getMarketStats() {
  if (!pool || !ready) return {};
  const res = await pool.query('SELECT county, COUNT(*) as zips, AVG(median_sold) as avg_median FROM market_data GROUP BY county ORDER BY count DESC');
  return { total_zips: 0, by_county: res.rows };
}

module.exports = {
  initDB, isAvailable,
  initCompCache, getCachedComps, saveComps,
  saveUnderwrite, getUnderwrite, getAllUnderwrites,
  saveBrainToDB, loadBrainFromDB,
  saveMarketData, getMarketData, getMarketStats
};
