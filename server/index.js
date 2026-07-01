// BUILD: 2026-06-11 19:20:56
require('dotenv').config({ path: '../.env' });
const DB = require('./db');
const TAMPA = require('./tampaKnowledge');
// Re-underwrite any small deals cached as HARD NO before sqft limiter was removed
setTimeout(() => {
  try {
    const staleDeals = Object.entries(underwrites||{}).filter(([uid, uw]) =>
      uw.underwriteStatus === 'HARD NO' && uw.underwriteScore <= 2 &&
      uw.sqft > 0 && uw.sqft < 1200
    );
    staleDeals.forEach(([uid], i) => {
      delete underwrites[uid].underwriteStatus;
      delete underwrites[uid].underwriteScore;
      setTimeout(() => runUnderwrite(uid, false).catch(()=>{}), 3000 + i * 1500);
    });
    if(staleDeals.length) console.log('[Urban] Re-underwriting ' + staleDeals.length + ' previously-excluded small deals');
  } catch(e) {}
}, 15000);


// ── CCG TARGET COUNTIES ────────────────────────────────────────────────────────
// Only underwrite and display deals in these counties — everything else is ignored
const CCG_COUNTIES = new Set([
  'pasco', 'polk', 'hillsborough', 'pinellas', 'sarasota', 'hernando', 'citrus'
]);


// ── FLORIDA CITY → COUNTY LOOKUP ──────────────────────────────────────────────
const FL_CITY_COUNTY = {
  // HILLSBOROUGH
  'tampa':'hillsborough','plant city':'hillsborough','brandon':'hillsborough',
  'riverview':'hillsborough','valrico':'hillsborough','apollo beach':'hillsborough',
  'ruskin':'hillsborough','sun city center':'hillsborough','seffner':'hillsborough',
  'lutz':'hillsborough','temple terrace':'hillsborough','dover':'hillsborough',
  // PINELLAS
  'st. petersburg':'pinellas','saint petersburg':'pinellas','clearwater':'pinellas',
  'largo':'pinellas','dunedin':'pinellas','safety harbor':'pinellas',
  'tarpon springs':'pinellas','palm harbor':'pinellas','seminole':'pinellas',
  'pinellas park':'pinellas','st pete':'pinellas','st. pete':'pinellas',
  'treasure island':'pinellas','madeira beach':'pinellas','belleair':'pinellas',
  'gulfport':'pinellas','south pasadena':'pinellas','redington beach':'pinellas',
  'clearwater beach':'pinellas','st pete beach':'pinellas','indian rocks beach':'pinellas',
  'indian shores':'pinellas','north redington beach':'pinellas',
  // POLK
  'lakeland':'polk','winter haven':'polk','bartow':'polk','auburndale':'polk',
  'haines city':'polk','lake wales':'polk','mulberry':'polk','fort meade':'polk',
  'davenport':'polk','polk city':'polk','eagle lake':'polk','lake alfred':'polk',
  // PASCO — comprehensive
  'new port richey':'pasco','port richey':'pasco','hudson':'pasco',
  'wesley chapel':'pasco','land o lakes':'pasco',"land o' lakes":'pasco',
  'zephyrhills':'pasco','dade city':'pasco','holiday':'pasco',
  'trinity':'pasco','odessa':'pasco','san antonio':'pasco',
  'elfers':'pasco','shady hills':'pasco','ridge manor':'pasco',
  'crystal springs':'pasco','lacoochee':'pasco','trilby':'pasco',
  'richey':'pasco','e hudson':'pasco','east hudson':'pasco',
  'newport richey':'pasco','new port richie':'pasco','port richie':'pasco',
  'zephyr hills':'pasco','saint leo':'pasco','st leo':'pasco',
  'pasadena hills':'pasco','jasmine estates':'pasco','moon lake':'pasco',
  'magnolia valley':'pasco','seven springs':'pasco','beacon square':'pasco',
  'tarpon springs':'pinellas',
  // HILLSBOROUGH — comprehensive
  'gibsonton':'hillsborough','lithia':'hillsborough','balm':'hillsborough',
  'mango':'hillsborough','thonotosassa':'hillsborough','wimauma':'hillsborough',
  'progress village':'hillsborough','ybor city':'hillsborough',
  'fish hawk':'hillsborough','fishhawk':'hillsborough','boyette':'hillsborough',
  'east tampa':'hillsborough','west tampa':'hillsborough',
  'carrollwood':'hillsborough','northdale':'hillsborough',
  'citrus park':'hillsborough','gunn highway':'hillsborough',
  'cheval':'hillsborough','hunters green':'hillsborough',
  'new tampa':'hillsborough','tampa palms':'hillsborough',
  'highwoods':'hillsborough','k-bar ranch':'hillsborough',
  'bloomingdale':'hillsborough','durant':'hillsborough',
  'brandon north':'hillsborough','tampa bay':'hillsborough',
  'port tampa':'hillsborough','harbor city':'hillsborough',
  'egypt lake':'hillsborough','lake magdalene':'hillsborough',
  'northdale':'hillsborough','town n country':'hillsborough',
  // HERNANDO — comprehensive
  'brooksville':'hernando','spring hill':'hernando','weeki wachee':'hernando',
  'ridge manor':'hernando','lake lindsey':'hernando','nobleton':'hernando',
  'hernando':'hernando','hernando beach':'hernando',
  'aripeka':'hernando','masaryktown':'hernando',
  'istachatta':'hernando','bayport':'hernando',
  // SARASOTA
  'sarasota':'sarasota','venice':'sarasota','north port':'sarasota',
  'englewood':'sarasota','osprey':'sarasota','siesta key':'sarasota','nokomis':'sarasota',
};

function inferCounty(city) {
  if (!city) return null;
  return FL_CITY_COUNTY[city.toLowerCase().trim()] || null;
}

function isTargetCounty(county, city) {
  if (county) {
    const norm = county.toLowerCase().replace(' county', '').trim();
    return CCG_COUNTIES.has(norm);
  }
  if (city) {
    const inferred = inferCounty(city);
    if (inferred) return CCG_COUNTIES.has(inferred);
    return false; // city not in our lookup → exclude (Derek shouldn't be sending outside CCG area)
  }
  return false; // no county + no city → exclude
}

const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const fetch = require('node-fetch');

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-urban-token,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));
// Serve static assets (non-HTML) with caching allowed
app.use(express.static(path.join(__dirname, '../public'), {
  index: false,  // Disable automatic index.html serving — we handle it explicitly
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

// HTML embedded directly in server
// Updated: 2026-07-01T05:19:03.102Z
const INDEX_PATH = __dirname + '/../public/index.html';
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(INDEX_PATH);
});

// Version endpoint — shows deployed commit for verification

// Public health endpoint — Railway healthcheck uses this (no auth required)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now(), v: 'EMBEDDED_HTML_5a9e0de', htmlLen: EMBEDDED_HTML.length }));
const DEPLOY_VERSION = 'b6fb656';
app.get('/api/version', auth, (req, res) => res.json({ 
  commit: DEPLOY_VERSION, 
  built: new Date().toISOString(), 
  htmlSize: (() => { try { return fs.statSync(INDEX_PATH).size; } catch { return 0; } })(),
  ok: true 
}));

// Lazy init Anthropic client
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
// ── USERS — dual login + IP tracking ─────────────────────────────────────────
const USERS = {
  [process.env.URBAN_PASSWORD || 'coralstone2025']: { name: 'grant', role: 'user' },
  [process.env.URBAN_CALEB_TOKEN || 'ccg-caleb-K9x4mP2v']: { name: 'caleb', role: 'admin' },
};
const ACCESS_LOG = [];
function logAccess(user, ip, ua, path) {
  ACCESS_LOG.unshift({ user, ip, ua: (ua||'').slice(0,80), path, ts: new Date().toISOString() });
  if (ACCESS_LOG.length > 1000) ACCESS_LOG.length = 1000;
  if (user === 'grant') {
    const since = Date.now() - 86400000;
    const grantIPs = new Set(ACCESS_LOG.filter(e=>e.user==='grant' && new Date(e.ts).getTime()>since).map(e=>e.ip));
    if (grantIPs.size >= 3) {
      urbanBrain.securityAlerts = urbanBrain.securityAlerts || [];
      const key = [...grantIPs].sort().join(',');
      if (!urbanBrain.securityAlerts.some(a=>a.key===key)) {
        urbanBrain.securityAlerts.push({ key, type:'multi-ip-grant', ips:[...grantIPs], ts:new Date().toISOString() });
        saveBrain().catch(()=>{});
      }
    }
  }
}
const ADAM_URL  = process.env.ADAM_URL || '';
const ADAM_TOKEN = process.env.ADAM_TOKEN || 'coralstone2025';
const BRAIN_FILE = path.join(__dirname, '../data/brain.json');
const UNDERWRITES_FILE = path.join(__dirname, '../data/underwrites.json');

// ── DATA PERSISTENCE ──────────────────────────────────────────────────────────
function loadJSON(file, def = {}) {
  try { return JSON.parse(fs.readFileSync(file)); } catch { return def; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Ensure /tmp/urban exists
try { require('fs').mkdirSync(DATA_DIR, { recursive: true }); } catch {}

let urbanBrain = loadJSON(BRAIN_FILE, {
  lessons: [],
  wholesalerNotes: {},
  wholesalerStats: {},
  marketNotes: {},
  correctionHistory: [],
  lastUpdated: null,
  totalUnderwritten: 0,
  hotDeals: 0,
  passedDeals: 0
});

let underwrites = {}; // Postgres is the single source — no JSON file dependency

// ── SHEETS CLIENT ─────────────────────────────────────────────────────────────
function getSheets() {
  const rawCreds = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!rawCreds) throw new Error('GOOGLE_CREDENTIALS_JSON env var is not set');
  let creds;
  try { creds = JSON.parse(rawCreds); }
  catch(e) { throw new Error('GOOGLE_CREDENTIALS_JSON is not valid JSON: ' + e.message); }
  const auth = new google.auth.JWT(creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

// ── SHEET-BACKED BRAIN ───────────────────────────────────────────────────────
const BRAIN_TAB = 'Urban Brain';
const UW_LOG_TAB = 'Urban Underwrites';

async function loadBrainFromSheet() {
  // 1. Try DB first (fastest, most complete, survives Sheets outages)
  try {
    if (DB.isAvailable()) {
      const dbBrain = await DB.loadBrainFromDB();
      if (dbBrain && dbBrain.totalUnderwritten) {
        urbanBrain = { ...urbanBrain, ...dbBrain };
        console.log(`🧠 Brain loaded from Postgres: ${urbanBrain.totalUnderwritten || 0} deals, ${urbanBrain.lessons?.length || 0} lessons`);
        return; // DB wins — skip Sheets load
      }
    }
  } catch(e) { console.log('Brain DB load err:', e.message); }

  // 2. Fall back to Google Sheets
  try {
    const s = getSheets();
    const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!B2` });
    const val = res.data.values?.[0]?.[0];
    if (val) {
      urbanBrain = { ...urbanBrain, ...JSON.parse(val) };
      console.log(`🧠 Brain loaded from Sheets: ${urbanBrain.totalUnderwritten || 0} deals`);
      // Promote to DB immediately
      DB.saveBrainToDB(urbanBrain).catch(() => {});
    }
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) initBrainTab().catch(()=>{});
    else console.log('Brain Sheets load:', e.message);
  }
}

// saveBrain = save to local file + sheet (use this everywhere)
async function saveBrain() {
  // Trim lessons to prevent 50K Google Sheets cell limit — DB keeps full history
  if (urbanBrain.lessons && urbanBrain.lessons.length > 100) {
    urbanBrain.lessons = urbanBrain.lessons.slice(-100);
  }
  saveJSON(BRAIN_FILE, urbanBrain);
  DB.saveBrainToDB(urbanBrain).catch(() => {}); // Postgres (full brain, no limit)
  await saveBrainToSheet().catch(e => console.log('Brain sheet save err:', e.message));
}

async function saveBrainToSheet() {
  try {
    const s = getSheets();
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['last_updated','brain_json'],[new Date().toISOString(), JSON.stringify(urbanBrain)]] }
    });
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) { await initBrainTab(); await saveBrainToSheet(); }
    else console.log('Brain save:', e.message);
  }
}

async function initBrainTab() {
  try {
    await getSheets().spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: BRAIN_TAB } } }] } });
  } catch(e) { if (!e.message?.includes('already exists')) console.log('initBrainTab:', e.message); }
}

async function logUnderwriteToSheet(uw) {
  try {
    const s = getSheets();
    const row = [uw.underwroteAt, uw.deal?.address, uw.deal?.city, uw.deal?.state,
      uw.deal?.askingPrice, uw.arv?.urbanARV, uw.arv?.wholesalerARV,
      uw.financials?.netProfitAtAsking, uw.financials?.mao, uw.rehab?.urbanEstimate,
      uw.verdict, uw.score, uw.verdictReason, uw.model || 'haiku',
      uw.deal?.contact1Email || '', uw.deal?.wholesalerCompany || ''];

    // Write verdict back to Active Deals: check Pass col (B) for PASS/HARD NO, 
    // check Sold col (C) for HOT/BUY (indicates action), Review col (D) for REVIEW
    if (uw.deal?.uid) {
      try {
        const adRes = await s.spreadsheets.values.get({
          spreadsheetId: SHEET_ID, range: 'Active Deals!A:CT'
        });
        const rows = adRes.data.values || [];
        const uidCol = rows[0]?.indexOf('Email UID');
        if (uidCol >= 0) {
          const rowIdx = rows.findIndex((r, i) => i > 0 && String(r[uidCol]) === String(uw.deal.uid));
          if (rowIdx > 0) {
            const sheetRow = rowIdx + 1;
            // Col B = Pass, Col C = Sold, Col D = Review (1-indexed: B=2, C=3, D=4)
            let checkCol = null;
            if (['PASS','HARD NO'].includes(uw.verdict)) checkCol = 'B'; // Pass checkbox
            else if (uw.verdict === 'REVIEW') checkCol = 'D';            // Review checkbox
            if (checkCol) {
              await s.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `Active Deals!${checkCol}${sheetRow}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[true]] }
              });
              console.log(`✅ Marked ${checkCol} (${uw.verdict}) for row ${sheetRow}: ${uw.deal.address}`);
            }
          }
        }
      } catch(wbErr) { console.log('Write-back err:', wbErr.message); }
    }

    await s.spreadsheets.values.append({ spreadsheetId: SHEET_ID,
      range: `${UW_LOG_TAB}!A:A`, valueInputOption: 'RAW',
      requestBody: { values: [row] } });
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) {
      try {
        const s = getSheets();
        await s.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: UW_LOG_TAB } } }] } });
        await s.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${UW_LOG_TAB}!A1`,
          valueInputOption: 'RAW', requestBody: { values: [['Date','Address','City','State',
            'Asking','Urban ARV','Wholesaler ARV','Net Profit','MAO','Rehab','Verdict',
            'Score','Reason','Model','Wholesaler Email','Company']] } });
        await logUnderwriteToSheet(uw);
      } catch {}
    }
  }
}

// ── PULL DEALS FROM SHEET ────────────────────────────────────────────────────
// ── PHOTO URL RESOLVER — follows tracking redirects to get real Dropbox/Drive URLs ──
const _photoUrlCache = {}; // uid -> resolved URL (in-memory, persists until restart)

const TRACKING_PATTERNS = [
  'click.email.',       // prophethomes, others
  '/c/eJ',             // 21propertygroup zlib-encoded click tracker
  'click.mailchi.mp',  // Mailchimp
  'mailtrack.io',
  'trk.klclick.com',
  '/click?',
  'email-click.',
  'hs-link.',
];

function isTrackingUrl(url) {
  if (!url) return false;
  return TRACKING_PATTERNS.some(p => url.includes(p));
}

async function resolvePhotoUrl(url, uid) {
  if (!url || !isTrackingUrl(url)) return url;
  const cacheKey = uid + ':' + url.slice(0, 80);
  if (_photoUrlCache[cacheKey]) return _photoUrlCache[cacheKey];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CCG/Urban)', 'Accept': 'text/html,*/*' }
    });
    clearTimeout(timer);
    const finalUrl = res.url;
    if (finalUrl && finalUrl !== url) {
      _photoUrlCache[cacheKey] = finalUrl;
      console.log('[PHOTO] Resolved:', url.slice(0,50), '->', finalUrl.slice(0,80));
      return finalUrl;
    }
  } catch(e) {
    console.log('[PHOTO] Could not resolve:', url.slice(0,50), e.message?.slice(0,40));
  }
  _photoUrlCache[cacheKey] = url; // cache original to avoid retrying
  return url;
}

async function getDealsFromSheet() {
  const s = getSheets();
  const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Active Deals!A1:CV2000' });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  return rows.slice(1).filter(r => {
    const addr = r[col['Address']];
    // Skip rows with no address OR redacted XXXX address — Urban can't underwrite without it
    if (!addr || addr.trim() === '') return false; // blank — genuinely no data
    // XXXX rows are logged but address wasn't filled in — keep them so UI can surface them
    return true;
  }).map(r => {
    const get = (h) => r[col[h]] || '';
    return {
      uid: (get('Address') || get('Email UID') || '').trim(), // Use address as primary UID
      needsAddress: ((get('Address') || '').trim().toUpperCase() === 'XXXX'), // Derek logged but never filled address
      dateReceived: get('Date Received'),
      propertyType: get('Property Type'),
      address: get('Address'),
      city: get('City'),
      state: get('State'),
      zip: get('Zip'),
      county: get('County'),
      subdivision: get('Subdivision'),
      beds: get('Beds'),
      baths: get('Baths'),
      halfBaths: get('Half Baths'),
      sqft: get('Sqft'),
      lotSqft: get('Lot Sqft'),
      lotAcres: get('Lot Acres'),
      yearBuilt: get('Year Built'),
      stories: get('Stories'),
      construction: get('Construction'),
      foundation: get('Foundation'),
      pool: get('Pool'),
      poolNotes: get('Pool Notes'),
      garage: get('Garage'),
      garageSpaces: get('Garage Spaces'),
      carport: get('Carport'),
      basement: get('Basement'),
      attic: get('Attic'),
      overall_condition: get('Overall Condition'),
      roofType: get('Roof Type'),
      roofAge: get('Roof Age / Year'),
      acYear: get('AC Year / Age'),
      waterHeater: get('Water Heater'),
      electrical: get('Electrical'),
      plumbing: get('Plumbing'),
      windows: get('Windows'),
      flooring: get('Flooring'),
      kitchenNotes: get('Kitchen Notes'),
      bathNotes: get('Bath Notes'),
      askingPrice: get('Asking Price'),
      wholesalerARV: get('ARV'),
      repairsEstimate: get('Repairs Estimate'),
      assignmentFee: get('Assignment Fee'),
      equity: get('Equity'),
      rentCurrent: get('Rent Current'),
      rentMarket: get('Rent Market'),
      annualTaxes: get('Annual Taxes'),
      hoaFee: get('HOA Fee'),
      closeDate: get('Close Date'),
      inspectionPeriod: get('Inspection Period'),
      earnestMoney: get('Earnest Money'),
      financingTerms: get('Financing Terms'),
      cashOnly: get('Cash Only'),
      contact1Name: get('Contact 1 Name'),
      contact1Title: get('Contact 1 Title'),
      contact1Company: get('Contact 1 Company'),
      contact1Phone: get('Contact 1 Phone'),
      contact1Phone2: get('Contact 1 Phone 2'),
      contact1Email: get('Contact 1 Email'),
      contact1Website: get('Contact 1 Website'),
      contact2Name: get('Contact 2 Name'),
      contact2Title: get('Contact 2 Title'),
      contact2Company: get('Contact 2 Company'),
      contact2Phone: get('Contact 2 Phone'),
      contact2Email: get('Contact 2 Email'),
      contact3Name: get('Contact 3 Name'),
      contact3Phone: get('Contact 3 Phone'),
      contact3Email: get('Contact 3 Email'),
      allPhones: get('ALL Phones Found'),
      allEmails: get('ALL Emails Found'),
      allNames: get('ALL Names Found'),
      sellerName: get('Seller Name'),
      sellerPhone: get('Seller Phone'),
      sellerSituation: get('Seller Situation'),
      sellerMotivation: get('Seller Motivation'),
      occupancy: get('Occupancy'),
      floodZone: get('Flood Zone'),
      hoa: get('HOA'),
      schoolDistrict: get('School District'),
      driveLink: get('Google Drive Link'),
      zillowLink: get('Zillow Link'),
      googleMapsLink: get('Google Maps Link'),
      allOtherLinks: get('All Other Links'),
      photosIncluded: get('Photos Included'),
      photoCount: get('Photo Count'),
      photoLinks: get('Photo Links'),
      comp1: get('Comp 1'),
      comp2: get('Comp 2'),
      comp3: get('Comp 3'),
      whatIsUpdated: get('What Is Updated'),
      whatNeedsWork: get('What Needs Work'),
      highlights: get('Highlights'),
      redFlags: get('Red Flags'),
      additionalNotes: get('Additional Notes'),
      wholesalerCompany: get('Wholesaler Company'),
      listName: get('List Name'),
      daysActive: get('Days Active'),
      emailSubject: get('Email Subject'),
      expires: get('Expires'),
      closeDate: get('Close Date') || get('Closing Date'),
      inspectionPeriod: get('Inspection Period') || get('Inspection Days'),
      earnestMoney: get('Earnest Money') || get('EMD') || get('Earnest Money Deposit'),
    };
  });
}

// ── COMP ENGINE ───────────────────────────────────────────────────────────────

// ── LIVE REDFIN COMP FETCHER ─────────────────────────────────────────────────
// Scrapes Redfin's recently-sold pages using cheerio for DOM parsing.
// Free, no API key, works for any US zip. ~$0 cost per comp lookup.
// Replaces the expensive web_search fallback ($0.01/call → $0/call).
const cheerio = require('cheerio');

async function fetchLiveRedfin(zip, beds, sqft, baths) {
  if (!zip) return [];
  try {
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    };

    // Fetch pages 1-3 in parallel (~120 raw listings)
    const urls = [
      `https://www.redfin.com/zipcode/${zip}/recently-sold`,
      `https://www.redfin.com/zipcode/${zip}/recently-sold?page=2`,
      `https://www.redfin.com/zipcode/${zip}/recently-sold?page=3`,
    ];
    const htmlPages = await Promise.all(
      urls.map(u => fetch(u, { headers: HEADERS }).then(r => r.ok ? r.text() : '').catch(() => ''))
    );

    const tBeds  = parseInt(beds)    || 0;
    const tSqft  = parseInt(sqft)    || 0;
    const seen   = new Set();
    const comps  = [];
    const MONTHS = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};

    for (const html of htmlPages) {
      if (!html || html.length < 500) continue;
      const $ = cheerio.load(html);

      // Each listing card contains a link to the property + stats
      $('a[href*="/home/"]').each((_, el) => {
        const $el   = $(el);
        const href  = $el.attr('href') || '';
        // Only process links that look like property listings
        if (!/\/[A-Z]{2}\/[^/]+\/[^/]+-\d{5}\/home\//.test(href)) return;

        // Walk up to the card container (varies by page layout)
        const $card = $el.closest('[class*="HomeCard"], [class*="homeCard"], [class*="listing"]')
                   || $el.closest('li')
                   || $el.parent();
        const text  = $card.text().replace(/\s+/g, ' ').trim();

        // Extract price
        const priceM = text.match(/\$([\d,]+)/);
        const price  = priceM ? parseInt(priceM[1].replace(/,/g,'')) : 0;
        if (!price || price < 75000 || price > 5000000) return;

        // Dedup on address slug
        const slugM = href.match(/\/[A-Z]{2}\/[^/]+\/([^/]+)\/home\//);
        const slug  = slugM ? slugM[1] : href;
        if (seen.has(slug + price)) return;
        seen.add(slug + price);

        // Extract stats
        const sfM    = text.match(/([\d,]+)\s*Sq\.?\s*Ft/i);
        const hSqft  = sfM  ? parseInt(sfM[1].replace(/,/g,''))  : 0;
        const bdM    = text.match(/(\d+)\s*(?:Bd|Bed)/i);
        const hBeds  = bdM  ? parseInt(bdM[1])                   : 0;
        const baM    = text.match(/([\d.]+)\s*(?:Ba|Bath)/i);
        const hBaths = baM  ? parseFloat(baM[1])                 : 0;

        // Sold date
        const dM = text.match(/SOLD\s+(\w+)\s+(\d+),?\s+(\d{4})/i);
        let sold_date = null;
        if (dM) {
          const mo = MONTHS[dM[1].toLowerCase().slice(0,3)];
          if (mo) sold_date = `${dM[3]}-${mo}-${dM[2].padStart(2,'0')}`;
        }

        // Filters: beds ±1, sqft ±30%
        if (tBeds > 0 && hBeds > 0 && Math.abs(hBeds - tBeds) > 1)    return;
        if (tSqft > 0 && hSqft > 0) {
          const r = hSqft / tSqft;
          if (r < 0.65 || r > 1.40) return;
        }

        // Clean address from slug
        const addr = decodeURIComponent(slug)
          .replace(/-/g,' ')
          .replace(/\s+\d{5}$/,'')
          .toUpperCase();

        comps.push({
          address:    addr,
          city:       '',
          sqft:       hSqft,
          beds:       hBeds,
          baths:      hBaths,
          year_built: null,
          sold_price: price,
          sold_date:  sold_date,
          ppsf:       hSqft > 0 ? Math.round(price / hSqft) : null,
          dom:        null,
          pool:       /\bpool\b/i.test(text) ? true : null,
          source:     'REDFIN_LIVE'
        });
      });
    }

    // Sort newest first, return top 15
    comps.sort((a,b) => (b.sold_date||'').localeCompare(a.sold_date||''));
    const result = comps.slice(0, 15);
    console.log(`🔴 Redfin LIVE: ${result.length} comps for zip ${zip} (${beds||'?'}bd ~${sqft||'?'}sf)`);
    return result;

  } catch(e) {
    console.warn('Redfin live fetch error:', e.message);
    return [];
  }
}


// ── HILLSBOROUGH COUNTY GIS SOLD COMPS ───────────────────────────────────────
// Free government REST API — never blocks server-side requests.
// Returns real arm's-length sales from HCPA/Property Appraiser data.

// ── GEOCODING ─────────────────────────────────────────────────────────────────
// Nominatim (OpenStreetMap) — free, unlimited, no API key, works from any server
async function geocodeAddress(address, city, state = 'FL') {
  try {
    const q = encodeURIComponent(`${address}, ${city}, ${state}`);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=us`, {
      headers: { 'User-Agent': 'Urban-Underwriter/1.0 (coralstone.cc)' },
      signal: AbortSignal.timeout(6000)
    });
    const data = await r.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

// In-memory de-dup so we don't hit Postgres just to check "have we tried this
// uid yet" on every single /api/deals call — resets harmlessly on restart.
const _geocodeAttempted = {};
async function proactivelyGeocodeDeals(targetDeals) {
  const toTry = targetDeals
    .filter(d => d.address && !_geocodeAttempted[d.uid || `${d.address}-${d.dateReceived}`])
    .slice(0, 8);
  for (const d of toTry) {
    const uid = d.uid || `${d.address}-${d.dateReceived}`;
    _geocodeAttempted[uid] = true;
    const key = `${d.address}|${d.city||''}|FL`.toLowerCase().trim();
    try {
      const cached = await DB.getGeocode(key);
      if (!cached) {
        const fresh = await geocodeAddress(d.address, d.city || '', 'FL').catch(() => null);
        if (fresh) await DB.saveGeocode(key, fresh.lat, fresh.lng);
        else await DB.saveGeocode(key, null, null);
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 250));
  }
}

// ── COUNTY GIS COMP FETCHER ───────────────────────────────────────────────────
// Queries each FL county's Property Appraiser ArcGIS REST API
// Government APIs — no IP blocking, free, returns actual recorded deed sales
async function fetchCountyGISComps(address, city, state, zip, county, beds, baths, sqft) {
  const geo = await geocodeAddress(address, city, state);
  if (!geo) {
    console.log('❌ Geocode failed for', address, '— trying zip-based fallback');
    return [];
  }
  const { lat, lng } = geo;
  console.log(`📍 Geocoded ${address}: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

  // Define the bounding box for ~0.5 mile radius around the property
  const deg = 0.015; // ~1 mile radius in degrees lat/lng at FL latitudes
  const bbox = { xmin: lng-deg, ymin: lat-deg, xmax: lng+deg, ymax: lat+deg };
  const geomStr = JSON.stringify(bbox);
  const geomEnc = encodeURIComponent(geomStr);
  
  const tBeds = parseInt(beds) || 0;
  const tSqft = parseInt(sqft) || 0;
  const sqftLo = Math.round(tSqft * 0.70);
  const sqftHi = Math.round(tSqft * 1.40);
  const tBaths = parseFloat(baths) || 0;

  const countyNorm = (county || '').toLowerCase().replace(' county','').trim();
  
  // County-specific ArcGIS REST endpoints + field mappings
  const countyConfigs = {
    hillsborough: {
      url: 'https://gis.hcpafl.org/arcgis/rest/services/Parcels/MapServer/0/query',
      where: `ZIPCD='${zip}' AND SAYR>=2024 AND SALPRC>50000`,
      fields: 'SITEADDR,BEDRM,SQFT,SALPRC,SAYR,SALMO,NBHC',
      map: a => ({ address:a.SITEADDR, beds:a.BEDRM, sqft:a.SQFT, salePrice:a.SALPRC, saleDate:`${a.SAYR}-${String(a.SALMO||1).padStart(2,'0')}`, source:'hillsborough_gis' })
    },
    pinellas: {
      url: 'https://pcpao-gis.pinellas.gov/arcgis/rest/services/public/PCPAO_Parcels/MapServer/0/query',
      where: `SALE_YEAR>=2024 AND SALE_PRICE>50000 AND DOR_CODE BETWEEN 1 AND 9`,
      fields: 'PROPERTY_ADDRESS,NO_BDRMS,LIVING_AREA,SALE_PRICE,SALE_DATE,NO_BATH',
      map: a => ({ address:a.PROPERTY_ADDRESS, beds:a.NO_BDRMS, baths:a.NO_BATH, sqft:a.LIVING_AREA, salePrice:a.SALE_PRICE, saleDate:(a.SALE_DATE||'').slice(0,10), source:'pinellas_gis' })
    },
    polk: {
      url: 'https://maps.polkflpa.gov/arcgis/rest/services/Parcel/MapServer/0/query',
      where: `SALE_YEAR>=2024 AND SALE_PRICE>50000`,
      fields: 'SITE_ADDRESS,BDRM_CNT,LIVING_SQ_FT,SALE_PRICE,SALE_DATE,BATH_CNT',
      map: a => ({ address:a.SITE_ADDRESS, beds:a.BDRM_CNT, baths:a.BATH_CNT, sqft:a.LIVING_SQ_FT, salePrice:a.SALE_PRICE, saleDate:(a.SALE_DATE||'').slice(0,10), source:'polk_gis' })
    },
    pasco: {
      url: 'https://gis.pascocountyfl.net/arcgis/rest/services/Parcel/ParcelData/MapServer/0/query',
      where: `SALE_DATE>='2024-01-01' AND SALE_PRICE>50000`,
      fields: 'SITE_ADDR,NO_BEDRMS,LAND_SQ_FT,SALE_PRICE,SALE_DATE,NO_BATHFULL',
      map: a => ({ address:a.SITE_ADDR, beds:a.NO_BEDRMS, baths:a.NO_BATHFULL, sqft:a.LAND_SQ_FT, salePrice:a.SALE_PRICE, saleDate:(a.SALE_DATE||'').slice(0,10), source:'pasco_gis' })
    },
    hernando: {
      url: 'https://gis.hernandocounty.us/arcgis/rest/services/PropertyAppraiser/Parcels/MapServer/0/query',
      where: `SALE_YEAR>=2024 AND SALE_PRICE>50000`,
      fields: 'SITE_ADDRESS,BEDROOMS,LIVING_AREA,SALE_PRICE,SALE_DATE',
      map: a => ({ address:a.SITE_ADDRESS, beds:a.BEDROOMS, sqft:a.LIVING_AREA, salePrice:a.SALE_PRICE, saleDate:(a.SALE_DATE||'').slice(0,10), source:'hernando_gis' })
    },
    manatee: {
      url: 'https://www.manateepao.com/arcgis/rest/services/Parcels/MapServer/0/query',
      where: `SALE_YR>=2024 AND SALE_PRICE>50000 AND DOR_CD<10`,
      fields: 'SITE_ADDR_1,BED_CNT,LIVING_SQ_FT,SALE_PRICE,SALE_DT,BATH_CNT',
      map: a => ({ address:a.SITE_ADDR_1, beds:a.BED_CNT, baths:a.BATH_CNT, sqft:a.LIVING_SQ_FT, salePrice:a.SALE_PRICE, saleDate:(a.SALE_DT||'').slice(0,10), source:'manatee_gis' })
    }
  };

  const cfg = countyConfigs[countyNorm];
  if (!cfg) {
    console.log(`⚠️ No GIS config for county: ${countyNorm} — will use web comps`);
    return [];
  }

  try {
    // Try zip-code WHERE first, add geometry if zip fails
    const baseParams = {
      where: cfg.where,
      outFields: cfg.fields,
      resultRecordCount: '80',
      f: 'json'
    };
    // Add spatial filter with proper WGS84 coordinate system
    const spatialParams = {
      ...baseParams,
      geometry: geomStr,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      inSR: '4326',   // WGS84 lat/lng from Nominatim
      outSR: '4326'
    };
    const params = new URLSearchParams(spatialParams);
    const r = await fetch(`${cfg.url}?${params}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) { console.log(`❌ ${countyNorm} GIS HTTP ${r.status}`); return []; }
    const data = await r.json();
    let features = data?.features || [];
    
    // If spatial query returned nothing, try zip-only query as fallback
    if (features.length === 0 && zip) {
      console.log(`🔄 ${countyNorm} spatial gave 0 — trying zip-only query for ${zip}`);
      const zipParams = new URLSearchParams({ where: cfg.where, outFields: cfg.fields, resultRecordCount: '80', f: 'json' });
      const r2 = await fetch(`${cfg.url}?${zipParams}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      }).catch(() => null);
      if (r2?.ok) {
        const d2 = await r2.json();
        features = d2?.features || [];
        console.log(`🏛️ ${countyNorm} zip fallback: ${features.length} raw records for zip ${zip}`);
      }
    } else {
      console.log(`🏛️ ${countyNorm} GIS: ${features.length} raw records within 1-mile radius`);
    }
    
    // Filter and map
    const comps = features
      .map(f => cfg.map(f.attributes || {}))
      .filter(c => {
        if (!c.salePrice || c.salePrice < 60000 || c.salePrice > 5000000) return false;
        if (tBeds > 0 && c.beds > 0 && Math.abs(c.beds - tBeds) > 1) return false;
        if (tSqft > 0 && c.sqft > 0 && (c.sqft < sqftLo || c.sqft > sqftHi)) return false;
        return true;
      })
      .map(c => {
        const ppsf = c.sqft > 0 ? Math.round(c.salePrice / c.sqft) : null;
        return { ...c, ppsf, sold_price: c.salePrice };
      })
      .slice(0, 20);

    console.log(`✅ ${countyNorm} GIS: ${comps.length} filtered comps for ${address}`);
    return comps;
  } catch (e) {
    console.warn(`❌ ${countyNorm} GIS error:`, e.message?.slice(0,80));
    return [];
  }
}

async function fetchHillsboroughGIS(zip, beds, sqft) {
  try {
    // HCPA ArcGIS Feature Service - public REST endpoint
    const where = `ZIPCD = '${zip}' AND SALMO >= 1 AND SAYR >= 2024`;
    const url = `https://gis.hcpafl.org/arcgis/rest/services/Parcels/MapServer/0/query?` +
      `where=${encodeURIComponent(where)}&outFields=SITEADDR,BEDRM,SQFT,SALPRC,SAYR,SALMO,NBHC&` +
      `orderByFields=SAYR+DESC,SALMO+DESC&resultRecordCount=100&f=json`;

    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const data = await r.json();
    const features = data?.features || [];

    const tBeds = parseInt(beds) || 0;
    const tSqft = parseInt(sqft) || 0;

    return features
      .filter(f => {
        const a = f.attributes || {};
        const price = parseInt(a.SALPRC) || 0;
        const hSqft = parseInt(a.SQFT)   || 0;
        const hBeds = parseInt(a.BEDRM)  || 0;
        if (price < 75000 || price > 5000000) return false;
        if (tBeds > 0 && hBeds > 0 && Math.abs(hBeds - tBeds) > 1) return false;
        if (tSqft > 0 && hSqft > 0) {
          const r = hSqft / tSqft;
          if (r < 0.65 || r > 1.40) return false;
        }
        return true;
      })
      .map(f => {
        const a = f.attributes || {};
        const price = parseInt(a.SALPRC) || 0;
        const hSqft = parseInt(a.SQFT)   || 0;
        const yr    = parseInt(a.SAYR)   || 2025;
        const mo    = String(parseInt(a.SALMO) || 1).padStart(2,'0');
        return {
          address:    (a.SITEADDR || '').toUpperCase(),
          city:       'TAMPA',
          sqft:       hSqft,
          beds:       parseInt(a.BEDRM) || 0,
          baths:      0,
          year_built: null,
          nbhc:       a.NBHC || null,
          sold_price: price,
          sold_date:  `${yr}-${mo}-01`,
          ppsf:       hSqft > 0 ? Math.round(price / hSqft) : null,
          dom:        null,
          pool:       null,
          source:     'HCPA_GIS_LIVE'
        };
      })
      .slice(0, 15);
  } catch(e) {
    console.warn('HCPA GIS fetch error:', e.message);
    return [];
  }
}



// ── WEB-SEARCH COMPS ─────────────────────────────────────────────────────────
// Fallback comp source: uses Claude web search to find real Zillow/Redfin sold
// listings for any address in Florida. Called automatically when CCG DB and 
// Redfin HTML scraping both come up empty.
async function fetchWebComps(address, city, zip, deal = {}) {
  const beds  = deal.beds  ? parseInt(deal.beds)    : null;
  const baths = deal.baths ? parseFloat(deal.baths) : null;
  const sqft  = deal.sqft  ? parseInt(deal.sqft)    : null;
  const county = (deal.county||'').toLowerCase().replace(' county','').trim();

  const sqftLow  = sqft ? Math.round(sqft * 0.70) : 900;
  const sqftHigh = sqft ? Math.round(sqft * 1.40) : 3500;
  const bedsLow  = beds ? Math.max(1, beds - 1) : 2;
  const bedsHigh = beds ? beds + 1 : 5;

  // 3 parallel searches targeting different data sources
  const [r1, r2, r3] = await Promise.all([

    // Search 1: Redfin sold listings — targeted URL with filters
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content:
          `Search for homes that SOLD in ${zip} FL in the past 12 months on Redfin.\n` +
          `Go to: https://www.redfin.com/zipcode/${zip}/filter/include=sold-12mo or search "redfin ${zip} FL recently sold ${beds||3} bedroom"\n` +
          `I need single-family homes that already CLOSED (not for sale). They need actual closed sale prices.\n\n` +
          `Return a JSON array of sold homes:\n` +
          `[{"address":"123 Oak Ave","city":"${city||''}","zip":"${zip}","sqft":1500,"beds":${beds||3},"baths":${baths||2},"salePrice":248000,"saleDate":"2025-01","ppsf":165,"source":"redfin_sold"}]\n` +
          `salePrice is in dollars (248000 not "$248K"). Return [] if no actual closed sales found.`
        }]
      })
    }).then(r => r.json()).catch(() => ({ content: [] })),

    // Search 2: Zillow + public records
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content:
          `Find recent home sales in ${city||''} Florida zip code ${zip}.\n` +
          `Search: "zillow.com ${zip} sold" OR "${city||zip} FL homes sold 2024 2025" OR "realtor.com ${zip} recently sold"\n` +
          `I need ${bedsLow}-${bedsHigh} bedroom single family homes, ${sqftLow}-${sqftHigh} sqft, sold in last 12 months.\n\n` +
          `Return JSON array with actual sale prices (not asking prices):\n` +
          `[{"address":"456 Pine St","city":"${city||''}","zip":"${zip}","sqft":1600,"beds":${beds||3},"baths":${baths||2},"salePrice":265000,"saleDate":"2025-02","ppsf":166,"source":"zillow_sold"}]\n` +
          `Return [] if no actual sold prices found.`
        }]
      })
    }).then(r => r.json()).catch(() => ({ content: [] })),

    // Search 3: County property appraiser + other sources
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content:
          `Find home sale prices in ${city||''} FL ${zip} from property records or MLS data.\n` +
          `Try these searches:\n` +
          `- "${county||city||zip} property appraiser recent sales 2024 2025"\n` +
          `- "homes sold ${zip} Florida 2024"\n` +
          `- "propstream OR batchdata ${zip} sold"\n` +
          `- site:har.com OR site:redfin.com "${zip} sold"\n\n` +
          `Return sale prices as JSON:\n` +
          `[{"address":"789 Elm Dr","city":"${city||''}","zip":"${zip}","sqft":1450,"beds":${beds||3},"baths":${baths||2},"salePrice":242000,"saleDate":"2024-11","ppsf":167,"source":"public_record"}]\n` +
          `Return [] if nothing found.`
        }]
      })
    }).then(r => r.json()).catch(() => ({ content: [] }))
  ]);

  const comps = [];
  const seen = new Set();

  const parseComps = (result) => {
    const blocks = result?.content || [];
    // Try all text blocks — web search may return multiple
    for (const block of blocks) {
      if (block.type !== 'text' || !block.text) continue;
      const raw = block.text.trim();
      // Find JSON array anywhere in the response
      let start = raw.indexOf('[');
      while (start !== -1) {
        const end = raw.lastIndexOf(']', raw.length);
        if (end <= start) break;
        try {
          const arr = JSON.parse(raw.slice(start, end + 1));
          if (!Array.isArray(arr)) { start = raw.indexOf('[', start + 1); continue; }
          for (const comp of arr) {
            // Robust price extraction — handles "$248K", "$248,000", 248000
            let price = comp.salePrice || comp.price || comp.sold_price || comp.saleAmount;
            if (typeof price === 'string') {
              const kMatch = price.match(/([\d,]+\.?\d*)\s*[Kk]/);
              const numMatch = price.match(/([\d,]+\.?\d*)/);
              if (kMatch) price = parseFloat(kMatch[1].replace(/,/g, '')) * 1000;
              else if (numMatch) price = parseFloat(numMatch[1].replace(/,/g, ''));
            }
            price = Math.round(parseFloat(price) || 0);
            if (!price || price < 30000 || price > 10000000) continue;
            
            const addr = (comp.address || comp.street || '').trim();
            if (!addr) continue;
            const key = (addr + (comp.zip || zip)).toLowerCase().replace(/\s+/g,'');
            if (seen.has(key)) continue;
            seen.add(key);
            
            const compSqft = parseInt(comp.sqft || comp.livingArea || comp.size) || null;
            const ppsf = compSqft && price ? Math.round(price / compSqft) : (parseInt(comp.ppsf) || null);
            
            comps.push({
              address: addr,
              city: comp.city || city || '',
              zip: comp.zip || zip,
              sqft: compSqft,
              beds: parseInt(comp.beds || comp.bedrooms) || null,
              baths: parseFloat(comp.baths || comp.bathrooms) || null,
              salePrice: price,
              sold_price: price,
              saleDate: comp.saleDate || comp.soldDate || comp.closeDate || '',
              ppsf,
              source: comp.source || 'web_search'
            });
          }
          break; // Found valid array, stop looking
        } catch (e) {
          start = raw.indexOf('[', start + 1);
        }
      }
    }
  };

  parseComps(r1);
  parseComps(r2);
  parseComps(r3);

  // Normalize salePrice → sold_price
  comps.forEach(c => { if (!c.sold_price && c.salePrice) c.sold_price = c.salePrice; });

  // If fewer than 3 comps, do one more broader search
  const sold = comps.filter(c => c.salePrice > 0);
  if (sold.length < 3) {
    console.log('Web comps retry: only ' + sold.length + ' found — trying broader search for ' + address);
    const r4 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(25000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content:
          `I need home sale prices in ${city||zip} FL. Search broadly:\n` +
          `"${city||zip} FL home prices 2024 2025" OR "${zip} real estate sold"\n` +
          `Any single family home sales in the past 2 years work.\n` +
          `Return JSON: [{"address":"any street","city":"${city||''}","zip":"${zip}","sqft":1500,"beds":3,"baths":2,"salePrice":250000,"saleDate":"2024-06","source":"public_record"}]\n` +
          `Return [] only if truly no data.`
        }]
      })
    }).then(r => r.json()).catch(() => ({ content: [] }));
    parseComps(r4);
  }

  const result = comps.filter(c => c.salePrice > 0).sort((a,b) => (a.distanceMiles||1) - (b.distanceMiles||1)).slice(0, 10);
  console.log('Web comps: ' + result.length + ' for ' + address + ' (zip ' + zip + ')');
  return result;
}


async function fetchComps(address, city, state, zip, deal = {}) {
  const _ck = (address + '|' + (zip || city || '')).toLowerCase().trim();
  if (deal._forceRefreshComps) {
    // Manual underwrite — clear stale cache and force fresh comp fetch
    await DB.saveComps(_ck, { comps: [], _meta: { cleared: true } }).catch(() => {});
    console.log('🔄 Cache cleared for fresh comp fetch:', address);
  } else {
    const _cached = await DB.getCachedComps(_ck).catch(() => null);
    if (_cached?.comps?.length) {
      const _c = _cached.comps;
      _c._meta = _cached._meta || { arvEstimate: null };
      console.log('💾 Cached comps:', address, '(' + _c.length + ')');
      return _c;
    }
  }
  // No address-specific cache — check actual sold_comps table first (real MLS-grade data)
  if (!deal._forceRefreshComps) {
    const zipKey = zip || (city || '').toLowerCase().trim();
    if (zipKey) {
      const sqft = deal.sqft ? parseInt(deal.sqft) : null;
      const beds = deal.beds ? parseInt(deal.beds) : null;
      const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 18);
      // Build comp query from deal details — match what the property actually has
    const compOpts = {
      beds:      beds,
      sqft:      sqft,
      baths:     deal.baths      ? parseFloat(deal.baths)         : null,
      // Wider filters — don't require pool match, let Claude assess comparability
      yearBuilt: deal.year_built ? parseInt(deal.year_built)      : null,
      nbhc:      deal.nbhc       || null,   // Hillsborough neighborhood code
      renovated: deal.renovated  || false,  // true = P60+ comps only (renovated market)
      limit:     25,
      minDate:   sixMonthsAgo.toISOString().slice(0, 10)
    };
    const realComps = await DB.getSoldComps(zipKey, compOpts).catch(() => []);
      if (realComps.length >= 3) {
        console.log('🏠 Real sold comps hit for zip', zipKey, '—', realComps.length, 'actual sales');
        const prices = realComps.map(c => c.sold_price).filter(p => p > 0).sort((a,b)=>a-b);
        const pct = (arr, p) => arr[Math.min(arr.length-1, Math.floor(arr.length * p))] || arr[Math.floor(arr.length/2)];
        const arvEst = pct(prices, 0.50); // Median = base ARV (as-is)
        const avgPpsf = realComps.filter(c=>c.ppsf).reduce((s,c)=>s+parseFloat(c.ppsf),0) / realComps.filter(c=>c.ppsf).length;
        const formatted = realComps.map(c => ({
          address: c.address, city: c.city, sqft: c.sqft, beds: c.beds, baths: c.baths,
          year_built: c.year_built, sold_price: c.sold_price, ppsf: c.ppsf,
          sold_date: c.sold_date, dom: c.dom, pool: c.pool, style: c.style,
          subdivision: c.subdivision
        }));
        // Compute P75 = renovated/top-of-market ARV standard
        const sortedPrices = [...prices];
        // Improved percentile with linear interpolation for more accurate estimates
        const pctile = (arr, p) => {
          if (!arr.length) return arvEst;
          const i = (arr.length - 1) * p;
          const lo = Math.floor(i), hi = Math.ceil(i);
          return lo === hi ? arr[lo] : Math.round(arr[lo] + (arr[hi] - arr[lo]) * (i - lo));
        };
        const p60 = pctile(sortedPrices, 0.60);   // P60 — lightly renovated
        const p75 = pctile(sortedPrices, 0.75);   // P75 — renovated (standard ARV)
        const p90 = pctile(sortedPrices, 0.90);   // P90 — top of market

        formatted._meta = {
          arvEstimate: arvEst,        // median — as-is/mid-market
          p60Estimate: p60,           // P60 — lightly renovated standard
          p75Estimate: p75,           // P75 — renovated standard (USE THIS for ARV)
          p90Estimate: p90,           // P90 — top of market (luxury finish)
          source: 'sold_comps_db',
          zip: zipKey,
          count: realComps.length,
          avg_ppsf: Math.round(avgPpsf) || null
        };
        DB.saveComps(_ck, { comps: formatted, _meta: formatted._meta }).catch(() => {});
        return formatted;
      }
      // Fall back to zip-level aggregate market data
      const mktData = await DB.getMarketData(zipKey).catch(() => null);
      if (mktData && mktData.median_sold) {
        console.log('📊 Market data for zip', zipKey, '— $' + mktData.median_sold + ' median, falling through to web search for real comps');
        // Don't return here — let web search get actual comp sales; store market data for context
        deal._marketDataContext = { arvEstimate: mktData.median_sold, source: 'market_db', avg_ppsf: mktData.avg_ppsf };
      }
    }
  }

  // ── LIVE COMP FALLBACK CHAIN ─────────────────────────────────────────────────
  // 1. County Property Appraiser GIS — government API, real recorded deed sales, never blocks
  let liveComps = [];
  if (deal.county) {
    liveComps = await fetchCountyGISComps(address, city, state, zip, deal.county, deal.beds, deal.baths, deal.sqft).catch(() => []);
    if (liveComps.length >= 3) console.log(`✅ County GIS: ${liveComps.length} comps for ${address}`);
  }

  // 2. Redfin HTML scraper (fallback — works unless Redfin blocks datacenter IP)
  if (liveComps.length < 3) {
    const rfComps = await fetchLiveRedfin(zip, deal.beds, deal.sqft, deal.baths).catch(() => []);
    if (rfComps.length > 0) liveComps = [...liveComps, ...rfComps];
  }

  // 3. Hillsborough-specific zip-based GIS if radius search gave nothing
  if (liveComps.length < 3 && zip && (deal.county || '').toLowerCase().includes('hillsborough')) {
    const hcpaComps = await fetchHillsboroughGIS(zip, deal.beds, deal.sqft).catch(() => []);
    if (hcpaComps.length > liveComps.length) liveComps = hcpaComps;
  }

  if (liveComps.length >= 3) {
    const prices = liveComps.map(c => c.sold_price).filter(p => p > 0).sort((a,b)=>a-b);
    const arvEst = prices[Math.floor(prices.length / 2)];
    const p60 = prices[Math.floor(prices.length * 0.60)] || arvEst;
    const p75 = prices[Math.floor(prices.length * 0.75)] || arvEst;
    const p90 = prices[Math.floor(prices.length * 0.90)] || arvEst;
    const avgPpsf = liveComps.filter(c=>c.ppsf).reduce((s,c)=>s+c.ppsf,0) / (liveComps.filter(c=>c.ppsf).length||1);
    const src = liveComps[0]?.source || 'LIVE';

    liveComps._meta = {
      arvEstimate: arvEst,
      p60Estimate: p60,
      p75Estimate: p75,
      p90Estimate: p90,
      source: src,
      zip: zip,
      count: liveComps.length,
      avg_ppsf: Math.round(avgPpsf) || null
    };
    DB.saveComps(_ck, { comps: liveComps, _meta: liveComps._meta }).catch(() => {});
    return liveComps;
  }

  // Fallback 3: web-search comps
  // For NEW deals (first-time underwrite from auto-batch): fetch comps once, cache forever
  // For manual ⚡: always fetch fresh comps (cache was cleared above)
  // This way auto-batch gets real comps on first run (cached → instant on reruns)
  console.log('🌐 Fetching live comps for', address, zip, deal._forceRefreshComps ? '(manual refresh)' : '(first-time auto)');
  const webComps = await fetchWebComps(address, city, zip, deal).catch(e => { console.warn('Web comps err:', e.message); return []; });
  if (webComps.length >= 2) {
    const prices = webComps.map(c => c.salePrice || c.sold_price).filter(p => p > 0).sort((a,b)=>a-b);
    const pctile = (arr, p) => { const i = (arr.length-1)*p; const lo=Math.floor(i),hi=Math.ceil(i); return lo===hi?arr[lo]:Math.round(arr[lo]+(arr[hi]-arr[lo])*(i-lo)); };
    const arvEst = pctile(prices, 0.60);   // P60 = light-rehab ARV
    const p75 = pctile(prices, 0.75);      // P75 = full-rehab ARV
    const avgPpsf = webComps.filter(c=>c.ppsf||c.sqft).reduce((s,c)=>s+(c.ppsf||(c.salePrice/c.sqft)||0),0)/webComps.filter(c=>c.sqft).length;
    webComps._meta = {
      arvEstimate: arvEst,
      p60Estimate: arvEst,
      p75Estimate: p75,
      source: 'web_search',
      zip: zip,
      count: webComps.length,
      avg_ppsf: Math.round(avgPpsf) || null
    };
    // Only cache non-empty results
    if (webComps.length > 0) {
      DB.saveComps(_ck, { comps: webComps, _meta: webComps._meta }).catch(() => {});
    }
    return webComps;
  }

  // Last resort: return empty comps with market aggregate from DB
  const emptyComps = [];
  const mktFallback = await DB.getMarketData(zip || city).catch(() => null);
  emptyComps._meta = {
    arvEstimate: mktFallback?.median_sold || null,
    source: 'market_aggregate_only',
    zip: zip
  };
  return emptyComps;
}

// ── UNIT COUNT HELPER — detects duplex/triplex/quad from property type ──────────
function getUnitCount(propertyType) {
  if (!propertyType) return 1;
  const t = propertyType.toLowerCase();
  if (t.includes('duplex') || t.includes('2-unit') || t.includes('2 unit') || t.includes('two unit') || t.includes('two-unit')) return 2;
  if (t.includes('triplex') || t.includes('3-unit') || t.includes('3 unit') || t.includes('three unit')) return 3;
  if (t.includes('quadplex') || t.includes('quadruplex') || t.includes('4-unit') || t.includes('4 unit') || t.includes('four unit') || t.includes('quad')) return 4;
  // Parse "X-unit" or "X unit" format
  const numMatch = t.match(/(\d+)[-\s]?unit/);
  if (numMatch) return Math.min(parseInt(numMatch[1]), 20);
  // Multi-family — assume at least 2 if no number given
  if (t.includes('multi') || t.includes('multifamily')) return 2;
  return 1;
}

// ── FETCH RENTAL MARKET DATA via web search ────────────────────────────────────
async function fetchRentalComps(city, county, zip, beds, sqft) {
  const bedsLabel = beds ? beds + ' bedroom' : '3 bedroom';
  const countyClean = (county || '').replace(' County', '').trim();
  const location = zip ? zip : (city || countyClean + ' County FL');

  try {
    const searches = [
      `average rent ${bedsLabel} house ${city || countyClean} Florida 2025`,
      `HUD fair market rent ${countyClean} County Florida 2025 ${bedsLabel}`,
    ];
    const results = await Promise.all(searches.map(q =>
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 800,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
          messages: [{ role: 'user', content: 'Search and return ONLY the key rental price data: ' + q + '. Give me 1BR, 2BR, 3BR, 4BR average monthly rent numbers if available, plus HUD FMR if found. Be brief — just the numbers.' }]
        })
      }).then(r => r.json()).catch(() => null)
    ));

    const texts = results.map(r => {
      if (!r || !r.content) return '';
      return r.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
    }).filter(Boolean).join('\n\n');

    return texts.length > 50 ? texts.slice(0, 2000) : null;
  } catch(e) {
    console.log('[RENTAL] Search err:', e.message?.slice(0, 60));
    return null;
  }
}

async function fetchDeepComps(address, city, state, zip, beds, baths, sqft, propType, deal = {}) {
  const comps = [];
  comps._meta = { arvEstimate: null, dataQuality: 'DEEP' };

  try {
    // 3 searches in parallel for deep mode — sold comps, wider radius, active listings
    const [r1, r2, r3] = await Promise.all([
      // Search 1: recent sold comps (tight radius)
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content:
            `Search Zillow and Redfin for recently SOLD homes near ${address}, ${city}, FL ${zip}. ` +
            `Find 4-6 sold comps from last 6 months within 1 mile, similar to ${beds||3}bd/${baths||2}ba ~${sqft||1200}sqft. ` +
            `Also get the Zestimate for ${address} itself. ` +
            `Return ONLY a JSON array:\n` +
            `[{"address":"123 Oak Ave","sqft":1350,"beds":3,"baths":2,"salePrice":248000,"saleDate":"2025-03","distanceMiles":0.4,"source":"zillow_sold"}]\n` +
            `Include subject property as source "zestimate". Return [] if none found.`
          }]
        })
      }).then(r => r.json()),

      // Search 2: county appraiser + permit data
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content:
            `Search for "${address} ${city} FL property appraiser" to find the county tax record. ` +
            `Find: assessed value, last sale price, last sale date, year built. ` +
            `Return ONLY JSON object (no array):\n` +
            `{"assessedValue":185000,"lastSalePrice":140000,"lastSaleDate":"2019-06","yearBuilt":1968,"notes":"found on hillsborough property appraiser"}`
          }]
        })
      }).then(r => r.json())
    ]);

    // Parse comp array from search 1
    const tb1 = r1.content?.find(c => c.type === 'text');
    if (tb1?.text) {
      const raw = tb1.text.trim();
      const s = raw.indexOf('['), e = raw.lastIndexOf(']');
      if (s !== -1 && e > s) {
        try {
          const arr = JSON.parse(raw.slice(s, e+1));
          arr.forEach(c => { if (c?.salePrice) comps.push(c); });
        } catch {}
      }
    }

    // Parse property record from search 2
    const tb2 = r2.content?.find(c => c.type === 'text');
    if (tb2?.text) {
      const raw = tb2.text.trim();
      const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
      if (s !== -1 && e > s) {
        try {
          const propData = JSON.parse(raw.slice(s, e+1));
          comps._meta.propertyData = propData;
          if (propData.assessedValue) {
            comps.push({ address, sqft: null, beds: null, baths: null,
              salePrice: propData.assessedValue, saleDate: 'assessed',
              distanceMiles: 0, source: 'tax_assessed' });
          }
          console.log(`📋 County record: assessed $${propData.assessedValue?.toLocaleString()}, last sold $${propData.lastSalePrice?.toLocaleString()} (${propData.lastSaleDate})`);
        } catch {}
      }
    }

    // Compute ARV
    const soldComps = comps.filter(c => c.source?.includes('sold') && c.salePrice);
    const estimates = comps.filter(c => c.source === 'zestimate' && c.salePrice);
    console.log(`Deep comps: ${soldComps.length} sold, ${estimates.length} zestimates, ${comps.filter(c=>c.source==='tax_assessed').length} tax`);
    if (soldComps.length || estimates.length) {
      const soldAvg = soldComps.length ? soldComps.reduce((a,c)=>a+c.salePrice,0)/soldComps.length : 0;
      const estAvg = estimates.length ? estimates.reduce((a,c)=>a+c.salePrice,0)/estimates.length : 0;
      comps._meta.arvEstimate = Math.round(soldAvg && estAvg ? soldAvg*0.75+estAvg*0.25 : soldAvg || estAvg);
      console.log(`Deep ARV: $${comps._meta.arvEstimate?.toLocaleString()}`);
    }
  } catch(e) { console.log('fetchDeepComps error:', e.message); }
  return comps;
}


// ── UNDERWRITE ENGINE ─────────────────────────────────────────────────────────
// ── REGENERATE VERDICT ────────────────────────────────────────────────────────
// Called after any number override — re-computes verdict/score/recommendation
// from updated numbers WITHOUT re-running comps (cheap Haiku call)
async function regenerateVerdict(uw) {
  const deal = uw.deal || {};
  const arv      = uw.arv?.urbanARV || 0;
  const repairs  = uw.rehab?.urbanEstimate || 0;
  const asking   = parseFloat(deal.askingPrice) || 0;
  const mao      = uw.financials?.mao || Math.round(arv * 0.7 - repairs);
  const costs    = (uw.financials?.holdingCosts?.total || 0) + 
                   (uw.financials?.sellingCosts?.total || 0) +
                   (uw.financials?.hardMoney?.totalInterest || 0) +
                   (uw.financials?.hardMoney?.originationPoints || 0);
  const profit   = Math.round(arv - asking - repairs - costs);
  const roi      = arv > 0 && asking > 0 ? parseFloat(((profit / (asking + repairs)) * 100).toFixed(1)) : 0;
  const wsARV    = uw.arv?.wholesalerARV || 0;
  const arvGap   = wsARV ? Math.round(((wsARV - arv) / arv) * 100) : 0;

  // Recalculate all financials from scratch with corrected numbers
  uw.financials = {
    ...uw.financials,
    mao,
    overUnderMAO:       Math.round(asking - mao),
    netProfitAtAsking:  profit,
    netProfitAtMAO:     Math.round(arv - mao - repairs - costs),
    roi,
    meetsMinimumProfit: (function(p,a){return a>=1000000?p>=100000:p>=Math.max(a*0.10,20000);})(profit, parseFloat(deal.askingPrice)||0),
  };

  // Rebuild negotiation ladder — smart price points based on asking vs MAO
  const _askBelowMAO = asking <= mao;
  const _pts_raw = _askBelowMAO
    ? [mao, asking, Math.round(asking*0.95), Math.round(asking*0.90), Math.round(asking*0.85)]  // asking < MAO: show negotiation below asking
    : [asking, mao, Math.round(mao*0.95), Math.round(mao*0.90), Math.round(mao*0.85)];          // asking > MAO: show counter below MAO
  const pts = [...new Set(_pts_raw.filter(p => p > 0))].sort((a,b) => b-a);
  uw.negotiationLadder = pts.map(price => ({
    price,
    label: price === mao
           ? (_askBelowMAO ? 'CEILING' : 'Max Offer')
           : price >= Math.round(asking*0.98)
           ? (_askBelowMAO ? 'Asking' : 'ASKING (over)')
           : price > asking
           ? 'If pressed'
           : price >= Math.round(asking*0.94)
           ? 'Counter'
           : price >= Math.round(asking*0.89)
           ? 'Open offer'
           : 'Best case',
    profit:   Math.round(arv - price - repairs - costs),
    meetsMin: (() => { const _p=Math.round(arv-price-repairs-costs); const _min=price>=1000000?100000:Math.max(price*0.10,20000); return _p>=_min; })(),
    roi:      arv > 0 ? parseFloat(((Math.round(arv - price - repairs - costs) / (price + repairs)) * 100).toFixed(1)) : 0
  }));

  // Rebuild exit analysis if we have Tampa neighborhood data
  const _city = (deal.city||'').toLowerCase();
  const _nb   = Object.entries(TAMPA.neighborhoods).find(([name]) => _city.includes(name) || name.includes(_city.split(' ')[0]));
  if (_nb) {
    const tier = _nb[1].tier;
    const dom  = TAMPA.marketConditions.days_on_market[tier.startsWith('A') ? 'a_tier' : tier.startsWith('B') ? 'b_tier' : 'c_tier'] || 45;
    const lsr  = TAMPA.marketConditions.list_to_sale_ratio[tier.startsWith('A') ? 'a_tier' : tier.startsWith('B') ? 'b_tier' : 'c_tier'] || 0.94;
    uw.exitAnalysis = { ...uw.exitAnalysis, estimatedDOM: dom, listToSaleRatio: lsr, realisticSalePrice: Math.round(arv * lsr), adjustedProfit: Math.round(profit - (arv - Math.round(arv * lsr))) };
  }

  // Re-run verdict/recommendation via Haiku (cheap — just the judgment, not the full analysis)
  const regenPrompt = 'You are Urban, elite Tampa Bay fix-and-flip underwriter for Coralstone Capital Group.\n\n' +
    'UPDATED NUMBERS (user corrected these):\n' +
    'Address: ' + (deal.address||'?') + ', ' + (deal.city||'?') + ' FL\n' +
    'Urban TRUE ARV: $' + arv.toLocaleString() + ' | Wholesaler ARV: $' + wsARV.toLocaleString() + (arvGap ? ' (inflated ' + arvGap + '%)' : '') + '\n' +
    'Repairs: $' + repairs.toLocaleString() + ' | Asking: $' + asking.toLocaleString() + '\n' +
    'MAO (ARV×70%-repairs): $' + mao.toLocaleString() + '\n' +
    'Net Profit @ Ask: $' + profit.toLocaleString() + ' | ROI: ' + roi + '%\n' +
    'Meets profit min (' + (ask < 1000000 ? Math.round(Math.max(ask*0.10,20000)/1000)+'K' : '$100K') + '): ' + (profit >= Math.max(ask*0.10,20000) ? 'YES' : 'NO') + '\n' +
    'Prior verdict: ' + (uw.verdict||'?') + ' (' + (uw.score||0) + '/10)\n\n' +
    'Based ONLY on these corrected numbers, give a new verdict, score, reason, and recommendation.\n' +
    'Respond with ONLY valid JSON (no markdown):\n' +
    '{"verdict":"<HOT|BUY|REVIEW|PASS|NEED COMPS|HARD NO>","score":<1-10>,"verdictReason":"<one sentence>","recommendation":"<2-3 hard sentences with specific numbers>","offerStrategy":"<one sentence on what price to offer>"}';

  try {
    const res = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: regenPrompt }]
    });
    const raw = res.content[0].text.trim();
    const f = raw.indexOf('{'), l = raw.lastIndexOf('}');
    if (f !== -1 && l > f) {
      const parsed = JSON.parse(raw.slice(f, l+1));
      uw.verdict       = parsed.verdict       || uw.verdict;
      uw.score         = parsed.score         || uw.score;
      uw.verdictReason = parsed.verdictReason || uw.verdictReason;
      uw.recommendation = parsed.recommendation || uw.recommendation;
      uw.offerStrategy  = parsed.offerStrategy  || uw.offerStrategy;
      uw.lastRegenAt   = new Date().toISOString();
    }
  } catch(e) { console.log('Regen Haiku call failed:', e.message); }

  return uw;
}


// ── MEGAMIND CONTEXT INJECTOR ─────────────────────────────────────────────────
// Assembles ALL harvested brain data relevant to this specific deal.
// This is what makes Urban smarter with every single underwrite.
function getMegamindContext(deal, comps) {
  const zip    = deal.zip    || '';
  const county = (deal.county || deal.city || '').toLowerCase();
  const beds   = parseInt(deal.beds) || 0;
  const sqft   = parseFloat(deal.sqft) || 0;
  const yr     = parseInt(deal.yearBuilt) || 0;
  const email  = (deal.contact1Email || '').toLowerCase();
  const lines  = [];

  const zi = (urbanBrain.zipIntel || {})[zip];
  if (zi && zi.deals >= 2) {
    lines.push(`[ZIP ${zip} | ${zi.deals} CCG DEALS] ARV avg $${(zi.avgARV||0).toLocaleString()} | $/sf $${zi.avgPpsf||'?'} | Rehab avg $${(zi.avgRehab||0).toLocaleString()} | Profit avg $${(zi.avgProfit||0).toLocaleString()} | HOT ${((zi.hotRate||0)*100).toFixed(0)}% | Score avg ${zi.avgScore||'?'}/10 | WholesalerInflation avg ${zi.avgARVInflation||0}%${zi.poolPremium ? ` | Pool premium $${zi.poolPremium.toLocaleString()}` : ''}`);
    const topFlags = Object.entries(zi.riskFlagCounts||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([f,n])=>`${f}(${n}x)`).join(', ');
    if (topFlags) lines.push(`  Top risk flags in ${zip}: ${topFlags}`);
  }

  const mn = (urbanBrain.marketNotes || {})[county];
  if (mn && mn.deals >= 2) {
    lines.push(`[${county.toUpperCase()} COUNTY | ${mn.deals} CCG DEALS] ARV avg $${(mn.avgARV||0).toLocaleString()} | HOT ${((mn.hotRate||0)*100).toFixed(0)}%`);
  }

  if (beds && sqft > 0) {
    const sfBucket = sqft < 1000 ? 'sub1000' : sqft < 1200 ? '1000to1200' : sqft < 1500 ? '1200to1500' : sqft < 1800 ? '1500to1800' : sqft < 2200 ? '1800to2200' : '2200plus';
    const typeKey  = `${beds}bd_${Math.round((parseFloat(deal.baths)||0)*2)/2}ba_${sfBucket}`;
    const pt = (urbanBrain.propertyPatterns || {})[typeKey];
    if (pt && pt.count >= 2) {
      lines.push(`[PROP TYPE ${typeKey} | ${pt.count} CCG DEALS] ARV avg $${(pt.avgARV||0).toLocaleString()} | $/sf $${pt.avgPpsf||'?'} | HOT ${((pt.hotRate||0)*100).toFixed(0)}%`);
    }
  }

  if (yr > 1900) {
    const cohort = yr < 1960 ? 'pre1960' : yr < 1980 ? '1960to1979' : yr < 2000 ? '1980to1999' : '2000plus';
    const yb = (urbanBrain.yearBuiltCohorts || {})[cohort];
    if (yb && yb.count >= 2) {
      lines.push(`[${cohort} COHORT | ${yb.count} CCG DEALS] $/sf avg $${yb.avgPpsf||'?'} | Rehab avg $${(yb.avgRehab||0).toLocaleString()} | Hard NO rate ${((yb.hardNoRate||0)*100).toFixed(0)}%`);
    }
  }

  const RL = urbanBrain.rehabLineItems || {};
  const rlKeys = Object.keys(RL).filter(k => RL[k].count >= 3);
  if (rlKeys.length) {
    lines.push(`[CCG REHAB ACTUALS] ${rlKeys.map(k=>`${k} avg $${RL[k].avg.toLocaleString()}(${RL[k].count}x)`).join(' | ')}`);
  }

  const ws = (urbanBrain.wholesalerStats || {})[email];
  if (ws && ws.deals >= 1) {
    const zipNote = zip && ws.byZip?.[zip] ? ` | In ${zip}: ${ws.byZip[zip].avgInflation}% inflation(${ws.byZip[zip].deals}x)` : '';
    lines.push(`[WHOLESALER ${ws.name||email}] ${ws.deals} deals | ARV inflation avg ${ws.avgARVInflation}%${ws.inflationWarning?' ⚠️ INFLATOR':''} | Verdicts: ${JSON.stringify(ws.verdicts)} | HOT rate ${((ws.hotRate||0)*100).toFixed(0)}%${zipNote}`);
  }

  const HD = urbanBrain.hotDealDNA;
  if (HD && HD.count >= 3) {
    lines.push(`[HOT DEAL DNA | ${HD.count} CCG WINS] ARV avg $${(HD.avgARV||0).toLocaleString()} | Profit avg $${(HD.avgProfit||0).toLocaleString()} | Rehab avg $${(HD.avgRehab||0).toLocaleString()} | Ask/ARV ${((HD.avgAskToARV||0)*100).toFixed(0)}% | ${HD.avgBeds}bd/${HD.avgSqft}sf typical`);
  }

  const HN = urbanBrain.hardNoDNA;
  if (HN && HN.count >= 3) {
    const killers = Object.entries(HN.topRiskFlags||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([f,n])=>`${f}(${n}x)`).join(', ');
    lines.push(`[HARD NO DNA | ${HN.count} DEAD DEALS] Top killers: ${killers||'none yet'}`);
  }

  const RF = urbanBrain.riskFlagIntel || {};
  const impactFlags = Object.entries(RF).filter(([,d])=>d.count>=2&&d.avgScoreWhenPresent<4).map(([f,d])=>`${f}→avg score ${d.avgScoreWhenPresent}(${d.count}x)`).slice(0,3);
  if (impactFlags.length) lines.push(`[HIGH-IMPACT FLAGS] ${impactFlags.join(' | ')}`);

  const FP = urbanBrain.financialPatterns || {};
  if (FP.avgHoldingCosts) lines.push(`[CCG FINANCIAL ACTUALS] Hold costs avg $${(FP.avgHoldingCosts||0).toLocaleString()} | Sell costs avg $${(FP.avgSellingCosts||0).toLocaleString()} | HML costs avg $${(FP.avgHMLCosts||0).toLocaleString()}`);

  return lines.length > 0 ? lines.join('\n') : 'No CCG data yet for this market.';
}

// ── BRAIN CONTEXT BUILDER ────────────────────────────────────────────────────
function getBrainContext(wsEmail, county) {
  const ws = wsEmail ? (urbanBrain.wholesalers || {})[wsEmail.toLowerCase()] : null;
  const mn = county ? (urbanBrain.marketNotes || {})[county] : null;

  // Wholesaler intelligence
  let wholesalerNotes = 'No wholesaler history on file.';
  let wholesalerStats = '';
  if (ws) {
    const deals = ws.deals || 0;
    const avgInflation = ws.avgInflation != null ? ws.avgInflation.toFixed(1) : null;
    wholesalerNotes = `${ws.name || wsEmail}: ${deals} prior deal${deals !== 1 ? 's' : ''}. ${ws.notes || ''}`.trim();
    if (avgInflation) {
      wholesalerStats = avgInflation > 10
        ? `VERIFIED ARV INFLATOR: avg ${avgInflation}% above Urban ARV across ${deals} deals.`
        : avgInflation > 5
        ? `ARV inflation warning: avg +${avgInflation}% above Urban ARV.`
        : `ARV accuracy: avg ${avgInflation}% variance across ${deals} deals.`;
    } else {
      wholesalerStats = deals > 0 ? `${deals} prior deals, no ARV variance tracked yet.` : 'First deal from this wholesaler.';
    }
  }

  // Market context
  let marketContext = 'No market history for this county yet.';
  if (mn && mn.deals >= 1) {
    const hotPct = Math.round(((mn.hotDeals || 0) / mn.deals) * 100);
    marketContext = `${mn.deals} Coralstone deals | Avg ARV: $${(mn.avgARV || 0).toLocaleString()} | HOT rate: ${hotPct}% | ${mn.notes || ''}`.trim();
  }

  return { wholesalerNotes, wholesalerStats, marketContext };
}

async function underwriteDeal(deal, comps, forceRefresh = false, deep = false) {
  const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
  const _ex = underwrites[uid];
  if (_ex && !forceRefresh) {
    if (_ex.arv?.urbanARV && _ex.financials?.mao) return _ex; // Full data in Postgres — free instant return
    if (_ex.verdict && !deep) return _ex; // Has verdict stub — show it, don't re-underwrite
  }

  // ── DEAL NOTES INJECTION — Caleb/Grant notes on this property ──────────────
  const dealNotesForPrompt = await DB.getNotes(uid).catch(function() { return []; });
  let notesContext = '';
  if (dealNotesForPrompt.length > 0) {
    notesContext = '\n\nTEAM NOTES ON THIS PROPERTY:\n' +
      dealNotesForPrompt.map(function(n) {
        const d = new Date(n.created_at);
        const ds = (d.getMonth()+1)+'/'+(d.getDate())+'/'+d.getFullYear();
        return '['+n.author.toUpperCase()+' - '+ds+']: '+n.note;
      }).join('\n') +
      '\nTreat these notes as authoritative context from the CCG team. Use them to adjust your analysis.\n';
  }

  // ── SMART LESSON INJECTION: match by county + property type + wholesaler ──
function getRelevantLessons(deal, maxLessons = 15) {
  const all = urbanBrain.lessons || [];
  const city = (deal.city || '').toLowerCase();
  const county = (deal.county || '').toLowerCase();
  const wsEmail = (deal.contact1Email || '').toLowerCase();
  const wsName  = (deal.wholesalerCompany || deal.contact1Name || '').toLowerCase();

  // Score each lesson by relevance
  const scored = all.map(l => {
    const ll = l.toLowerCase();
    let score = 0;
    if (ll.includes(city)) score += 4;
    if (ll.includes(county)) score += 3;
    if (wsEmail && ll.includes(wsEmail.split('@')[0])) score += 5;
    if (wsName && ll.includes(wsName.split(' ')[0])) score += 3;
    // Recency: newer lessons score higher (last 20 get +2, last 5 get +3)
    const idx = all.indexOf(l);
    if (idx >= all.length - 5)  score += 3;
    if (idx >= all.length - 20) score += 2;
    return { lesson: l, score };
  });

  // Always include CRITICAL / WARNING flagged lessons regardless of relevance
  const critical = all.filter(l => l.includes('⚠️ CRITICAL') || l.includes('⚠️ WARNING') || l.includes('OVERRIDE→HARD NO'));

  // Sort by score descending, take top N (minus critical slots)
  const nonCritical = scored.filter(s => !critical.includes(s.lesson));
  const relevant = nonCritical.sort((a, b) => b.score - a.score).slice(0, maxLessons - critical.length);
  const rest = all.slice(-5).filter(l => !relevant.find(r => r.lesson === l) && !critical.includes(l)); // always include last 5

  return [...new Set([...critical, ...relevant.map(r => r.lesson), ...rest])].join('\n');
}

const brain = getBrainContext(deal.contact1Email, deal.county || deal.city);
const megamindContext = getMegamindContext(deal, comps);  // All harvested data — hundreds of categories
const relevantLessons = getRelevantLessons(deal);

// Fetch live rental market data for this property's location + bed count
const rentalMarketData = await fetchRentalComps(
  deal.city, deal.county, deal.zip,
  parseInt(deal.beds) || 3,
  parseInt(deal.sqft) || 0
).catch(() => null);
  const sqft = parseFloat(deal.sqft) || 0;
  // Normalize asking price — Derek sometimes enters in thousands (e.g. "325" = $325K).
  // Any residential price under $10,000 is clearly a K-format entry.
  const _rawAskRaw = parseFloat(deal.askingPrice) || 0;
  const askingPrice = (_rawAskRaw > 0 && _rawAskRaw < 10000) ? _rawAskRaw * 1000 : _rawAskRaw;
  // Patch back onto deal so rest of pipeline uses corrected price
  if (askingPrice !== _rawAskRaw) {
    deal._rawAskingPrice = deal.askingPrice; // preserve original for reference
    deal.askingPrice = String(askingPrice);
    console.log('[Price Normalize]', deal.address, ':', _rawAskRaw, '→', askingPrice);
  }
  const wholesalerARV = parseFloat(deal.wholesalerARV) || 0;
  const wholesalerRepairs = parseFloat(deal.repairsEstimate) || 0;
  const annualTaxes = parseFloat(deal.annualTaxes) || 0;
  const hoaFee = parseFloat(deal.hoaFee) || 0;

  const meta = comps._meta || {};
  // Build ARV context line — use P75 as the renovated ARV standard
  let arvLine = 'No comp data retrieved — estimate from market knowledge and deal data';
  if (meta.source === 'sold_comps_db' && meta.count >= 3) {
    // Real county recorder data — P75 = renovated/fully-updated ARV standard
    arvLine = `REAL COUNTY COMPS (${meta.count} actual sales, ${meta.zip}): ` +
      `Median (as-is market): $${(meta.arvEstimate||0).toLocaleString()} | ` +
      `P60 (light reno): $${(meta.p60Estimate||0).toLocaleString()} | ` +
      `P75 (RENOVATED ARV — USE THIS): $${(meta.p75Estimate||0).toLocaleString()} | ` +
      `P90 (top of market): $${(meta.p90Estimate||0).toLocaleString()} | ` +
      `Avg $/sqft: $${meta.avg_ppsf || '?'}/sf. ` +
      `SOURCE: ${meta.source} — real arm's-length qualified sales, not Zestimate. ` +
      `Use P75 as your primary ARV anchor for a fully renovated flip. P60 if light cosmetic only.`;
  } else if (meta.arvEstimate) {
    const isMarketDb = meta.source === 'market_db' || meta.source === 'market_aggregate_only';
    arvLine = isMarketDb
      ? `⚠️ NO REAL COMPS AVAILABLE — using zip-level market aggregate only (median sold ${meta.avg_ppsf ? '$' + meta.avg_ppsf + '/sf' : '$' + (meta.arvEstimate / 1500).toFixed(0) + '/sf est'}). Apply UPPER portion of county benchmark range. Do NOT use asking prices from other pipeline deals as comparables. Flag arvConfidence = LOW.`
      : `WEB COMP SOLD DATA — ${comps.length} actual sold transactions found via Zillow/Redfin (NOT asking prices): estimated ARV anchor $${meta.arvEstimate.toLocaleString()} — see comp list above`;
  }
  // Format comps with full property details so Claude can comp by sqft/beds/baths/pool/ppsf
  const formatComp = (c) => {
    const rawPrice = c.salePrice || c.sold_price || 0;
    const priceK   = rawPrice ? `$${Math.round(rawPrice/1000)}K` : '';
    const sqft  = c.sqft  ? `${c.sqft}sf`  : '';
    const beds  = c.beds  ? `${c.beds}bd`  : '';
    const baths = c.baths ? `${c.baths}ba` : '';
    const ppsf  = c.ppsf  ? `$${Math.round(parseFloat(c.ppsf))}/sf` : '';
    const date  = c.saleDate || c.sold_date || '';
    const addr  = c.address || '(unknown)';
    const src   = c.source || 'sold';
    const attrs = [sqft, [beds,baths].filter(Boolean).join('/'), ppsf].filter(Boolean).join(' ');
    // Format for UI parser: "Address (attrs, $priceK, source)"
    return `${addr} (${attrs}, ${priceK}, ${src}) sold ${date}`.trim();
  };
  // Pre-build compsUsed strings in exact UI format — Claude copies them verbatim into compsUsed[]
  const soldCompsForUI = comps
    .filter(c => c.salePrice || c.sold_price)
    .map(formatComp)
    .slice(0, 8);
  
  const prebuiltCompsText = soldCompsForUI.length > 0
    ? `\n\nPRE-BUILT compsUsed ENTRIES — copy these EXACTLY into compsUsed[] in your JSON (do not modify):\n${soldCompsForUI.map((s,i) => `${i+1}. "${s}"`).join('\n')}`
    : '';
  
  const compsText = comps.length > 0
    ? 'ACTUAL SOLD TRANSACTIONS (use these as comps, NOT asking prices from pipeline):\n' + arvLine + '\n' + comps.map(formatComp).join('\n') + prebuiltCompsText
    : arvLine;

  // Pre-compute ALL template values to avoid IIFE scope issues
  const _mn = urbanBrain.marketNotes[deal.county || deal.city];
  // Pull real market data from DB (pre-seeded 390+ FL zip codes)
  const _mktDB = deal.zip ? await DB.getMarketData(deal.zip).catch(() => null) : null;
  // Pull NBHC-level ARV stats (P75 = renovated standard) from HCPA county data
  const _nbhcArv = deal.nbhc ? await DB.getNbhcArv(deal.nbhc).catch(() => null) : null;
  let marketContextStr = '';
  if (_mktDB && _mktDB.median_sold) {
    marketContextStr = `[Market DB ${deal.zip}] Median: $${_mktDB.median_sold.toLocaleString()} | $${_mktDB.avg_ppsf || '?'}/sqft | DOM: ${_mktDB.median_dom || '?'} days`;
    // Use DB prop_tax_rate & insurance for rental schema defaults
    if (_mktDB.prop_tax_rate) deal._propTaxRate = parseFloat(_mktDB.prop_tax_rate);
    if (_mktDB.insurance_mo)  deal._insuranceMo  = parseInt(_mktDB.insurance_mo);
    if (_mktDB.trend_pct) marketContextStr += ` | YoY: ${_mktDB.trend_pct > 0 ? '+' : ''}${_mktDB.trend_pct}%`;
    if (_mktDB.flip_margin_pct) marketContextStr += ` | Typical flip margin: ${_mktDB.flip_margin_pct}%`;
    if (_mktDB.prop_tax_rate) marketContextStr += ` | Tax: ${(_mktDB.prop_tax_rate * 100).toFixed(2)}%/yr`;
    if (_mktDB.insurance_mo) marketContextStr += ` | Insurance: ~$${_mktDB.insurance_mo}/mo`;
    if (_mktDB.rehab_medium) marketContextStr += ` | Rehab: $${_mktDB.rehab_light}/$${_mktDB.rehab_medium}/$${_mktDB.rehab_heavy} light/med/heavy per sqft`;
    if (_mktDB.notes) marketContextStr += ` || NEIGHBORHOOD: ${_mktDB.notes}`;
  }
  // Wire NBHC-level ARV data (P75 = renovated standard from 64K real HCPA transactions)
  if (_nbhcArv && _nbhcArv.p75_sold) {
    const arvCtx = `[HCPA REAL COMPS NBHC${deal.nbhc}] Renovated ARV (P75): $${_nbhcArv.p75_sold.toLocaleString()} | Median all: $${_nbhcArv.median_sold?.toLocaleString()} | ${_nbhcArv.count} real sales 2023-2026`;
    marketContextStr = marketContextStr ? marketContextStr + ' || ' + arvCtx : arvCtx;
  }
  if (_mn && _mn.deals >= 2) {
    const brainCtx = `${_mn.deals} Coralstone deals | Avg ARV: $${(_mn.avgARV||0).toLocaleString()} | HOT rate: ${Math.round((_mn.hotDeals||0)/_mn.deals*100)}%`;
    marketContextStr = marketContextStr ? marketContextStr + ' || ' + brainCtx : brainCtx;
  }
  if (!marketContextStr) marketContextStr = 'Limited data — use comp-based judgment.';

  // Pre-compute neighborhood intel string
  const _city = (deal.city||'').toLowerCase().trim();
  const _nb = Object.entries(TAMPA.neighborhoods).find(([name]) =>
    _city.includes(name) || name.includes(_city.split(' ')[0])
  );
  const neighborhoodStr = _nb
    ? _nb[0].toUpperCase() + ': $' + _nb[1].ppsf + '/sqft avg | Tier ' + _nb[1].tier + ' | Trend: ' + _nb[1].trend + ' | ' + _nb[1].notes
    : 'No specific neighborhood data — use comp-based judgment.';

  // Pre-compute private comps string
  const _targetSqft = parseFloat(deal.sqft) || 0;
  const _county = (deal.county||'').toLowerCase();
  const _privateComps = Object.values(underwrites)
    .filter(uw => uw.verdict && uw.arv?.urbanARV && uw.deal?.address &&
      uw.deal.address !== deal.address && !uw.restoredFromSheet &&
      ((uw.deal.city||'').toLowerCase().includes(_city.split(' ')[0]) ||
       (uw.deal.county||'').toLowerCase().includes(_county.split(' ')[0])))
    .map(uw => {
      const ppsf = uw.arv.urbanARV && uw.deal.sqft ? Math.round(uw.arv.urbanARV/parseFloat(uw.deal.sqft)) : null;
      return (uw.deal.address||'?') + ' | ' + (uw.deal.sqft||'?') + 'sqft ' + (uw.deal.beds||'?') + 'bd/' + (uw.deal.baths||'?') + 'ba' +
        ' | Our ARV: $' + uw.arv.urbanARV.toLocaleString() + (ppsf ? ' ($'+ppsf+'/sqft)' : '') +
        ' | ' + uw.verdict + ' | ' + (uw.underwroteAt ? new Date(uw.underwroteAt).toLocaleDateString() : '?');
    })
    .sort((a,b) => {
      // sort by sqft proximity
      const aSqft = parseFloat((a.match(/(\d+)sqft/)||[])[1])||0;
      const bSqft = parseFloat((b.match(/(\d+)sqft/)||[])[1])||0;
      return Math.abs(aSqft-_targetSqft) - Math.abs(bSqft-_targetSqft);
    })
    .slice(0,5)
    .join('\n') || 'None yet in this area.';

  const prompt = `${deep ? 'DEEP ANALYSIS MODE — Sonnet is running. Be thorough. Show your full reasoning on ARV and rehab. Longer text fields allowed.\n\n' : ''}You are Urban, elite real estate underwriter for Coralstone Capital Group, Tampa Bay FL. 20+ years fix-and-flip experience in Pasco, Hillsborough, Polk, Pinellas, Hernando counties.

TAMPA BAY NEIGHBORHOOD INTEL ($/sqft benchmarks, 2025):
${neighborhoodStr}

TAMPA BAY MARKET CONDITIONS (2025):
- FL insurance crisis: Roofs 15yr+ hard to insure. 20yr+ uninsurable. Budget $3-6K/yr insurance.
- Buyer pool strongest: $150-350K. FHA buyers active under $250K. Investors active everywhere.
- Days on market: A-tier ~25 days | B-tier ~35 days | C-tier ~55 days
- New construction competing in Wesley Chapel, Parrish, Riverview corridors — comp carefully.
- Peak season Feb-May. Slower Jun-Sep. Q4 pickup.

RED FLAGS TO ALWAYS FLAG:
${Object.entries(TAMPA.redFlags).map(([flag, data]) => `- ${flag.toUpperCase()} [${data.severity}]: ${data.detail}`).join('\n')}

URBAN BRAIN — RELEVANT LESSONS (matched by county, wholesaler, recency):
${relevantLessons || 'No lessons yet — first deal in this area'}

PROPERTY TAX & INSURANCE (from Market DB — use these exact values if available):
${deal._propTaxRate ? `Prop tax rate: ${(deal._propTaxRate * 100).toFixed(3)}% → monthly: $${Math.round((wholesalerARV || 0) * deal._propTaxRate / 12)}` : 'Prop tax: estimate 1.2% of ARV annually'}
${deal._insuranceMo ? `Insurance: $${deal._insuranceMo}/mo (from market DB)` : 'Insurance: estimate based on property type/location'}

RENTAL MARKET DATA (live-fetched — use for rental.marketRent estimation):
${rentalMarketData || 'No live rental data fetched — estimate from market knowledge: Pasco/Hernando SFR avg: 3BR ~$1,800-2,200/mo, 4BR ~$2,200-2,600/mo; Pinellas/Clearwater premium +15-20%.'}

WHOLESALER INTEL:
${brain.wholesalerNotes}
${brain.wholesalerStats}
CREDIBILITY NOTE: ${
  brain.wholesalerStats.includes('VERIFIED ARV INFLATOR') ? 'This wholesaler is a VERIFIED ARV inflator. Aggressively haircut their ARV.' :
  brain.wholesalerStats.includes('ARV inflation warning') ? 'This wholesaler has an ARV inflation warning. Be skeptical of their ARV.' :
  brain.wholesalerStats.includes('prior deals') && brain.wholesalerStats.includes('avg ARV inflation: 0') ? 'Wholesaler ARV has been accurate historically.' :
  'No credibility data yet — treat wholesaler ARV with standard skepticism.'
}

MARKET CONTEXT: ${brain.marketContext}
LIFETIME: ${urbanBrain.totalUnderwritten || 0} deals | ${urbanBrain.hotDeals || 0} HOT | ${urbanBrain.passedDeals || 0} passed

MEGAMIND INTELLIGENCE (harvested from ALL ${urbanBrain.totalUnderwritten||0} CCG underwrites):
${megamindContext}

DEAL:
Address: ${deal.address}, ${deal.city}, ${deal.state} ${deal.zip} | County: ${deal.county}
Type: ${deal.propertyType} | Units: ${getUnitCount(deal.propertyType)} | Beds/Baths: ${deal.beds}/${deal.baths} | Sqft: ${sqft} | Year: ${deal.yearBuilt}
Lot: ${deal.lotAcres} acres | Construction: ${deal.construction} | Foundation: ${deal.foundation}
Condition: ${deal.overall_condition} | Occupancy: ${deal.occupancy}
Pool: ${deal.pool} | HOA: ${deal.hoa} (${hoaFee}/mo) | Flood Zone: ${deal.floodZone}

SYSTEMS:
Roof: ${deal.roofType} ${deal.roofAge} | AC: ${deal.acYear} | Water Heater: ${deal.waterHeater}
Electrical: ${deal.electrical} | Plumbing: ${deal.plumbing} | Windows: ${deal.windows} | Flooring: ${deal.flooring}

CONDITION NOTES:
Kitchen: ${deal.kitchenNotes}
Baths: ${deal.bathNotes}
Updated: ${deal.whatIsUpdated}
Needs Work: ${deal.whatNeedsWork}
Red Flags: ${deal.redFlags}
Highlights: ${deal.highlights}
Notes: ${deal.additionalNotes}

${deal._extractionConfidence !== undefined ? `DATA QUALITY NOTE FROM DEREK: Extraction confidence ${deal._extractionConfidence}/10 — ${deal._extractionNote || (deal._extractionConfidence >= 8 ? 'high confidence, data reliable' : deal._extractionConfidence >= 5 ? 'medium confidence, some fields estimated' : 'LOW confidence — verify key fields before trusting numbers')}` : ''}${notesContext}

WHOLESALER NUMBERS:
Asking: $${askingPrice.toLocaleString()} | Their ARV: $${wholesalerARV.toLocaleString()} | Their Repairs: ${wholesalerRepairs ? '$'+wholesalerRepairs.toLocaleString() : 'NOT PROVIDED'}
Their MAO implication: $${wholesalerARV ? Math.round(wholesalerARV*0.7 - (wholesalerRepairs||0)).toLocaleString() : '?'} (ARV×70%-Repairs)
Gap vs asking: $${wholesalerARV ? Math.round(wholesalerARV*0.7 - (wholesalerRepairs||0) - askingPrice).toLocaleString() : '?'} (positive = room to negotiate, negative = overpriced)
Taxes: $${annualTaxes.toLocaleString()}/yr | Close: ${deal.closeDate} | EMD: ${deal.earnestMoney}

PRIVATE COMP DATABASE (Coralstone past deals — real numbers we paid for):
${_privateComps}

MARKET COMPS (Zillow/web search):
${compsText}

MARKET CONTEXT FOR THIS COUNTY (${deal.county || deal.city}):
${marketContextStr}

Respond ONLY with a JSON object (no markdown, no backticks, just raw JSON).
PUT THESE FIELDS FIRST — they are most important:
{
  "verdict": "<BUY|REVIEW|PASS|HARD NO>",
  "score": <1-10 — based SOLELY on profit margin and deal quality, NOT on property size, age, or type. 9-10=HOT(>30% margin), 7-8=BUY(20-29%), 5-6=REVIEW(10-19%), 3-4=PASS(<10% or risk issues), 1-2=HARD NO. Land deals scored same way.>,
  "verdictReason": "<one punchy sentence why>",
  "recommendation": "<REQUIRED - 2-3 hard sentences. Example: 'Walk away. ARV is inflated by 15% and at $215K you have $8K profit — zero margin. Pass unless they come down to $160K.' OR: 'Pull the trigger. At $185K your profit is $62K at a clean 8.4% ROI. Roof is 8 years old, HVAC 2019 — it pencils. Counter at $175K to grab another $10K.'>",
  "offerStrategy": "<REQUIRED - if HOT/BUY: 'Offer $X, close in Y days, $Z EMD, AS-IS, 7-day inspection.' If PASS/HARD NO: 'Would work at $X — X% below ask. Not worth countering above that.'>",
  "arv": {
    "wholesalerARV": <number>,
    "asIsValue": <REQUIRED: property value TODAY as-is zero renovation. Use P50/median of sold comps. If no real comps, estimate 80-85% of urbanARV. For LAND/LOTS: set equal to urbanARV (land is sold as-is). Never null.>,
    "urbanARV": <number>,
    "arvPerSqft": <urbanARV divided by sqft, or null if sqft unknown>,
    "marketAvgPerSqft": <what $/sqft comps support, or null>,
    "arvConfidence": "<HIGH|MEDIUM|LOW>",
    "arvNotes": "<specific reasoning — cite actual comp addresses and prices>",
    "compsUsed": ["<REQUIRED — use SOLD comps from the ACTUAL SOLD TRANSACTIONS section above. Format: \'123 Main St, City FL (1500sf 3bd/2ba, $250K, zillow_sold)\' — include address, sqft, beds, baths, price in $Ks. Put each sold comp on its own line. If no real sold comps, use []>"]
  },
  "rehab": {
    "wholesalerEstimate": <number or null>,
    "urbanEstimate": <number>,
    "urbanEstimateRange": {"low": <number>, "high": <number>},
    "confidence": "<HIGH|MEDIUM|LOW>",
    "missingInfo": "<what would help>",
    "lineItems":{"roof":<n>,"hvac":<n>,"plumbing":<n>,"electrical":<n>,"kitchen":<min $10,000 cosmetic; $20-30K full gut. NEVER go below $10K>,"bathrooms":<$5,000 PER bath all-in. 2baths=$10,000>,"flooring":<sqft×$3 installed. 1500sf=$4,500>,"windows":<n>,"paint":<sqft×$2 interior. 1500sf=$3,000>,"landscaping":<n, min $500>,"permits":<$1,500-4,000>,"misc":<REQUIRED: min $1,500 for fixtures/hardware/cleanup/dumpster/touch-ups. Never $0.>,"contingency":<10% of scoped items, min $2,000>},
    "scopeLevel": "<FULL REHAB|MEDIUM|LIGHT COSMETIC>",
    "notes": "<scope explanation>"
  },
  "financials": {
    "askingPrice": <number>,
    "mao": <number>,
    "overUnderMAO": <number>,
    "holdMonths": <4 or 5>,
    "hardMoney": {"loanAmount":<n>,"interestRate":9.5,"monthlyPayment":<n>,"totalInterest":<n>,"originationPoints":<n>},
    "holdingCosts": {"taxes":<n>,"insurance":<n>,"utilities":<n>,"total":<n>},
    "sellingCosts": {"agentCommission":<n>,"closingCosts":<n>,"total":<n>},
    "totalCost": <number>,
    "netProfitAtAsking": <number>,
    "netProfitAtMAO": <number>,
    "roi": <number>,
    "meetsMinimumProfit": <boolean>,
    "cashToClose": <(purchasePrice×0.10) + rehabCost — cash CCG needs at table, excluding financed portion>,
    "annualizedROI": <(netProfitAtAsking / cashToClose) / (holdMonths/12) — annualized return on cash. Round to 1 decimal.>
  },
  "rental": {
    "marketRent": {
      "unitCount": <CRITICAL: number of rentable units — 1 for SFR, 2 for duplex, 3 for triplex, 4 for quadplex. Detect from propertyType field. THIS AFFECTS ALL DOWNSTREAM MATH.>,
      "rentPerUnit": <number — monthly rent for ONE unit, based on comps/beds/sqft>,
      "estimated": <number — TOTAL monthly gross rent = rentPerUnit × unitCount. For duplex at $1400/unit = $2800 total. DO NOT just use single-unit rent for multi-unit properties.>,
      "lowEnd": <number — conservative total (all units × low rent per unit)>,
      "highEnd": <number — optimistic total>,
      "rentPerSqft": <number — (total monthly rent / total sqft)>,
      "hudFMR": <number or null — HUD Fair Market Rent for one unit of this bedroom count in this county>,
      "source": "<Zillow / Rentometer / HUD FMR / Market estimate>",
      "confidence": "<HIGH|MEDIUM|LOW>",
      "comps": [{"address":"<addr or generic>","beds":<n>,"rent":<n>,"source":"<>","note":"per unit or total?"}]
    },
    "income": {
      "monthlyGrossRent": <number — TOTAL across all units = rentPerUnit × unitCount>,
      "annualGrossRent": <number>,
      "vacancyRate": <number — % as decimal e.g. 0.07 for 7%. Use 5-8% for SFR FL>,
      "vacancyLoss": <number — monthly>,
      "effectiveGrossIncome": <number — monthly after vacancy>
    },
    "expenses": {
      "propertyManagement": {"rate": <0.08-0.10>, "monthly": <number>, "note": "8-10% of gross rent for SFR in FL"},
      "propertyTaxes": {"annual": <number — use prop_tax_rate from market DB if available (deal._propTaxRate), else 1.2% of ARV for FL. Monthly = annual/12>, "monthly": <number>},
      "insurance": {"annual": <number — use insurance_mo from market DB if available (deal._insuranceMo × 12), else FL SFR budget $2,000-5,000/yr; more in flood/coastal zones>, "monthly": <number>},
      "maintenance": {"annual": <number — use $1/sqft/yr minimum for SFR, more for older homes>, "monthly": <number>},
      "capexReserve": {"annual": <number — 5-10% of gross rent for roof/HVAC/appliance reserves>, "monthly": <number>},
      "hoa": {"monthly": <number or 0>},
      "utilities": {"monthly": <number or 0 — if landlord pays water/trash/lawn>},
      "lawnTrash": {"monthly": <number — $80-150/mo typical FL SFR>},
      "totalMonthly": <sum of all above monthly>,
      "totalAnnual": <sum × 12>
    },
    "noi": {
      "monthly": <effectiveGrossIncome - totalMonthlyExpenses>,
      "annual": <monthly × 12>
    },
    "performance": {
      "capRate": <number — noi.annual / ARV × 100>,
      "grossYield": <number — annualGrossRent / ARV × 100>,
      "netYield": <number — noi.annual / ARV × 100>,
      "priceToRentRatio": <number — ARV / (monthlyGrossRent × 12). Below 15 = strong rental market>
    },
    "debtService": {
      "dscrLoan": {
        "rate": <number — current DSCR loan rate, typically 7.5-8.5% in 2025>,
        "ltv": 0.75,
        "loanAmount": <ARV × 0.75>,
        "monthlyPayment": <number — 30yr amort>,
        "cashFlow": <noi.monthly - monthlyPayment>,
        "dscr": <noi.monthly / monthlyPayment — must be ≥1.25 for most lenders>,
        "meetsDSCR": <boolean — dscr >= 1.20>
      },
      "conventional30": {
        "rate": <number — 30yr conventional rate, typically 7.0-7.5% in 2025>,
        "ltv": 0.80,
        "loanAmount": <ARV × 0.80>,
        "downPayment": <ARV × 0.20>,
        "monthlyPayment": <number>,
        "cashFlow": <noi.monthly - monthlyPayment>,
        "dscr": <number>
      }
    },
    "brrrr": {
      "applicable": <boolean — true if ARV is significantly above purchase+rehab cost>,
      "strategy": "<FULL BRRRR | PARTIAL BRRRR | NOT VIABLE>",
      "refiArv": <ARV — same as underwrite ARV for now>,
      "refiLtv": 0.75,
      "refiLoanAmount": <ARV × 0.75>,
      "totalCashInvested": <purchase price + rehab (out of pocket, before any financing)>,
      "cashReturnedAtRefi": <refiLoanAmount - any existing loans — this is what you pull back out>,
      "cashLeftInDeal": <totalCashInvested - cashReturnedAtRefi>,
      "infiniteReturn": <boolean — true if cashLeftInDeal ≤ 0 meaning full cash recycle>,
      "refiMonthlyPayment": <DSCR loan payment at 7.5%, 30yr, on refiLoanAmount>,
      "cashFlowAfterRefi": <noi.monthly - refiMonthlyPayment>,
      "cocReturnAfterRefi": <cashFlowAfterRefi × 12 / cashLeftInDeal × 100, or null if infinite>,
      "dscrAfterRefi": <noi.monthly / refiMonthlyPayment>,
      "equityAtRefi": <ARV - refiLoanAmount>,
      "seasoning": "6-12 months typical before refi",
      "notes": "<BRRRR viability assessment — is this a good BRRRR candidate? How much cash comes back? What does the ongoing cash flow look like?>"
    },
    "worthConsidering": <boolean>,
    "worthBRRRR": <boolean>,
    "rentalVerdict": "<STRONG HOLD | BRRRR CANDIDATE | POSSIBLE HOLD | FLIP ONLY>",
    "notes": "<2-3 sentence rental/BRRRR assessment — be specific about cash flow projections, DSCR, and whether CCG should flip or hold>"
  },
  "newConstruction": {
    "applicable": <true ONLY if lot/teardown deal or if neighboring new construction meaningfully affects ARV. false for most SFR flips>,
    "notApplicableReason": "<if false: one sentence why e.g. 'Existing structure flip — not a teardown candidate. No new construction analysis applicable.'>",
    "nearbyNewConstruction": "<are there active new builds in this zip competing for the same buyer? affects pricing and DOM>",
    "lotValue": <number or null>,
    "lotEquityRequired": <50% of lotValue — CCG must own this as equity>,
    "buildCostPerSqft": 160,
    "potentialNewSqft": <number>,
    "estimatedBuildCost": <buildCostPerSqft × potentialNewSqft — includes plans/permits NOT impact fees>,
    "constructionLoanAmount": <estimatedBuildCost + 50% of lotValue — lender funds this>,
    "constructionInterestRate": 11.5,
    "constructionHoldMonths": <typical 12-18 for new build>,
    "estimatedInterestCost": <constructionLoanAmount × 0.115 × holdMonths/12>,
    "estimatedNewARV": <number>,
    "netProfitNewBuild": <estimatedNewARV - lotValue - estimatedBuildCost - estimatedInterestCost - sellingCosts>,
    "worthConsidering": <boolean>,
    "notes": "<new construction analysis — include lot size, setbacks, market demand for new product in area>"
  },
  "riskFlags": [{"flag":"<Short readable title — e.g. 'Flood Zone Unverified' — no SNAKE_CASE>","severity":"<HIGH|MEDIUM|LOW>","detail":"<2-3 sentences: what is the risk, dollar impact, what to verify before closing>"}],
  "marketAnalysis": {"neighborhood":"<assessment>","trend":"<IMPROVING|STABLE|DECLINING>","daysOnMarket":"<typical DOM>","notes":"<context>"},
  "wholesalerCredibility": {"assessment":"<TRUSTED|UNKNOWN|QUESTIONABLE>","arvAccuracy":"<TYPICALLY ACCURATE|INFLATED|UNKNOWN>","notes":"<read>"},
  "urbanNotes": "<1 sentence max>"
}

IMPORTANT: arvNotes, recommendation, and notes fields can be detailed. All other text fields under 150 chars.. Valid JSON only. No markdown.`;

  const model = deep ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  console.log(`Underwriting ${deal.address} with ${model}`);

  // STATIC_SYSTEM is cached — reused across all underwrites at 90% off after first call
  const STATIC_SYSTEM = `You are Urban, elite fix-and-flip underwriter for Coralstone Capital Group, Tampa Bay FL.

CRITERIA: Hard money 9.5% IO 90%LTV | MAO=ARV×Repairs | 6% agent+1.5% closing+2pts HML | 4-5mo hold.
CCG UNDERWRITING PHILOSOPHY — THINK LIKE CORALSTONE CAPITAL GROUP:
We are active fix-and-flip operators in Tampa Bay. We work ALL deal types — small, cheap, and distressed included. A $55K house with good margin is a great deal. Our standards:
• SPEED: We close in 10-21 days cash, no mortgage contingency. This is a competitive advantage.
• TARGET: $150K-$500K purchase price, SFR, MF 2-4 units, mobile homes w/ land, condos — all sizes welcome. No sqft minimum. CCG buys small and cheap.
• COUNTIES: Pasco, Hillsborough, Polk, Pinellas, Hernando (AND adjacent: Manatee, Sarasota, Lee for right deals).
• PROFIT MINIMUM: 10% of asking price (floor $20K). Deals above $1M need $100K+.
• HOLD TIME: 4-5 months max for fix-and-flip. New construction 12-18 months.
• MARKET CONTEXT: FL market is 2025 Q2 — strong appreciation across all markets, especially Tampa Bay, coastal Pinellas, and Miami metro. ARVs are UP significantly from 2022-2023. Do not underestimate the market.
• SIZE POLICY: CCG buys ANY size property. Small homes (under 1,000sf), large homes (over 3,000sf), tiny lots, acreage — ALL are viable. Never score down just for size.
• EXIT: MLS via Grant Patterson (brokerage), target 30-45 day DOM post-renovation.
• BUYS ANYTHING: CCG buys any size SFR (studio to 5,000+sf), any age, any condition, any bed/bath count. Also buys LAND and LOTS (vacant, agricultural, infill). Size and configuration do NOT disqualify.
• AVOID: flood zone AE (unless deeply discounted), extreme rural with no comps, properties requiring >$100K rehab without comp support.
• MOBILE HOMES & DOUBLE-WIDES: Consider only if fee-simple land included and comparable sales exist. Flag clearly.
• LAND/LOT DEALS: Underwrite on lot value, development potential, utilities, zoning. Rehab = $0. Comp to similar lot sales.
• REHAB PHILOSOPHY: Cosmetic = our wheelhouse. Structural = price accordingly or pass. Roof + HVAC together = major flag.
• WHOLESALER INTEL: We see dozens of leads weekly. We know which wholesalers inflate ARV. Flag them.
• AS-IS VALUE: Always provide — this is our downside. If deal went sideways, what could we get out at?

PROFIT RULE: askingPrice<$1M → profit must be ≥10% of askingPrice (e.g. $300K ask=$30K min, $400K ask=$40K min, $250K ask=$25K min). askingPrice≥$1M → profit must be ≥$100K. Deals below threshold → HARD NO unless negotiable.

MISSING DATA RULE — CRITICAL: If ARV is unknown/uncompable, verdict = NEED COMPS (score 3-5). A deal without ARV is not dead — it needs more information. HARD NO requires enough data to CONFIRM the numbers fail, or a deal-killer independent of missing data (flood AE, zoning, title, price mathematically impossible even at best-case ARV, or outside CCG's 5-county mandate). Missing sqft → NEED COMPS. Missing ARV → NEED COMPS. Missing both → NEED COMPS. Never HARD NO purely because data is absent.

VERDICT SCALE — use exactly one:
CRITICAL — SIZE/PRICE: Small sqft or low price is NEVER alone a reason for HARD NO. Only these qualify as fatal: Flood Zone AE, 55+ that kills exit, title/HOA restrictions blocking resale, math that doesn't work at any reasonable offer. A 700sf $50K house with $120K ARV is a real deal.
HOT: numbers work well, motivated seller, strong comps, needs fast action.
BUY: numbers work, solid deal worth pursuing.
REVIEW: close — one negotiation point or data point away from BUY.
PASS: technically possible but too many headwinds or soft market.
NEED COMPS: missing ARV, sqft, or other data Urban needs to underwrite fully. Describe exactly what's missing and ask for it. Score 3-5.
HARD NO: confirmed dead — math proven not to work, or hard disqualifier (geography, flood, title, etc.) independent of missing data. Score 1-2.

ARV METHODOLOGY — CRITICAL, ALWAYS FOLLOW:
1. EVERY PROPERTY NEEDS REAL COMPS — MINIMUM 3. If you have fewer than 3 real sold comps, explicitly flag it in arvNotes and set arvConfidence = LOW. Do not guess without comps.
   ⚠️ CRITICAL: Other deals in Urban's pipeline (addresses from Derek's sheet) are NOT comps. They are AS-IS distressed asking prices — typically 15-30% below renovated value. NEVER use asking prices from other pipeline deals as ARV comparables. Only use ACTUAL SOLD transactions from CCG DB, Zillow, Redfin, or county records.
2. AS-IS VALUE (asIsValue): ALWAYS calculate. This is what the property is worth TODAY with zero renovation — just cleaned out and pass-inspection ready. Use P50 (median) of actual sold comps. This answers "what could we buy it for and immediately wholesale it?"
3. ARV (urbanARV): What the property is worth FULLY RENOVATED to market-standard. Use P75 of sold comps (top-tier renovation = P90). This is always higher than as-is value. The spread between as-is and ARV = your flip profit opportunity.
4. COMP HIERARCHY — use in order:
   A. Real sold comps from CCG DB / Zillow / Redfin (provided in this prompt) — PRIMARY
   B. County property appraiser recent sales — SECONDARY
   C. Florida $/sqft benchmarks — RENOVATED TOP-OF-MARKET Q2 2025 (use when comps unavailable):
      ⚡ DEFAULT TO UPPER HALF OF EACH RANGE — Florida is appreciating fast, err toward market reality not conservatism.
      
      Hillsborough (Tampa): $210-290/sf | Seminole Heights/SoHo/Hyde Park: $300-380/sf
      Pasco (Wesley Chapel/NPR): $200-270/sf
      Pinellas INLAND (St. Pete/Clearwater/Largo): $230-320/sf | St. Pete historic: $300-380/sf
      Pinellas COASTAL (Redington/Treasure Island/St. Pete Beach/Clearwater Beach): $400-700/sf
      Hernando (Spring Hill/Brooksville): $170-230/sf
      Polk (Lakeland/Winter Haven): $170-230/sf | SE Lakeland/33813: $220-260/sf
      Orange (Orlando): $210-300/sf | Windermere/Dr. Phillips: $350+/sf
      Osceola (Kissimmee): $185-255/sf
      Manatee (Bradenton): $220-300/sf | Anna Maria Island: $500-900/sf
      Sarasota: $260-380/sf | waterfront: $450-800/sf
      Charlotte (Port Charlotte/Punta Gorda): $200-280/sf | waterfront: $350-550/sf
      Lee (Fort Myers/Cape Coral): $210-290/sf | canal/waterfront: $300-450/sf
      Collier (Naples): $310-500/sf | Naples waterfront: $700-1500/sf
      Broward: $260-400/sf | waterfront: $500-900/sf
      Miami-Dade inland (Hialeah/Kendall): $290-420/sf | Miami/Coral Gables: $400-700/sf | Miami Beach: $600-1200/sf
      Volusia (Daytona/Port Orange): $190-280/sf | New Smyrna Beach: $350-600/sf
      Brevard (Melbourne/Palm Bay): $195-280/sf | Cocoa Beach/waterfront: $350-600/sf
      Duval/St. Johns (Jacksonville/Ponte Vedra): $210-320/sf | Ponte Vedra beach: $400-700/sf
      
      🏖️ COASTAL RULE: If city/address = known beach town (Redington Beach, Clearwater Beach, Treasure Island, Holmes Beach, Siesta Key, Marco Island, Naples, Destin, Cocoa Beach, New Smyrna Beach, etc.) or address contains 'beach', 'gulf', 'bay', 'shore', 'island', 'key', 'marina', 'waterway', 'canal', 'intracoastal' → use COASTAL pricing (minimum $350-400/sf for waterfront access, $500-900/sf for direct gulf/ocean)
5. COMP WEIGHTING: Within 0.5 miles > same zip > same city. ±15% sqft match. Sold within 6 months preferred. Pool adds $15-25K. Block/CBS construction = small premium over frame.
6. CONFIDENCE SIGNAL: arvConfidence = HIGH (5+ real comps, tight <10% range) | MEDIUM (2-4 real comps, or 1 comp + benchmark) | LOW (benchmark only — NO real comps. MUST flag in arvNotes: 'No real comps available — ARV based on FL market benchmarks only. Hit ⚡ Underwrite for live comp pull.'). When confidence is LOW, pick the UPPER portion of the benchmark range unless there are clear property negatives.
7. In arvNotes: (a) list ACTUAL SOLD comps used (not asking prices) with address/sold price/sqft/date, (b) $/sqft you calculated from sold prices, (c) how you derived asIsValue (P50) and urbanARV (P75) from those sold comps, (d) confidence and why. If you're using comps from the prompt, verify they are labeled as sold transactions (source: zillow_sold, redfin_sold, CCG) NOT as asking prices or pipeline deals.
8. DERIVE independently but do not reflexively undercut. If you get a number >20% below wholesaler AND you have no real comps, that is a red flag about YOUR estimate, not necessarily theirs. Wholesalers often have access to comp data you don't. Flag the discrepancy, but do not dismiss their number — note it as unconfirmed without real comps.
9. SANITY CHECK: If your ARV implies <$150/sf for a renovated Florida SFR anywhere south of Ocala, that is almost certainly wrong. Even the cheapest inland FL markets (Hernando, Highlands, Hardee) are $160+/sf renovated in 2025.

NEW CONSTRUCTION UNDERWRITING — CCG FRAMEWORK:
When a deal has land/lot potential or wholesaler mentions new build:
BUILD COST: $160/sqft ALL-IN (plans, architect, permits, builder fee, materials, labor, landscaping). Does NOT include: impact fees (county-specific, often $8-25K), utility connections ($5-15K), or HOA/CDD fees.
TYPICAL BUILD SIZES: 1,400-2,000sf 3bd/2ba = $224K-320K | 1,800-2,400sf 4bd/2ba = $288K-384K
EQUITY STRUCTURE: CCG must own 50% of land value as equity (cash out of pocket). Lender funds: 100% of construction + remaining 50% of land. So CCG's cash = 50% × landValue.
CONSTRUCTION LOAN: 11.5% interest rate (interest-only during build). Typical build timeline: 10-14 months.
INTEREST COST = constructionLoanAmount × 0.115 × (buildMonths/12)
EXAMPLE: Land $80K, Build 1,600sf × $160 = $256K → CCG cash = $40K → Loan = $40K + $256K = $296K → 12mo interest = $296K × 11.5% = $34K → Total in = $374K + $40K cash → Need ARV ≥ $450K+ to make sense (≥20% margin).
WHEN IT WORKS: Infill lots in strong zips, corner lots, areas where new construction sells $50-80/sf above resale.
WHEN IT DOESN'T: Where ARV isn't $50+ above all-in cost, impact fees kill the deal, long entitlement risk.

REPAIR BENCHMARKS (Florida 2025 — labor+materials, post-inflation): Roof shingle 1500sf=$10-16K/2000sf=$13-20K | Roof tile=$18-35K | HVAC full system=$8-14K/condenser only=$4-7K | Kitchen gut=$18-35K/cosmetic update=$6-14K | Bath full remodel=$10-22K/cosmetic=$5-12K | LVP flooring=$4-7/sf installed | Tile=$6-10/sf | Repipe=$5-10K | Panel upgrade 200A=$3.5-6K | Interior paint=$4-8K | Impact windows/doors=$12-30K | Permits+fees=$2-5K | Foundation=$10-35K | Septic replace=$5-12K | Pool resurface=$8-18K | Landscaping refresh=$2-6K | Drywall=$2-5K. ALWAYS fill lineItems with specific realistic dollar estimates — do not low-ball scope. for every applicable category.

HARD NO: profit below threshold, flood zone AE/VE, structural/slab issue, knob-tube wiring, <1000sf, mobile/manufactured, title clouds, condemnation.
BUY CRITERIA: profit ≥10% of askingPrice (if <$1M) OR ≥$100K (if ≥$1M), no hard-no flags, anywhere FL → verdict "BUY".
REVIEW: close — one point away from BUY. PASS: works technically but too many issues. NEED COMPS: missing data, not dead.
OUTPUT: ONLY valid JSON, no markdown, no extra text..`;

  const system = deep
    ? STATIC_SYSTEM + ` DEEP MODE: Full reasoning on ARV/rehab. ${urbanBrain.totalUnderwritten||0} deals.`
    : STATIC_SYSTEM + ` ${urbanBrain.totalUnderwritten||0} deals underwritten.`;

  // Prompt caching: mark system prompt as cacheable (90% cost reduction after first call)
  // Haiku 4.5: $1/M input, $5/M output. With caching: ~$0.007/underwrite (<1 cent).
  // Call Anthropic with retry on 429 rate limit
  let res;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await getAnthropic().messages.create({
        model,
        max_tokens: deep ? 4000 : 2500,
        system: system,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      break; // success
    } catch(apiErr) {
      lastErr = apiErr;
      const is429 = apiErr.status === 429 || 
                    (apiErr.message||'').includes('rate_limit') || 
                    (apiErr.message||'').includes('429') ||
                    apiErr.error?.type === 'rate_limit_error';
      if (is429 && attempt < 3) {
        // Read retry-after header if available, otherwise exponential backoff
        const retryAfter = parseInt(apiErr.headers?.get?.('retry-after') || 
                                    apiErr.response?.headers?.['retry-after'] || '0') * 1000;
        const wait = retryAfter > 0 ? Math.min(retryAfter + 1000, 90000) 
                                    : [15000, 30000, 60000][attempt];
        console.log(`⏳ Rate limited (attempt ${attempt+1}/3) — waiting ${Math.round(wait/1000)}s...`);
        // Tell the user what's happening via SSE
        try { send({ status: `⏳ Rate limited — retrying in ${Math.round(wait/1000)}s (attempt ${attempt+1}/3)...` }); } catch {}
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw apiErr;
      }
    }
  }
  if (!res) throw lastErr;

  const rawText = res.content[0].text.trim();
  console.log(`Raw underwrite response length: ${rawText.length}, preview: ${rawText.slice(0,100)}`);
  const f = rawText.indexOf('{'), l = rawText.lastIndexOf('}');
  if (f === -1 || l === -1) throw new Error(`No JSON object in response. Raw: ${rawText.slice(0,200)}`);
  let underwrite;
  // Robust JSON recovery — handles truncated objects AND arrays
  let jsonStr = rawText.slice(f, l + 1);
  try {
    underwrite = JSON.parse(jsonStr);
  } catch(e1) {
    console.warn('JSON parse fail — recovering truncated response...');
    let str = jsonStr.trimEnd().replace(/,\s*$/, '');
    const stack = [];
    let inStr = false, esc = false;
    for (let ci = 0; ci < str.length; ci++) {
      const ch = str[ci];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
    }
    while (stack.length) str += stack.pop();
    try { underwrite = JSON.parse(str); }
    catch(e2) {
      const cleaned = str.replace(/[\x00-\x1f]/g,' ').replace(/,\s*}/g,'}').replace(/,\s*]/g,']');
      underwrite = JSON.parse(cleaned);
    }
  }
  underwrite.uid = uid;
  underwrite.deal = deal;
  underwrite.comps = comps;
  underwrite.underwroteAt = new Date().toISOString();

  // ── RECALCULATE PROFIT SERVER-SIDE (Claude's financials often off) ──────
  try {
    const _ask    = parseFloat(deal.askingPrice) || 0;
    const _arv    = underwrite.arv?.urbanARV || 0;
    const _repairs = underwrite.rehab?.urbanEstimate || 0;
    const _holding = underwrite.financials?.holdingCosts?.total || 0;
    const _selling = underwrite.financials?.sellingCosts?.total || (_arv * 0.075);
    const _interest = underwrite.financials?.hardMoney?.totalInterest || 0;
    const _origination = underwrite.financials?.hardMoney?.originationPoints || 0;
    const _costs  = _holding + _selling + _interest + _origination;
    if (underwrite.financials && _arv > 0 && _ask > 0) {
      underwrite.financials.netProfitAtAsking = Math.round(_arv - _ask - _repairs - _costs);
    }
  } catch(e) { /* non-critical */ }

  // ── ENFORCE MULTI-UNIT RENT SCALING SERVER-SIDE ───────────────────────────────
  try {
    if (underwrite.rental && deal.propertyType) {
      const _units = getUnitCount(deal.propertyType);
      const _mr = underwrite.rental.marketRent;
      if (_units > 1 && _mr) {
        _mr.unitCount = _units;
        const _pu  = _mr.rentPerUnit || 0;
        const _est = _mr.estimated   || 0;
        // If estimated looks like a per-unit figure (< rentPerUnit × units × 0.9), scale it up
        if (_pu > 0 && _est < _pu * _units * 0.9) {
          _mr.estimated = Math.round(_pu * _units);
          if (_mr.lowEnd)  _mr.lowEnd  = Math.round((_mr.lowEnd  / _est) * _mr.estimated);
          if (_mr.highEnd) _mr.highEnd = Math.round((_mr.highEnd / _est) * _mr.estimated);
          console.log('[RENTAL] ' + _units + '-unit: $' + _pu + '/unit → $' + _mr.estimated + ' total');
        } else if (!_pu && _est > 0) {
          // Set rentPerUnit from total
          _mr.rentPerUnit = Math.round(_est / _units);
        }
        // Fix income to use total rent
        if (underwrite.rental.income) {
          const _gross = _mr.estimated;
          underwrite.rental.income.monthlyGrossRent = _gross;
          underwrite.rental.income.annualGrossRent  = _gross * 12;
          const _vr = underwrite.rental.income.vacancyRate || 0.07;
          underwrite.rental.income.vacancyLoss = Math.round(_gross * _vr);
          underwrite.rental.income.effectiveGrossIncome = Math.round(_gross * (1 - _vr));
        }
      }
    }
  } catch(e) { /* non-critical */ }

  // ── ENFORCE CCG REHAB MINIMUMS SERVER-SIDE ────────────────────────────────
  try {
    const li = underwrite.rehab?.lineItems;
    if (li) {
      const sqft  = parseFloat(deal.sqft)  || 0;
      const baths = parseFloat(deal.baths) || 0;
      // Kitchen: $10K minimum always, even for small cosmetic jobs
      if (li.kitchen !== undefined && li.kitchen < 10000) li.kitchen = 10000;
      // Bathrooms: $5K per bath all-in
      const bathMin = Math.round(Math.max(baths, 1) * 5000);
      if (li.bathrooms !== undefined && li.bathrooms < bathMin) li.bathrooms = bathMin;
      // Flooring: $3/sqft installed when sqft known
      if (sqft > 0 && li.flooring !== undefined && li.flooring < Math.round(sqft * 3))
        li.flooring = Math.round(sqft * 3);
      // Paint: $2/sqft interior when sqft known
      if (sqft > 0 && li.paint !== undefined && li.paint < Math.round(sqft * 2))
        li.paint = Math.round(sqft * 2);
      // Misc: always at least $1,500
      if (!li.misc || li.misc < 1500) li.misc = 1500;
      // Contingency: 10% of major items, min $2,000
      const major = (li.kitchen||0)+(li.bathrooms||0)+(li.flooring||0)+(li.paint||0)+(li.roof||0)+(li.hvac||0)+(li.plumbing||0)+(li.electrical||0);
      const contMin = Math.max(2000, Math.round(major * 0.10));
      if ((li.contingency||0) < contMin) li.contingency = contMin;
      // Recalculate total from enforced line items
      const newTotal = Object.values(li).reduce((s, v) => s + (parseFloat(v)||0), 0);
      if (newTotal > 0) underwrite.rehab.urbanEstimate = Math.round(newTotal);
    }
  } catch(e) { /* non-critical */ }

  // ── SERVER-SIDE compsUsed INJECTION ──────────────────────────────────────
  // Don't trust Claude to format compsUsed — build it from actual comp data
  if (comps && comps.length > 0) {
    const realComps = comps.filter(c => c.salePrice || c.sold_price);
    if (realComps.length > 0) {
      underwrite.arv = underwrite.arv || {};
      underwrite.arv.compsUsed = realComps.slice(0, 8).map(c => {
        const price = c.salePrice || c.sold_price || 0;
        const priceK = Math.round(price / 1000);
        const sqft = c.sqft || '';
        const beds = c.beds || '';
        const baths = c.baths || '';
        const ppsf = sqft && price ? Math.round(price / sqft) : '';
        const date = (c.saleDate || c.sold_date || '').slice(0, 7);
        const src = c.source || 'sold';
        const addr = c.address || '(unknown)';
        const attrs = [sqft ? sqft + 'sf' : '', [beds ? beds+'bd' : '', baths ? baths+'ba' : ''].filter(Boolean).join('/'), ppsf ? '$'+ppsf+'/sf' : ''].filter(Boolean).join(' ');
        return addr + (attrs ? ' (' + attrs + ', $' + priceK + 'K, ' + src + ')' : '') + (date ? ' sold ' + date : '');
      });
      console.log('💾 Server-built compsUsed:', underwrite.arv.compsUsed.length, 'comps for', deal.address);
    }
  }

  // ── NEGOTIATION LADDER ────────────────────────────────────────────────────
  // 5 price points so Caleb/Grant know exactly where the deal pencils
  try {
    const arv     = underwrite.arv?.urbanARV || 0;
    const repairs = underwrite.rehab?.urbanEstimate || 0;
    const mao     = underwrite.financials?.mao || Math.round(arv * 0.7 - repairs);
    const ask     = parseFloat(deal.askingPrice) || 0;
    const costs   = (underwrite.financials?.holdingCosts?.total || 0) +
                    (underwrite.financials?.sellingCosts?.total || 0) +
                    (underwrite.financials?.hardMoney?.totalInterest || 0) +
                    (underwrite.financials?.hardMoney?.originationPoints || 0);
    // Generate 5 meaningful price points between MAO-10% and asking+5%
    const pts = [
      Math.round(ask * 1.00),             // asking (baseline)
      Math.round(ask * 0.95),             // 5% under ask
      Math.round((ask + mao) / 2),        // midpoint
      Math.round(mao * 1.00),             // MAO
      Math.round(mao * 0.90),             // 10% under MAO (stretch offer)
    ].filter((p, i, arr) => p > 0 && arr.indexOf(p) === i)
     .sort((a, b) => a - b); // lowest price first (opening offer at top)

    underwrite.negotiationLadder = pts.map(price => ({
      price,
      label: price === mao ? 'MAX OFFER' :
             price === Math.round(ask) ? 'At asking' :
             price > mao ? 'Over MAO' :
             price < Math.round(ask * 0.90) ? 'Opening offer' :
             price < Math.round(ask * 0.97) ? 'Counter' :
             price < ask ? 'Best counter' : 'Counter',
      profit: Math.round(arv - price - repairs - costs),
      meetsMin: (() => { const _p=Math.round(arv-price-repairs-costs); const _min=price>=1000000?100000:Math.max(price*0.10,20000); return _p>=_min; })(),
      roi:   arv > 0 ? parseFloat(((arv - price - repairs - costs) / (price + repairs) * 100).toFixed(1)) : 0
    }));
  } catch(e) { /* non-critical */ }
  underwrite.chatHistory = underwrite.chatHistory || [];
  underwrite.model = model;

  // ── EXIT ANALYSIS ──────────────────────────────────────────────────────────
  try {
    const city = (deal.city||'').toLowerCase();
    const nb = Object.entries(TAMPA.neighborhoods).find(([name]) =>
      city.includes(name.split(' ')[0]) || name.includes(city.split(' ')[0])
    );
    const tier = nb ? nb[1].tier : 'C';
    const tierKey = tier.startsWith('A') ? 'a_tier' : tier.startsWith('B') ? 'b_tier' : 'c_tier';
    const dom  = TAMPA.marketConditions.days_on_market[tierKey] || 45;
    const lsr  = TAMPA.marketConditions.list_to_sale_ratio[tierKey] || 0.94;
    const arv  = underwrite.arv?.urbanARV || 0;
    const ask  = parseFloat(deal.askingPrice) || 0;
    const repairs = underwrite.rehab?.urbanEstimate || 0;

    // Extra hold cost from DOM vs assumed hold
    const holdMonths = underwrite.financials?.holdMonths || 5;
    const domMonths  = Math.ceil(dom / 30);
    const extraMonths = Math.max(0, domMonths - 1); // 1 month to close after list
    const extraHoldCost = extraMonths * 350; // $350/mo extra carrying per extra month

    // Realistic sale price = ARV * list-to-sale ratio
    const realisticSalePrice = Math.round(arv * lsr);

    underwrite.exitAnalysis = {
      neighborhoodTier: tier,
      estimatedDOM: dom,
      listToSaleRatio: lsr,
      realisticSalePrice,
      realisticSalePriceNote: `${arv.toLocaleString()} ARV × ${(lsr*100).toFixed(0)}% list-to-sale`,
      adjustedProfit: Math.round((underwrite.financials?.netProfitAtAsking||0) - (arv - realisticSalePrice) - extraHoldCost),
      extraCarryingCost: extraHoldCost,
      totalHoldEstimate: holdMonths + extraMonths,
      buyerProfile: tier.startsWith('A') ? 'Move-up/luxury buyers. 25 day DOM typical.' :
                    tier.startsWith('B') ? 'First-time + move-up buyers. 35 day DOM typical. Strong demand.' :
                    'Value/investor buyers. 55 day DOM typical. Price sensitively high.',
    };
  } catch(e) { /* non-critical */ }

  underwrites[uid] = underwrite;
  // (JSON file removed — Postgres only)
  DB.saveUnderwrite(uid, underwrite).catch(() => {}); // Postgres
  // Async persist verdict index to sheet — non-blocking
  persistVerdictIndexToSheet().catch(() => {});

  // ── MEGAMIND BRAIN HARVEST ───────────────────────────────────────────────────
  // Every single data point from every underwrite goes here.
  // Brain becomes smarter with every deal — hundreds of categories.
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const zip  = deal.zip  || '';
    const county = (deal.county || deal.city || 'unknown').toLowerCase();
    const email  = (deal.contact1Email || 'unknown').toLowerCase();
    const arv    = underwrite.arv?.urbanARV            || 0;
    const wARV   = underwrite.arv?.wholesalerARV       || 0;
    const rehab  = underwrite.rehab?.urbanEstimate     || 0;
    const ask    = parseFloat(deal.askingPrice)        || 0;
    const sqft   = parseFloat(deal.sqft)               || 0;
    const beds   = parseInt(deal.beds)                 || 0;
    const baths  = parseFloat(deal.baths)              || 0;
    const yr     = parseInt(deal.yearBuilt)            || 0;
    const profit = underwrite.financials?.netProfitAtAsking || 0;
    const mao    = underwrite.financials?.mao           || 0;
    const scope  = underwrite.rehab?.scopeLevel         || 'UNKNOWN';
    const ppsf   = (arv && sqft) ? Math.round(arv / sqft) : 0;
    const verdict = underwrite.verdict || 'REVIEW';
    const score   = underwrite.score   || 0;
    const isHot   = ['HOT','BUY'].includes(verdict);
    const isBad   = ['PASS','HARD NO'].includes(verdict);
    const arvInflation = (wARV && arv && wARV > 0) ? ((wARV - arv) / arv * 100) : 0;

    // ── 1. GLOBAL STATS ──────────────────────────────────────────────────────
    urbanBrain.totalUnderwritten = (urbanBrain.totalUnderwritten || 0) + 1;
    if (isHot) urbanBrain.hotDeals  = (urbanBrain.hotDeals  || 0) + 1;
    if (isBad) urbanBrain.passedDeals = (urbanBrain.passedDeals || 0) + 1;

    // ── 2. ZIP INTELLIGENCE — every metric per zip ────────────────────────────
    if (zip) {
      const z = urbanBrain.zipIntel = urbanBrain.zipIntel || {};
      if (!z[zip]) z[zip] = {
        deals:0, hotDeals:0, hardNos:0, passes:0,
        arvSamples:[], ppsfSamples:[], rehabSamples:[], profitSamples:[],
        askSamples:[], domSamples:[], scoreSamples:[],
        poolDeals:0, noPoolDeals:0, poolARVSamples:[], noPoolARVSamples:[],
        scopeCounts:{}, riskFlagCounts:{}, verdictCounts:{},
        wholesalerInflationSamples:[], avgARVInflation:0,
        firstSeen: dateStr, lastSeen: dateStr
      };
      const zi = z[zip];
      zi.deals++;
      zi.lastSeen = dateStr;
      zi.verdictCounts[verdict] = (zi.verdictCounts[verdict] || 0) + 1;
      zi.scoreSamples.push(score); if (zi.scoreSamples.length > 50) zi.scoreSamples.shift();
      if (isHot) zi.hotDeals++;
      if (verdict === 'HARD NO') zi.hardNos++;
      if (isBad) zi.passes++;
      if (arv)    { zi.arvSamples.push(arv);    if (zi.arvSamples.length > 50) zi.arvSamples.shift(); }
      if (ppsf)   { zi.ppsfSamples.push(ppsf);  if (zi.ppsfSamples.length > 50) zi.ppsfSamples.shift(); }
      if (rehab)  { zi.rehabSamples.push(rehab); if (zi.rehabSamples.length > 50) zi.rehabSamples.shift(); }
      if (profit) { zi.profitSamples.push(profit); if (zi.profitSamples.length > 50) zi.profitSamples.shift(); }
      if (ask)    { zi.askSamples.push(ask);     if (zi.askSamples.length > 50) zi.askSamples.shift(); }
      if (scope)  { zi.scopeCounts[scope] = (zi.scopeCounts[scope] || 0) + 1; }
      if (arvInflation) {
        zi.wholesalerInflationSamples.push(parseFloat(arvInflation.toFixed(1)));
        if (zi.wholesalerInflationSamples.length > 30) zi.wholesalerInflationSamples.shift();
        zi.avgARVInflation = parseFloat((zi.wholesalerInflationSamples.reduce((a,b)=>a+b,0)/zi.wholesalerInflationSamples.length).toFixed(1));
      }
      // Pool premium
      const hasPool = (deal.pool || '').toLowerCase() === 'yes' || deal.pool === true;
      if (hasPool && arv) {
        zi.poolDeals++; zi.poolARVSamples.push(arv);
        if (zi.poolARVSamples.length > 20) zi.poolARVSamples.shift();
      } else if (arv) {
        zi.noPoolDeals++; zi.noPoolARVSamples.push(arv);
        if (zi.noPoolARVSamples.length > 20) zi.noPoolARVSamples.shift();
      }
      // Pool premium calculation
      if (zi.poolARVSamples.length >= 3 && zi.noPoolARVSamples.length >= 3) {
        const poolAvg = zi.poolARVSamples.reduce((a,b)=>a+b,0)/zi.poolARVSamples.length;
        const noPoolAvg = zi.noPoolARVSamples.reduce((a,b)=>a+b,0)/zi.noPoolARVSamples.length;
        zi.poolPremium = Math.round(poolAvg - noPoolAvg);
      }
      // Computed stats
      if (zi.arvSamples.length)  zi.avgARV   = Math.round(zi.arvSamples.reduce((a,b)=>a+b,0)/zi.arvSamples.length);
      if (zi.ppsfSamples.length) zi.avgPpsf  = Math.round(zi.ppsfSamples.reduce((a,b)=>a+b,0)/zi.ppsfSamples.length);
      if (zi.rehabSamples.length) zi.avgRehab = Math.round(zi.rehabSamples.reduce((a,b)=>a+b,0)/zi.rehabSamples.length);
      if (zi.profitSamples.length) zi.avgProfit = Math.round(zi.profitSamples.reduce((a,b)=>a+b,0)/zi.profitSamples.length);
      if (zi.scoreSamples.length) zi.avgScore = parseFloat((zi.scoreSamples.reduce((a,b)=>a+b,0)/zi.scoreSamples.length).toFixed(1));
      zi.hotRate  = zi.deals > 0 ? parseFloat((zi.hotDeals/zi.deals).toFixed(2)) : 0;
      zi.hardNoRate = zi.deals > 0 ? parseFloat((zi.hardNos/zi.deals).toFixed(2)) : 0;
      // Risk flags
      (underwrite.riskFlags || []).forEach(f => {
        zi.riskFlagCounts[f.flag] = (zi.riskFlagCounts[f.flag] || 0) + 1;
      });
    }

    // ── 3. COUNTY INTELLIGENCE ────────────────────────────────────────────────
    if (county) {
      const m = urbanBrain.marketNotes = urbanBrain.marketNotes || {};
      if (!m[county]) m[county] = { deals:0, avgARV:0, arvSamples:[], hotDeals:0, notes:'' };
      const mn = m[county];
      mn.deals++;
      if (isHot) mn.hotDeals = (mn.hotDeals || 0) + 1;
      if (arv)  { mn.arvSamples.push(arv); if (mn.arvSamples.length > 50) mn.arvSamples.shift(); }
      mn.avgARV   = mn.arvSamples.length ? Math.round(mn.arvSamples.reduce((a,b)=>a+b,0)/mn.arvSamples.length) : 0;
      mn.hotRate  = mn.deals > 0 ? parseFloat((mn.hotDeals/mn.deals).toFixed(2)) : 0;
    }

    // ── 4. PROPERTY TYPE PATTERNS ─────────────────────────────────────────────
    if (beds && sqft > 0) {
      const sfBucket = sqft < 1000 ? 'sub1000' : sqft < 1200 ? '1000to1200' : sqft < 1500 ? '1200to1500' : sqft < 1800 ? '1500to1800' : sqft < 2200 ? '1800to2200' : '2200plus';
      const typeKey  = `${beds}bd_${baths}ba_${sfBucket}`;
      const PT = urbanBrain.propertyPatterns = urbanBrain.propertyPatterns || {};
      if (!PT[typeKey]) PT[typeKey] = { count:0, arvSamples:[], ppsfSamples:[], rehabSamples:[], profitSamples:[], hotDeals:0, verdicts:{} };
      const pt = PT[typeKey];
      pt.count++;
      pt.verdicts[verdict] = (pt.verdicts[verdict] || 0) + 1;
      if (isHot) pt.hotDeals++;
      if (arv)  { pt.arvSamples.push(arv);   if (pt.arvSamples.length > 30) pt.arvSamples.shift(); }
      if (ppsf) { pt.ppsfSamples.push(ppsf); if (pt.ppsfSamples.length > 30) pt.ppsfSamples.shift(); }
      if (rehab){ pt.rehabSamples.push(rehab);if (pt.rehabSamples.length > 30) pt.rehabSamples.shift(); }
      if (profit){ pt.profitSamples.push(profit);if (pt.profitSamples.length > 30) pt.profitSamples.shift(); }
      if (pt.arvSamples.length)   pt.avgARV   = Math.round(pt.arvSamples.reduce((a,b)=>a+b,0)/pt.arvSamples.length);
      if (pt.ppsfSamples.length)  pt.avgPpsf  = Math.round(pt.ppsfSamples.reduce((a,b)=>a+b,0)/pt.ppsfSamples.length);
      if (pt.rehabSamples.length) pt.avgRehab = Math.round(pt.rehabSamples.reduce((a,b)=>a+b,0)/pt.rehabSamples.length);
      pt.hotRate = pt.count > 0 ? parseFloat((pt.hotDeals/pt.count).toFixed(2)) : 0;
    }

    // ── 5. YEAR BUILT COHORT DATA ─────────────────────────────────────────────
    if (yr > 1900) {
      const cohort = yr < 1960 ? 'pre1960' : yr < 1980 ? '1960to1979' : yr < 2000 ? '1980to1999' : '2000plus';
      const YB = urbanBrain.yearBuiltCohorts = urbanBrain.yearBuiltCohorts || {};
      if (!YB[cohort]) YB[cohort] = { count:0, ppsfSamples:[], rehabSamples:[], hardNoRate:0, hardNos:0 };
      const yb = YB[cohort];
      yb.count++;
      if (verdict === 'HARD NO') yb.hardNos++;
      if (ppsf)  { yb.ppsfSamples.push(ppsf);   if (yb.ppsfSamples.length > 30) yb.ppsfSamples.shift(); }
      if (rehab) { yb.rehabSamples.push(rehab);  if (yb.rehabSamples.length > 30) yb.rehabSamples.shift(); }
      if (yb.ppsfSamples.length)  yb.avgPpsf  = Math.round(yb.ppsfSamples.reduce((a,b)=>a+b,0)/yb.ppsfSamples.length);
      if (yb.rehabSamples.length) yb.avgRehab = Math.round(yb.rehabSamples.reduce((a,b)=>a+b,0)/yb.rehabSamples.length);
      yb.hardNoRate = yb.count > 0 ? parseFloat((yb.hardNos/yb.count).toFixed(2)) : 0;
    }

    // ── 6. REHAB SCOPE PATTERNS ───────────────────────────────────────────────
    if (scope && scope !== 'UNKNOWN') {
      const RS = urbanBrain.rehabPatterns = urbanBrain.rehabPatterns || {};
      if (!RS[scope]) RS[scope] = { count:0, rehabSamples:[], profitSamples:[], hotDeals:0 };
      const rs = RS[scope];
      rs.count++;
      if (isHot) rs.hotDeals++;
      if (rehab)  { rs.rehabSamples.push(rehab);  if (rs.rehabSamples.length > 30) rs.rehabSamples.shift(); }
      if (profit) { rs.profitSamples.push(profit); if (rs.profitSamples.length > 30) rs.profitSamples.shift(); }
      if (rs.rehabSamples.length)  rs.avgRehab  = Math.round(rs.rehabSamples.reduce((a,b)=>a+b,0)/rs.rehabSamples.length);
      if (rs.profitSamples.length) rs.avgProfit = Math.round(rs.profitSamples.reduce((a,b)=>a+b,0)/rs.profitSamples.length);
      rs.hotRate = rs.count > 0 ? parseFloat((rs.hotDeals/rs.count).toFixed(2)) : 0;
    }

    // ── 7. REHAB LINE ITEM HARVEST ────────────────────────────────────────────
    const lineItems = underwrite.rehab?.lineItems || {};
    if (Object.keys(lineItems).length) {
      const RL = urbanBrain.rehabLineItems = urbanBrain.rehabLineItems || {};
      for (const [item, cost] of Object.entries(lineItems)) {
        if (!cost || cost === 0) continue;
        if (!RL[item]) RL[item] = { count:0, samples:[], avg:0 };
        RL[item].count++;
        RL[item].samples.push(parseInt(cost));
        if (RL[item].samples.length > 50) RL[item].samples.shift();
        RL[item].avg = Math.round(RL[item].samples.reduce((a,b)=>a+b,0)/RL[item].samples.length);
      }
    }

    // ── 8. RISK FLAG INTELLIGENCE ─────────────────────────────────────────────
    const RF = urbanBrain.riskFlagIntel = urbanBrain.riskFlagIntel || {};
    (underwrite.riskFlags || []).forEach(f => {
      const key = (f.flag || f.severity + '_flag').toUpperCase().replace(/\s+/g,'_');
      if (!RF[key]) RF[key] = { count:0, severity: f.severity, avgScoreWhenPresent:0, scoreSamples:[], counties:[] };
      RF[key].count++;
      RF[key].scoreSamples.push(score);
      if (RF[key].scoreSamples.length > 20) RF[key].scoreSamples.shift();
      RF[key].avgScoreWhenPresent = parseFloat((RF[key].scoreSamples.reduce((a,b)=>a+b,0)/RF[key].scoreSamples.length).toFixed(1));
      if (county && !RF[key].counties.includes(county)) RF[key].counties.push(county);
    });

    // ── 9. WHOLESALER INTELLIGENCE ────────────────────────────────────────────
    const WS = urbanBrain.wholesalerStats = urbanBrain.wholesalerStats || {};
    if (!WS[email]) WS[email] = {
      name: deal.contact1Name || '', company: deal.wholesalerCompany || '',
      deals:0, arvSamples:[], avgARVInflation:0,
      verdicts:{}, hotDeals:0, byZip:{}, byCounty:{},
      inflationWarning:false, verifiedInflator: false
    };
    const ws = WS[email];
    ws.deals++;
    ws.verdicts[verdict] = (ws.verdicts[verdict] || 0) + 1;
    if (isHot) ws.hotDeals++;
    // ARV inflation tracking
    if (wARV && arv && wARV > 0) {
      const inf = parseFloat(((wARV - arv) / arv * 100).toFixed(1));
      ws.arvSamples.push(inf);
      if (ws.arvSamples.length > 20) ws.arvSamples.shift();
      ws.avgARVInflation = parseFloat((ws.arvSamples.reduce((a,b)=>a+b,0)/ws.arvSamples.length).toFixed(1));
      // Per-zip inflation tracking
      if (zip) {
        ws.byZip = ws.byZip || {};
        if (!ws.byZip[zip]) ws.byZip[zip] = { deals:0, inflationSamples:[], avgInflation:0 };
        ws.byZip[zip].deals++;
        ws.byZip[zip].inflationSamples.push(inf);
        if (ws.byZip[zip].inflationSamples.length > 10) ws.byZip[zip].inflationSamples.shift();
        ws.byZip[zip].avgInflation = parseFloat((ws.byZip[zip].inflationSamples.reduce((a,b)=>a+b,0)/ws.byZip[zip].inflationSamples.length).toFixed(1));
      }
    }
    // Auto-flag inflators (>15% avg over 3+ deals)
    if (!ws.verifiedInflator && ws.arvSamples.length >= 3 && ws.avgARVInflation > 15) {
      ws.inflationWarning = true;
    } else if (!ws.verifiedInflator && ws.avgARVInflation <= 15) {
      ws.inflationWarning = false;
    }
    ws.hotRate = ws.deals > 0 ? parseFloat((ws.hotDeals/ws.deals).toFixed(2)) : 0;
    // Build human-readable note
    urbanBrain.wholesalerNotes = urbanBrain.wholesalerNotes || {};
    urbanBrain.wholesalerNotes[email] = `${ws.name} (${ws.company}) | ${ws.deals} deals | avg ARV inflation: ${ws.avgARVInflation}%${ws.verifiedInflator ? ' | ⚠️ VERIFIED INFLATOR' : ws.inflationWarning ? ' | ⚠️ INFLATION WARNING' : ''} | verdicts: ${JSON.stringify(ws.verdicts)} | hot rate: ${(ws.hotRate*100).toFixed(0)}%`;

    // ── 10. HOT DEAL DNA ──────────────────────────────────────────────────────
    if (isHot && arv && profit > 0) {
      const HD = urbanBrain.hotDealDNA = urbanBrain.hotDealDNA || {
        count:0, arvSamples:[], ppsfSamples:[], profitSamples:[], rehabSamples:[],
        askToARVSamples:[], bedsSamples:[], sqftSamples:[], topZips:{}, topCounties:{}
      };
      HD.count++;
      if (arv)    { HD.arvSamples.push(arv);    if (HD.arvSamples.length > 50) HD.arvSamples.shift(); }
      if (ppsf)   { HD.ppsfSamples.push(ppsf);  if (HD.ppsfSamples.length > 50) HD.ppsfSamples.shift(); }
      if (profit) { HD.profitSamples.push(profit); if (HD.profitSamples.length > 50) HD.profitSamples.shift(); }
      if (rehab)  { HD.rehabSamples.push(rehab); if (HD.rehabSamples.length > 50) HD.rehabSamples.shift(); }
      if (ask && arv) HD.askToARVSamples.push(parseFloat((ask/arv).toFixed(3)));
      if (beds)   HD.bedsSamples.push(beds);
      if (sqft)   HD.sqftSamples.push(sqft);
      if (zip)    HD.topZips[zip] = (HD.topZips[zip] || 0) + 1;
      if (county) HD.topCounties[county] = (HD.topCounties[county] || 0) + 1;
      HD.avgARV         = HD.arvSamples.length ? Math.round(HD.arvSamples.reduce((a,b)=>a+b,0)/HD.arvSamples.length) : 0;
      HD.avgPpsf        = HD.ppsfSamples.length ? Math.round(HD.ppsfSamples.reduce((a,b)=>a+b,0)/HD.ppsfSamples.length) : 0;
      HD.avgProfit      = HD.profitSamples.length ? Math.round(HD.profitSamples.reduce((a,b)=>a+b,0)/HD.profitSamples.length) : 0;
      HD.avgRehab       = HD.rehabSamples.length ? Math.round(HD.rehabSamples.reduce((a,b)=>a+b,0)/HD.rehabSamples.length) : 0;
      HD.avgAskToARV    = HD.askToARVSamples.length ? parseFloat((HD.askToARVSamples.reduce((a,b)=>a+b,0)/HD.askToARVSamples.length).toFixed(3)) : 0;
      HD.avgBeds        = HD.bedsSamples.length ? parseFloat((HD.bedsSamples.reduce((a,b)=>a+b,0)/HD.bedsSamples.length).toFixed(1)) : 0;
      HD.avgSqft        = HD.sqftSamples.length ? Math.round(HD.sqftSamples.reduce((a,b)=>a+b,0)/HD.sqftSamples.length) : 0;
    }

    // ── 11. HARD NO DNA (what kills deals) ───────────────────────────────────
    if (verdict === 'HARD NO') {
      const HN = urbanBrain.hardNoDNA = urbanBrain.hardNoDNA || { count:0, topRiskFlags:{}, topZips:{}, topCounties:{}, avgScore:0, scoreSamples:[] };
      HN.count++;
      HN.scoreSamples.push(score);
      if (HN.scoreSamples.length > 30) HN.scoreSamples.shift();
      HN.avgScore = parseFloat((HN.scoreSamples.reduce((a,b)=>a+b,0)/HN.scoreSamples.length).toFixed(1));
      if (zip) HN.topZips[zip] = (HN.topZips[zip] || 0) + 1;
      if (county) HN.topCounties[county] = (HN.topCounties[county] || 0) + 1;
      (underwrite.riskFlags || []).filter(f => f.severity === 'HIGH').forEach(f => {
        HN.topRiskFlags[f.flag] = (HN.topRiskFlags[f.flag] || 0) + 1;
      });
    }

    // ── 12. COMP QUALITY TRACKING ─────────────────────────────────────────────
    if (comps && comps.length > 0) {
      const CQ = urbanBrain.compQuality = urbanBrain.compQuality || {};
      const src = comps[0]?.source || 'unknown';
      const srcKey = src.includes('HCPA') ? 'HCPA' : src.includes('REDFIN_LIVE') ? 'REDFIN_LIVE' : src.includes('REDFIN') ? 'REDFIN_DB' : 'other';
      if (!CQ[srcKey]) CQ[srcKey] = { uses:0, avgCompsReturned:0, countSamples:[] };
      CQ[srcKey].uses++;
      CQ[srcKey].countSamples.push(comps.length);
      if (CQ[srcKey].countSamples.length > 20) CQ[srcKey].countSamples.shift();
      CQ[srcKey].avgCompsReturned = parseFloat((CQ[srcKey].countSamples.reduce((a,b)=>a+b,0)/CQ[srcKey].countSamples.length).toFixed(1));
      if (zip) {
        CQ[srcKey].zipsServed = CQ[srcKey].zipsServed || {};
        CQ[srcKey].zipsServed[zip] = (CQ[srcKey].zipsServed[zip] || 0) + 1;
      }
    }

    // ── 13. FINANCIAL PATTERN TRACKING ───────────────────────────────────────
    const FP = urbanBrain.financialPatterns = urbanBrain.financialPatterns || {
      holdingCostSamples:[], sellingCostSamples:[], hmlCostSamples:[], maoToAskGapSamples:[],
      avgHoldingCosts:0, avgSellingCosts:0, avgHMLCosts:0
    };
    const hc = underwrite.financials?.holdingCosts?.total;
    const sc = underwrite.financials?.sellingCosts?.total;
    const hml = (underwrite.financials?.hardMoney?.totalInterest || 0) + (underwrite.financials?.hardMoney?.originationPoints || 0);
    if (hc)  { FP.holdingCostSamples.push(hc);  if (FP.holdingCostSamples.length > 30) FP.holdingCostSamples.shift(); FP.avgHoldingCosts = Math.round(FP.holdingCostSamples.reduce((a,b)=>a+b,0)/FP.holdingCostSamples.length); }
    if (sc)  { FP.sellingCostSamples.push(sc);  if (FP.sellingCostSamples.length > 30) FP.sellingCostSamples.shift(); FP.avgSellingCosts = Math.round(FP.sellingCostSamples.reduce((a,b)=>a+b,0)/FP.sellingCostSamples.length); }
    if (hml) { FP.hmlCostSamples.push(hml);     if (FP.hmlCostSamples.length > 30) FP.hmlCostSamples.shift(); FP.avgHMLCosts = Math.round(FP.hmlCostSamples.reduce((a,b)=>a+b,0)/FP.hmlCostSamples.length); }
    if (mao && ask) FP.maoToAskGapSamples.push(Math.round(ask - mao));

    // ── 14. DETAILED LESSON (rich, multi-field) ────────────────────────────────
    const lesson = [
      `${verdict} (${score}/10)`,
      `${deal.address}, ${deal.city} ${zip}`,
      ask  ? `Ask $${ask.toLocaleString()}`  : null,
      arv  ? `ARV $${arv.toLocaleString()}`  : null,
      wARV ? `WholesalerARV $${wARV.toLocaleString()} (${arvInflation > 0 ? '+' : ''}${arvInflation.toFixed(0)}%)` : null,
      rehab ? `Rehab $${rehab.toLocaleString()} (${scope})` : null,
      profit ? `Profit $${profit.toLocaleString()}` : null,
      ppsf ? `$${ppsf}/sf` : null,
      sqft ? `${sqft}sf` : null,
      beds ? `${beds}bd/${baths}ba` : null,
      yr ? `Built ${yr}` : null,
      comps?.length ? `${comps.length} comps (${comps[0]?.source || '?'})` : null,
      underwrite.arv?.arvConfidence ? `ARV conf: ${underwrite.arv.arvConfidence}` : null,
      underwrite.verdictReason ? underwrite.verdictReason.slice(0, 100) : null,
      // Price accuracy flag
      underwrite.arv?.urbanARV && parseFloat(deal.askingPrice) > underwrite.arv.urbanARV * 0.90
        ? '⚠️ Ask near/above ARV — VERIFY PRICE' : null,
    ].filter(Boolean).join(' | ');
    
    urbanBrain.lessons = urbanBrain.lessons || [];
    urbanBrain.lessons.push(`[${dateStr}] ${lesson}`);
    if (urbanBrain.lessons.length > 200) urbanBrain.lessons.shift();

    // ── 16. PRICE TIER INTELLIGENCE ─────────────────────────────────────────
    if (ask > 0) {
      const tier = ask < 150000 ? 'sub150' : ask < 250000 ? '150to250' : ask < 400000 ? '250to400' : ask < 600000 ? '400to600' : '600plus';
      const PT2 = urbanBrain.priceTierIntel = urbanBrain.priceTierIntel || {};
      if (!PT2[tier]) PT2[tier] = { count:0, profitSamples:[], arvSamples:[], hotDeals:0, hotRate:0 };
      PT2[tier].count++; if (isHot) PT2[tier].hotDeals++;
      if (profit) { PT2[tier].profitSamples.push(profit); if (PT2[tier].profitSamples.length > 30) PT2[tier].profitSamples.shift(); PT2[tier].avgProfit = Math.round(PT2[tier].profitSamples.reduce((a,b)=>a+b,0)/PT2[tier].profitSamples.length); }
      if (arv) { PT2[tier].arvSamples.push(arv); if (PT2[tier].arvSamples.length > 30) PT2[tier].arvSamples.shift(); PT2[tier].avgARV = Math.round(PT2[tier].arvSamples.reduce((a,b)=>a+b,0)/PT2[tier].arvSamples.length); }
      PT2[tier].hotRate = PT2[tier].count > 0 ? parseFloat((PT2[tier].hotDeals/PT2[tier].count).toFixed(2)) : 0;
    }

    // ── 17. ARV $/SQFT ACCURACY BY COUNTY (real-data benchmarks) ───────────────
    if (ppsf && arv > 50000 && sqft > 500 && county) {
      const AS = urbanBrain.arvAccuracy = urbanBrain.arvAccuracy || {};
      const ck = county.toLowerCase().replace(' county','');
      if (!AS[ck]) AS[ck] = { ppsfSamples:[], avgPpsf:0, count:0, p75Ppsf:0 };
      AS[ck].count++; AS[ck].ppsfSamples.push(ppsf);
      if (AS[ck].ppsfSamples.length > 50) AS[ck].ppsfSamples.shift();
      const ss = AS[ck].ppsfSamples.slice().sort((a,b)=>a-b);
      AS[ck].avgPpsf = Math.round(ss.reduce((a,b)=>a+b,0)/ss.length);
      AS[ck].p25Ppsf = ss[Math.floor(ss.length*0.25)] || ss[0];
      AS[ck].p75Ppsf = ss[Math.floor(ss.length*0.75)] || ss[ss.length-1];
    }

    // ── 18. CITY-LEVEL MICRO INTELLIGENCE ───────────────────────────────────
    const city2 = (deal.city || '').toLowerCase().trim();
    if (city2) {
      const CI = urbanBrain.cityIntel = urbanBrain.cityIntel || {};
      if (!CI[city2]) CI[city2] = { deals:0, arvSamples:[], ppsfSamples:[], hotDeals:0, hardNos:0, hotRate:0 };
      const ci = CI[city2]; ci.deals++; if (isHot) ci.hotDeals++; if (verdict==='HARD NO') ci.hardNos++;
      if (arv) { ci.arvSamples.push(arv); if (ci.arvSamples.length>30) ci.arvSamples.shift(); ci.avgARV = Math.round(ci.arvSamples.reduce((a,b)=>a+b,0)/ci.arvSamples.length); }
      if (ppsf) { ci.ppsfSamples.push(ppsf); if (ci.ppsfSamples.length>30) ci.ppsfSamples.shift(); ci.avgPpsf = Math.round(ci.ppsfSamples.reduce((a,b)=>a+b,0)/ci.ppsfSamples.length); }
      ci.hotRate = ci.deals>0 ? parseFloat((ci.hotDeals/ci.deals).toFixed(2)) : 0;
    }

    // ── 19. PROFIT MARGIN DISTRIBUTION ────────────────────────────────────────
    if (profit && ask > 0) {
      const PMD = urbanBrain.profitMarginDist = urbanBrain.profitMarginDist || { samples:[], total:0, above10pct:0, avg:0, p50:0, p75:0 };
      PMD.total++; PMD.samples.push(parseFloat((profit/ask*100).toFixed(1)));
      if (PMD.samples.length > 100) PMD.samples.shift();
      const sorted = PMD.samples.slice().sort((a,b)=>a-b);
      PMD.avg = parseFloat((sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(1));
      PMD.p50 = sorted[Math.floor(sorted.length*0.50)]; PMD.p75 = sorted[Math.floor(sorted.length*0.75)];
      PMD.above10pct = PMD.samples.filter(p => p >= 10).length;
    }

    // ── 20. ARV INFLATION BY COUNTY ─────────────────────────────────────────
    if (arvInflation > 5 && wARV > 0 && county) {
      const AIA = urbanBrain.arvInflationByCounty = urbanBrain.arvInflationByCounty || {};
      const ck = county.toLowerCase();
      if (!AIA[ck]) AIA[ck] = { samples:[], avg:0, count:0 };
      AIA[ck].count++; AIA[ck].samples.push(parseFloat(arvInflation.toFixed(1)));
      if (AIA[ck].samples.length > 30) AIA[ck].samples.shift();
      AIA[ck].avg = parseFloat((AIA[ck].samples.reduce((a,b)=>a+b,0)/AIA[ck].samples.length).toFixed(1));
    }

    // ── 21. REHAB COST $/SF BY SCOPE ──────────────────────────────────────────
    if (rehab && sqft > 0) {
      const RC = urbanBrain.rehabCostPsf = urbanBrain.rehabCostPsf || {};
      const sk = scope && scope !== 'UNKNOWN' ? scope : 'MEDIUM';
      if (!RC[sk]) RC[sk] = { samples:[], avg:0, count:0 };
      RC[sk].count++; RC[sk].samples.push(parseFloat((rehab/sqft).toFixed(2)));
      if (RC[sk].samples.length > 30) RC[sk].samples.shift();
      RC[sk].avg = parseFloat((RC[sk].samples.reduce((a,b)=>a+b,0)/RC[sk].samples.length).toFixed(2));
    }

    // ── 22. COUNTY $/SF BENCHMARKS (real CCG data) ───────────────────────────
    if (ppsf && county && arv > 50000) {
      const CB = urbanBrain.countyPpsfBenchmarks = urbanBrain.countyPpsfBenchmarks || {};
      const ck2 = county.toLowerCase().replace(' county','');
      if (!CB[ck2]) CB[ck2] = { count:0, samples:[], avg:0, p25:0, p75:0 };
      CB[ck2].count++; CB[ck2].samples.push(ppsf);
      if (CB[ck2].samples.length > 50) CB[ck2].samples.shift();
      const cbs = CB[ck2].samples.slice().sort((a,b)=>a-b);
      CB[ck2].avg = Math.round(cbs.reduce((a,b)=>a+b,0)/cbs.length);
      CB[ck2].p25 = cbs[Math.floor(cbs.length*0.25)] || cbs[0];
      CB[ck2].p75 = cbs[Math.floor(cbs.length*0.75)] || cbs[cbs.length-1];
    }

    // ── 23. BUY DEAL DNA (10%-profit-rule wins) ──────────────────────────────
    if (isHot && arv && profit > 0 && ask > 0) {
      const BD = urbanBrain.buyDealDNA = urbanBrain.buyDealDNA || { count:0, profitPctSamples:[], arvSamples:[], topZips:{}, topCounties:{}, avgProfitPct:0, avgARV:0 };
      BD.count++;
      BD.profitPctSamples.push(parseFloat((profit/ask*100).toFixed(1)));
      if (BD.profitPctSamples.length > 50) BD.profitPctSamples.shift();
      BD.avgProfitPct = parseFloat((BD.profitPctSamples.reduce((a,b)=>a+b,0)/BD.profitPctSamples.length).toFixed(1));
      if (arv) { BD.arvSamples.push(arv); if (BD.arvSamples.length>50) BD.arvSamples.shift(); BD.avgARV = Math.round(BD.arvSamples.reduce((a,b)=>a+b,0)/BD.arvSamples.length); }
      if (zip) BD.topZips[zip] = (BD.topZips[zip]||0)+1;
      if (county) BD.topCounties[county] = (BD.topCounties[county]||0)+1;
    }

    // ── 24. WHOLESALER PRICE POSITIONING ───────────────────────────────────
    if (email && ask > 0) {
      const WP = urbanBrain.wholesalerPricing = urbanBrain.wholesalerPricing || {};
      if (!WP[email]) WP[email] = { deals:0, askSamples:[], counties:{}, avgAsk:0 };
      WP[email].deals++; WP[email].askSamples.push(ask);
      if (WP[email].askSamples.length>20) WP[email].askSamples.shift();
      WP[email].avgAsk = Math.round(WP[email].askSamples.reduce((a,b)=>a+b,0)/WP[email].askSamples.length);
      if (county) WP[email].counties[county] = (WP[email].counties[county]||0)+1;
    }

    // ── 25. META & TOTALS ─────────────────────────────────────────────────────────────────
    urbanBrain.lastUpdated = now.toISOString();
    urbanBrain.totalCategories = Object.keys(urbanBrain).length;
    const zipCount = Object.keys(urbanBrain.zipIntel || {}).length;
    const wsCount  = Object.keys(urbanBrain.wholesalerStats || {}).length;
    const ptCount  = Object.keys(urbanBrain.propertyPatterns || {}).length;
    const cityCount = Object.keys(urbanBrain.cityIntel || {}).length;
    console.log(`Brain x25: ${verdict}|${score}/10 | zips:${zipCount} ws:${wsCount} types:${ptCount} cities:${cityCount} cat:${urbanBrain.totalCategories}`);

    saveBrain().catch(() => {});
    logUnderwriteToSheet(underwrite).catch(e => console.log('UW log:', e.message));

  } catch(brainErr) { console.error('Megamind harvest error:', brainErr.message); }

  return underwrite;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers['x-urban-token'] || req.query.token;
  const user = USERS[token];
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket?.remoteAddress || '?';
  logAccess(user.name, ip, req.headers['user-agent'], req.path);
  req.user = user; req.author = user.name;
  next();
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
// ── REVIEW CHAT & LEARN ──────────────────────────────────────────────────────
// Call this to have Urban re-read ALL conversation history and extract lessons.
// Adam calls this after Caleb/Grant conversations. Caleb/Grant can call manually.
// Uses Haiku (cheap) unless there are 20+ messages to digest (uses Sonnet once).
app.post('/api/review-chat', auth, async (req, res) => {
  try {
    // Gather all chat history — from underwrite threads + any corrections
    const allChats = [];
    for (const [uid, uw] of Object.entries(underwrites)) {
      if (uw.chatHistory && uw.chatHistory.length > 0) {
        allChats.push({
          address: uw.deal?.address || uid,
          verdict: uw.verdict,
          score: uw.score,
          chat: uw.chatHistory.slice(-20) // last 20 messages per deal
        });
      }
    }

    const corrections = urbanBrain.correctionHistory || [];
    const existingLessons = urbanBrain.lessons || [];

    if (!allChats.length && !corrections.length) {
      return res.json({ ok: true, message: 'No chat history to review yet.', lessonsAdded: 0 });
    }

    const chatSummary = allChats.slice(-30).map(c => {
      const msgs = (c.chat||[]).map(m => (m.role||'') + ': ' + String(m.content||'').slice(0,100)).join(' | ');
      return c.address + ' (' + c.verdict + ' ' + c.score + '/10): ' + msgs;
    }).join('\n');

    const correctionSummary = corrections.slice(-20).map(c =>
      (c.date||'') + ' — ' + (c.field||'') + ' corrected to ' + c.value + ' on ' + c.address + ': "' + (c.message||'').slice(0,100) + '"'
    ).join('\n');

    const wholesalerCtx = Object.entries(urbanBrain.wholesalerStats || {}).slice(0,10)
      .map(([email, ws]) => `${ws.name||email}: ${ws.deals} deals, avg ARV inflation ${ws.avgARVInflation}%`)
      .join('\n');

    const model = 'claude-haiku-4-5-20251001'; // Always Haiku for review — cheap, sufficient

    const r = await getAnthropic().messages.create({
      model, max_tokens: 1000,
      messages: [{
        role: 'user',
        content: 'You are Urban, real estate underwriter for Coralstone Capital Group (Tampa Bay fix-and-flip).\n' +
        'Review conversation and correction history and extract SPECIFIC lessons to improve future underwriting.\n\n' +
        'CURRENT LESSONS (' + existingLessons.length + '):\n' +
        existingLessons.slice(-10).join('\n') + '\n\n' +
        'RECENT DEAL CONVERSATIONS:\n' + (chatSummary || 'none') + '\n\n' +
        'CORRECTIONS BY CALEB/GRANT:\n' + (correctionSummary || 'none') + '\n\n' +
        'WHOLESALER STATS:\n' + (wholesalerCtx || 'none') + '\n\n' +
        'Extract 3-8 NEW specific lessons not already captured. Focus on:\n' +
        '- Patterns in what Caleb/Grant accept vs reject\n' +
        '- ARV inflation patterns by wholesaler\n' +
        '- Market conditions for specific zip codes\n' +
        '- Repair estimate accuracy\n' +
        '- Deal types they most want\n\n' +
        'Return ONLY a JSON array of lesson strings, no markdown:\n' +
        '["lesson 1", "lesson 2", ...]'
      }]
    });

    const raw = r.content[0].text.trim();
    const s = raw.indexOf('['), e = raw.lastIndexOf(']');
    let newLessons = [];
    if (s !== -1 && e > s) {
      try { newLessons = JSON.parse(raw.slice(s, e+1)); } catch {}
    }

    // Add new lessons, avoid duplicates
    const existing = new Set(existingLessons.map(l => l.slice(0,50)));
    const added = [];
    for (const lesson of newLessons) {
      if (!existing.has(lesson.slice(0,50))) {
        const stamp = `[${new Date().toLocaleDateString()} AUTO-REVIEW] ${lesson}`;
        urbanBrain.lessons.push(stamp);
        added.push(stamp);
      }
    }
    if (urbanBrain.lessons.length > 150) urbanBrain.lessons = urbanBrain.lessons.slice(-150);
    urbanBrain.lastReviewAt = new Date().toISOString();
    await saveBrain();

    console.log(`📚 Chat review complete: ${added.length} new lessons added (${model})`);
    res.json({ ok: true, lessonsAdded: added.length, lessons: added, model });
  } catch(e) {
    console.error('Review chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Agent feedback from Adam — Urban learns from outcomes


app.post('/api/seed-sold-comps', async (req, res) => {
  const token = req.headers['x-urban-token'];
  if (token !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { comps } = req.body;
  if (!Array.isArray(comps)) return res.status(400).json({ error: 'comps array required' });
  try {
    const saved = await DB.saveSoldComps(comps);
    console.log('🏠 Seeded', saved, 'sold comps');
    res.json({ ok: true, saved, received: comps.length });
  } catch(e) {
    console.error('seed-sold-comps error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sold-comps/:zip', auth, async (req, res) => {
  try {
    const comps = await DB.getSoldComps(req.params.zip, { limit: 25 });
    const stats = await DB.getSoldCompStats(req.params.zip);
    res.json({ zip: req.params.zip, count: comps.length, stats, comps });
  } catch(e) { res.status(500).json({ error: e.message }); }
});





// Live HCPA parcel lookup: given address, return NBHC code + folio for ARV lookup
app.get('/api/hcpa/parcel', auth, async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });
  try {
    // HCPA has a JSON search API
    const encoded = encodeURIComponent(address.toUpperCase());
    const url = `https://gis.hcpafl.org/propertysearch/api/search?query=${encoded}&type=address`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    const data = await r.json();
    const results = data?.results || data?.parcels || data || [];
    const first = Array.isArray(results) ? results[0] : null;
    if (first) {
      res.json({ ok: true, folio: first.folio || first.FOLIO, nbhc: first.nbhc || first.NBHC, address: first.address || first.ADDRESS, data: first });
    } else {
      res.json({ ok: false, results, raw: data });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Returns zip-level sold comps stats from the real sold_comps table
app.get('/api/market/stats/:zip', auth, async (req, res) => {
  try {
    const stats = await DB.getSoldCompStats(req.params.zip);
    const mkt = await DB.getMarketData(req.params.zip);
    res.json({ zip: req.params.zip, sold_comps_stats: stats, market_data: mkt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Monthly data refresh endpoint — re-downloads county PA data and reseeds
// Call this endpoint to kick off a manual refresh
app.post('/api/refresh-data', async (req, res) => {
  const token = req.headers['x-urban-token'];
  if (token !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  
  // Document what needs to happen for monthly refresh
  const refreshInstructions = {
    step1: 'Go to downloads.hcpafl.org and re-download allsales_[date].zip (67MB)',
    step2: 'Parse with browser JS: filter DOR_CODE 00xx/01xx, QU=Q, S_AMT>75000, S_DATE>=2023',
    step3: 'POST 64K+ records to /api/seed-nbhc with updated P75 stats',
    step4: 'Download Pinellas: pcpao.gov → RP_OS_SALES CSV → parse → POST to /api/seed-sold-comps',
    step5: 'Download Pasco: pascopa.com → sales data → POST to /api/seed-sold-comps',
    step6: 'Download Polk: polkpa.org → sales data → POST to /api/seed-sold-comps',
    hcpa_url: 'https://downloads.hcpafl.org/',
    pcpao_endpoint: 'https://www.pcpao.gov/dal/databasefile/downloadDatabaseFile',
    pcpao_sales_table: 'RP_OS_SALES',
    pcpao_parcel_table: 'RP_OS_PARCEL_VALUE',
    pcpao_site_table: 'RP_OS_SITE_ADDRESS',
  };
  
  console.log('📅 Monthly refresh requested');
  res.json({ ok: true, message: 'Monthly refresh guide', instructions: refreshInstructions });
});

app.post('/api/seed-nbhc', async (req, res) => {
  const token = req.headers['x-urban-token'];
  if (token !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records array required' });
  try {
    const saved = await DB.saveNbhcStats(records);
    console.log('📊 Seeded', saved, 'NBHC neighborhood stats');
    res.json({ ok: true, saved, received: records.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/agent-feedback', async (req, res) => {
  const token = req.headers['x-urban-token'];
  if (token !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { from, type, message, dealAddress } = req.body;
  console.log(`💬 [${from}→urban] ${message}`);
  // Log to Urban's brain as a lesson
  urbanBrain.lessons = urbanBrain.lessons || [];
  urbanBrain.lessons.push(`[Adam feedback] ${message}`);
  if (urbanBrain.lessons.length > 50) urbanBrain.lessons = urbanBrain.lessons.slice(-50);
  await saveBrain().catch(() => {});
  res.json({ ok: true });
});

// Adam queries Urban directly

// Manually regenerate verdict/recommendation with current numbers (no new comps)
app.post('/api/regen-verdict/:uid', auth, async (req, res) => {
  const uid = decodeURIComponent(req.params.uid);
  const uw  = underwrites[uid];
  if (!uw) return res.status(404).json({ error: 'Not found' });
  try {
    const updated = await regenerateVerdict(uw);
    underwrites[uid] = updated;
    // (JSON file removed — Postgres only)
    DB.saveUnderwrite(uid, updated);
    persistVerdictIndexToSheet().catch(() => {});
    console.log('🔄 Manual regen: ' + (uw.deal?.address||uid) + ' → ' + updated.verdict + ' (' + updated.score + '/10)');
    res.json({ ok: true, verdict: updated.verdict, score: updated.score, verdictReason: updated.verdictReason, recommendation: updated.recommendation });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Keep deal alive — reset 7-day stale timer
app.post('/api/keep-deal/:uid', auth, (req, res) => {
  const uid  = decodeURIComponent(req.params.uid);
  const days = parseInt((req.body && req.body.days) || 7);
  if (!urbanBrain.keptDeals) urbanBrain.keptDeals = {};
  urbanBrain.keptDeals['kept:' + uid] = new Date(Date.now() + days * 86400000).toISOString();
  saveBrain().catch(() => {});
  console.log('📌 Kept: ' + uid + ' for ' + days + ' days');
  res.json({ ok: true });
});

// Feedback from Adam — Caleb/Grant's actual decisions feed back as lessons
// Called when someone pursues or passes a deal on Telegram — NO AI call, template-based
app.post('/api/feedback', auth, (req, res) => {
  const { address, city, verdict, score, action, who, reason, askingPrice, profit } = req.body;
  if (!address || !action) return res.status(400).json({ error: 'address and action required' });

  const n = v => v ? '$' + parseInt(v).toLocaleString() : '?';
  const dateStr = new Date().toLocaleDateString();

  let lesson = '';
  if (action === 'pursue') {
    lesson = '[' + dateStr + '] PURSUED by ' + (who||'team') + ': ' + address + ', ' + (city||'?') +
      ' | Urban said ' + (verdict||'?') + ' (' + (score||'?') + '/10)' +
      ' | Ask ' + n(askingPrice) + ' | Projected profit ' + n(profit) +
      (reason ? ' | Note: ' + reason : '') +
      ' → CONFIRMED WORTH PURSUING';
  } else if (action === 'pass') {
    lesson = '[' + dateStr + '] PASSED by ' + (who||'team') + ': ' + address + ', ' + (city||'?') +
      ' | Urban said ' + (verdict||'?') + ' (' + (score||'?') + '/10)' +
      ' | Ask ' + n(askingPrice) +
      (reason ? ' | Reason: ' + reason : ' | Team passed — review ARV/scope assumptions') +
      ' → NOT PURSUED';
  } else if (action === 'counter') {
    const counterPrice = req.body.counterPrice;
    lesson = '[' + dateStr + '] COUNTER by ' + (who||'team') + ': ' + address + ', ' + (city||'?') +
      ' | Urban MAO was ' + n(req.body.mao) + ' | Counter at ' + n(counterPrice) +
      ' → ACTIVELY NEGOTIATING';
  }

  if (lesson) {
    urbanBrain.lessons = urbanBrain.lessons || [];
    urbanBrain.lessons.push(lesson);
    if (urbanBrain.lessons.length > 150) urbanBrain.lessons.shift();
    // High-priority: save immediately
    saveBrain().catch(() => {});
    console.log('📚 Feedback lesson added:', lesson.slice(0, 80));
  }

  res.json({ ok: true, lesson });
});

app.post('/api/agent-query', auth, async (req, res) => {
  if (req.headers['x-urban-token'] !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { question, deal, dealAddress, askedBy } = req.body;
  console.log('Agent query from ' + (askedBy || 'adam') + ': ' + question);

  try {
    const n = v => v ? '$' + parseInt(v).toLocaleString() : 'unknown';
    const brain = getBrainContext('', '');
    const recentLessons = (urbanBrain.lessons || []).slice(-15).join('\n');
    const mktSummary = Object.entries(urbanBrain.marketNotes || {})
      .filter(([,mn]) => mn.deals >= 2)
      .map(([county, mn]) => county + ': ' + mn.deals + ' deals, avg ARV $' + (mn.avgARV||0).toLocaleString())
      .join(' | ') || 'building data';

    const dealCtx = deal ? [
      'DEAL: ' + (deal.address||'?') + ', ' + (deal.city||'?') + ' FL',
      'Ask: ' + n(deal.askingPrice) + ' | ARV: ' + n(deal.arv?.urbanARV) + ' | Rehab: ' + n(deal.rehab?.urbanEstimate),
      'Verdict: ' + (deal.verdict||'?') + ' (' + (deal.score||'?') + '/10)',
      'Profit @ ask: ' + n(deal.financials?.netProfitAtAsking) + ' | MAO: ' + n(deal.financials?.mao),
    ].join('\n') : '';

    const systemPrompt = [
      'You are Urban — the most sophisticated real estate underwriter in Tampa Bay. You work for Coralstone Capital Group, a fix-and-flip investment company. You report to Caleb Blair and Grant Patterson.',
      '',
      'YOUR KNOWLEDGE BASE:',
      '',
      'INVESTMENT FUNDAMENTALS:',
      '- MAO (Maximum Allowable Offer) = ARV x 70% - Estimated Repairs. This is the ceiling. Never pay above MAO without a compelling reason.',
      '- Minimum profit target: $40,000 net for deals over $200K asking. For deals under $200K asking: $20,000 net minimum. For land deals: $15,000 net minimum. Property SIZE is never a disqualifier — CCG buys studios to mansions.',
      '- Hard money: 9.5% interest-only, typically 90% LTV on purchase. 2 point origination fee. Budget accordingly.',
      '- Selling costs: 6% agent commissions + 1.5% closing costs = 7.5% of sale price',
      '- Holding costs: ~$350-500/month (insurance, utilities, taxes prorated)',
      '- Typical hold time: 4 months light cosmetic, 5-6 months full rehab, 7-9 months heavy rehab',
      '- ROI = Net Profit / (Purchase Price + Rehab Cost) — target 12%+ annualized',
      '',
      'TAMPA BAY MARKET EXPERTISE (2025):',
      '- FL insurance crisis: roofs 15yr+ cause insurance problems, 20yr+ often uninsurable. Budget $3-6K/yr insurance.',
      '- Hillsborough avg $380K, Pasco avg $290K, Pinellas avg $420K, Hernando avg $220K, Polk avg $260K',
      '- A-tier (South Tampa, Downtown St Pete): $300-450/sqft, 20-25 DOM, 98% list-to-sale',
      '- B-tier (Land O Lakes, Brandon, Seminole Heights, Clearwater): $185-260/sqft, 30-40 DOM, 96% list-to-sale',
      '- C-tier (Spring Hill, Zephyrhills, Plant City, Holiday): $140-190/sqft, 50-65 DOM, 93-95% list-to-sale',
      '- Best fix-flip markets: B-tier Pasco and Hillsborough. Consistent demand, reliable exits, less competition than Pinellas.',
      '- New construction pressure in Wesley Chapel, Riverview, Parrish — comp carefully, buyers choose new over old at same price.',
      '- Flood Zone AE: kills buyer pool, insurance $3-8K/yr. Flag immediately. AE = hard pass unless deep value.',
      '- Seasonal: peak demand Feb-May, slow Jun-Sep (heat + hurricane), Q4 recovery as snowbirds return.',
      '',
      'REHAB COST DATABASE (Tampa Bay 2025 contractor rates):',
      '- Roof shingle: $8-13K (1500sqft), $10-16K (2000sqft), $13-20K (2500sqft)',
      '- HVAC full system: $6-10K | Condenser only: $3-5K',
      '- Kitchen full gut (mid-grade): $15-30K | Cosmetic: $5-12K',
      '- Master bath full: $8-18K | Secondary bath: $5-10K each',
      '- LVP flooring: $3-6/sqft installed | Tile: $6-12/sqft | Carpet: $2-4/sqft',
      '- Interior paint (1500sqft): $3-6K | Exterior: $3-8K',
      '- Panel upgrade 200A: $2.5-5K | Full rewire: $8-20K',
      '- Full repipe: $4-8K | Water heater: $1.2-2.5K',
      '- Impact windows full home: $10-25K | Per window: $400-800',
      '- Foundation work: $5-30K (highly variable — always get 3 quotes)',
      '- Permits and inspections: always budget $1.5-4K',
      '',
      'DEAL STRUCTURES YOU KNOW:',
      '- Wholesale/assignment: Wholesaler assigns equitable interest. Quick close, cash. Watch for thin assignment fees inflating price.',
      '- Novation: Replace wholesaler in contract. Clean title path. Coralstone uses this.',
      '- Subject-to: Take title subject to existing mortgage. Creative financing play.',
      '- Double close: Wholesaler closes A-B and B-C simultaneously. Normal.',
      '- JV: Joint venture with wholesaler. Avoid unless clear value add.',
      '',
      'RED FLAGS — ALWAYS CALL OUT:',
      '- ARV inflation: Most wholesalers inflate ARV 10-20%. Independently verify with real comps.',
      '- Polybutylene pipe (gray): Full repipe required, $5-10K. Pre-1995 homes.',
      '- Galvanized plumbing: Repipe, $5-10K.',
      '- Aluminum wiring: Insurance nightmare, pig-tail every outlet or rewire.',
      '- Chinese drywall (2006-2008 construction): Walk away.',
      '- Roof 20yr+: Uninsurable in FL. Must replace before buyer can get insurance.',
      '- Active code violations or open permits: Can prevent close. Research county records.',
      '- Sinkhole: Walk away unless fully remediated with engineering docs.',
      '- HOA that prohibits STR or has rental restrictions: Kills investor exit.',
      '- Title issues (IRS liens, probate, clouds): Title search is non-negotiable.',
      '- Flood Zone AE/VE: Immediate flag.',
      '- Tenant-occupied/occupied without lease: Eviction risk — 2-4 months delay, $2-8K.',
      '- New construction competition (same zip): Buyers choose new over old. Flag if active.',
      '- Unknown year built: Insurance and systems verification impossible.',
      '- Open/expired permits: Can prevent close — verify county records.',
      '- Foundation unknown: Budget $5-30K. Always flag.',
      '- HOA investor/rental restrictions: Verify before offer — kills flip exit.',
      '',
      'RISK FLAG OUTPUT RULES:',
      '- Always generate 3-7 flags. Never 0.',
      '- USE READABLE NAMES: "Flood Zone Unverified" not "FLOOD_ZONE_AE"',
      '- HIGH = deal-killer or $10K+ surprise, MEDIUM = needs verification, LOW = minor note',
      '- Detail: what is it, what does it cost if it hits, what action to take',
      '- Include at least one positive flag labeled LOW when deal is clean (e.g. "Major Systems Confirmed Complete")',
      '',
      'WHOLESALER INTELLIGENCE:',
      'Brain context: ' + brain.wholesalerStats,
      'Market data: ' + mktSummary,
      '',
      'RECENT LESSONS FROM PAST DEALS:',
      recentLessons || 'Building data.',
      '',
      'RESPONSE STYLE:',
      '- You are talking to Caleb or Grant, experienced investors. Speak plainly like a sharp colleague.',
      '- Give specific numbers, not ranges when you can.',
      '- Lead with the answer, then explain.',
      '- If asked about a deal, anchor on the actual numbers.',
      '- No hedging, no disclaimers. Direct.',
      '- Plain text. No bullet points or markdown unless it genuinely helps.',
      dealCtx ? ('\nCURRENT DEAL CONTEXT:\n' + dealCtx) : '',
    ].filter(Boolean).join('\n');

    const r = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001', // Haiku sufficient for verdict regen
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }]
    });

    const answer = r.content[0].text.trim();
    console.log('Agent answer: ' + answer.slice(0, 80));
    res.json({ answer, ok: true });
  } catch(e) {
    console.error('Agent query error:', e.message);
    res.status(500).json({ error: e.message });
  }
});


app.get('/health', (req, res) => res.json({ status: 'online', ts: new Date().toISOString() }));

app.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('text/html')) return next();
  res.json({ status: 'Urban the Underwriter — online' });
});

// Get deals with underwrite status attached
// ── WHOLESALER VERIFICATION (manual by Caleb/Grant) ──────────────────────────
app.post('/api/verify-wholesaler', auth, async (req, res) => {
  const { email, verified, notes } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!urbanBrain.wholesalerStats[email]) {
    return res.status(404).json({ error: 'Wholesaler not found in brain' });
  }
  const ws = urbanBrain.wholesalerStats[email];
  ws.verifiedInflator = !!verified;
  ws.inflationWarning = !!verified; // if verified, warning stays on permanently
  if (notes) ws.verificationNotes = notes;
  ws.verifiedBy = 'Caleb/Grant';
  ws.verifiedAt = new Date().toISOString();
  urbanBrain.wholesalerNotes[email] = `${ws.name} (${ws.company}) | ${ws.deals} deals | avg ARV inflation: ${ws.avgARVInflation}%${ws.verifiedInflator ? ' | ⚠️ VERIFIED INFLATOR' : ''} | verdicts: ${JSON.stringify(ws.verdicts)}`;
  await saveBrain();
  console.log(`✅ Wholesaler ${email} ${verified ? 'VERIFIED as inflator' : 'cleared'} by Caleb/Grant`);
  res.json({ success: true, email, verifiedInflator: ws.verifiedInflator, notes: ws.verificationNotes });
});

// ── BATCH AUTO-UNDERWRITE (parallel, 3 concurrent) ───────────────────────────
app.post('/api/auto-underwrite-batch', auth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const deals = await getDealsFromSheet();
    const pending = deals.filter(d => {
      if (!d.address || d.address === 'XXXX') return false;
      // Check in-memory cache (fast)
      const uid1 = d.uid;
      const uid2 = `${d.address}-${d.dateReceived}`;
      const inCache = (uid1 && underwrites[uid1]?.verdict && underwrites[uid1].verdict !== 'PENDING')
                   || (uid2 && underwrites[uid2]?.verdict && underwrites[uid2].verdict !== 'PENDING');
      if (inCache) return false;
      // Also check sheet column — survives redeploys (rejects deals already marked)
      const inSheet = d.underwriteStatus && !['PENDING',''].includes(d.underwriteStatus);
      return !inSheet;
    });

    send({ total: pending.length, status: `Found ${pending.length} pending deals` });
    if (!pending.length) { res.end(); return; }

    const CONCURRENCY = 1;  // Serialize — prevents rate limit bursts
    let idx = 0;
    let completed = 0;
    const results = [];

    async function processNext() {
      while (idx < pending.length) {
        const deal = pending[idx++];
        if (!deal.address || deal.address === 'XXXX') {
          send({ skipped: true, address: deal.address || 'XXXX', reason: 'No address' });
          completed++;
          continue;
        }
        try {
          send({ status: `Fetching comps for ${deal.address}...`, address: deal.address });
          const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip, deal);
          const uw = await underwriteDeal(deal, comps, false, false);
          underwrites[uw.uid] = uw; // uid is set inside underwriteDeal
          // (JSON file removed — Postgres only)
          await logUnderwriteToSheet(uw);
          await saveBrain();
          results.push({ address: deal.address, verdict: uw.verdict, score: uw.score });
          send({ done: true, address: deal.address, verdict: uw.verdict, score: uw.score });
          completed++;
          await new Promise(r => setTimeout(r, 4000)); // 4s between underwrites — stays under Haiku TPM limit
          console.log(`⚡ Batch: ${deal.address} → ${uw.verdict} (${completed}/${pending.length})`);
        } catch(e) {
          const rl = e.status === 429 || (e.message||'').includes('rate_limit') || (e.message||'').includes('429');
          send({ error: e.message, address: deal.address, rateLimited: rl });
          completed++;
          if (rl) await new Promise(r => setTimeout(r, 5000)); // brief pause after 429
        }
      }
    }

    // Run CONCURRENCY workers simultaneously
    await Promise.all(Array.from({ length: CONCURRENCY }, processNext));
    send({ finished: true, total: completed, results });
  } catch(e) {
    send({ error: e.message });
  }
  res.end();
});

// ── SHEET AUDIT — shows exactly what's in Derek's sheet vs what Urban imports ──
// Update address for a deal that Derek logged as XXXX
app.post('/api/update-address', auth, async (req, res) => {
  try {
    const { oldUid, newAddress, author } = req.body || {};
    if (!oldUid || !newAddress) return res.status(400).json({ error: 'oldUid and newAddress required' });
    // Find the deal in memory cache
    let deal = sheetCache.find(d => (d.uid||'').toLowerCase().trim() === (oldUid||'').toLowerCase().trim())
             || sheetCache.find(d => d.needsAddress && (d.city||'').toLowerCase().trim() === (oldUid||'').toLowerCase().trim());
    if (!deal) return res.status(404).json({ error: 'Deal not found in sheet cache. Try pulling from Derek\'s sheet first.' });
    // Update in memory
    deal.address = newAddress.trim();
    deal.uid = newAddress.trim();
    deal.needsAddress = false;
    // Log to brain
    urbanBrain.lessons = urbanBrain.lessons || [];
    urbanBrain.lessons.push({ type: 'address_correction', text: `Address filled in for deal previously logged as XXXX: "${newAddress.trim()}" in ${deal.city||'unknown city'}. Logged by ${author||'user'}.`, ts: new Date().toISOString() });
    saveBrain().catch(()=>{});
    // Kick off underwriting for the newly-addressed deal
    const uid = newAddress.trim();
    underwrites[uid] = underwrites[uid] || {};
    res.json({ ok: true, deal, message: `Address set to "${newAddress.trim()}". Click Underwrite to analyze.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sheet-audit', auth, async (req, res) => {
  try {
    // Pull raw rows directly from the sheet, same call as getDealsFromSheet but unfiltered
    const _s = getSheets();
    const response = await _s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Active Deals!A1:CV2000'
    });
    const rows = response.data.values || [];
    const headers = rows[0] || [];
    const get = (row, name) => {
      const idx = headers.findIndex(h => (h||'').toLowerCase().trim() === name.toLowerCase().trim());
      return idx >= 0 ? (row[idx] || '').toString().trim() : '';
    };
    const dataRows = rows.slice(1).filter(row => row.some(cell => (cell||'').toString().trim()));
    const results = { totalSheetRows: dataRows.length, imported: [], skippedBlankAddr: [], skippedXXXX: [], skippedOther: [] };
    for (const row of dataRows) {
      const addr = get(row, 'Property Address') || get(row, 'Address');
      const city = get(row, 'City');
      const dateReceived = get(row, 'Date Received') || get(row, 'Date');
      const asking = get(row, 'Asking Price') || get(row, 'Price');
      const emailSubj = get(row, 'Email Subject') || get(row, 'Subject');
      const entry = { addr: addr || '(blank)', city, dateReceived, asking, emailSubj: emailSubj ? emailSubj.slice(0,60) : '' };
      if (!addr || addr.trim() === '') { results.skippedBlankAddr.push(entry); }
      else if (addr.trim().toUpperCase().startsWith('XXXX') || addr.trim().toUpperCase() === 'XXXX') { results.skippedXXXX.push(entry); }
      else { results.imported.push({ ...entry, addr }); }
    }
    results.importedCount = results.imported.length;
    results.skippedCount = results.skippedBlankAddr.length + results.skippedXXXX.length + results.skippedOther.length;
    res.json(results);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ════════════════════════════════════════════════════════════════════════════════
// ADAM — Autonomous Acquisition Agent
// Monitors deal inbox, parses emails, underwrites + loads into Urban automatically
// Configure via Railway env vars: ADAM_IMAP_HOST, ADAM_IMAP_USER, ADAM_IMAP_PASSapp.post('/api/adam/process', auth, async (req, res) => {
  // Manually feed Adam an email body (e.g. copied from phone/text)
  const { subject = 'Manual deal', body, from = req.author } = req.body || {};
  if (!body || body.trim().length < 10) return res.status(400).json({ error: 'Paste email body' });
  adamLog(`Manual process by ${req.author}: ${subject.slice(0,60)}`);
  const parsed = await adamParseEmail(subject, body, from);
  if (!parsed) return res.status(400).json({ error: 'No deal found in that text', parsed });
  const result = await adamAddDeal(parsed, subject);
  res.json({ ...result, parsed });
});


// ── ACCESS LOG (admin only) ──────────────────────────────────────────────────
app.get('/api/access-log', auth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const grantIPs = [...new Set(ACCESS_LOG.filter(e=>e.user==='grant').map(e=>e.ip))];
  res.json({ log: ACCESS_LOG.slice(0,300), summary: { caleb: ACCESS_LOG.filter(e=>e.user==='caleb').length, grant: ACCESS_LOG.filter(e=>e.user==='grant').length, grantUniqueIPs: grantIPs }, securityAlerts: urbanBrain.securityAlerts||[] });
});

// ── ADD A DEAL (paste text → Claude parses → underwrite) ─────────────────────
app.post('/api/add-deal', auth, async (req, res) => {
  try {
    const { text, addedBy } = req.body || {};
    if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Paste deal text first' });
    const parseRes = await getAnthropic().messages.create({ model: 'claude-sonnet-4-6', max_tokens: 500,
      system: 'Extract real estate deal info from the text. Return ONLY valid JSON (no markdown, no explanation): { "address":"", "city":"", "state":"FL", "zip":"", "askingPrice":0, "beds":0, "baths":0, "sqft":0, "yearBuilt":0, "construction":"", "wholesaler":"", "wholesalerPhone":"", "arv":0, "rehab":0, "notes":"" }. Use 0 or empty string for missing fields.',
      messages: [{ role: 'user', content: text.slice(0,3000) }],
    });
    let parsed;
    try { parsed = JSON.parse(parseRes.content[0].text.replace(/```json?|```/g,'').trim()); }
    catch(e) { return res.status(400).json({ error: 'Could not parse — paste more detail including the full street address' }); }
    if (!parsed.address || !parsed.city) return res.status(400).json({ error: 'No address found in that text — include the full street address' });
    const uid = (parsed.address + ', ' + parsed.city).trim();
    if (!sheetCache) global.sheetCache = [];
    const existing = sheetCache.find(d => (d.uid||'').toLowerCase()===uid.toLowerCase() || (d.address||'').toLowerCase()===(parsed.address||'').toLowerCase());
    if (existing) return res.status(409).json({ error: 'Already in Urban: ' + (existing.uid||existing.address), existingUid: existing.uid });
    const county = inferCounty(parsed.city) || '';
    const deal = { uid, address: parsed.address, city: parsed.city, state: parsed.state||'FL', zip: parsed.zip||'', county, beds: parsed.beds||0, baths: parsed.baths||0, sqft: parsed.sqft||0, yearBuilt: parsed.yearBuilt||0, construction: parsed.construction||'', askingPrice: parsed.askingPrice||0, wholesaler: parsed.wholesaler||req.author, wholesalerPhone: parsed.wholesalerPhone||'', source: 'manual-upload', addedBy: addedBy||req.author, isManual: true, dateReceived: new Date().toISOString(), needsSheet: true };
    sheetCache.push(deal);
    underwrites[uid] = underwrites[uid] || {};
    setTimeout(() => runUnderwrite(uid, false).catch(()=>{}), 300);
    res.json({ ok: true, uid, deal });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/deals', auth, async (req, res) => {
  try {
    const deals = await getDealsFromSheet();
    // Filter to CCG target counties only
    // Exclude deals without a real address — Adam will chase those via email
    const targetDeals = deals.filter(d => isTargetCounty(d.county, d.city) && !d.needsAddress);

    // Cache deals to Postgres (non-blocking) — enables fast reload on next boot
    if (targetDeals.length > 0) {
      Promise.allSettled(targetDeals.map(d => {
        const uid = d.uid || (d.address + '-' + d.dateReceived);
        return DB.saveDeal(uid, d);
      })).catch(() => {});
    }

    // Resolve tracking photo URLs in background (non-blocking)
    // Only attempt fresh deals not yet in cache
    Promise.allSettled(
      targetDeals
        .filter(d => d.photoLinks && isTrackingUrl(d.photoLinks))
        .slice(0, 10) // limit concurrent resolves
        .map(d => {
          const uid = d.uid || (d.address + '-' + d.dateReceived);
          const cacheKey = uid + ':' + d.photoLinks.slice(0, 80);
          if (!_photoUrlCache[cacheKey]) {
            return resolvePhotoUrl(d.photoLinks, uid).then(resolved => {
              if (resolved !== d.photoLinks) d.photoLinks = resolved;
            });
          }
        })
    ).catch(() => {});

    // Proactively geocode new/uncached deals in the background — runs every
    // time anyone loads the app, not just when the map screen is opened, so
    // a deal is already located on the map well before anyone goes looking
    // for it.
    proactivelyGeocodeDeals(targetDeals).catch(() => {});

    // One bulk lookup for everything we already know — not a per-deal query.
    const _geoKeys = targetDeals.map(d => `${d.address}|${d.city||''}|FL`.toLowerCase().trim());
    const _geoMap = await DB.getGeocodesForKeys(_geoKeys).catch(() => ({}));

    const out = targetDeals.map(d => {
      const uid = d.uid || `${d.address}-${d.dateReceived}`;
      const uw  = underwrites[uid];
      if (uw && uw.archived) return null; // logged as Lost to Buyer or Purchased — out of the active pipeline
      const _geo = _geoMap[`${d.address}|${d.city||''}|FL`.toLowerCase().trim()];

      // Stale detection — 7 days default, unless "kept"
      const received  = d.dateReceived ? new Date(d.dateReceived) : null;
      const daysOld   = received ? Math.floor((Date.now() - received) / 86400000) : null;
      const keptKey   = 'kept:' + uid;
      const keptUntil = urbanBrain.keptDeals?.[keptKey];
      const isKept    = keptUntil && new Date(keptUntil) > new Date();
      const isStale   = daysOld !== null && daysOld >= 7 && !isKept;

      // Brain enrichment — fill missing contact info from wholesaler profile
      const wsEmail = d.contact1Email || d.contact2Email || '';
      const wsProfile = wsEmail && urbanBrain.wholesalerStats[wsEmail];

      // Apply cached resolved photo URL if available
      const _photoCache = d.photoLinks ? _photoUrlCache[uid + ':' + d.photoLinks.slice(0, 80)] : null;
      if (_photoCache && _photoCache !== d.photoLinks) d.photoLinks = _photoCache;

      // Normalize K-format asking prices (e.g. "325" → 325000) before any logic runs
      const _rawAsk0 = parseFloat(d.askingPrice) || 0;
      if (_rawAsk0 > 0 && _rawAsk0 < 10000) {
        d._rawAskingPrice = d.askingPrice;
        d.askingPrice = String(_rawAsk0 * 1000);
      }

      // Price sanity check — flag suspicious asking prices
      let priceSanityFlag = null;
      const _ask = parseFloat(d.askingPrice);
      const _uwArv = uw?.arv?.urbanARV || 0;
      const _wsArv = parseFloat(d.wholesalerARV) || 0;
      if (_ask > 0 && _uwArv > 0 && _ask > _uwArv * 0.95) {
        priceSanityFlag = 'ASK_NEAR_OR_ABOVE_ARV'; // asking ≥ 95% of ARV — probably wrong
      } else if (_ask > 0 && _wsArv > 0 && Math.abs(_ask - _wsArv) / _wsArv > 0.30) {
        priceSanityFlag = 'ASK_VS_WS_ARV_MISMATCH'; // asking differs from WS ARV by >30%
      } else if (_ask > 700000 && d.sqft && parseInt(d.sqft) < 2000) {
        priceSanityFlag = 'PRICE_HIGH_FOR_SQFT'; // >$700K for small house
      } else if (_ask > 0 && _ask < 30000) {
        priceSanityFlag = 'PRICE_TOO_LOW'; // likely data entry error
      }

      return {
        ...d,
        contact1Name:    d.contact1Name    || wsProfile?.name    || '',
        contact1Email:   wsEmail,
        contact1Phone:   d.contact1Phone   || wsProfile?.phone   || '',
        wholesalerCompany: d.wholesalerCompany || wsProfile?.company || '',
        priceSanityFlag,
        // Wholesaler credibility from brain
        wholesalerCredibility: (() => {
          const wsKey = d.contact1Email || d.wholesalerCompany || '';
          const wsStat = wsKey && urbanBrain.wholesalerStats ? urbanBrain.wholesalerStats[wsKey] : null;
          if (!wsStat) return null;
          const deals = wsStat.totalDeals || 0;
          const arvInflation = wsStat.avgArvInflation ? parseFloat(wsStat.avgArvInflation).toFixed(1) : null;
          const rating = wsStat.rating || null;
          if (!deals) return null;
          return { deals, arvInflation, rating, lastDeal: wsStat.lastDeal };
        })(),
        // Underwrite data
        underwriteStatus: uw ? uw.verdict : (d.underwriteStatus || 'PENDING'),
        underwriteScore:  uw ? uw.score   : null,
        underwroteAt:     uw ? uw.underwroteAt : null,
        arv:              uw ? uw.arv      : null,
        financials:       uw ? uw.financials : null,
        // Stale
        isStale, daysOld, keptUntil: keptUntil || null,
        // Map coordinates — already-known location, no separate round-trip needed
        lat: (_geo && _geo.lat != null) ? _geo.lat : null,
        lng: (_geo && _geo.lng != null) ? _geo.lng : null,
        // Wholesaler brain stats
        wholesalerDeals:           wsProfile?.deals || 0,
        wholesalerAvgInflation:    wsProfile?.avgARVInflation || null,
        wholesalerInflationWarning: wsProfile?.inflationWarning || wsProfile?.verifiedInflator || false,
      };
    });
    res.json(out.filter(Boolean));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get single underwrite
app.get('/api/underwrite/:uid', auth, async (req, res) => {
  const uid = decodeURIComponent(req.params.uid);
  // 1. Try exact uid match
  let uw = underwrites[uid];
  // 2. Try address-based lookup across all stored underwrites
  if (!uw) {
    const addr = uid.toLowerCase().trim();
    uw = Object.values(underwrites).find(u =>
      (u.deal?.address || u.address || '').toLowerCase().trim() === addr
    );
  }
  // 3. Try Postgres directly (handles old row-number UIDs)
  if (!uw && DB.isAvailable()) {
    uw = await DB.getUnderwrite(uid).catch(() => null);
    if (uw) {
      // Cache in memory with address-based uid for future lookups
      const addrKey = uw.deal?.address || uid;
      underwrites[addrKey] = uw;
      // Persist under address uid for consistency
      if (addrKey !== uid) DB.saveUnderwrite(addrKey, uw).catch(() => {});
    }
  }
  if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });
  res.json(uw);
});

// Underwrite by uid (manual trigger from UI)
app.post('/api/underwrite/:uid', auth, async (req, res) => {
  // SSE headers first — always — so client gets a stream not HTML
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  const send = msg => { try { res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch {} };

  try {
    const { uid } = req.params;
    const { forceRefresh, deep, dealData } = req.body;

    // 1. Try sheet lookup first
    let deal = null;
    try {
      const deals = await getDealsFromSheet();
      deal = deals.find(d => (d.uid || `${d.address}-${d.dateReceived}`) === uid);
    } catch(sheetErr) {
      console.warn('Sheet lookup failed:', sheetErr.message);
    }

    // 2. Fall back to dealData from request body (sent by UI with full curDeal data)
    if (!deal && dealData && dealData.address) {
      deal = dealData;
    }

    if (!deal) {
      send({ error: 'Deal not found — sheet unavailable and no deal data in body' });
      res.end(); return;
    }

    // Normalize common field names (sheet uses camelCase, some clients use snake_case)
    deal.year_built = deal.year_built || deal.yearBuilt;
    deal.pool = deal.pool || deal.pool === 'Yes' || deal.pool === true;

    send({ status: deep ? '🔍 Deep analysis: running parallel comp searches...' : '⚡ Fetching comps...' });

    const comps = deep
      ? await fetchDeepComps(deal.address, deal.city, deal.state, deal.zip, deal.beds, deal.baths, deal.sqft, deal.propertyType)
      : await fetchComps(deal.address, deal.city, deal.state, deal.zip, deal);

    send({ status: `📊 Got ${comps.length} comps — running ARV analysis...` });

    const uw = await underwriteDeal(deal, comps, forceRefresh || false, deep || false);
    send({ done: true, underwrite: uw });
    res.end();
  } catch(e) {
    console.error(e);
    try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); } catch {}
  }
});

// Underwrite by address (Derek auto-trigger)
app.post('/api/underwrite-by-address/:address', auth, async (req, res) => {
  try {
    const address = decodeURIComponent(req.params.address).toLowerCase().trim();
    const { deep } = req.body;

    const deals = await getDealsFromSheet();
    const deal = deals.find(d => (d.address || '').toLowerCase().trim() === address ||
      (d.address || '').toLowerCase().includes(address.split(' ').slice(0,2).join(' ')));
    if (!deal) {
      console.log(`Auto-underwrite: no deal for "${address}"`);
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Skip if underwritten — check in-memory cache first, then the sheet's verdict column
    const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
    const existing = underwrites[uid] || underwrites[deal.uid] || underwrites[`${deal.address}-${deal.dateReceived}`];
    if (existing?.verdict && existing.verdict !== 'PENDING' && !deep) {
      console.log(`Already underwritten (cache): ${deal.address} → ${existing.verdict}`);
      return res.json({ skipped: true, verdict: existing.verdict });
    }
    // Also check the sheet's underwrite status column (survives redeployments)
    if (!deep && (deal.underwriteStatus && !['PENDING',''].includes(deal.underwriteStatus))) {
      console.log(`Already underwritten (sheet): ${deal.address} → ${deal.underwriteStatus}`);
      return res.json({ skipped: true, verdict: deal.underwriteStatus });
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const send = msg => res.write(`data: ${JSON.stringify(msg)}\n\n`);

    send({ status: deep ? '🔍 Deep analysis: running 3 parallel comp searches (Zillow + Redfin + county records)...' : `Fetching comps for ${deal.address}...` });
    const comps = deep
      ? await fetchDeepComps(deal.address, deal.city, deal.state, deal.zip, deal.beds, deal.baths, deal.sqft, deal.propertyType)
      : await fetchComps(deal.address, deal.city, deal.state, deal.zip, deal);
    send({ status: `Got ${comps.length} comps — ${deep ? 'running Sonnet deep analysis' : 'underwriting'}...` });

    const uw = await underwriteDeal(deal, comps, false, deep || false);
    send({ done: true, underwrite: uw });
    res.end();
  } catch(e) {
    console.error('Auto-underwrite error:', e.message);
    try { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); } catch {}
  }
});

// Chat
app.post('/api/chat/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { message, author } = req.body;
    // Look up underwrite — try uid directly, then all known uid formats, then by address
    const { address: hintAddress, city: hintCity } = req.body;
    let uw = underwrites[uid];

    if (!uw) {
      // Try every possible uid format in the cache
      uw = Object.values(underwrites).find(u =>
        u.uid === uid ||
        u.deal?.address === uid ||
        (u.deal?.address && hintAddress && u.deal.address.toLowerCase() === hintAddress.toLowerCase())
      );
    }

    if (!uw) {
      // Fall back to fetching the deal from the sheet by address or uid
      const deals = await getDealsFromSheet();
      const deal = deals.find(d => {
        if ((d.uid || `${d.address}-${d.dateReceived}`) === uid) return true;
        if (hintAddress && d.address?.toLowerCase() === hintAddress.toLowerCase()) return true;
        return false;
      });

      if (!deal) {
        console.log(`Chat: deal not found — uid="${uid}", address hint="${hintAddress}"`);
        return res.status(404).json({
          error: `Deal not found. Make sure the deal has been underwritten first. (Looking for: ${hintAddress || uid})`
        });
      }

      // Check if it's already underwritten under a different uid format
      const altUid = `${deal.address}-${deal.dateReceived}`;
      uw = underwrites[deal.uid] || underwrites[altUid];

      if (!uw) {
        // Not underwritten yet — underwrite it now (Haiku, cheap)
        console.log(`Chat: auto-underwriting ${deal.address} for chat context...`);
        const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip, deal);
        uw = await underwriteDeal(deal, comps, false, false);
      }
    }

    const chatHistory = uw.chatHistory || [];
    // Store clean message — author is tracked separately
    // Keep "AUTHOR: message" format for brain/correction detection but display strips it

    // Proactively extract numbers the user typed directly (e.g. "ARV is $260K")
    // and lock them in before the AI call — so corrections persist even if the
    // model's reply doesn't hit the structured trigger phrases.
    (() => {
      const pn = s => s ? parseInt(s.trim().replace(/[,$]/g,'').replace(/k$/i,'000')) : 0;
      let chg = false;
      const mArv = message.match(/(?:real|actual|true|confirmed)?\s*arv[:\s=]+\$?([\d,.k]+)/i)
               || message.match(/arv\s+(?:is|of|=)[:\s]+\$?([\d,.k]+)/i);
      if (mArv) { const v=pn(mArv[1]); if(v>50000){if(!uw.arv)uw.arv={};uw.arv.urbanARV=v;chg=true;} }
      const mRehab = message.match(/(?:real|actual)?\s*(?:rehab|repairs?)[:\s=]+\$?([\d,.k]+)/i)
                  || message.match(/(?:rehab|repairs?)\s+(?:is|are|=)[:\s]+\$?([\d,.k]+)/i);
      if (mRehab) { const v=pn(mRehab[1]); if(v>0){if(!uw.rehab)uw.rehab={};uw.rehab.urbanEstimate=v;chg=true;} }
      const mSqft = message.match(/([\d,]+)\s*(?:sq\s*ft|sqft)/i)
                 || message.match(/(?:sqft?|square\s*feet?)[:\s=]+([\d,]+)/i);
      if (mSqft) { const v=pn(mSqft[1]); if(v>200&&v<20000){if(!uw.deal)uw.deal={};uw.deal.sqft=String(v);chg=true;} }
      if (chg) { underwrites[uid]=uw; DB.saveUnderwrite(uid,uw).catch(()=>{}); console.log('[chat] proactive extract updated',uid); }
    })();
    chatHistory.push({ role: 'user', content: `${(author||'USER').toUpperCase()}: ${message}`, author: author||'user', timestamp: new Date().toISOString() });

    const ws = urbanBrain.wholesalerStats[uw.deal.contact1Email || ''];
    const wHistory = ws ? `${ws.deals} prior deals, avg ARV inflation ${ws.avgARVInflation}%` : 'first deal from this wholesaler';

    const activeTab = req.body.activeTab || 'overview';
    const tabContext = {
      overview: 'User is looking at the Overview — verdict, profit, ARV summary, recommendation.',
      arv: 'User is on the ARV tab — focused on comp analysis, ARV confidence, wholesaler vs Urban ARV.',
      rehab: 'User is on the Rehab tab — focused on repair line items, scope, confidence.',
      financials: 'User is on the Financials tab — focused on MAO, hard money, holding costs, net profit.',
      rental: 'User is on the Rental tab — focused on rental yield, cap rate, cash flow.',
      flags: 'User is on the Risk Flags tab — focused on specific risk items.',
      property: 'User is on the Property tab — looking at raw property details from the sheet.',
      chat: 'User is in the chat — may ask anything about this deal.'
    }[activeTab] || '';

    // Build rich system prompt with ALL deal data
    const n = v => v ? '$'+parseInt(v).toLocaleString() : '?';
    const li = uw.rehab?.lineItems || {};
    const liText = Object.entries(li).filter(([,v])=>v>0)
      .map(([k,v])=>k+': '+n(v)).join(' | ') || 'not broken out';
    const compsText2 = (uw.comps||[]).slice(0,5).map(c=>
      (c.address||'?')+' — '+(c.sqft||'?')+'sqft '+n(c.salePrice)+' ('+( c.saleDate||'?')+') '+(c.distanceMiles||'?')+'mi'
    ).join('\n') || 'none on file';
    const flags = (uw.riskFlags||[]).map(f=>'['+f.severity+'] '+f.flag+': '+f.detail).join('\n') || 'none';
    const lessons = urbanBrain.lessons.slice(-12).map(l=>'• '+l).join('\n') || 'none yet';

    const systemPrompt = [
      'You are Urban — Coralstone Capital Group real estate underwriter. You report to Caleb and Grant.',
      tabContext ? 'CONTEXT: '+tabContext : '',
      '',
      '━━ DEAL ━━',
      uw.deal.address+', '+uw.deal.city+' FL '+(uw.deal.zip||''),
      (uw.deal.beds||'?')+'bd/'+(uw.deal.baths||'?')+'ba | '+(uw.deal.sqft ? parseInt(uw.deal.sqft).toLocaleString()+' sqft' : '? sqft')+' | Built '+(uw.deal.yearBuilt||'?'),
      'Condition: '+(uw.deal.overall_condition||'?')+' | Occupancy: '+(uw.deal.occupancy||'?')+' | Flood: '+(uw.deal.floodZone||'none'),
      'Roof: '+(uw.deal.roofType||'?')+' '+(uw.deal.roofAge||'')+' | AC: '+(uw.deal.acYear||'?'),
      'Updated: '+(uw.deal.whatIsUpdated||'unknown'),
      'Needs work: '+(uw.deal.whatNeedsWork||'unknown'),
      'Red flags: '+(uw.deal.redFlags||'none'),
      '',
      '━━ NUMBERS ━━',
      'Asking: '+n(uw.deal.askingPrice)+' | Wholesaler ARV: '+n(uw.arv?.wholesalerARV)+' | Your ARV: '+n(uw.arv?.urbanARV)+' ('+(uw.arv?.arvConfidence||'?')+' confidence)',
      'ARV notes: '+(uw.arv?.arvNotes||'none'),
      'Rehab: '+n(uw.rehab?.urbanEstimate)+' | Range: '+n(uw.rehab?.urbanEstimateRange?.low)+'–'+n(uw.rehab?.urbanEstimateRange?.high)+' | Scope: '+(uw.rehab?.scopeLevel||'?'),
      'Rehab breakdown: '+liText,
      'MAO: '+n(uw.financials?.mao)+' | Gap vs asking: '+n(uw.financials?.overUnderMAO)+' ('+((uw.financials?.overUnderMAO||0)>0?'over MAO — deal is expensive':'under MAO — room to negotiate')+')',
      'Net profit @ asking: '+n(uw.financials?.netProfitAtAsking)+' | @ MAO: '+n(uw.financials?.netProfitAtMAO)+' | ROI: '+(uw.financials?.roi||'?')+'%',
      'Hold: '+(uw.financials?.holdMonths||'?')+' months | Hard money: '+n(uw.financials?.hardMoney?.monthlyPayment)+'/mo, '+n(uw.financials?.hardMoney?.totalInterest)+' total interest',
      'Meets profit min (10%): '+(uw.financials?.meetsMinimumProfit?'YES ✅':'NO ❌'),
      '',
      '━━ VERDICT ━━',
      uw.verdict+' ('+uw.score+'/10) — '+uw.verdictReason,
      'Recommendation: '+(uw.recommendation||''),
      'Offer strategy: '+(uw.offerStrategy||''),
      '',
      '━━ COMPS ━━',
      compsText2,
      '',
      '━━ RISK FLAGS ━━',
      flags,
      '',
      '━━ WHOLESALER ━━',
      (uw.deal.wholesalerCompany||uw.deal.contact1Name||'Unknown')+' | '+wHistory,
      'Credibility: '+(uw.wholesalerCredibility?.assessment||'UNKNOWN')+' | ARV accuracy: '+(uw.wholesalerCredibility?.arvAccuracy||'UNKNOWN'),
      '',
      '━━ BRAIN LESSONS ━━',
      lessons,
      '',
      '━━ RULES ━━',
      '- Talk like a sharp real estate colleague. Direct. No fluff.',
      '- Answer specifically about THIS deal using the actual numbers above.',
      '- When given new data (comp price, repair cost, roof age, new ARV): IMMEDIATELY recalculate MAO and net profit. Show every step.',
      '- What-ifs ("what if ARV was $X"): run full calc, state new verdict.',
      '- Always end a recalculation: "→ New verdict: [VERDICT] ([score]/10) | Net profit: [amount]"',
      '- Log brain lessons: "🧠 Noted: [insight]"',
      '- Be honest if your estimate was off. Own it and update.',
      '- MAO formula: ARV × 70% - Repairs | Min profit: 10% of ask (≥$20K floor) | Hard money 9.5% fix-and-flip | Construction loans 11.5% (CCG owns 50% land equity, lender funds 100% build + 50% land) | Counties: Pasco/Hillsborough/Polk/Pinellas/Hernando',
      '- CRITICAL: when the user states a correction or new data point as fact (not a hypothetical "what if") — a real ARV, a real repair cost, a confirmed comp, anything that should change the underwrite — you MUST end your reply with a block in EXACTLY this format, one line per field that actually changed, using these literal labels so the system can lock the correction in permanently:\nARV: $XXX,XXX\nRehab: $XX,XXX\nMAO: $XXX,XXX\nNet profit: $XX,XXX\nNew verdict: VERDICT (X)\n  Only include the lines for fields that actually changed. Never include this block for a hypothetical "what if" question — only for a stated correction the user wants applied for real.'
    ].filter(Boolean).join('\n')

    const historyForAPI = chatHistory.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }));

    // Chat uses Sonnet — this is human conversation Caleb and Grant actually
    // read and act on. A prior pass swapped this to Haiku to save money per
    // message, which is almost certainly why the chat started feeling dumb —
    // Haiku is real savings but a genuine step down in reasoning depth for
    // exactly the kind of multi-step deal analysis this needs. Reverting.
    const r2 = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: historyForAPI
    });

    const reply = r2.content[0].text;
    chatHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    uw.chatHistory = chatHistory;

    // ── PARSE REPLY FOR NEW NUMBERS + UPDATE UNDERWRITE OBJECT ───────────────
    // If Urban recalculated, extract the new figures and write them back
    // so the deal card UI reflects the corrected data immediately
    const replyLower = reply.toLowerCase();
    const hasCalc = replyLower.includes('new verdict') || replyLower.includes('recalculate') ||
                    replyLower.includes('new numbers') || replyLower.includes('updated verdict') ||
                    replyLower.includes('→ new') || replyLower.includes('mao:');

    if (hasCalc) {
      // Extract ARV — look for "ARV: $X" or "arv of $X"
      const arvMatch = reply.match(/(?:arv|after repair value)[:\s]+\$?([\d,]+)/i);
      if (arvMatch) {
        const newARV = parseInt(arvMatch[1].replace(/,/g, ''));
        if (newARV > 50000 && newARV < 5000000) {
          uw.arv = uw.arv || {};
          uw.arv.correctedARV = newARV;
          uw.arv.urbanARV = newARV;
          uw.arv.arvNotes = (uw.arv.arvNotes || '') + ` [Chat correction ${new Date().toLocaleDateString()}: ARV updated to $${newARV.toLocaleString()} by ${author||'team'}]`;
        }
      }

      // Extract Rehab
      const rehabMatch = reply.match(/(?:rehab|repairs)[:\s]+\$?([\d,]+)/i);
      if (rehabMatch) {
        const newRehab = parseInt(rehabMatch[1].replace(/,/g, ''));
        if (newRehab > 1000 && newRehab < 1000000) {
          uw.rehab = uw.rehab || {};
          uw.rehab.correctedEstimate = newRehab;
          uw.rehab.urbanEstimate = newRehab;
        }
      }

      // Extract MAO
      const maoMatch = reply.match(/mao[:\s]+\$?([\d,]+)/i) || reply.match(/\$([\d,]+)\s*mao/i);
      if (maoMatch) {
        const newMAO = parseInt(maoMatch[1].replace(/,/g, ''));
        if (newMAO > 10000 && newMAO < 3000000) {
          uw.financials = uw.financials || {};
          uw.financials.mao = newMAO;
        }
      }

      // Extract net profit
      const profitMatch = reply.match(/(?:net profit|profit)[:\s]+\$?([\d,]+)/i) ||
                          reply.match(/\$([\d,]+)\s*profit/i);
      if (profitMatch) {
        const newProfit = parseInt(profitMatch[1].replace(/,/g, ''));
        if (newProfit > -500000 && newProfit < 2000000) {
          uw.financials = uw.financials || {};
          uw.financials.netProfitAtAsking = newProfit;
        }
      }

      // Extract new verdict
      const verdictMatch = reply.match(/(?:new verdict|updated verdict|verdict)[:\s→]+([A-Z ]+?)\s*\((\d+)\/10\)/i);
      if (verdictMatch) {
        const newVerdict = verdictMatch[1].trim().toUpperCase();
        const newScore   = parseInt(verdictMatch[2]);
        const validVerdicts = ['HOT', 'BUY', 'REVIEW', 'PASS', 'HARD NO'];
        if (validVerdicts.includes(newVerdict) && newScore >= 1 && newScore <= 10) {
          uw.verdict        = newVerdict;
          uw.score          = newScore;
          uw.verdictReason  = `Chat correction by ${author||'team'} on ${new Date().toLocaleDateString()}`;
          uw.chatCorrected  = true;
          uw.chatCorrectedAt = new Date().toISOString();
          // Recalculate overUnderMAO if we have the data
          if (uw.financials?.mao && uw.deal?.askingPrice) {
            uw.financials.overUnderMAO = parseInt(uw.deal.askingPrice) - uw.financials.mao;
          }
          if (uw.arv?.urbanARV && uw.financials?.mao) {
            uw.financials.meetsMinimumProfit = (function(p,a){return a>=1000000?p>=100000:p>=Math.max(a*0.10,20000);})(uw.financials.netProfitAtAsking||0, parseFloat(uw.deal?.askingPrice)||0);
          }
          console.log('💬 Chat correction applied: ' + newVerdict + ' (' + newScore + '/10) on ' + uw.deal.address);
        }
      }

      // Also log to sheet status column so the deal list reflects the new verdict
      if (uw.chatCorrected) {
        logUnderwriteToSheet(uw.deal, uw).catch(() => {});
      }
    }

    // Save corrections to brain
    // ── CORRECTION DETECTION + IMMEDIATE CROSS-DEAL LEARNING ─────────────────
    // Detect if this message is a correction or new data point
    const msgLower = message.toLowerCase();
    const isCorrection = [
      'actually','wrong','not right','arv is','arv should','arv around','arv closer',
      'repairs are','repairs should','repairs closer','sold for','comp at','comp was',
      'i got a comp','correction','update','change','fix','incorrect','off on',
      'too high','too low','overestimated','underestimated','real number','real arv',
      'just sold','recently sold','it sold','closed at','under contract at'
    ].some(w => msgLower.includes(w));

    if (isCorrection) {
      // 1. Add to this deal's correction history
      const lesson = '[' + new Date().toLocaleDateString() + ' ' + (author||'team').toUpperCase() +
        ' on ' + uw.deal.address + '] ' + message.slice(0, 300);
      urbanBrain.lessons = urbanBrain.lessons || [];
      urbanBrain.lessons.push(lesson);
      if (urbanBrain.lessons.length > 150) urbanBrain.lessons.shift();

      // 2. Record in correction history
      urbanBrain.correctionHistory = urbanBrain.correctionHistory || [];
      urbanBrain.correctionHistory.push({
        date: new Date().toISOString(),
        deal: uw.deal.address,
        city: uw.deal.city,
        zip: uw.deal.zip,
        wholesaler: uw.deal.contact1Email || uw.deal.wholesalerCompany,
        correction: message,
        author: author || 'unknown',
        prevVerdict: uw.verdict,
        prevScore: uw.score
      });
      if (urbanBrain.correctionHistory.length > 200) urbanBrain.correctionHistory.shift();

      // 3. Update wholesaler stats if this correction implies ARV inflation
      const wsEmail = uw.deal.contact1Email;
      if (wsEmail && urbanBrain.wholesalerStats[wsEmail]) {
        urbanBrain.wholesalerStats[wsEmail].corrections =
          (urbanBrain.wholesalerStats[wsEmail].corrections || 0) + 1;
        urbanBrain.wholesalerNotes[wsEmail] = (urbanBrain.wholesalerNotes[wsEmail] || '') +
          ' | Correction ' + new Date().toLocaleDateString() + ': ' + message.slice(0,100);
      }

      urbanBrain.lastUpdated = new Date().toISOString();

      // 4. Re-trigger line item math if key values changed
      if (uw.arv?.urbanARV && uw.rehab?.urbanEstimate) {
        const arv     = uw.arv.urbanARV;
        const repairs = uw.rehab.urbanEstimate;
        const ask     = parseFloat(uw.deal?.askingPrice) || 0;
        const costs   = (uw.financials?.holdingCosts?.total||0) +
                        (uw.financials?.sellingCosts?.total||0) +
                        (uw.financials?.hardMoney?.totalInterest||0) +
                        (uw.financials?.hardMoney?.originationPoints||0);
        // Update MAO and profit with corrected numbers
        if (uw.financials) {
          uw.financials.mao              = Math.round(arv * 0.7 - repairs);
          uw.financials.overUnderMAO     = Math.round(ask - uw.financials.mao);
          uw.financials.netProfitAtAsking = Math.round(arv - ask - repairs - costs);
          uw.financials.netProfitAtMAO   = Math.round(arv - uw.financials.mao - repairs - costs);
          uw.financials.meetsMinimumProfit = (function(p,a){return a>=1000000?p>=100000:p>=Math.max(a*0.10,20000);})(uw.financials.netProfitAtAsking||0, parseFloat(uw.deal?.askingPrice)||0);
          if (arv > 0 && ask > 0) {
            uw.financials.roi = parseFloat(((uw.financials.netProfitAtAsking / (ask + repairs)) * 100).toFixed(1));
          }
        }
        // Recalculate negotiation ladder with corrected numbers
        const _ab2 = ask <= uw.financials.mao;
        const _pts2_raw = _ab2
          ? [uw.financials.mao, ask, Math.round(ask*0.95), Math.round(ask*0.90), Math.round(ask*0.85)]
          : [ask, uw.financials.mao, Math.round(uw.financials.mao*0.95), Math.round(uw.financials.mao*0.90), Math.round(uw.financials.mao*0.85)];
        const pts = [...new Set(_pts2_raw.filter(p=>p>0))].sort((a,b)=>b-a);
        uw.negotiationLadder = pts.map(price => ({
          price,
          label: price === uw.financials.mao
                 ? (_ab2 ? 'CEILING' : 'Max Offer')
                 : price >= Math.round(ask*0.98)
                 ? (_ab2 ? 'Asking' : 'ASKING (over)')
                 : price > ask ? 'If pressed'
                 : price >= Math.round(ask*0.94) ? 'Counter'
                 : price >= Math.round(ask*0.89) ? 'Open offer'
                 : 'Best case',
          profit: Math.round(arv - price - repairs - costs),
          meetsMin: (() => { const _p=Math.round(arv-price-repairs-costs); const _min=price>=1000000?100000:Math.max(price*0.10,20000); return _p>=_min; })()
        }));
        console.log('🔢 Recalculated: MAO=' + uw.financials.mao + ' Profit=' + uw.financials.netProfitAtAsking);
      }

      // If Urban mentions a specific repair item was resolved, zero it out
      const msgLow = message.toLowerCase();
      if ((msgLow.includes('roof') && (msgLow.includes('replaced') || msgLow.includes('new') || msgLow.includes('2020') || msgLow.includes('2021') || msgLow.includes('2022') || msgLow.includes('2023') || msgLow.includes('2024'))) && uw.rehab?.lineItems?.roof) {
        const saved = uw.rehab.lineItems.roof;
        uw.rehab.lineItems.roof = 0;
        uw.rehab.urbanEstimate = Math.max(0, (uw.rehab.urbanEstimate||0) - saved);
        console.log('🏠 Roof line item zeroed out ($'+saved+' saved) based on chat correction');
      }
      if ((msgLow.includes('hvac') || msgLow.includes('ac ') || msgLow.includes('air condition')) && (msgLow.includes('replaced') || msgLow.includes('new') || msgLow.includes('202')) && uw.rehab?.lineItems?.hvac) {
        const saved = uw.rehab.lineItems.hvac;
        uw.rehab.lineItems.hvac = 0;
        uw.rehab.urbanEstimate = Math.max(0, (uw.rehab.urbanEstimate||0) - saved);
        console.log('❄️ HVAC line item zeroed out ($'+saved+' saved) based on chat correction');
      }

      // 5. Regenerate verdict/recommendation/score with updated numbers
      try {
        const updatedUW = await regenerateVerdict(uw);
        if (updatedUW) {
          underwrites[req.params.uid] = updatedUW;
          uw = updatedUW;
          // (JSON file removed — Postgres only)
          DB.saveUnderwrite(req.params.uid, updatedUW).catch(() => {});
          console.log('🔄 Verdict regenerated: ' + updatedUW.verdict + ' (' + updatedUW.score + '/10)');
        }
      } catch(rErr) { console.log('Regen skipped:', rErr.message); }

      // 6. Save to sheet
      await saveBrain();
      console.log('📝 Correction saved to brain + sheet: ' + message.slice(0,80));
    }

    underwrites[uid] = uw;
    // (JSON file removed — Postgres only)
    if (uw.chatCorrected) await saveBrain().catch(() => {});
    res.json({
      reply, chatHistory,
      uid, address: uw.deal?.address,
      updated: !!uw.chatCorrected,   // tells frontend to refresh the panel
      verdict: uw.verdict,
      score: uw.score,
      arv: uw.arv,
      financials: uw.financials
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Override ARV or Rehab
app.post('/api/override/:uid', auth, (req, res) => {
  try {
    const uw = underwrites[req.params.uid];
    if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });
    const { field, value, author } = req.body;
    if (field === 'urbanARV') { uw.arv.urbanARV = parseFloat(value); uw.arv.overridden = true; }
    else if (field === 'rehab') { uw.rehab.urbanEstimate = parseFloat(value); uw.rehab.overridden = true; }
    else if (field === 'verdict') {
      // Manual verdict override — allows marking deals as HARD NO, PASS, etc.
      uw.verdict = value;
      uw.underwriteStatus = value;
      uw.verdictOverridden = true;
      uw.verdictOverrideReason = req.body.reason || 'Manually overridden';
      uw.verdictOverrideAt = new Date().toISOString();
      uw.verdictOverrideBy = req.body.author || 'CCG';
      // If HARD NO, skip profit recalc
      if (value === 'HARD NO') {
        uw.score = uw.score > 2 ? 1 : uw.score;
        // Add to brain as lesson
        const addr = uw.deal?.address || req.params.uid;
        const reason = req.body.reason || 'Manually marked HARD NO';
        urbanBrain.lessons = urbanBrain.lessons || [];
        urbanBrain.lessons.push('[' + new Date().toLocaleDateString('en-US') + '] OVERRIDE→HARD NO | ' + addr + ' | ' + reason);
        if (urbanBrain.lessons.length > 200) urbanBrain.lessons.shift();
        saveBrain().catch(() => {});
      }
      return res.json(uw);
    }
    const arv = uw.arv.urbanARV, repairs = uw.rehab.urbanEstimate, asking = parseFloat(uw.deal.askingPrice);
    uw.financials.mao = Math.round(arv * 0.7 - repairs);
    uw.financials.overUnderMAO = Math.round(asking - uw.financials.mao);
    uw.financials.netProfitAtAsking = Math.round(arv - asking - repairs - (uw.financials.holdingCosts?.total||0) - (uw.financials.sellingCosts?.total||0) - (uw.financials.hardMoney?.totalInterest||0) - (uw.financials.hardMoney?.originationPoints||0));
    uw.financials.meetsMinimumProfit = (function(p,a){return a>=1000000?p>=100000:p>=Math.max(a*0.10,20000);})(uw.financials.netProfitAtAsking||0, parseFloat(uw.deal?.askingPrice)||0);
    urbanBrain.lessons.push(`[Override: ${author||'user'} changed ${field} to ${value} on ${uw.deal.address}]`);
    saveJSON(BRAIN_FILE, urbanBrain);
    underwrites[req.params.uid] = uw;
    // (JSON file removed — Postgres only)
    res.json(uw);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Market intel endpoint — Derek reads this to pre-score deals by county/city
// Returns county-level averages so Derek can hint extraction with market context
app.get('/api/market-intel', auth, (req, res) => {
  const county = req.query.county || req.query.city;
  const notes  = urbanBrain.marketNotes || {};

  if (county) {
    // Return specific county
    const mn = notes[county] || null;
    if (!mn) return res.json({ county, noData: true });
    const ppsf = mn.avgARV && mn.avgSqft ? Math.round(mn.avgARV / mn.avgSqft) : null;
    return res.json({
      county, deals: mn.deals,
      avgARV: mn.avgARV, avgSqft: mn.avgSqft, ppsf,
      hotRate: mn.deals ? Math.round((mn.hotDeals||0) / mn.deals * 100) : 0,
      signal: mn.deals < 3 ? 'insufficient data' : (mn.hotDeals||0)/mn.deals > 0.4 ? 'HOT MARKET' : (mn.hotDeals||0)/mn.deals < 0.1 ? 'COLD MARKET' : 'NORMAL MARKET'
    });
  }

  // Return all counties summary
  const summary = Object.entries(notes)
    .filter(([, mn]) => mn.deals >= 2)
    .map(([county, mn]) => {
      const ppsf = mn.avgARV && mn.avgSqft ? Math.round(mn.avgARV / mn.avgSqft) : null;
      return { county, deals: mn.deals, avgARV: mn.avgARV, ppsf,
               hotRate: mn.deals ? Math.round((mn.hotDeals||0)/mn.deals*100) : 0 };
    })
    .sort((a, b) => b.deals - a.deals);

  // Also expose top/worst wholesalers so Derek can fast-track or flag
  const wsRankings = Object.entries(urbanBrain.wholesalerStats || {})
    .filter(([, ws]) => ws.deals >= 3)
    .map(([email, ws]) => ({
      email, deals: ws.deals,
      hotDeals: ws.hotDeals || 0,
      avgInflation: ws.avgARVInflation,
      isInflator: !!(ws.verifiedInflator || ws.inflationWarning),
      quality: ws.hotDeals > ws.deals * 0.4 ? 'HIGH' : ws.verifiedInflator ? 'INFLATOR' : ws.deals > 5 && (ws.hotDeals||0) < 1 ? 'LOW' : 'MED'
    }))
    .sort((a, b) => b.hotDeals - a.hotDeals);

  res.json({ markets: summary, wholesalers: wsRankings, lessonsCount: (urbanBrain.lessons||[]).length });
});

// ── MARKET DATA SEED (batch insert market comps by zip) ──────────────────────
app.post('/api/market-seed', auth, async (req, res) => {
  const { records } = req.body || {};
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records array required' });
  let saved = 0, errors = 0;
  for (const r of records) {
    if (!r.zip_code) { errors++; continue; }
    try {
      await DB.saveMarketData(r);
      saved++;
    } catch(e) { errors++; console.warn('market-seed err:', e.message); }
  }
  res.json({ saved, errors, total: records.length });
});

// ── GET MARKET DATA (lookup by zip) ──────────────────────────────────────────
app.get('/api/market/:zip', auth, async (req, res) => {
  const data = await DB.getMarketData(req.params.zip).catch(() => null);
  if (!data) return res.json({ zip: req.params.zip, found: false });
  res.json({ ...data, found: true });
});

// ── LIST ALL MARKET DATA (for admin) ─────────────────────────────────────────
app.get('/api/market-stats', auth, async (req, res) => {
  const stats = await DB.getMarketStats().catch(() => ({}));
  res.json(stats);
});

// Stats
app.get('/api/stats', auth, (req, res) => {
  // Include restored stubs for verdict counts, full objects for financials
  const allUw = Object.values(underwrites).filter(u => u.verdict && isTargetCounty(u.deal?.county, u.deal?.city));
  const full  = allUw.filter(u => !u.restoredFromSheet);
  const verdicts = {};
  allUw.forEach(u => { verdicts[u.verdict] = (verdicts[u.verdict]||0) + 1; });
  const all = full; // use full objects for score/profit calcs
  const profits = all.map(u => u.financials?.netProfitAtAsking).filter(p => p && p > 0);
  const avgProfit = profits.length ? Math.round(profits.reduce((a,b)=>a+b,0)/profits.length) : null;
  const scores = all.map(u => u.score).filter(Boolean);
  const avgScore = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;

  // ARV accuracy: how far off is Urban vs wholesaler?
  const arvPairs = all.filter(u => u.arv?.urbanARV > 0 && u.arv?.wholesalerARV > 0).map(u => ({
    urban: u.arv.urbanARV,
    ws: u.arv.wholesalerARV,
    diff: u.arv.urbanARV - u.arv.wholesalerARV,
    pctDiff: ((u.arv.urbanARV - u.arv.wholesalerARV) / u.arv.wholesalerARV) * 100,
    addr: u.deal?.address
  }));
  const arvAccuracy = arvPairs.length ? {
    dealCount: arvPairs.length,
    avgDiffPct: parseFloat((arvPairs.reduce((s,p) => s + p.pctDiff, 0) / arvPairs.length).toFixed(1)),
    avgDiffDollars: Math.round(arvPairs.reduce((s,p) => s + p.diff, 0) / arvPairs.length),
    totalDiffDollars: Math.round(arvPairs.reduce((s,p) => s + p.diff, 0)),
    urbanBelow: arvPairs.filter(p => p.diff < 0).length,      // Urban below wholesaler
    urbanAbove: arvPairs.filter(p => p.diff > 0).length,      // Urban above wholesaler
    onTarget: arvPairs.filter(p => Math.abs(p.pctDiff) <= 5).length, // Within 5%
    bigGaps: arvPairs.filter(p => Math.abs(p.pctDiff) > 20).map(p => ({
      address: p.addr, urbanARV: p.urban, wsARV: p.ws, pctDiff: parseFloat(p.pctDiff.toFixed(1))
    })).slice(0, 5)
  } : null;
  // Wholesaler quality rankings from brain
  const wsRankings = Object.entries(urbanBrain.wholesalerStats || {})
    .filter(([, ws]) => ws.deals >= 3)
    .sort((a, b) => (b[1].hotDeals||0) - (a[1].hotDeals||0))
    .slice(0, 5)
    .map(([email, ws]) => ({
      email, name: ws.name || email,
      deals: ws.deals, hotDeals: ws.hotDeals || 0,
      avgInflation: ws.avgARVInflation,
      isInflator: ws.verifiedInflator || ws.inflationWarning
    }));
  res.json({
    dbAvailable: DB.isAvailable(),
    arvAccuracy,
    totalUnderwritten: all.length,
    verdicts,
    avgScore: avgScore ? parseFloat(avgScore.toFixed(1)) : null,
    avgProfit,
    lessonsLearned: (urbanBrain.lessons||[]).length,
    correctionsApplied: (urbanBrain.correctionHistory||[]).length,
    topWholesalers: wsRankings,
    marketSummary: Object.entries(urbanBrain.marketNotes||{})
      .filter(([, mn]) => mn.deals >= 3)
      .map(([county, mn]) => ({
        county, deals: mn.deals,
        avgARV: mn.avgARV,
        avgSqft: mn.avgSqft,
        hotRate: mn.deals ? Math.round((mn.hotDeals||0)/mn.deals*100) : 0
      }))
  });
});
// Brain
app.get('/api/brain', auth, (req, res) => res.json(urbanBrain));

const PORT = process.env.PORT || 3001;
// Load brain from sheet on boot
loadBrainFromSheet().catch(e => console.log('Brain boot load:', e.message)).finally(() => injectCriticalLessons());
// ── INJECT CRITICAL CORRECTION LESSONS (one-time on boot) ─────────────────────
function injectCriticalLessons() {
  urbanBrain.lessons = urbanBrain.lessons || [];
  const CRITICAL_LESSONS = [
    '⚠️ CRITICAL PRICE ERROR LESSON [2026-06-18]: 2215 Curtis Drive S, Clearwater — Urban pulled asking price as $224,999 but the ACTUAL wholesaler email said $324,000. This caused a BUY verdict on what was a PASS. ALWAYS verify asking price against original email. If Zillow link exists, cross-reference it. If price per sqft seems abnormally low vs ARV, FLAG it.',
    '⚠️ CRITICAL INTAKE RULE: Asking price from sheet may not match original email. For any deal where price/sqft is below $100 or price is more than 40% below ARV with no explanation, flag for manual price verification before rendering verdict.',
  ];
  for (const lesson of CRITICAL_LESSONS) {
    if (!urbanBrain.lessons.find(l => l.includes('CRITICAL PRICE ERROR LESSON'))) {
      urbanBrain.lessons.unshift(lesson); // prepend so it stays at front
    }
  }
}

// ── UPDATE DEREK WHOLESALER QUALITY IN SHEET ──────────────────────────────────
// Urban writes quality scores to Derek's Brain sheet after each underwrite.
// Derek reads this on every extraction to know which senders to prioritize.
async function updateDerekWholesalerQuality(email, name, verdict, score, isDuplicate) {
  // Quality scoring rules:
  // HOT or BUY = good deal, counts positive
  // HARD NO = genuinely bad deal, counts negative
  // PASS = didn't work for us (price, timing, capacity) — NOT the wholesaler's fault, don't count
  // Duplicates caught by Derek = don't count at all against wholesaler
  if (isDuplicate) {
    console.log(`📊 Derek brain: skipping quality update for ${name||email} — duplicate deal`);
    return;
  }

  const isGood = ['HOT', 'BUY'].includes(verdict);
  const isBad  = verdict === 'HARD NO'; // PASS is neutral — price issue not wholesaler quality

  // Only update if we have a clear signal
  if (!isGood && !isBad) return;

  try {
    const s = getSheets();
    const res = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: "Derek's Brain!A:J"
    });
    const rows = res.data.values || [];
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === email) { rowIdx = i + 1; break; }
    }

    if (rowIdx > 0) {
      const row    = rows[rowIdx - 1];
      const hot    = parseInt(row[8] || '0');
      const hardno = parseInt(row[9] || '0');
      const newHot    = hot    + (isGood ? 1 : 0);
      const newHardno = hardno + (isBad  ? 1 : 0);
      // Quality = HOT deals / (HOT + HARD NO) * 10, defaulting to 5 with no data
      const total   = newHot + newHardno;
      const quality = total > 0 ? Math.round((newHot / total) * 10) : 5;
      await s.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Derek's Brain!H${rowIdx}:J${rowIdx}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[quality, newHot, newHardno]] }
      });
      console.log(`📊 Derek brain: ${name||email} quality=${quality}/10 (${newHot} HOT, ${newHardno} HARD NO — PASS not counted)`);
    } else {
      // Ensure header exists
      if (rows[0] && !rows[0][8]) {
        await s.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: "Derek's Brain!H1:J1",
          valueInputOption: 'RAW',
          requestBody: { values: [['Quality Score (0-10)', 'HOT/BUY Deals', 'Hard No Deals']] }
        });
      }
      console.log(`📊 Derek brain: first quality signal for ${name||email} — ${verdict}`);
    }
  } catch(e) {
    if (!e.message?.includes('Unable to parse')) console.log('Derek brain update err:', e.message);
  }
}

// ── RESTORE BRAIN + VERDICT INDEX FROM SHEET ON STARTUP ──────────────────────
// This is how corrections, lessons, and past verdicts survive redeployments.
async function restoreBrainFromSheet() {
  try {
    // 1. Restore brain (lessons, corrections, wholesaler stats)
    const s = getSheets();
    const r = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!A1:B2`
    });
    const rows = r.data.values || [];
    if (rows.length >= 2 && rows[1]?.[1]) {
      const saved = JSON.parse(rows[1][1]);
      const fileUpdated  = urbanBrain.lastUpdated ? new Date(urbanBrain.lastUpdated) : new Date(0);
      const sheetUpdated = saved.lastUpdated      ? new Date(saved.lastUpdated)      : new Date(0);
      if (sheetUpdated > fileUpdated) {
        // Sheet is newer — restore from it
        Object.assign(urbanBrain, {
          lessons:           saved.lessons           || urbanBrain.lessons || [],
          correctionHistory: saved.correctionHistory || urbanBrain.correctionHistory || [],
          wholesalerStats:   saved.wholesalerStats   || urbanBrain.wholesalerStats || {},
          wholesalerNotes:   saved.wholesalerNotes   || urbanBrain.wholesalerNotes || {},
          marketNotes:       saved.marketNotes       || urbanBrain.marketNotes || {},
          totalUnderwritten: saved.totalUnderwritten || urbanBrain.totalUnderwritten || 0,
          hotDeals:          saved.hotDeals          || urbanBrain.hotDeals || 0,
          passedDeals:       saved.passedDeals       || urbanBrain.passedDeals || 0,
          lastReviewAt:      saved.lastReviewAt      || urbanBrain.lastReviewAt || null,
          lastUpdated:       saved.lastUpdated
        });
        saveJSON(BRAIN_FILE, urbanBrain);
        console.log('✅ Brain restored: ' + (urbanBrain.lessons.length) + ' lessons, ' + (urbanBrain.correctionHistory.length) + ' corrections');
      } else {
        console.log('Local brain is current (' + (urbanBrain.lessons?.length || 0) + ' lessons)');
      }
    }

    // 2. Restore verdict index — prevent re-underwriting deals already done
    // Check the 'Urban Verdicts' columns in the brain tab (cols D+)
    try {
      const vi = await s.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!D1:G2000`
      });
      const viRows = (vi.data.values || []).slice(1); // skip header
      let restored = 0;
      for (const row of viRows) {
        const [uid, verdict, score, address, snapshotJson] = row;
        if (uid && verdict) {
          // Only restore stub if we don't have full data in memory/DB
          const existing = underwrites[uid] || (address && underwrites[address]);
          if (existing && (existing.recommendation || existing.financials?.mao)) continue; // Full data exists, skip stub
          let snapshot = { uid, verdict, score: parseInt(score)||0, deal: { address }, restoredFromSheet: true };
          if (snapshotJson) {
            try {
              const parsed = JSON.parse(snapshotJson);
              // Merge snapshot fields — keeps arv, rehab, financials, recommendation etc
              snapshot = { ...snapshot, ...parsed, deal: { ...(parsed.deal || {}), address: address || parsed.deal?.address }, restoredFromSheet: true };
            } catch {}
          }
          underwrites[uid] = snapshot;
          restored++;
        }
      }
      if (restored > 0) {
        // (JSON file removed — Postgres only)
        console.log('✅ Verdict index restored: ' + restored + ' deals (will not re-underwrite)');
        persistVerdictIndexToSheet().catch(() => {});


      }
    } catch(e) {
      // Verdict index columns may not exist yet — that's fine
      console.log('Verdict index not found (first run after fix)');
    }
  } catch(e) {
    console.log('Brain restore err:', e.message);
  }
}

// Persist verdict index to sheet (cols D+ in Brain tab) after each underwrite
async function persistVerdictIndexToSheet() {
  try {
    const s = getSheets();
    const rows = Object.entries(underwrites)
      .filter(([, uw]) => uw.verdict && uw.verdict !== 'PENDING')
      .map(([uid, uw]) => {
        // Store enough data so the UI never shows "not yet underwritten"
        const snapshot = {
          uid,
          verdict:          uw.verdict,
          score:            uw.score || 0,
          verdictReason:    uw.verdictReason || '',
          recommendation:   uw.recommendation || '',
          offerStrategy:    uw.offerStrategy || '',
          arv:              uw.arv || null,
          rehab:            uw.rehab || null,
          financials:       uw.financials || null,
          riskFlags:        uw.riskFlags || [],
          negotiationLadder: uw.negotiationLadder || [],
          exitAnalysis:     uw.exitAnalysis || null,
          underwroteAt:     uw.underwroteAt || null,
          model:            uw.model || null,
          chatCorrected:    uw.chatCorrected || false,
        };
        return [uid, uw.verdict, String(uw.score||0), uw.deal?.address||uid, JSON.stringify(snapshot)];
      });
    if (!rows.length) return;
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['UID','Verdict','Score','Address','Snapshot'], ...rows] }
    });
  } catch(e) { console.log('Persist verdict index err:', e.message); }
}


// ── GIS DIAGNOSTIC ENDPOINT ───────────────────────────────────────────────────
app.get('/api/test-gis/:county', auth, async (req, res) => {
  const county = req.params.county.toLowerCase();
  const address = req.query.address || '6785 21st Way S';
  const city = req.query.city || 'Saint Petersburg';
  const zip = req.query.zip || '33712';
  const beds = req.query.beds || '4';
  const sqft = req.query.sqft || '1935';
  
  console.log(`🔬 Testing GIS for ${county}: ${address}`);
  
  // Test geocoding first
  const geo = await geocodeAddress(address, city, 'FL').catch(e => ({ error: e.message }));
  if (!geo || geo.error) return res.json({ step: 'geocode', result: geo, address, city });
  
  // Test county GIS with raw response
  const countyNorm = county.toLowerCase().replace(' county','').trim();
  const countyConfigs2 = {
    hillsborough: { url: 'https://gis.hcpafl.org/arcgis/rest/services/Parcels/MapServer/0/query', where: `ZIPCD='${zip}' AND SAYR>=2024 AND SALPRC>50000`, fields: 'SITEADDR,BEDRM,SQFT,SALPRC,SAYR,SALMO' },
    pinellas: { url: 'https://pcpao-gis.pinellas.gov/arcgis/rest/services/public/PCPAO_Parcels/MapServer/0/query', where: `SALE_YEAR>=2024 AND SALE_PRICE>50000`, fields: 'PROPERTY_ADDRESS,NO_BDRMS,LIVING_AREA,SALE_PRICE,SALE_DATE' },
    polk: { url: 'https://maps.polkpa.org/server/rest/services/Parcel/MapServer/0/query', where: `SALE_YEAR>=2024 AND SALE_PRICE>50000`, fields: 'SITE_ADDRESS,BDRM_CNT,LIVING_SQ_FT,SALE_PRICE,SALE_DATE' },
  };
  const cfg2 = countyConfigs2[countyNorm] || {};
  
  // Try raw API call
  let rawResult = null, rawErr = null;
  if (cfg2.url) {
    try {
      const p = new URLSearchParams({ where: cfg2.where, outFields: cfg2.fields, resultRecordCount: '5', f: 'json' });
      const r = await fetch(`${cfg2.url}?${p}`, { headers: {'User-Agent':'Mozilla/5.0'}, signal: AbortSignal.timeout(8000) });
      const txt = await r.text();
      rawResult = { status: r.status, body: txt.slice(0,500) };
    } catch(e) { rawErr = e.message; }
  }
  
  const comps = await fetchCountyGISComps(address, city, 'FL', zip, county, beds, null, sqft).catch(e => ({ error: e.message }));
  res.json({ 
    geocode: geo,
    county,
    rawApiTest: rawResult,
    rawErr,
    compsCount: Array.isArray(comps) ? comps.length : 'error',
    comps: Array.isArray(comps) ? comps.slice(0,3) : comps,
    error: comps?.error
  });
});

// ── DEAL NOTES + SEEN-BY ────────────────────────────────────────────────────
app.get('/api/notes/:uid', auth, async (req, res) => {
  const uid = decodeURIComponent(req.params.uid);
  const [notes, seenBy] = await Promise.all([
    DB.getNotes(uid),
    DB.getSeenBy(uid),
  ]).catch(() => [[], {}]);
  res.json({ notes, seenBy });
});

app.post('/api/notes/:uid', auth, async (req, res) => {
  const uid        = decodeURIComponent(req.params.uid);
  const noteText   = (req.body.note   || '').trim();
  const noteAuthor = (req.body.author || 'caleb').trim();
  if (!noteText) return res.status(400).json({ error: 'note required' });
  const saved = await DB.saveNote(uid, noteText, noteAuthor);
  if (!saved) return res.status(500).json({ error: 'DB unavailable' });
  // Persist as brain lesson so Urban uses it in next underwrite
  urbanBrain.lessons = urbanBrain.lessons || [];
  const uw4note  = underwrites[uid];
  const addr4note = uw4note?.deal?.address || uid;
  urbanBrain.lessons.push({
    type: 'deal_note', address: addr4note, author: noteAuthor,
    text: '[' + noteAuthor.toUpperCase() + ' NOTE on ' + addr4note + ']: ' + noteText,
    ts: new Date().toISOString(),
  });
  if (urbanBrain.lessons.length > 200) urbanBrain.lessons.shift();
  saveBrain().catch(() => {});
  const [notes2, seenBy2] = await Promise.all([DB.getNotes(uid), DB.getSeenBy(uid)]).catch(() => [[], {}]);
  res.json({ notes: notes2, seenBy: seenBy2 });
});

// ── BATCH GEOCODING — for the mobile deal map. Caches every address in
// Postgres so it's only ever geocoded once; everything after that is instant.
app.post('/api/geocode-batch', auth, async (req, res) => {
  try {
    const items = (req.body && req.body.items) || [];
    const out = {};
    const CHUNK = 3; // gentle on Nominatim's free tier
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async (it) => {
        if (!it || !it.address) return;
        const key = `${it.address}|${it.city||''}|FL`.toLowerCase().trim();
        let geo = await DB.getGeocode(key).catch(() => null);
        if (!geo) {
          // Never attempted for this address — try it now, and cache the
          // outcome either way so a bad/unparseable address doesn't get
          // re-sent to Nominatim on every single map open from here on.
          const fresh = await geocodeAddress(it.address, it.city || '', 'FL').catch(() => null);
          if (fresh) { geo = fresh; DB.saveGeocode(key, fresh.lat, fresh.lng).catch(() => {}); }
          else { DB.saveGeocode(key, null, null).catch(() => {}); geo = null; }
        }
        if (geo && geo.lat != null) out[it.uid] = { lat: geo.lat, lng: geo.lng };
      }));
      if (i + CHUNK < items.length) await new Promise(r => setTimeout(r, 350));
    }
    res.json(out);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/seen/:uid', auth, async (req, res) => {
  const uid   = decodeURIComponent(req.params.uid);
  const who   = (req.body.author || 'caleb').trim();
  await DB.markSeen(uid, who).catch(() => {});
  const seenBy = await DB.getSeenBy(uid).catch(() => ({}));
  res.json({ seenBy });
});

// ── DEAL OUTCOMES: LOST TO ANOTHER BUYER / PURCHASED ────────────────────────
// Both archive the deal out of the active pipeline, log to Postgres + the
// "Archived Deals" sheet tab, check the Sold column (C) on Active Deals, and
// feed a lesson into Urban's brain.
const ARCHIVE_TAB = 'Archived Deals';

async function checkSoldColumnInSheet(uid) {
  try {
    const s = getSheets();
    const adRes = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Active Deals!A:CT' });
    const rows = adRes.data.values || [];
    const uidCol = rows[0]?.indexOf('Email UID');
    if (uidCol == null || uidCol < 0) return;
    const rowIdx = rows.findIndex((r, i) => i > 0 && String(r[uidCol]) === String(uid));
    if (rowIdx <= 0) return;
    const sheetRow = rowIdx + 1;
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Active Deals!C${sheetRow}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [[true]] }
    });
    console.log(`✅ Marked Sold (C) for row ${sheetRow}, uid ${uid}`);
  } catch(e) { console.log('checkSoldColumnInSheet err:', e.message); }
}

async function logArchivedDealToSheet(row) {
  try {
    const s = getSheets();
    await s.spreadsheets.values.append({ spreadsheetId: SHEET_ID,
      range: `${ARCHIVE_TAB}!A:A`, valueInputOption: 'RAW', requestBody: { values: [row] } });
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) {
      try {
        const s = getSheets();
        await s.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: ARCHIVE_TAB } } }] } });
        await s.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${ARCHIVE_TAB}!A1`,
          valueInputOption: 'RAW', requestBody: { values: [['Date','Address','City','State',
            'Outcome','Reason / Strategy','Their Price / Purchase Price','Notes','Logged By']] } });
        await logArchivedDealToSheet(row);
      } catch {}
    } else console.log('logArchivedDealToSheet err:', e.message);
  }
}

// Lost to another buyer — we called to lock it up but it had already sold
app.post('/api/lost/:uid', auth, async (req, res) => {
  try {
    const uid = decodeURIComponent(req.params.uid);
    const { reason, theirPrice, notes, author, address, city, state } = req.body || {};
    let uw = underwrites[uid] || await DB.getUnderwrite(uid);
    if (!uw) uw = { deal: { address: address || '', city: city || '', state: state || '' } };
    uw.uid = uw.uid || uid;

    const reasonLabel = ({
      lost_price: 'another buyer offered more',
      lost_speed: 'another buyer moved faster / closed quicker',
      seller_changed_mind: 'seller backed out',
      lost_unresponsive: 'wholesaler went unresponsive',
      other: 'other reason'
    })[reason] || reason || 'unspecified reason';
    const theirPriceNum = theirPrice ? parseFloat(theirPrice) : null;

    uw.dealOutcome = {
      type: 'LOST_TO_BUYER', reason: reason || 'other', theirPrice: theirPriceNum,
      notes: (notes || '').trim(), loggedBy: author || 'caleb', loggedAt: new Date().toISOString()
    };
    uw.archived = true;
    underwrites[uid] = uw;
    DB.saveUnderwrite(uid, uw).catch(() => {});

    const addr = uw.deal?.address || address || uid;
    urbanBrain.lessons = urbanBrain.lessons || [];
    urbanBrain.lessons.push({
      type: 'lost_deal', address: addr, author: author || 'caleb',
      text: `[LOST DEAL] ${addr} — sold to another buyer (${reasonLabel}).` +
        (theirPriceNum ? ` They reportedly got it for $${theirPriceNum.toLocaleString()}.` : '') +
        (notes ? ` Notes: ${notes}` : ''),
      ts: new Date().toISOString()
    });
    if (urbanBrain.lessons.length > 200) urbanBrain.lessons.shift();
    saveBrain().catch(() => {});

    checkSoldColumnInSheet(uid).catch(() => {});
    logArchivedDealToSheet([
      new Date().toISOString(), addr, uw.deal?.city || city || '', uw.deal?.state || state || '',
      'LOST TO BUYER', reasonLabel, theirPriceNum || '', notes || '', author || 'caleb'
    ]).catch(() => {});

    res.json(uw);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Purchased — CCG bought it; log the real numbers for outcome tracking
app.post('/api/outcome/:uid', auth, async (req, res) => {
  try {
    const uid = decodeURIComponent(req.params.uid);
    const { purchase, rehab, arv, strategy, wholesaleFee, actualProfit, notes, author, address } = req.body || {};
    let uw = underwrites[uid] || await DB.getUnderwrite(uid);
    if (!uw) return res.status(404).json({ error: 'Underwrite not found for this deal' });
    uw.uid = uw.uid || uid;

    const purchasePrice = parseFloat(purchase) || 0;
    const actualRehab   = parseFloat(rehab) || 0;
    const expectedArv   = parseFloat(arv) || (uw.arv?.urbanARV || 0);
    const wFee          = strategy === 'wholesale' ? (parseFloat(wholesaleFee) || 0) : null;
    const profit = actualProfit !== undefined && actualProfit !== '' && actualProfit !== null
      ? parseFloat(actualProfit)
      : (strategy === 'wholesale' && wFee ? wFee : null);

    uw.dealOutcome = {
      type: 'PURCHASED', purchasePrice, actualRehab, expectedARV: expectedArv,
      strategy: strategy || 'flip', wholesaleFee: wFee, actualProfit: profit,
      notes: (notes || '').trim(),
      loggedBy: author || 'caleb', loggedAt: new Date().toISOString()
    };
    uw.archived = true;
    underwrites[uid] = uw;
    DB.saveUnderwrite(uid, uw).catch(() => {});

    const addr = uw.deal?.address || address || uid;
    urbanBrain.lessons = urbanBrain.lessons || [];
    urbanBrain.lessons.push({
      type: 'purchased_deal', address: addr, author: author || 'caleb',
      text: `[PURCHASED] ${addr} — bought for ${purchasePrice.toLocaleString()}, rehab budget ` +
        `${actualRehab.toLocaleString()}, expected ARV ${expectedArv.toLocaleString()}, strategy: ${strategy || 'flip'}.` +
        (wFee ? ` Wholesale fee: ${wFee.toLocaleString()}.` : '') +
        (profit != null ? ` Logged profit: ${profit.toLocaleString()}.` : '') +
        (notes ? ` Notes: ${notes}` : ''),
      ts: new Date().toISOString()
    });
    if (urbanBrain.lessons.length > 200) urbanBrain.lessons.shift();
    saveBrain().catch(() => {});

    checkSoldColumnInSheet(uid).catch(() => {});
    logArchivedDealToSheet([
      new Date().toISOString(), addr, uw.deal?.city || '', uw.deal?.state || '',
      'PURCHASED', strategy || 'flip', purchasePrice, notes || '', author || 'caleb'
    ]).catch(() => {});

    res.json(uw);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profit/:uid', auth, async (req, res) => {
  try {
    const uid = decodeURIComponent(req.params.uid);
    const { actualProfit, wholesaleFee, notes, author } = req.body || {};
    let uw = underwrites[uid] || await DB.getUnderwrite(uid);
    if (!uw || !uw.dealOutcome) return res.status(404).json({ error: 'No logged outcome for this deal yet — log it as Purchased first.' });
    if (actualProfit !== undefined && actualProfit !== '') uw.dealOutcome.actualProfit = parseFloat(actualProfit);
    if (wholesaleFee !== undefined && wholesaleFee !== '') uw.dealOutcome.wholesaleFee = parseFloat(wholesaleFee);
    if (notes) uw.dealOutcome.notes = ((uw.dealOutcome.notes || '') + ' ' + notes).trim();
    uw.dealOutcome.profitUpdatedBy = author || 'caleb';
    uw.dealOutcome.profitUpdatedAt = new Date().toISOString();
    underwrites[uid] = uw;
    DB.saveUnderwrite(uid, uw).catch(() => {});
    res.json(uw);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profits', auth, async (req, res) => {
  try {
    const all = Object.values(underwrites).length ? underwrites : await DB.getAllUnderwrites();
    const rows = [];
    Object.values(all).forEach(uw => {
      if (!uw || !uw.dealOutcome || uw.dealOutcome.type !== 'PURCHASED') return;
      const o = uw.dealOutcome;
      rows.push({
        uid: uw.uid, address: uw.deal?.address || '', city: uw.deal?.city || '',
        strategy: o.strategy || 'flip', purchasePrice: o.purchasePrice || 0,
        wholesaleFee: o.wholesaleFee || null, actualProfit: o.actualProfit != null ? o.actualProfit : null,
        notes: o.notes || '', loggedAt: o.loggedAt
      });
    });
    rows.sort((a, b) => new Date(b.loggedAt||0) - new Date(a.loggedAt||0));
    const totals = { flip: 0, brrrr: 0, wholesale: 0, other: 0, all: 0, loggedCount: 0, pendingCount: 0 };
    rows.forEach(r => {
      if (r.actualProfit == null) { totals.pendingCount++; return; }
      totals.loggedCount++;
      totals.all += r.actualProfit;
      const key = ['flip','brrrr','wholesale'].includes(r.strategy) ? r.strategy : 'other';
      totals[key] += r.actualProfit;
    });
    res.json({ rows, totals });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Mobile app — served at /m (no changes to main Urban app)
const MOBILE_PATH = require('path').join(__dirname, '../public/mobile.html');
app.get('/m', (req, res) => res.sendFile(MOBILE_PATH));


app.listen(PORT, async () => {
  console.log(`🏙️ Urban on port ${PORT}`);

  // ── DATABASE INIT ──────────────────────────────────────────────────────────
  await DB.initDB().catch(e => console.warn('DB init:', e.message));
  await DB.initCompCache().catch(() => {});
  await DB.initDealsCache().catch(() => {});
  await DB.initDealNotes().catch(() => {});
  await DB.initGeocodeCache().catch(() => {});
  if (DB.isAvailable()) {
    // Merge Postgres + JSON: JSON already loaded above, DB wins on conflicts
    const fromDB = await DB.getAllUnderwrites().catch(() => ({}));
    const dbCount = Object.keys(fromDB).length;
    if (dbCount > 0) {
      // Merge DB data in — DB is authoritative
      // Only load target county deals into memory
      const targetFromDB = Object.fromEntries(
        Object.entries(fromDB).filter(([k, v]) => {
          return isTargetCounty(v.deal?.county, v.deal?.city);
        })
      );
      Object.assign(underwrites, targetFromDB);
      console.log('✅ Postgres loaded: ' + dbCount + ' deals → total: ' + Object.keys(underwrites).length);
      
      // Build address→uid reverse index so lookups by address work even with old UIDs
      for (const [uid, uw] of Object.entries(underwrites)) {
        const addr = uw.deal?.address || uw.address || '';
        if (addr && addr !== uid) {
          // If we have data under old row-number UID, re-save under address UID
          if (!underwrites[addr] || !underwrites[addr].recommendation) {
            underwrites[addr] = uw;
            // Also save to DB under the address UID for future lookups
            DB.saveUnderwrite(addr, uw).catch(() => {});
          }
        }
      }
      console.log('✅ Address index built: ' + Object.keys(underwrites).length + ' total UIDs');
    } else {
      console.log('⚠️ Postgres empty or unavailable — starting fresh');
    }
  } // end if (DB.isAvailable())

  // RESTORE BRAIN + VERDICT INDEX FROM SHEET ON EVERY STARTUP
  // This is what keeps Grant's corrections and past underwrites alive across redeploys
  console.log('🔄 Restoring brain and verdict index from Google Sheet...');
  await restoreBrainFromSheet().catch(e => console.log('Restore err:', e.message));

  // Auto-run chat review on startup (if more than 12h since last review) — cheap Haiku
  const lastReview = urbanBrain.lastReviewAt ? new Date(urbanBrain.lastReviewAt) : null;
  const hoursSince = lastReview ? (Date.now() - lastReview) / 3600000 : 0; // 0 = never auto-review on first startup
  if (hoursSince > 168) { // 7-day min
    console.log('📚 Scheduling auto chat review...');
    setTimeout(async () => {
      try {
        // Internal review — same logic as /api/review-chat but called locally
        const allChats = Object.values(underwrites)
          .filter(uw => uw.chatHistory?.length > 0)
          .slice(-20);
        if (allChats.length > 0) {
          const r = await getAnthropic().messages.create({
            model: 'claude-haiku-4-5-20251001', max_tokens: 600,
            messages: [{
              role: 'user',
              content: 'You are Urban, real estate underwriter for Coralstone Capital Group. Review these recent underwrite conversations and extract 2-4 SPECIFIC new lessons for improving future analysis. Return only a JSON array of lesson strings.\n\nChat summary:\n' +
                allChats.map(uw => (uw.deal?.address||'?') + ' ' + (uw.verdict||'') + ': ' + (uw.chatHistory||[]).slice(-3).map(m => (m.role||'')+': '+(String(m.content||'').slice(0,80))).join(' | ')).join('\n')
            }]
          });
          const raw = r.content[0].text;
          const s = raw.indexOf('['), e = raw.lastIndexOf(']');
          if (s !== -1 && e > s) {
            const lessons = JSON.parse(raw.slice(s, e+1));
            const existing = new Set((urbanBrain.lessons||[]).map(l => l.slice(0,50)));
            let added = 0;
            for (const l of lessons) {
              if (!existing.has(l.slice(0,50))) {
                urbanBrain.lessons = urbanBrain.lessons || [];
                urbanBrain.lessons.push('[AUTO-REVIEW] ' + l);
                added++;
              }
            }
            urbanBrain.lastReviewAt = new Date().toISOString();
            if (urbanBrain.lessons.length > 150) urbanBrain.lessons = urbanBrain.lessons.slice(-150);
            await saveBrain();
            if (added > 0) console.log('📚 Auto-review: ' + added + ' new lessons added');
          }
        }
      } catch(e) { console.log('Auto-review err:', e.message); }
    }, 30000); // 30s after startup
  } // end if (hoursSince > 168)
});


// ── PITR BACKUP SYSTEM ─────────────────────────────────────────────────────────
// Point-in-Time Recovery: exports full underwrite database to Google Sheets every 6h
async function runPITRBackup() {
  try {
    const s = getSheets();
    const allUws = Object.values(underwrites);
    if (!allUws.length) return;
    const BACKUP_TAB = 'PITR_Backup';
    const now = new Date().toISOString();
    const header = ['backed_up_at','uid','address','city','state','zip','verdict','score','arv','mao','rehab','profit','full_json'];
    const rows = allUws.map(uw => [
      now, uw.deal?.uid||'', uw.deal?.address||'', uw.deal?.city||'', uw.deal?.state||'', uw.deal?.zip||'',
      uw.verdict||'', uw.score||'', uw.arv?.urbanARV||'', uw.financials?.mao||'',
      uw.rehab?.urbanEstimate||'', uw.financials?.netProfitAtAsking||'',
      JSON.stringify(uw).slice(0, 45000)
    ]);
    try { await s.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: BACKUP_TAB } } }] }
    }); } catch(e) { /* tab exists */ }
    await s.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: BACKUP_TAB+'!A1',
      valueInputOption: 'RAW', requestBody: { values: [header, ...rows] } });
    console.log('✅ PITR backup: ' + allUws.length + ' underwrites saved');
  } catch(e) { console.log('PITR backup error:', e.message); }
}
setInterval(runPITRBackup, 6 * 60 * 60 * 1000);
setTimeout(runPITRBackup, 5 * 60 * 1000);
app.post('/api/backup', auth, async (req, res) => {
  try { await runPITRBackup(); res.json({ ok: true, count: Object.keys(underwrites).length }); }
  catch(e) { res.status(500).json({ error: e.message }); }
})
// ── DB HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/api/db-status', auth, async (req, res) => {
  const available = DB.isAvailable();
  const count = available ? Object.keys(await DB.getAllUnderwrites().catch(() => ({}))).length : 0;
  res.json({
    available,
    underwrites_in_db: count,
    underwrites_in_memory: Object.keys(underwrites).length,
    brain_categories: Object.keys(urbanBrain).length,
    lessons: urbanBrain.lessons?.length || 0,
    message: available ? 'Postgres connected' : 'No DATABASE_URL — data is in-memory only (lost on restart!)'
  });
});
;

// ── SERVER-SIDE AUTO-UNDERWRITE LOOP ───────────────────────────────────────────
// Runs every 10 minutes on the server — underwrites pending deals WITHOUT login
// This is the core of "deals underwritten as they come in"
let serverBatchRunning = false;

async function serverAutoUnderwrite() {
  if (serverBatchRunning) return;
  try {
    serverBatchRunning = true;

    // Get pending deals from the sheet
    const s = getSheets();
    const sheetRes = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Active Deals!A:CT'
    }).catch(() => null);
    if (!sheetRes?.data?.values?.length) { serverBatchRunning = false; return; }

    const rows = sheetRes.data.values;
    const header = rows[0] || [];
    const col = name => header.indexOf(name);

    const addrCol = col('Address') >= 0 ? col('Address') : col('Property Address');
    const uidCol = col('Email UID');
    if (addrCol < 0) { serverBatchRunning = false; return; }

    // Build authoritative "already underwritten" set from POSTGRES (not just memory)
    // This prevents re-underwrites after code deploys — Postgres is the source of truth
    const dbUnderwritten = new Set();
    if (DB.isAvailable()) {
      const allDbKeys = await DB.getAllUnderwrites().catch(() => ({}));
      for (const [k, v] of Object.entries(allDbKeys)) {
        if (v.verdict) {
          dbUnderwritten.add(k.toLowerCase().trim());
          const da = v.deal?.address || v.address || '';
          if (da) dbUnderwritten.add(da.toLowerCase().trim());
        }
      }
    }
    // Also include anything in memory with a verdict
    for (const [k, v] of Object.entries(underwrites)) {
      if (v.verdict) {
        dbUnderwritten.add(k.toLowerCase().trim());
        const da = v.deal?.address || v.address || '';
        if (da) dbUnderwritten.add(da.toLowerCase().trim());
      }
    }
    console.log('📋 Auto-batch: ' + dbUnderwritten.size/2 + ' deals already underwritten in DB — will skip them');

    // Find deals without an underwrite — ONLY truly new deals
    const pending = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const addr = (row[addrCol] || '').trim();
      if (!addr) continue;
      // ALWAYS use address as the canonical key (Email UID from sheet = campaign ID, not unique)
      const addrKey = addr.toLowerCase().trim();
      // Skip if already underwritten in DB or memory — PERIOD. One underwrite ever.
      if (dbUnderwritten.has(addrKey)) continue;
      // Skip if not in CCG target counties (Pasco/Polk/Hillsborough/Pinellas/Sarasota/Hernando)
      const _rowCounty = uidCol >= 0 ? '' : ''; // parsed below after deal is built, pre-check here
      const _dealCounty = col('County') >= 0 ? (row[col('County')] || '') : '';
      const _dealCity   = col('City')   >= 0 ? (row[col('City')]   || '') : '';
      if (!isTargetCounty(_dealCounty, _dealCity)) continue;
      {
        // Build deal object from sheet row
        const deal = {};
        const fields = { address: 'Address', city: 'City', state: 'State', zip: 'Zip',
          beds: 'Beds', baths: 'Baths', sqft: 'Sqft', askingPrice: 'Price',
          wholesalerCompany: 'Wholesaler', contact1Email: 'Email', uid: 'Email UID',
          county: 'County', propertyType: 'Property Type', yearBuilt: 'Year Built',
          pool: 'Pool', wholesalerARV: 'ARV' };
        for (const [key, colName] of Object.entries(fields)) {
          const c = col(colName);
          if (c >= 0 && row[c]) deal[key] = row[c];
        }
        deal.address = deal.address || addr;
        // Always use address as UID — Email UID from sheet is campaign ID, not unique per deal
        deal.uid = addr;
        deal.askingPrice = deal.askingPrice ? parseFloat(String(deal.askingPrice).replace(/[$,]/g,'')) : null;
        if (deal.wholesalerARV) deal.wholesalerARV = parseFloat(String(deal.wholesalerARV).replace(/[$,]/g,''));
        pending.push(deal);
      }
    }

    if (!pending.length) {
      console.log('✅ Server auto-batch: all deals underwritten');
      serverBatchRunning = false;
      return;
    }

    console.log(`🤖 Server auto-batch: ${pending.length} pending deals — underwriting...`);

    // Underwrite them one at a time with rate limit handling
    let successCount = 0;
    let rlHit = false;
    const send = () => {}; // no-op for SSE send in server context
    for (const deal of pending) {
      if (rlHit) break; // Stop if rate limited, resume next cycle
      try {
        // Gather comps then underwrite (same flow as SSE endpoint)
        send({ status: '⚡ Fetching comps...' }); // noop - no SSE in server batch
        const comps = await fetchComps(
          deal.address, deal.city, deal.state, deal.zip, deal
        ).catch(() => []);
        const uw = await underwriteDeal(deal, comps, true);
        if (uw?.verdict) {
          const uid = deal.uid || deal.address;
          underwrites[uid] = { ...uw, deal, underwroteAt: new Date().toISOString() };
          await DB.saveUnderwrite(uid, underwrites[uid]).catch(() => {});
          await logUnderwriteToSheet(underwrites[uid]).catch(() => {});
          await harvestBrainFromUnderwrite(underwrites[uid]).catch(() => {});
          successCount++;
          console.log(`✅ Server auto-batch: ${deal.address} → ${uw.verdict} (${uw.score}/10)`);
          await new Promise(r => setTimeout(r, 3000)); // 3s between underwrites
        }
      } catch(e) {
        const isRL = e.status === 429 || (e.message||'').includes('rate_limit');
        if (isRL) {
          console.log('⏳ Server auto-batch: rate limited — will retry in next cycle (10 min)');
          rlHit = true;
        } else {
          console.log(`⚠️ Server auto-batch: ${deal.address} failed: ${e.message}`);
        }
      }
    }

    if (successCount > 0) {
      await saveBrain().catch(() => {});
      console.log(`🏁 Server auto-batch: ${successCount}/${pending.length} underwritten`);
    }
  } catch(e) {
    console.log('Server auto-batch error:', e.message);
  } finally {
    serverBatchRunning = false;
  }
}

// Run every 10 minutes, 24/7 — no login needed
setInterval(serverAutoUnderwrite, 10 * 60 * 1000);
// Also run 2 minutes after startup (gives time for DB/sheet restore to complete)
setTimeout(serverAutoUnderwrite, 2 * 60 * 1000);

// Webhook endpoint — Google Sheets Apps Script calls this when a new deal row is added
// Triggers immediate underwrite without waiting for the 10-min cycle
app.post('/api/webhook/new-deal', async (req, res) => {
  // Lightweight webhook auth — Apps Script sends this header
  const secret = req.headers['x-urban-webhook'] || req.body?.secret;
  if (secret !== 'coralstone2025') return res.status(401).json({ error: 'unauthorized' });

  res.json({ ok: true, message: 'Received — underwriting queued' });

  // Trigger immediately in background (don't await — respond first)
  setTimeout(serverAutoUnderwrite, 500);
});

// build Thu Jun 11 18:57:38 UTC 2026
