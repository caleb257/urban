require('dotenv').config({ path: '../.env' });
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Lazy init — reads env var at request time, not at boot
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
const PASSWORD = process.env.URBAN_PASSWORD || 'coralstone2025';
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

let urbanBrain = loadJSON(BRAIN_FILE, {
  lessons: [],
  wholesalerNotes: {},
  marketNotes: {},
  correctionHistory: [],
  lastUpdated: null
});

let underwrites = loadJSON(UNDERWRITES_FILE, {});

// ── SHEETS CLIENT ─────────────────────────────────────────────────────────────
function getSheets() {
  const rawCreds = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!rawCreds) throw new Error('GOOGLE_CREDENTIALS_JSON env var is not set');
  let creds;
  try { creds = JSON.parse(rawCreds); }
  catch(e) { throw new Error('GOOGLE_CREDENTIALS_JSON is not valid JSON: ' + e.message); }
  const auth = new google.auth.JWT(creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  return google.sheets({ version: 'v4', auth });
}

// ── PULL DEALS FROM DEREK'S SHEET ────────────────────────────────────────────
async function getDealsFromSheet() {
  const s = getSheets();
  const res = await s.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Active Deals!A1:CV200'
  });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  return rows.slice(1).filter(r => r[col['Address']]).map(r => {
    const get = (h) => r[col[h]] || '';
    return {
      uid: get('Email UID'),
      dateReceived: get('Date Received'),
      propertyType: get('Property Type'),
      address: get('Address'),
      city: get('City'),
      state: get('State'),
      zip: get('Zip'),
      county: get('County'),
      beds: get('Beds'),
      baths: get('Baths'),
      sqft: get('Sqft'),
      yearBuilt: get('Year Built'),
      lotAcres: get('Lot Acres'),
      construction: get('Construction'),
      foundation: get('Foundation'),
      pool: get('Pool'),
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
      contact1Phone: get('Contact 1 Phone'),
      contact1Email: get('Contact 1 Email'),
      contact1Company: get('Contact 1 Company'),
      allPhones: get('ALL Phones Found'),
      allEmails: get('ALL Emails Found'),
      occupancy: get('Occupancy'),
      floodZone: get('Flood Zone'),
      hoa: get('HOA'),
      schoolDistrict: get('School District'),
      driveLink: get('Google Drive Link'),
      zillowLink: get('Zillow Link'),
      googleMapsLink: get('Google Maps Link'),
      photosIncluded: get('Photos Included'),
      comp1: get('Comp 1'),
      comp2: get('Comp 2'),
      comp3: get('Comp 3'),
      whatIsUpdated: get('What Is Updated'),
      whatNeedsWork: get('What Needs Work'),
      highlights: get('Highlights'),
      redFlags: get('Red Flags'),
      additionalNotes: get('Additional Notes'),
      wholesalerCompany: get('Wholesaler Company'),
      daysActive: get('Days Active'),
      emailSubject: get('Email Subject'),
    };
  });
}

// ── FREE COMP ENGINE ─────────────────────────────────────────────────────────
// Pulls from 3 free sources: Zillow, Redfin, County Appraiser
// Returns { comps, zestimate, countyData, arvEstimate }

async function scrapeZillow(address, city, state, zip) {
  try {
    const encoded = encodeURIComponent(`${address} ${city} ${state} ${zip}`);
    const url = `https://www.zillow.com/homes/${encoded}_rb/`;
    const r = await fetch(url, { headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }, redirect: 'follow' });
    const html = await r.text();
    // Extract Zestimate from page data
    const zestMatch = html.match(/"zestimate":(\d+)/);
    const priceMatch = html.match(/"price":(\d+)/);
    const sqftMatch = html.match(/"livingArea":(\d+)/);
    const zestimate = zestMatch ? parseInt(zestMatch[1]) : null;
    const listPrice = priceMatch ? parseInt(priceMatch[1]) : null;
    const sqft = sqftMatch ? parseInt(sqftMatch[1]) : null;
    console.log(`Zillow: zestimate=$${zestimate} listPrice=$${listPrice} sqft=${sqft}`);
    return { zestimate, listPrice, sqft, source: 'zillow' };
  } catch(e) {
    console.log('Zillow scrape failed:', e.message);
    return { zestimate: null, source: 'zillow' };
  }
}

async function scrapeRedfin(address, city, state, zip) {
  try {
    const encoded = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
    const url = `https://www.redfin.com/stingray/do/location-autocomplete?location=${encoded}&count=1&v=2`;
    const r = await fetch(url, { headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json'
    }});
    const text = await r.text();
    const json = JSON.parse(text.replace("{}&&", ""));
    const item = json?.payload?.exactMatch || json?.payload?.sections?.[0]?.rows?.[0];
    if (!item?.url) return { estimate: null, source: 'redfin' };
    const propR = await fetch(`https://www.redfin.com${item.url}`, { headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }});
    const html = await propR.text();
    const estimateMatch = html.match(/"estimatedValue":(\d+)/);
    const estimate = estimateMatch ? parseInt(estimateMatch[1]) : null;
    console.log(`Redfin: estimate=$${estimate}`);
    return { estimate, source: 'redfin' };
  } catch(e) {
    console.log('Redfin scrape failed:', e.message);
    return { estimate: null, source: 'redfin' };
  }
}

async function scrapeCountyAppraiser(address, city, state, zip) {
  try {
    // Florida county appraiser HTTPS APIs — free public data
    const county = detectCounty(city, zip);
    let result = { lastSalePrice: null, assessedValue: null, yearBuilt: null, sqft: null, county, source: 'county' };

    if (county === 'Hillsborough') {
      // Hillsborough PA has a free search API
      const encoded = encodeURIComponent(address.toUpperCase());
      const r = await fetch(`https://gis.hcpafl.org/arcgis/rest/services/HCPA_Services/Parcel/MapServer/0/query?where=SITEADDRESS+LIKE+%27${encoded}%25%27&outFields=*&f=json`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await r.json();
      const feat = data?.features?.[0]?.attributes;
      if (feat) {
        result.lastSalePrice = feat.SALEAMT || null;
        result.assessedValue = feat.JUSTVALUE || null;
        result.yearBuilt = feat.YEARBUILT || null;
        result.sqft = feat.TOTLVGAREA || null;
        console.log(`Hillsborough PA: lastSale=$${result.lastSalePrice} assessed=$${result.assessedValue}`);
      }
    } else if (county === 'Pinellas') {
      const encoded = encodeURIComponent(address.split(' ').slice(0,3).join(' ').toUpperCase());
      const r = await fetch(`https://www.pcpao.gov/search/real-property?address=${encoded}&city=&zip=${zip}&action=Search`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      // Pinellas returns HTML — just log it hit
      console.log(`Pinellas PA: queried`);
    } else if (county === 'Pasco') {
      const encoded = encodeURIComponent(address.toUpperCase());
      const r = await fetch(`https://pascopa.com/index.aspx?search=${encoded}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      console.log(`Pasco PA: queried`);
    }
    return result;
  } catch(e) {
    console.log('County appraiser scrape failed:', e.message);
    return { lastSalePrice: null, assessedValue: null, county: null, source: 'county' };
  }
}

function detectCounty(city, zip) {
  const z = parseInt(zip);
  // Hillsborough: 33601-33699, 33701-33714 (overlap), 33547, 33549, 33556, 33558, 33559, 33563, 33565, 33566, 33567, 33569, 33570, 33572, 33573, 33578, 33579, 33584, 33586, 33587, 33592, 33594, 33596, 33598
  if ((z >= 33601 && z <= 33699) || [33547,33549,33556,33558,33559,33563,33565,33566,33567,33569,33570,33572,33573,33578,33579,33584,33586,33587,33592,33594,33596,33598].includes(z)) return 'Hillsborough';
  // Pinellas: 33701-33785
  if (z >= 33701 && z <= 33785) return 'Pinellas';
  // Pasco: 33523-33545, 34638, 34639, 34652, 34653, 34654, 34655, 34667, 34668, 34669, 34690, 34691
  if ((z >= 33523 && z <= 33545) || [34638,34639,34652,34653,34654,34655,34667,34668,34669,34690,34691].includes(z)) return 'Pasco';
  // Polk: 33801-33898
  if (z >= 33801 && z <= 33898) return 'Polk';
  // Hernando: 34601-34614
  if (z >= 34601 && z <= 34614) return 'Hernando';
  const c = city.toLowerCase();
  if (c.includes('tampa') || c.includes('brandon') || c.includes('riverview') || c.includes('ruskin') || c.includes('plant city') || c.includes('lutz') || c.includes('valrico')) return 'Hillsborough';
  if (c.includes('st pete') || c.includes('clearwater') || c.includes('largo') || c.includes('pinellas')) return 'Pinellas';
  if (c.includes('new port') || c.includes('land o') || c.includes('zephyrhills') || c.includes('dade city') || c.includes('hudson') || c.includes('holiday') || c.includes('pasco')) return 'Pasco';
  if (c.includes('lakeland') || c.includes('winter haven') || c.includes('auburndale') || c.includes('polk')) return 'Polk';
  if (c.includes('brooksville') || c.includes('spring hill') || c.includes('hernando')) return 'Hernando';
  return 'Unknown';
}

async function fetchComps(address, city, state, zip) {
  // Run all three sources in parallel
  const [zillowData, redfinData, countyData] = await Promise.allSettled([
    scrapeZillow(address, city, state, zip),
    scrapeRedfin(address, city, state, zip),
    scrapeCountyAppraiser(address, city, state, zip)
  ]);

  const zillow = zillowData.status === 'fulfilled' ? zillowData.value : {};
  const redfin = redfinData.status === 'fulfilled' ? redfinData.value : {};
  const county = countyData.status === 'fulfilled' ? countyData.value : {};

  // Build ARV estimate from available data points
  const estimates = [];
  if (zillow.zestimate) estimates.push(zillow.zestimate);
  if (redfin.estimate) estimates.push(redfin.estimate);
  // County assessed value in FL is typically 80-90% of market — adjust up
  if (county.assessedValue) estimates.push(Math.round(county.assessedValue * 1.15));

  const arvEstimate = estimates.length > 0
    ? Math.round(estimates.reduce((a, b) => a + b, 0) / estimates.length)
    : null;

  console.log(`ARV sources: zillow=$${zillow.zestimate} redfin=$${redfin.estimate} county_assessed=$${county.assessedValue} → avg=$${arvEstimate}`);

  // Return in comp format + metadata
  const comps = [];
  if (zillow.zestimate) comps.push({
    address: `${address} (Zestimate)`, sqft: zillow.sqft, beds: null, baths: null,
    salePrice: zillow.zestimate, saleDate: '2025', distanceMiles: 0, source: 'zillow_zestimate'
  });
  if (redfin.estimate) comps.push({
    address: `${address} (Redfin Estimate)`, sqft: null, beds: null, baths: null,
    salePrice: redfin.estimate, saleDate: '2025', distanceMiles: 0, source: 'redfin_estimate'
  });
  if (county.lastSalePrice) comps.push({
    address: `${address} (Last Sale - ${county.county} PA)`, sqft: county.sqft, beds: null, baths: null,
    salePrice: county.lastSalePrice, saleDate: 'prior', distanceMiles: 0, source: 'county_appraiser'
  });

  // Attach metadata for underwrite prompt
  comps._meta = { zillow, redfin, county, arvEstimate };
  return comps;
}

// ── URBAN'S BRAIN CONTEXT ─────────────────────────────────────────────────────
function getBrainContext(wholesalerEmail) {
  const lessons = urbanBrain.lessons.slice(-20).map(l => `- ${l}`).join('\n');
  const wNotes = urbanBrain.wholesalerNotes[wholesalerEmail] || '';
  return { lessons, wholesalerNotes: wNotes };
}

// ── CORE UNDERWRITING ENGINE ──────────────────────────────────────────────────
async function underwriteDeal(deal, comps, forceRefresh = false, deep = false) {
  const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;

  // Return cached unless forced refresh
  if (underwrites[uid] && !forceRefresh) return underwrites[uid];

  const brain = getBrainContext(deal.contact1Email);
  const sqft = parseFloat(deal.sqft) || 0;
  const askingPrice = parseFloat(deal.askingPrice) || 0;
  const wholesalerARV = parseFloat(deal.wholesalerARV) || 0;
  const wholesalerRepairs = parseFloat(deal.repairsEstimate) || 0;
  const annualTaxes = parseFloat(deal.annualTaxes) || 0;
  const hoaFee = parseFloat(deal.hoaFee) || 0;

  const meta = comps._meta || {};
  const arvLine = meta.arvEstimate
    ? `FREE DATA ARV ESTIMATE: $${meta.arvEstimate.toLocaleString()} (avg of: ${[meta.zillow?.zestimate && 'Zillow $'+meta.zillow.zestimate.toLocaleString(), meta.redfin?.estimate && 'Redfin $'+meta.redfin.estimate.toLocaleString(), meta.county?.assessedValue && 'County Assessed $'+meta.county.assessedValue.toLocaleString()].filter(Boolean).join(', ')})`
    : 'No AVM data retrieved — estimate from market knowledge';
  const compsText = comps.length > 0
    ? arvLine + '\n' + comps.map(c => `- ${c.address}: sold/estimated $${c.salePrice?.toLocaleString()} (${c.source})`).join('\n')
    : arvLine;

  const prompt = `You are Urban, an elite real estate investment underwriter for Coralstone Capital Group in Tampa Bay, Florida. You have 20+ years of experience underwriting fix-and-flip and buy-and-hold deals in Pasco, Hillsborough, Polk, Pinellas, and Hernando counties.

CORALSTONE'S CRITERIA:
- Hard money financing: 9.5% interest only
- MAO formula: ARV × 70% - Repairs
- Minimum net profit target: $40,000
- Markets: Pasco, Hillsborough, Polk, Pinellas, Hernando (within ~1hr of Tampa)
- Exit strategies: Fix & Flip, Buy & Hold (rental), note new construction potential separately
- Full rehab hold time: 5 months. Light cosmetic: 4 months.
- CRITICAL: Assume wholesaler ARV is INFLATED most of the time. Be skeptical. Find the TRUE ARV.
- Sometimes wholesaler ARV is LOWER than true value — note this when you see it.
- Repair budget: Use wholesaler's number if available. If not, estimate from condition + sqft.

URBAN'S BRAIN — LESSONS LEARNED:
${brain.lessons || 'No lessons yet — first underwrite'}

WHOLESALER NOTES FOR THIS SENDER:
${brain.wholesalerNotes || 'No prior data on this wholesaler'}

DEAL DATA FROM DEREK:
Address: ${deal.address}, ${deal.city}, ${deal.state} ${deal.zip}
County: ${deal.county}
Property Type: ${deal.propertyType}
Beds/Baths: ${deal.beds}/${deal.baths} | Sqft: ${sqft} | Year Built: ${deal.yearBuilt}
Lot: ${deal.lotAcres} acres | Construction: ${deal.construction}
Condition: ${deal.overall_condition}
Pool: ${deal.pool} | HOA: ${deal.hoa} | Flood Zone: ${deal.floodZone}
Occupancy: ${deal.occupancy}

SYSTEMS:
Roof: ${deal.roofType} — ${deal.roofAge}
AC: ${deal.acYear}
Water Heater: ${deal.waterHeater}
Electrical: ${deal.electrical}
Plumbing: ${deal.plumbing}
Windows: ${deal.windows}
Flooring: ${deal.flooring}

CONDITION NOTES:
Kitchen: ${deal.kitchenNotes}
Baths: ${deal.bathNotes}
What's Updated: ${deal.whatIsUpdated}
What Needs Work: ${deal.whatNeedsWork}
Red Flags (wholesaler noted): ${deal.redFlags}
Highlights: ${deal.highlights}
Additional Notes: ${deal.additionalNotes}

WHOLESALER'S NUMBERS:
Asking Price: $${askingPrice.toLocaleString()}
Wholesaler's ARV: $${wholesalerARV.toLocaleString()}
Wholesaler's Repair Estimate: ${wholesalerRepairs ? '$' + wholesalerRepairs.toLocaleString() : 'NOT PROVIDED — Urban must estimate'}
Annual Taxes: $${annualTaxes.toLocaleString()}
HOA: $${hoaFee}/month

COMPARABLE SALES FOUND:
${compsText}

Respond with a comprehensive underwriting report as a JSON object with these EXACT fields:

{
  "score": <1-10>,
  "verdict": "<HOT|BUY|REVIEW|PASS|HARD NO>",
  "verdictReason": "<one punchy sentence>",
  
  "arv": {
    "wholesalerARV": <number>,
    "urbanARV": <number>,
    "arvConfidence": "<HIGH|MEDIUM|LOW>",
    "arvNotes": "<why Urban's ARV differs from wholesaler's, be specific>",
    "compsUsed": [<array of comp addresses used>]
  },
  
  "rehab": {
    "wholesalerEstimate": <number or null>,
    "urbanEstimate": <number>,
    "urbanEstimateRange": {"low": <number>, "high": <number>},
    "confidence": "<HIGH|MEDIUM|LOW>",
    "missingInfo": "<what Urban couldn't find that would help>",
    "lineItems": {
      "roof": <number>,
      "hvac": <number>,
      "plumbing": <number>,
      "electrical": <number>,
      "kitchen": <number>,
      "bathrooms": <number>,
      "flooring": <number>,
      "windows": <number>,
      "paint": <number>,
      "landscaping": <number>,
      "contingency": <number>,
      "other": <number>
    },
    "scopeLevel": "<FULL REHAB|MEDIUM|LIGHT COSMETIC>",
    "notes": "<explanation of rehab scope>"
  },
  
  "financials": {
    "askingPrice": <number>,
    "mao": <number>,
    "overUnderMAO": <number>,
    "holdMonths": <4 or 5>,
    "hardMoney": {
      "loanAmount": <number>,
      "interestRate": 9.5,
      "monthlyPayment": <number>,
      "totalInterest": <number>,
      "originationPoints": <number>
    },
    "holdingCosts": {
      "taxes": <number>,
      "insurance": <number>,
      "utilities": <number>,
      "total": <number>
    },
    "sellingCosts": {
      "agentCommission": <number>,
      "closingCosts": <number>,
      "total": <number>
    },
    "totalCost": <number>,
    "netProfitAtAsking": <number>,
    "netProfitAtMAO": <number>,
    "roi": <number>,
    "meetsMinimumProfit": <boolean>
  },
  
  "rental": {
    "marketRent": <number>,
    "grossYield": <number>,
    "netYield": <number>,
    "cashFlow": <number>,
    "capRate": <number>,
    "worthConsidering": <boolean>,
    "notes": "<rental analysis>"
  },
  
  "newConstruction": {
    "lotValue": <number or null>,
    "buildCostPerSqft": 150,
    "potentialNewSqft": <number>,
    "estimatedBuildCost": <number>,
    "estimatedNewARV": <number>,
    "worthConsidering": <boolean>,
    "notes": "<brief note on new construction potential>"
  },
  
  "riskFlags": [
    {"flag": "<risk name>", "severity": "<HIGH|MEDIUM|LOW>", "detail": "<explanation>"}
  ],
  
  "marketAnalysis": {
    "neighborhood": "<assessment>",
    "trend": "<IMPROVING|STABLE|DECLINING>",
    "daysOnMarket": "<typical DOM in this market>",
    "notes": "<market context>"
  },
  
  "wholesalerCredibility": {
    "assessment": "<TRUSTED|UNKNOWN|QUESTIONABLE>",
    "arvAccuracy": "<TYPICALLY ACCURATE|INFLATED|UNKNOWN>",
    "notes": "<Urban's read on this wholesaler>"
  },
  
  "recommendation": "<Urban's full recommendation paragraph — be direct, be specific, tell Caleb and Grant exactly what Urban thinks and why>",
  
  "offerStrategy": "<if worth pursuing, exactly how Urban would approach this deal — offer price, terms, contingencies>",
  
  "urbanNotes": "<anything else Urban wants Caleb and Grant to know>"
}`;

  const model = deep
    ? 'claude-sonnet-4-20250514'
    : 'claude-haiku-4-5-20251001';
  console.log(`Underwriting with ${model} (deep=${deep})`);
  const res = await getAnthropic().messages.create({
    model,
    max_tokens: deep ? 4000 : 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const text = res.content[0].text.trim()
      .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    const underwrite = JSON.parse(text);
    underwrite.uid = uid;
    underwrite.deal = deal;
    underwrite.comps = comps;
    underwrite.underwroteAt = new Date().toISOString();
    underwrite.chatHistory = [];

    underwrites[uid] = underwrite;
    saveJSON(UNDERWRITES_FILE, underwrites);
    return underwrite;
  } catch (e) {
    console.error('Underwrite parse error:', e.message);
    throw e;
  }
}

// ── PUBLIC HEALTH CHECK (no auth needed for Railway) ─────────────────────────
app.get('/health', (req, res) => res.json({ status: 'Urban is alive', ts: new Date().toISOString() }));
app.get('/', (req, res, next) => {
  // If requesting HTML, serve the app; otherwise health check
  if (req.headers.accept?.includes('text/html')) return next();
  res.json({ status: 'Urban the Underwriter — online' });
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers['x-urban-token'] || req.query.token;
  if (token === PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── API ROUTES ────────────────────────────────────────────────────────────────

// Get all deals from Derek's sheet
app.get('/api/deals', auth, async (req, res) => {
  try {
    const deals = await getDealsFromSheet();
    // Attach underwrite status to each deal
    const withStatus = deals.map(d => {
      const uid = d.uid || `${d.address}-${d.dateReceived}`;
      const uw = underwrites[uid];
      return {
        ...d,
        underwriteStatus: uw ? uw.verdict : 'PENDING',
        underwriteScore: uw ? uw.score : null,
        underwroteAt: uw ? uw.underwroteAt : null
      };
    });
    res.json(withStatus);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Underwrite a specific deal
app.post('/api/underwrite/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { forceRefresh, deep } = req.body;
    const deals = await getDealsFromSheet();
    const deal = deals.find(d => (d.uid || `${d.address}-${d.dateReceived}`) === uid);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendStatus = (msg) => res.write(`data: ${JSON.stringify({ status: msg })}\n\n`);

    sendStatus('Pulling comps from web...');
    const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    sendStatus(`Found ${comps.length} comparable sales`);

    sendStatus('Urban is analyzing this deal...');
    const underwrite = await underwriteDeal(deal, comps, forceRefresh, deep);

    res.write(`data: ${JSON.stringify({ done: true, underwrite })}\n\n`);
    res.end();
  } catch (e) {
    console.error(e);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

// Get a specific underwrite
app.get('/api/underwrite/:uid', auth, async (req, res) => {
  const uw = underwrites[req.params.uid];
  if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });
  res.json(uw);
});

// Chat with Urban about a deal
app.post('/api/chat/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { message, author } = req.body; // author: 'caleb' or 'grant'
    const uw = underwrites[uid];
    if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });

    const chatHistory = uw.chatHistory || [];
    chatHistory.push({ role: 'user', content: `${author?.toUpperCase() || 'USER'}: ${message}`, timestamp: new Date().toISOString() });

    const historyText = chatHistory.slice(-10).map(h => `${h.role === 'user' ? h.content : 'URBAN: ' + h.content}`).join('\n');

    const systemPrompt = `You are Urban, Coralstone Capital Group's underwriter. You already underwrote this deal:

DEAL: ${uw.deal.address}, ${uw.deal.city} | Asking: $${parseInt(uw.deal.askingPrice).toLocaleString()} | Your ARV: $${uw.arv?.urbanARV?.toLocaleString()} | Verdict: ${uw.verdict} (${uw.score}/10)

Your analysis: Net profit at asking = $${uw.financials?.netProfitAtAsking?.toLocaleString()} | MAO = $${uw.financials?.mao?.toLocaleString()}

Caleb and Grant can correct your numbers and you should re-calculate immediately. If they give you new information (better comps, actual repair costs, corrected ARV), update your analysis and explain what changed and why.

When they correct a number:
1. Acknowledge the correction
2. Re-calculate all affected figures
3. State the new verdict if it changed
4. Extract a lesson for your brain

Be direct. Be specific. Be the best underwriter they've ever worked with.`;

    const res2 = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${historyText}\n\n${author?.toUpperCase() || 'USER'}: ${message}` }]
    });

    const reply = res2.content[0].text;
    chatHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    uw.chatHistory = chatHistory;

    // Extract and save lessons
    if (message.toLowerCase().includes('actually') || message.toLowerCase().includes('correction') || message.toLowerCase().includes('wrong') || message.toLowerCase().includes('update')) {
      urbanBrain.lessons.push(`[${new Date().toLocaleDateString()} - ${uw.deal.city}] ${message.slice(0, 200)}`);
      urbanBrain.correctionHistory.push({
        date: new Date().toISOString(),
        deal: uw.deal.address,
        correction: message,
        author: author || 'unknown'
      });
      urbanBrain.lastUpdated = new Date().toISOString();
      saveJSON(BRAIN_FILE, urbanBrain);
    }

    underwrites[uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);

    res.json({ reply, chatHistory });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Override specific numbers
app.post('/api/override/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { field, value, author } = req.body;
    const uw = underwrites[uid];
    if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });

    // Apply override
    const overrides = uw.overrides || {};
    overrides[field] = { value, author, timestamp: new Date().toISOString() };
    uw.overrides = overrides;

    // Re-calculate financials with new numbers
    if (field === 'urbanARV') {
      uw.arv.urbanARV = parseFloat(value);
      uw.arv.overridden = true;
    } else if (field === 'rehab') {
      uw.rehab.urbanEstimate = parseFloat(value);
      uw.rehab.overridden = true;
    }

    // Recalculate MAO and financials
    const arv = uw.arv.urbanARV;
    const repairs = uw.rehab.urbanEstimate;
    const asking = uw.deal.askingPrice;
    uw.financials.mao = Math.round(arv * 0.7 - repairs);
    uw.financials.overUnderMAO = Math.round(asking - uw.financials.mao);
    const totalCost = asking + repairs + (uw.financials.holdingCosts?.total || 0) + (uw.financials.sellingCosts?.total || 0) + (uw.financials.hardMoney?.totalInterest || 0);
    uw.financials.netProfitAtAsking = Math.round(arv - totalCost);
    uw.financials.meetsMinimumProfit = uw.financials.netProfitAtAsking >= 40000;

    // Save lesson
    urbanBrain.lessons.push(`[Override on ${uw.deal.address}] ${author} corrected ${field} to ${value}`);
    saveJSON(BRAIN_FILE, urbanBrain);

    underwrites[uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);
    res.json(uw);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Urban's brain
app.get('/api/brain', auth, (req, res) => res.json(urbanBrain));

// Test endpoint — runs full pipeline without auth for debugging
app.get('/api/test', async (req, res) => {
  try {
    const deals = await getDealsFromSheet();
    if (!deals.length) return res.json({ error: 'No deals in sheet' });
    const deal = deals[0];
    const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    const uw = await underwriteDeal(deal, comps, true);
    res.json({ 
      success: true, 
      deal: deal.address,
      verdict: uw.verdict,
      score: uw.score,
      urbanARV: uw.arv?.urbanARV,
      wholesalerARV: uw.arv?.wholesalerARV,
      netProfit: uw.financials?.netProfitAtAsking,
      mao: uw.financials?.mao,
      recommendation: uw.recommendation?.substring(0, 200)
    });
  } catch(e) {
    res.status(500).json({ error: e.message, stack: e.stack?.substring(0, 500) });
  }
});

// Stats
app.get('/api/stats', auth, (req, res) => {
  const all = Object.values(underwrites);
  const verdicts = {};
  all.forEach(u => { verdicts[u.verdict] = (verdicts[u.verdict] || 0) + 1; });
  res.json({
    totalUnderwritten: all.length,
    verdicts,
    avgScore: all.length ? (all.reduce((s, u) => s + (u.score || 0), 0) / all.length).toFixed(1) : 0,
    lessonsLearned: urbanBrain.lessons.length,
    corrections: urbanBrain.correctionHistory.length
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🏙️ Urban running on port ${PORT}`));
