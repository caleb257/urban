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
        county     TEXT,
        zip        TEXT,
        beds       SMALLINT,
        sqft       INTEGER,
        verdict    TEXT,
        score      INTEGER,
        worth_brrrr BOOLEAN,
        cash_flow_est INTEGER,
        data       JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      -- Add columns if upgrading existing DB
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS county TEXT;
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS zip TEXT;
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS beds SMALLINT;
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS sqft INTEGER;
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS worth_brrrr BOOLEAN;
      ALTER TABLE underwrites ADD COLUMN IF NOT EXISTS cash_flow_est INTEGER;
      CREATE TABLE IF NOT EXISTS brain_store (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_uw_verdict    ON underwrites(verdict);
      CREATE INDEX IF NOT EXISTS idx_uw_updated_at ON underwrites(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_uw_county     ON underwrites(county);
      CREATE INDEX IF NOT EXISTS idx_uw_zip        ON underwrites(zip);
      CREATE INDEX IF NOT EXISTS idx_uw_brrrr      ON underwrites(worth_brrrr) WHERE worth_brrrr = TRUE;
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
      CREATE TABLE IF NOT EXISTS market_data (
        zip_code         TEXT PRIMARY KEY,
        city             TEXT,
        county           TEXT,
        state            TEXT DEFAULT 'FL',
        median_sold      INTEGER,
        avg_ppsf         INTEGER,
        median_dom       INTEGER,
        sold_count       INTEGER,
        trend_pct        NUMERIC(5,1),
        flip_margin_pct  NUMERIC(5,1),
        rehab_light      INTEGER,
        rehab_medium     INTEGER,
        rehab_heavy      INTEGER,
        prop_tax_rate    NUMERIC(6,4),
        insurance_mo     INTEGER,
        comps            JSONB,
        notes            TEXT,
        fetched_at       TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS trend_pct NUMERIC(5,1);
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS flip_margin_pct NUMERIC(5,1);
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS rehab_light INTEGER;
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS rehab_medium INTEGER;
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS rehab_heavy INTEGER;
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS prop_tax_rate NUMERIC(6,4);
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS insurance_mo INTEGER;
      ALTER TABLE market_data ADD COLUMN IF NOT EXISTS notes TEXT;
      CREATE INDEX IF NOT EXISTS idx_market_county ON market_data(county);
      CREATE INDEX IF NOT EXISTS idx_market_city   ON market_data(city);
      CREATE TABLE IF NOT EXISTS sold_comps (
        id            SERIAL PRIMARY KEY,
        zip           TEXT NOT NULL,
        address       TEXT,
        city          TEXT,
        county        TEXT,
        sqft          INTEGER,
        beds          SMALLINT,
        baths         NUMERIC(3,1),
        year_built    SMALLINT,
        sold_price    INTEGER NOT NULL,
        sold_date     DATE,
        ppsf          NUMERIC(8,2),
        dom           SMALLINT,
        style         TEXT,
        pool          BOOLEAN,
        garage        BOOLEAN,
        subdivision   TEXT,
        notes         TEXT,
        nbhc          TEXT,
        source        TEXT DEFAULT 'redfin',
        fetched_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sc_zip      ON sold_comps(zip);
      CREATE INDEX IF NOT EXISTS idx_sc_sqft     ON sold_comps(sqft);
      CREATE INDEX IF NOT EXISTS idx_sc_sold     ON sold_comps(sold_price);
      CREATE INDEX IF NOT EXISTS idx_sc_date     ON sold_comps(sold_date);
      CREATE INDEX IF NOT EXISTS idx_sc_beds     ON sold_comps(beds);
      CREATE INDEX IF NOT EXISTS idx_sc_pool     ON sold_comps(pool);
      CREATE INDEX IF NOT EXISTS idx_sc_nbhc     ON sold_comps(nbhc);
      CREATE INDEX IF NOT EXISTS idx_sc_year     ON sold_comps(year_built);
      -- Add nbhc column if upgrading existing DB
      ALTER TABLE sold_comps ADD COLUMN IF NOT EXISTS nbhc TEXT;
      CREATE INDEX IF NOT EXISTS idx_sc_zip_beds ON sold_comps(zip, beds, sqft);
      -- Unique constraint to prevent duplicate comps from reseeding
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_unique ON sold_comps(zip, address, sold_date, sold_price) WHERE address IS NOT NULL;
      CREATE TABLE IF NOT EXISTS nbhc_arv_stats (
        nbhc          TEXT PRIMARY KEY,
        county        TEXT DEFAULT 'Hillsborough',
        count         INTEGER,
        median_sold   INTEGER,
        p25_sold      INTEGER,
        p75_sold      INTEGER,
        p90_sold      INTEGER,
        source        TEXT,
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_nbhc_county ON nbhc_arv_stats(county);
    `);
    console.log('✅ comp_cache + market_data tables ready');
  } catch(e) { console.warn('cache/market init:', e.message); }
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
    const cashFlow = uw.rental?.debtService?.dscrLoan?.cashFlow || null;
    const worthBrrrr = uw.rental?.worthBRRRR || false;
    await pool.query(
      `INSERT INTO underwrites (uid,address,city,county,zip,beds,sqft,verdict,score,worth_brrrr,cash_flow_est,data,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (uid) DO UPDATE SET
         address=EXCLUDED.address, city=EXCLUDED.city, county=EXCLUDED.county,
         zip=EXCLUDED.zip, beds=EXCLUDED.beds, sqft=EXCLUDED.sqft,
         verdict=EXCLUDED.verdict, score=EXCLUDED.score,
         worth_brrrr=EXCLUDED.worth_brrrr, cash_flow_est=EXCLUDED.cash_flow_est,
         data=EXCLUDED.data, updated_at=NOW()`,
      [uid, uw.deal?.address||'', uw.deal?.city||'', uw.deal?.county||null,
       uw.deal?.zip||null, parseInt(uw.deal?.beds)||null, parseInt(uw.deal?.sqft)||null,
       uw.verdict||'', uw.score||0, worthBrrrr, cashFlow, JSON.stringify(uw)]
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


async function saveSoldComps(comps) {
  if (!pool || !ready || !comps?.length) return 0;
  let saved = 0;
  for (const c of comps) {
    if (!c.zip || !c.sold_price) continue;
    try {
      await pool.query(
        `INSERT INTO sold_comps
          (zip, address, city, county, sqft, beds, baths, year_built,
           sold_price, sold_date, ppsf, dom, style, pool, garage, subdivision, nbhc, notes, source, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
         ON CONFLICT DO NOTHING`,
        [c.zip, c.address||null, c.city||null, c.county||null,
         c.sqft||null, c.beds||null, c.baths||null, c.year_built||null,
         c.sold_price, c.sold_date||null,
         c.ppsf || (c.sqft ? Math.round(c.sold_price/c.sqft) : null),
         c.dom||null, c.style||'SFR',
         c.pool != null ? !!c.pool : null,
         c.garage||false,
         c.subdivision||null, c.nbhc||null, c.notes||null, c.source||'redfin']
      );
      saved++;
    } catch(e) { /* dupe or bad data, skip */ }
  }
  return saved;
}

async function getSoldComps(zip, opts = {}) {
  if (!pool || !ready) return [];
  try {
    const { beds, sqft, baths, pool: hasPool, yearBuilt, nbhc, renovated, limit = 15, minDate } = opts;
    let q = 'SELECT DISTINCT ON (address, sold_price) * FROM sold_comps WHERE zip = $1';
    const params = [zip];

    // Beds: ±1 unless tight match requested
    if (beds) {
      params.push(beds - 1, beds + 1);
      q += ` AND beds BETWEEN $${params.length-1} AND $${params.length}`;
    }

    // Sqft: ±30% band — tighten to ±20% if also filtering pool/baths
    if (sqft) {
      const tight = (hasPool !== undefined || baths) ? 0.20 : 0.30;
      const lo = Math.round(sqft * (1 - tight));
      const hi = Math.round(sqft * (1 + tight + 0.05));
      params.push(lo, hi);
      q += ` AND sqft BETWEEN $${params.length-1} AND $${params.length}`;
    }

    // Baths: exact or ±0.5
    if (baths) {
      params.push(baths - 0.5, baths + 0.5);
      q += ` AND baths BETWEEN $${params.length-1} AND $${params.length}`;
    }

    // Pool match — only filter when explicitly set (true or false)
    if (hasPool === true) {
      q += ' AND pool = TRUE';
    } else if (hasPool === false) {
      q += ' AND (pool = FALSE OR pool IS NULL)';
    }

    // Year built range ±15 years
    if (yearBuilt) {
      params.push(yearBuilt - 15, yearBuilt + 15);
      q += ` AND year_built BETWEEN $${params.length-1} AND $${params.length}`;
    }

    // NBHC neighborhood filter (Hillsborough only) — tightest possible match
    if (nbhc) {
      params.push(nbhc);
      q += ` AND nbhc = $${params.length}`;
    }

    // Renovated / top-of-market: pull only P75+ comps for the zip
    // This gives you the renovated comp set without relying on manual flags
    if (renovated) {
      q += ` AND sold_price >= (
        SELECT PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY sold_price)
        FROM sold_comps WHERE zip = $1
        AND sold_date >= NOW() - INTERVAL '18 months'
      )`;
    }

    if (minDate) { params.push(minDate); q += ` AND sold_date >= $${params.length}`; }

    // Sort: most recent first, then highest price (renovated floats up)
    q += ' ORDER BY sold_date DESC NULLS LAST, sold_price DESC';
    params.push(limit); q += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(q, params);
    return rows;
  } catch(e) { console.error('getSoldComps err:', e.message); return []; }
}

async function getSoldCompStats(zip) {
  if (!pool || !ready) return null;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sold_price) as median_sold,
              ROUND(AVG(ppsf)::numeric, 0) as avg_ppsf,
              ROUND(AVG(dom)::numeric, 0) as avg_dom,
              MAX(sold_date) as latest_sale
       FROM sold_comps WHERE zip = $1 AND sold_date >= NOW() - INTERVAL '18 months'`,
      [zip]
    );
    return rows[0]?.cnt > 0 ? rows[0] : null;
  } catch(e) { return null; }
}


async function saveNbhcStats(records) {
  if (!pool || !ready || !records?.length) return 0;
  let saved = 0;
  for (const r of records) {
    if (!r.nbhc || !r.median_sold) continue;
    try {
      await pool.query(
        `INSERT INTO nbhc_arv_stats (nbhc, county, count, median_sold, p25_sold, p75_sold, p90_sold, source, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (nbhc) DO UPDATE SET
           county=EXCLUDED.county, count=EXCLUDED.count,
           median_sold=EXCLUDED.median_sold, p25_sold=EXCLUDED.p25_sold,
           p75_sold=EXCLUDED.p75_sold, p90_sold=EXCLUDED.p90_sold,
           source=EXCLUDED.source, updated_at=NOW()`,
        [r.nbhc, r.county||'Hillsborough', r.count||0,
         r.median_sold, r.p25_sold||null, r.p75_sold||null, r.p90_sold||null, r.source||'hcpa']
      );
      saved++;
    } catch(e) { /* skip */ }
  }
  return saved;
}

async function getNbhcArv(nbhc) {
  if (!pool || !ready) return null;
  try {
    const { rows } = await pool.query('SELECT * FROM nbhc_arv_stats WHERE nbhc = $1', [nbhc]);
    return rows[0] || null;
  } catch(e) { return null; }
}

// ── DEALS CACHE — snapshot of Derek's sheet so app works when Sheets is slow ──
async function initDealsCache() {
  if (!pool || !ready) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals_cache (
        uid        TEXT PRIMARY KEY,
        address    TEXT,
        city       TEXT,
        county     TEXT,
        zip        TEXT,
        data       JSONB NOT NULL,
        sheet_date DATE,
        cached_at  TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE deals_cache ADD COLUMN IF NOT EXISTS sheet_date DATE;
      CREATE INDEX IF NOT EXISTS idx_dc_county ON deals_cache(county);
      CREATE INDEX IF NOT EXISTS idx_dc_city   ON deals_cache(city);
    `);
  } catch(e) { console.warn('deals_cache init:', e.message); }
}

async function saveDeal(uid, deal) {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO deals_cache (uid, address, city, county, zip, data, cached_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (uid) DO UPDATE SET
         address=EXCLUDED.address, city=EXCLUDED.city, county=EXCLUDED.county,
         zip=EXCLUDED.zip, data=EXCLUDED.data, cached_at=NOW()`,
      [uid, deal.address||'', deal.city||'', deal.county||null, deal.zip||null, JSON.stringify(deal)]
    );
  } catch(e) { /* non-critical */ }
}

async function getCachedDeals() {
  if (!pool || !ready) return null;
  try {
    // Return deals cached in the last 4 hours (fresh enough)
    const r = await pool.query(
      "SELECT data FROM deals_cache WHERE cached_at > NOW() - INTERVAL '4 hours' ORDER BY cached_at DESC"
    );
    return r.rows.length > 0 ? r.rows.map(row => row.data) : null;
  } catch(e) { return null; }
}

async function getPortfolioStats() {
  if (!pool || !ready) return null;
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE verdict = 'BUY' OR verdict = 'HOT') as buys,
        COUNT(*) FILTER (WHERE verdict = 'PASS') as passes,
        COUNT(*) FILTER (WHERE verdict = 'HARD NO') as hard_nos,
        COUNT(*) FILTER (WHERE worth_brrrr = TRUE) as brrrr_candidates,
        AVG(score) FILTER (WHERE verdict NOT IN ('HARD NO','PASS')) as avg_score,
        SUM(cash_flow_est) FILTER (WHERE worth_brrrr = TRUE AND cash_flow_est > 0) as total_cf_potential,
        COUNT(*) as total
      FROM underwrites
    `);
    return r.rows[0] || null;
  } catch(e) { return null; }
}

module.exports = {
  initDB, isAvailable,
  initCompCache, getCachedComps, saveComps,
  initDealsCache, saveDeal, getCachedDeals,
  saveUnderwrite, getUnderwrite, getAllUnderwrites,
  saveBrainToDB, loadBrainFromDB,
  saveMarketData, getMarketData, getMarketStats,
  saveSoldComps, getSoldComps, getSoldCompStats,
  saveNbhcStats, getNbhcArv,
  getPortfolioStats
};
