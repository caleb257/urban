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
  wholesalerStats: {},
  marketNotes: {},
  correctionHistory: [],
  lastUpdated: null,
  totalUnderwritten: 0,
  hotDeals: 0,
  passedDeals: 0
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
    ['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

// ── SHEET-BACKED BRAIN ───────────────────────────────────────────────────────
const BRAIN_TAB = 'Urban Brain';
const UW_LOG_TAB = 'Urban Underwrites';

async function loadBrainFromSheet() {
  try {
    const s = getSheets();
    const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!B2` });
    const val = res.data.values?.[0]?.[0];
    if (val) {
      urbanBrain = { ...urbanBrain, ...JSON.parse(val) };
      console.log(`🧠 Brain loaded: ${urbanBrain.totalUnderwritten || 0} deals`);
    }
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) initBrainTab().catch(()=>{});
    else console.log('Brain load:', e.message);
  }
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
async function getDealsFromSheet() {
  const s = getSheets();
  const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Active Deals!A1:CV300' });
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
    };
  });
}

// ── COMP ENGINE ───────────────────────────────────────────────────────────────
async function fetchComps(address, city, state, zip) {
  const comps = [];
  comps._meta = { arvEstimate: null };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search Zillow and Redfin for recently SOLD homes near: ${address}, ${city}, ${state} ${zip}. Find 3-5 sold comps from last 6 months within 1 mile. Also find the Zestimate for this exact address. Return ONLY a JSON array, no markdown backticks:\n[{"address":"123 Oak","sqft":1400,"beds":3,"baths":2,"salePrice":248000,"saleDate":"2025-03","distanceMiles":0.3,"source":"zillow"}]`
        }]
      })
    });
    const data = await res.json();
    if (data.error) { console.log('Comp API error:', data.error.message); return comps; }
    const tb = data.content?.find(c => c.type === 'text');
    if (!tb) return comps;
    const raw = tb.text.trim();
    const f = raw.indexOf('['), l = raw.lastIndexOf(']');
    if (f === -1 || l === -1) return comps;
    const parsed = JSON.parse(raw.slice(f, l + 1));
    parsed.forEach(c => comps.push(c));
    const prices = parsed.map(c => c.salePrice).filter(Boolean);
    if (prices.length) {
      comps._meta.arvEstimate = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
      console.log(`Comps: ${parsed.length} found → avg $${comps._meta.arvEstimate?.toLocaleString()}`);
    }
  } catch(e) { console.log('Comp error:', e.message); }
  return comps;
}

// ── BRAIN CONTEXT ─────────────────────────────────────────────────────────────
function getBrainContext(wholesalerEmail, county) {
  const lessons = urbanBrain.lessons.slice(-25).map(l => `- ${l}`).join('\n');
  const wNotes = urbanBrain.wholesalerNotes[wholesalerEmail] || 'First time seeing this wholesaler';
  const ws = urbanBrain.wholesalerStats[wholesalerEmail];
  const wStats = ws
    ? `${ws.deals} prior deals | avg ARV inflation: ${ws.avgARVInflation}% | past verdicts: ${JSON.stringify(ws.verdicts)}`
    : 'No prior deals from this wholesaler';
  const mn = urbanBrain.marketNotes[county];
  const marketCtx = mn && mn.deals > 2
    ? `${county}: ${mn.deals} deals | avg Urban ARV: $${mn.avgARV?.toLocaleString()}`
    : `${county}: limited data`;
  return { lessons, wholesalerNotes: wNotes, wholesalerStats: wStats, marketContext: marketCtx };
}

// ── UNDERWRITE ENGINE ─────────────────────────────────────────────────────────
async function underwriteDeal(deal, comps, forceRefresh = false, deep = false) {
  const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
  if (underwrites[uid] && !forceRefresh) return underwrites[uid];

  const brain = getBrainContext(deal.contact1Email, deal.county || deal.city);
  const sqft = parseFloat(deal.sqft) || 0;
  const askingPrice = parseFloat(deal.askingPrice) || 0;
  const wholesalerARV = parseFloat(deal.wholesalerARV) || 0;
  const wholesalerRepairs = parseFloat(deal.repairsEstimate) || 0;
  const annualTaxes = parseFloat(deal.annualTaxes) || 0;
  const hoaFee = parseFloat(deal.hoaFee) || 0;

  const meta = comps._meta || {};
  const arvLine = meta.arvEstimate
    ? `WEB DATA ARV: $${meta.arvEstimate.toLocaleString()} (avg of ${comps.length} comps/estimates found)`
    : 'No comp data retrieved — estimate from market knowledge and deal data';
  const compsText = comps.length > 0
    ? arvLine + '\n' + comps.map(c => `- ${c.address}: $${c.salePrice?.toLocaleString()} sold ${c.saleDate} (${c.source})`).join('\n')
    : arvLine;

  const prompt = `You are Urban, elite real estate underwriter for Coralstone Capital Group, Tampa Bay FL. 20+ years fix-and-flip experience in Pasco, Hillsborough, Polk, Pinellas, Hernando counties.

CORALSTONE CRITERIA:
- Hard money: 9.5% interest only, 90% LTV
- MAO = ARV × 70% - Repairs
- Minimum net profit: $40,000
- Markets: Pasco, Hillsborough, Polk, Pinellas, Hernando (within ~1hr Tampa)
- Full rehab: 5 month hold. Light cosmetic: 4 months.
- Wholesaler ARVs are usually INFLATED. Be skeptical. Find the TRUE ARV.
- If wholesaler ARV seems LOW, note the upside.

URBAN BRAIN — LESSONS (last 25):
${brain.lessons || 'No lessons yet'}

WHOLESALER INTEL:
${brain.wholesalerNotes}
${brain.wholesalerStats}

MARKET CONTEXT: ${brain.marketContext}
LIFETIME: ${urbanBrain.totalUnderwritten || 0} deals | ${urbanBrain.hotDeals || 0} HOT | ${urbanBrain.passedDeals || 0} passed

DEAL:
Address: ${deal.address}, ${deal.city}, ${deal.state} ${deal.zip} | County: ${deal.county}
Type: ${deal.propertyType} | Beds/Baths: ${deal.beds}/${deal.baths} | Sqft: ${sqft} | Year: ${deal.yearBuilt}
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

WHOLESALER NUMBERS:
Asking: $${askingPrice.toLocaleString()} | Their ARV: $${wholesalerARV.toLocaleString()}
Repairs: ${wholesalerRepairs ? '$'+wholesalerRepairs.toLocaleString() : 'NOT PROVIDED'}
Taxes: $${annualTaxes.toLocaleString()}/yr | Close: ${deal.closeDate} | EMD: ${deal.earnestMoney}

COMPS:
${compsText}

Respond ONLY with a JSON object (no markdown, no backticks, just raw JSON):
{
  "score": <1-10>,
  "verdict": "<HOT|BUY|REVIEW|PASS|HARD NO>",
  "verdictReason": "<one punchy sentence>",
  "arv": {
    "wholesalerARV": <number>,
    "urbanARV": <number>,
    "arvConfidence": "<HIGH|MEDIUM|LOW>",
    "arvNotes": "<specific reasoning>",
    "compsUsed": ["<addresses>"]
  },
  "rehab": {
    "wholesalerEstimate": <number or null>,
    "urbanEstimate": <number>,
    "urbanEstimateRange": {"low": <number>, "high": <number>},
    "confidence": "<HIGH|MEDIUM|LOW>",
    "missingInfo": "<what would help>",
    "lineItems": {"roof":<n>,"hvac":<n>,"plumbing":<n>,"electrical":<n>,"kitchen":<n>,"bathrooms":<n>,"flooring":<n>,"windows":<n>,"paint":<n>,"landscaping":<n>,"contingency":<n>,"other":<n>},
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
    "meetsMinimumProfit": <boolean>
  },
  "rental": {
    "marketRent": <number>,
    "grossYield": <number>,
    "netYield": <number>,
    "cashFlow": <number>,
    "capRate": <number>,
    "worthConsidering": <boolean>,
    "notes": "<rental take>"
  },
  "newConstruction": {
    "lotValue": <number or null>,
    "buildCostPerSqft": 150,
    "potentialNewSqft": <number>,
    "estimatedBuildCost": <number>,
    "estimatedNewARV": <number>,
    "worthConsidering": <boolean>,
    "notes": "<new construction note>"
  },
  "riskFlags": [{"flag":"<name>","severity":"<HIGH|MEDIUM|LOW>","detail":"<explanation>"}],
  "marketAnalysis": {"neighborhood":"<assessment>","trend":"<IMPROVING|STABLE|DECLINING>","daysOnMarket":"<typical DOM>","notes":"<context>"},
  "wholesalerCredibility": {"assessment":"<TRUSTED|UNKNOWN|QUESTIONABLE>","arvAccuracy":"<TYPICALLY ACCURATE|INFLATED|UNKNOWN>","notes":"<read>"},
  "recommendation": "<full direct recommendation — tell Caleb and Grant exactly what Urban thinks>",
  "offerStrategy": "<if worth pursuing: exact offer price, terms, contingencies>",
  "urbanNotes": "<anything else>"
}`;

  const model = deep ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  console.log(`Underwriting ${deal.address} with ${model}`);

  const res = await getAnthropic().messages.create({
    model, max_tokens: deep ? 4000 : 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = res.content[0].text.trim();
  const f = raw.indexOf('{'), l = raw.lastIndexOf('}');
  if (f === -1 || l === -1) throw new Error('No JSON in response');
  const underwrite = JSON.parse(raw.slice(f, l + 1));

  underwrite.uid = uid;
  underwrite.deal = deal;
  underwrite.comps = comps;
  underwrite.underwroteAt = new Date().toISOString();
  underwrite.chatHistory = underwrite.chatHistory || [];
  underwrite.model = model;

  underwrites[uid] = underwrite;
  saveJSON(UNDERWRITES_FILE, underwrites);

  // Learn from this underwrite
  try {
    urbanBrain.totalUnderwritten = (urbanBrain.totalUnderwritten || 0) + 1;
    if (underwrite.verdict === 'HOT') urbanBrain.hotDeals = (urbanBrain.hotDeals || 0) + 1;
    if (['PASS','HARD NO'].includes(underwrite.verdict)) urbanBrain.passedDeals = (urbanBrain.passedDeals || 0) + 1;

    const email = deal.contact1Email || 'unknown';
    if (!urbanBrain.wholesalerStats[email]) {
      urbanBrain.wholesalerStats[email] = { name: deal.contact1Name || '', company: deal.wholesalerCompany || '', deals: 0, avgARVInflation: 0, arvSamples: [], verdicts: {} };
    }
    const ws = urbanBrain.wholesalerStats[email];
    ws.deals++;
    ws.verdicts[underwrite.verdict] = (ws.verdicts[underwrite.verdict] || 0) + 1;
    if (underwrite.arv?.wholesalerARV && underwrite.arv?.urbanARV && underwrite.arv.wholesalerARV > 0) {
      const inf = ((underwrite.arv.wholesalerARV - underwrite.arv.urbanARV) / underwrite.arv.urbanARV * 100).toFixed(1);
      ws.arvSamples.push(parseFloat(inf));
      if (ws.arvSamples.length > 20) ws.arvSamples.shift();
      ws.avgARVInflation = (ws.arvSamples.reduce((a,b)=>a+b,0)/ws.arvSamples.length).toFixed(1);
    }
    urbanBrain.wholesalerNotes[email] = `${ws.name} (${ws.company}) | ${ws.deals} deals | avg ARV inflation: ${ws.avgARVInflation}% | verdicts: ${JSON.stringify(ws.verdicts)}`;

    const lesson = `${underwrite.verdict} | ${deal.address}, ${deal.city} | Ask $${deal.askingPrice?.toLocaleString()} | Urban ARV $${underwrite.arv?.urbanARV?.toLocaleString()} | Net profit $${underwrite.financials?.netProfitAtAsking?.toLocaleString()} | ${underwrite.verdictReason}`;
    urbanBrain.lessons.push(`[${new Date().toLocaleDateString()}] ${lesson}`);
    if (urbanBrain.lessons.length > 100) urbanBrain.lessons.shift();

    const ck = deal.county || deal.city;
    if (!urbanBrain.marketNotes[ck]) urbanBrain.marketNotes[ck] = { deals: 0, avgARV: 0, arvSamples: [] };
    const mn = urbanBrain.marketNotes[ck];
    mn.deals++;
    if (underwrite.arv?.urbanARV) {
      mn.arvSamples.push(underwrite.arv.urbanARV);
      if (mn.arvSamples.length > 50) mn.arvSamples.shift();
      mn.avgARV = Math.round(mn.arvSamples.reduce((a,b)=>a+b,0)/mn.arvSamples.length);
    }

    urbanBrain.lastUpdated = new Date().toISOString();
    saveJSON(BRAIN_FILE, urbanBrain);
    saveBrainToSheet().catch(e => console.log('Sheet brain save:', e.message));
    logUnderwriteToSheet(underwrite).catch(e => console.log('UW log:', e.message));
    console.log(`🧠 Learned: ${underwrite.verdict} | ${ws.deals} deals from this wholesaler`);
  } catch(e) { console.log('Brain update error:', e.message); }

  return underwrite;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers['x-urban-token'] || req.query.token;
  if (token === PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'online', ts: new Date().toISOString() }));

app.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('text/html')) return next();
  res.json({ status: 'Urban the Underwriter — online' });
});

// Get deals with underwrite status attached
app.get('/api/deals', auth, async (req, res) => {
  try {
    const deals = await getDealsFromSheet();
    const out = deals.map(d => {
      const uid = d.uid || `${d.address}-${d.dateReceived}`;
      const uw = underwrites[uid];
      return { ...d, underwriteStatus: uw ? uw.verdict : 'PENDING', underwriteScore: uw ? uw.score : null, underwroteAt: uw ? uw.underwroteAt : null };
    });
    res.json(out);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get single underwrite
app.get('/api/underwrite/:uid', auth, (req, res) => {
  const uw = underwrites[req.params.uid];
  if (!uw) return res.status(404).json({ error: 'Not underwritten yet' });
  res.json(uw);
});

// Underwrite by uid (manual trigger from UI)
app.post('/api/underwrite/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { forceRefresh, deep } = req.body;

    const deals = await getDealsFromSheet();
    const deal = deals.find(d => (d.uid || `${d.address}-${d.dateReceived}`) === uid);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const send = msg => res.write(`data: ${JSON.stringify(msg)}\n\n`);

    send({ status: 'Fetching comps...' });
    const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    send({ status: `Got ${comps.length} comps — Urban is analyzing...` });

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

    // Skip if already underwritten (only underwrite once per deal)
    const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
    if (underwrites[uid] && !deep) {
      console.log(`Already underwritten: ${deal.address}`);
      return res.json({ skipped: true, verdict: underwrites[uid].verdict });
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const send = msg => res.write(`data: ${JSON.stringify(msg)}\n\n`);

    send({ status: `Fetching comps for ${deal.address}...` });
    const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    send({ status: `Got ${comps.length} comps — underwriting...` });

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
    let uw = underwrites[uid];
    if (!uw) {
      const deals = await getDealsFromSheet();
      const deal = deals.find(d => (d.uid || `${d.address}-${d.dateReceived}`) === uid);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
      const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
      uw = await underwriteDeal(deal, comps, false, false);
    }

    const chatHistory = uw.chatHistory || [];
    chatHistory.push({ role: 'user', content: `${(author||'USER').toUpperCase()}: ${message}`, timestamp: new Date().toISOString() });

    const ws = urbanBrain.wholesalerStats[uw.deal.contact1Email || ''];
    const wHistory = ws ? `${ws.deals} prior deals, avg ARV inflation ${ws.avgARVInflation}%` : 'first deal from this wholesaler';

    const systemPrompt = `You are Urban, Coralstone Capital Group's real estate underwriter for Tampa Bay. You report to Caleb and Grant.

DEAL YOU UNDERWROTE:
${uw.deal.address}, ${uw.deal.city} FL | ${uw.deal.beds}/${uw.deal.baths}bd/ba | ${uw.deal.sqft} sqft | ${uw.deal.yearBuilt}
Asking: $${parseInt(uw.deal.askingPrice||0).toLocaleString()} | Your ARV: $${uw.arv?.urbanARV?.toLocaleString()} | Wholesaler ARV: $${uw.arv?.wholesalerARV?.toLocaleString()}
Rehab: $${uw.rehab?.urbanEstimate?.toLocaleString()} (${uw.rehab?.scopeLevel})
MAO: $${uw.financials?.mao?.toLocaleString()} | Net Profit @ Asking: $${uw.financials?.netProfitAtAsking?.toLocaleString()}
Verdict: ${uw.verdict} (${uw.score}/10) — ${uw.verdictReason}
Wholesaler: ${uw.deal.wholesalerCompany||'Unknown'} | ${wHistory}

RECENT LESSONS:
${urbanBrain.lessons.slice(-8).map(l=>`• ${l}`).join('\n') || 'None yet'}

YOUR ROLE:
- Answer deal questions directly and specifically
- If given corrected numbers (better comps, actual repairs, real ARV), immediately recalculate MAO, profit, verdict — show the math
- Be concise. No fluff.
- End corrections with: "Updated verdict: [VERDICT] ([score]/10)"
- Note learnings with: "🧠 Noted: [lesson]"`;

    const historyForAPI = chatHistory.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }));

    const r2 = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: historyForAPI
    });

    const reply = r2.content[0].text;
    chatHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    uw.chatHistory = chatHistory;

    // Save corrections to brain
    const correctionWords = ['actually','wrong','arv is','arv should','repairs are','repairs should','sold for','comp at','i got a comp','correction','update','change'];
    if (correctionWords.some(w => message.toLowerCase().includes(w))) {
      urbanBrain.lessons.push(`[${new Date().toLocaleDateString()} CORRECTION on ${uw.deal.address}] ${message.slice(0,250)}`);
      if (urbanBrain.lessons.length > 100) urbanBrain.lessons.shift();
      urbanBrain.correctionHistory.push({ date: new Date().toISOString(), deal: uw.deal.address, correction: message, author: author||'unknown' });
      urbanBrain.lastUpdated = new Date().toISOString();
      saveJSON(BRAIN_FILE, urbanBrain);
      saveBrainToSheet().catch(()=>{});
    }

    underwrites[uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);
    res.json({ reply, chatHistory });
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
    const arv = uw.arv.urbanARV, repairs = uw.rehab.urbanEstimate, asking = parseFloat(uw.deal.askingPrice);
    uw.financials.mao = Math.round(arv * 0.7 - repairs);
    uw.financials.overUnderMAO = Math.round(asking - uw.financials.mao);
    uw.financials.netProfitAtAsking = Math.round(arv - asking - repairs - (uw.financials.holdingCosts?.total||0) - (uw.financials.sellingCosts?.total||0) - (uw.financials.hardMoney?.totalInterest||0) - (uw.financials.hardMoney?.originationPoints||0));
    uw.financials.meetsMinimumProfit = uw.financials.netProfitAtAsking >= 40000;
    urbanBrain.lessons.push(`[Override: ${author||'user'} changed ${field} to ${value} on ${uw.deal.address}]`);
    saveJSON(BRAIN_FILE, urbanBrain);
    underwrites[req.params.uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);
    res.json(uw);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Stats
app.get('/api/stats', auth, (req, res) => {
  const all = Object.values(underwrites);
  const verdicts = {};
  all.forEach(u => { verdicts[u.verdict] = (verdicts[u.verdict]||0) + 1; });
  res.json({
    totalUnderwritten: all.length, verdicts,
    avgScore: all.length ? (all.reduce((s,u)=>s+(u.score||0),0)/all.length).toFixed(1) : 0,
    lessonsLearned: urbanBrain.lessons.length,
    corrections: urbanBrain.correctionHistory.length
  });
});

// Brain
app.get('/api/brain', auth, (req, res) => res.json(urbanBrain));

const PORT = process.env.PORT || 3001;
// Load brain from sheet on boot
loadBrainFromSheet().catch(e => console.log('Brain boot load:', e.message));
app.listen(PORT, () => console.log(`🏙️ Urban on port ${PORT}`));
