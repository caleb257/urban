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
  lessons: [],                // General lessons from past underwrites
  wholesalerNotes: {},        // Per-wholesaler email notes
  wholesalerStats: {},        // Per-wholesaler accuracy stats
  marketNotes: {},            // Per-city/county market observations
  correctionHistory: [],      // When Urban was corrected by Caleb/Grant
  dealOutcomes: {},           // Actual outcomes (bought/passed/flipped) if logged
  arvAccuracy: [],            // Tracking Urban ARV vs actual sale price over time
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

// ── SHEET-BACKED BRAIN PERSISTENCE ──────────────────────────────────────────
// Uses "Urban Brain" tab in Derek's sheet as permanent memory
// Schema: row 1 = headers, row 2 = single JSON blob of brain state
// Also: "Urban Underwrites" tab stores every underwrite summary

const BRAIN_TAB = "Urban Brain";
const UW_LOG_TAB = "Urban Underwrites";

async function loadBrainFromSheet() {
  try {
    const s = getSheets();
    const res = await s.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${BRAIN_TAB}!B2`
    });
    const val = res.data.values?.[0]?.[0];
    if (val) {
      const loaded = JSON.parse(val);
      // Merge with defaults so new fields don't break old brains
      urbanBrain = { ...urbanBrain, ...loaded };
      console.log(`🧠 Brain loaded from sheet: ${urbanBrain.totalUnderwritten || 0} deals in memory`);
    } else {
      console.log('🧠 No brain data in sheet yet — starting fresh');
    }
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) {
      await initBrainTab();
    } else {
      console.log('Brain load failed:', e.message);
    }
  }
}

async function saveBrainToSheet() {
  try {
    const s = getSheets();
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${BRAIN_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [
        ['last_updated', 'brain_json'],
        [new Date().toISOString(), JSON.stringify(urbanBrain)]
      ]}
    });
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) {
      await initBrainTab();
      await saveBrainToSheet();
    } else {
      console.log('Brain save failed:', e.message);
    }
  }
}

async function initBrainTab() {
  try {
    const s = getSheets();
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: BRAIN_TAB } } }] }
    });
    console.log(`✅ Created ${BRAIN_TAB} tab`);
  } catch(e) {
    if (!e.message?.includes('already exists')) console.log('initBrainTab:', e.message);
  }
}

async function logUnderwriteToSheet(uw) {
  try {
    const s = getSheets();
    const row = [
      uw.underwroteAt,
      uw.deal?.address,
      uw.deal?.city,
      uw.deal?.state,
      uw.deal?.askingPrice,
      uw.arv?.urbanARV,
      uw.arv?.wholesalerARV,
      uw.financials?.netProfitAtAsking,
      uw.financials?.mao,
      uw.rehab?.urbanEstimate,
      uw.verdict,
      uw.score,
      uw.verdictReason,
      uw.model || 'haiku',
      uw.deal?.contact1Email || uw.deal?.wholesalerEmail || '',
      uw.deal?.wholesalerCompany || ''
    ];
    await s.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${UW_LOG_TAB}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch(e) {
    if (e.message?.includes('Unable to parse range')) {
      await initUWLogTab();
      await logUnderwriteToSheet(uw);
    }
  }
}

async function initUWLogTab() {
  try {
    const s = getSheets();
    await s.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: UW_LOG_TAB } } }] }
    });
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${UW_LOG_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[
        'Date','Address','City','State','Asking','Urban ARV','Wholesaler ARV',
        'Net Profit','MAO','Rehab Est','Verdict','Score','Reason','Model','Wholesaler Email','Company'
      ]]}
    });
    console.log(`✅ Created ${UW_LOG_TAB} tab`);
  } catch(e) {
    if (!e.message?.includes('already exists')) console.log('initUWLogTab:', e.message);
  }
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
      listName: get('List Name'),
      daysActive: get('Days Active'),
      emailSubject: get('Email Subject'),
      // Missing fields now added
      subdivision: get('Subdivision'),
      halfBaths: get('Half Baths'),
      lotSqft: get('Lot Sqft'),
      stories: get('Stories'),
      poolNotes: get('Pool Notes'),
      garage: get('Garage'),
      garageSpaces: get('Garage Spaces'),
      carport: get('Carport'),
      basement: get('Basement'),
      attic: get('Attic'),
      assignmentFee: get('Assignment Fee'),
      contact1Title: get('Contact 1 Title'),
      contact1Phone2: get('Contact 1 Phone 2'),
      contact1Website: get('Contact 1 Website'),
      contact2Name: get('Contact 2 Name'),
      contact2Title: get('Contact 2 Title'),
      contact2Company: get('Contact 2 Company'),
      contact2Phone: get('Contact 2 Phone'),
      contact2Email: get('Contact 2 Email'),
      contact3Name: get('Contact 3 Name'),
      contact3Phone: get('Contact 3 Phone'),
      contact3Email: get('Contact 3 Email'),
      allNames: get('ALL Names Found'),
      sellerName: get('Seller Name'),
      sellerPhone: get('Seller Phone'),
      sellerSituation: get('Seller Situation'),
      sellerMotivation: get('Seller Motivation'),
      allOtherLinks: get('All Other Links'),
      photoCount: get('Photo Count'),
      photoLinks: get('Photo Links'),
      expires: get('Expires'),
    };
  });
}

// ── COMP ENGINE ──────────────────────────────────────────────────────────────
async function fetchComps(address, city, state, zip) {
  const comps = [];
  comps._meta = { arvEstimate: null };

  try {
    // Use Haiku + web_search to find real recently sold comps
    const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Search Zillow and Redfin for recently SOLD homes comparable to: ${address}, ${city}, ${state} ${zip}. Find 3-5 sold comps from last 6 months within 1 mile, similar beds/baths/sqft. Also find the current Zestimate or Redfin estimate for this exact address if available. Return ONLY valid JSON array, no markdown:
[{"address":"123 Oak St","sqft":1400,"beds":3,"baths":2,"salePrice":248000,"saleDate":"2025-03","distanceMiles":0.3,"source":"zillow"},{"address":"${address}","sqft":null,"beds":null,"baths":null,"salePrice":265000,"saleDate":"2025-05","distanceMiles":0,"source":"zestimate"}]`
        }]
      })
    });

    const data = await searchRes.json();
    if (data.error) {
      console.log('Comp search API error:', data.error.message);
      return comps;
    }

    const textBlock = data.content?.find(c => c.type === 'text');
    if (!textBlock) return comps;

    const raw = textBlock.text.trim();
    const first = raw.indexOf('[');
    const last = raw.lastIndexOf(']');
    if (first === -1 || last === -1) return comps;

    const parsed = JSON.parse(raw.slice(first, last + 1));
    parsed.forEach(c => comps.push(c));

    // Compute ARV estimate from comps (excluding the subject property estimate)
    const soldComps = parsed.filter(c => c.source !== 'zestimate' && c.source !== 'redfin_estimate' && c.salePrice);
    const estimates = parsed.filter(c => (c.source === 'zestimate' || c.source === 'redfin_estimate') && c.salePrice);
    
    const allPrices = [...soldComps.map(c => c.salePrice), ...estimates.map(c => c.salePrice)].filter(Boolean);
    if (allPrices.length > 0) {
      comps._meta.arvEstimate = Math.round(allPrices.reduce((a,b) => a+b, 0) / allPrices.length);
      console.log(`Comps found: ${soldComps.length} sold, ${estimates.length} estimates → ARV avg $${comps._meta.arvEstimate?.toLocaleString()}`);
    }

  } catch(e) {
    console.log('Comp search error:', e.message);
  }

  return comps;
}


// ── URBAN'S BRAIN CONTEXT ─────────────────────────────────────────────────────
function getBrainContext(wholesalerEmail, county) {
  const lessons = urbanBrain.lessons.slice(-25).map(l => `- ${l}`).join('\n');
  const wNotes = urbanBrain.wholesalerNotes[wholesalerEmail] || 'First time seeing this wholesaler';
  const ws = urbanBrain.wholesalerStats[wholesalerEmail];
  const wStats = ws
    ? `${ws.deals} prior deals | avg ARV inflation: ${ws.avgARVInflation}% | past verdicts: ${JSON.stringify(ws.verdicts)}`
    : 'No prior deals from this wholesaler';
  const mn = urbanBrain.marketNotes[county];
  const marketCtx = mn && mn.deals > 2
    ? `${county}: ${mn.deals} deals underwritten | avg Urban ARV: $${mn.avgARV?.toLocaleString()}`
    : `${county}: limited data`;
  return { lessons, wholesalerNotes: wNotes, wholesalerStats: wStats, marketContext: marketCtx };
}

// ── CORE UNDERWRITING ENGINE ──────────────────────────────────────────────────
async function underwriteDeal(deal, comps, forceRefresh = false, deep = false) {
  const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;

  // Return cached unless forced refresh
  if (underwrites[uid] && !forceRefresh) return underwrites[uid];

  const brain = getBrainContext(deal.contact1Email || deal.wholesalerEmail, deal.county || deal.city);
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

URBAN'S BRAIN — LESSONS LEARNED (last 25 deals):
${brain.lessons || 'No lessons yet — first underwrite'}

WHOLESALER INTELLIGENCE:
Notes: ${brain.wholesalerNotes}
Stats: ${brain.wholesalerStats}

MARKET CONTEXT (from past underwrites):
${brain.marketContext}

URBAN'S LIFETIME STATS: ${urbanBrain.totalUnderwritten || 0} deals underwritten | ${urbanBrain.hotDeals || 0} HOT | ${urbanBrain.passedDeals || 0} passed

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
    let raw = res.content[0].text.trim();
    // Extract JSON object — find first { and last }
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object found in response');
    const text = raw.slice(first, last + 1);
    const underwrite = JSON.parse(text);
    underwrite.uid = uid;
    underwrite.deal = deal;
    underwrite.comps = comps;
    underwrite.underwroteAt = new Date().toISOString();
    underwrite.chatHistory = [];
    underwrite.model = model;

    underwrites[uid] = underwrite;
    saveJSON(UNDERWRITES_FILE, underwrites);

    // ── AUTO-LEARN from this underwrite ─────────────────────────────────────
    try {
      // Update brain stats
      urbanBrain.totalUnderwritten = (urbanBrain.totalUnderwritten || 0) + 1;
      if (underwrite.verdict === 'HOT') urbanBrain.hotDeals = (urbanBrain.hotDeals || 0) + 1;
      if (['PASS', 'HARD NO'].includes(underwrite.verdict)) urbanBrain.passedDeals = (urbanBrain.passedDeals || 0) + 1;

      // Learn from wholesaler ARV accuracy
      const wholesalerEmail = deal.contact1Email || deal.wholesalerEmail || 'unknown';
      if (!urbanBrain.wholesalerStats[wholesalerEmail]) {
        urbanBrain.wholesalerStats[wholesalerEmail] = {
          name: deal.contact1Name || deal.wholesalerCompany || 'Unknown',
          company: deal.wholesalerCompany || '',
          deals: 0, avgARVInflation: 0, arvSamples: [], verdicts: {}
        };
      }
      const ws = urbanBrain.wholesalerStats[wholesalerEmail];
      ws.deals++;
      ws.verdicts[underwrite.verdict] = (ws.verdicts[underwrite.verdict] || 0) + 1;
      if (underwrite.arv?.wholesalerARV && underwrite.arv?.urbanARV && underwrite.arv.wholesalerARV > 0) {
        const inflation = ((underwrite.arv.wholesalerARV - underwrite.arv.urbanARV) / underwrite.arv.urbanARV * 100).toFixed(1);
        ws.arvSamples.push(parseFloat(inflation));
        if (ws.arvSamples.length > 20) ws.arvSamples.shift(); // keep last 20
        ws.avgARVInflation = (ws.arvSamples.reduce((a,b)=>a+b,0) / ws.arvSamples.length).toFixed(1);
      }
      // Update wholesalerNotes with stats summary
      urbanBrain.wholesalerNotes[wholesalerEmail] =
        `${ws.name} (${ws.company}) | ${ws.deals} deals | avg ARV inflation: ${ws.avgARVInflation}% | verdicts: ${JSON.stringify(ws.verdicts)}`;

      // Auto-generate a lesson from this deal
      const lesson = `${underwrite.verdict} | ${deal.address}, ${deal.city} | Ask $${deal.askingPrice?.toLocaleString()} | Urban ARV $${underwrite.arv?.urbanARV?.toLocaleString()} | Net profit $${underwrite.financials?.netProfitAtAsking?.toLocaleString()} | ${underwrite.verdictReason}`;
      urbanBrain.lessons.push(`[${new Date().toLocaleDateString()}] ${lesson}`);
      if (urbanBrain.lessons.length > 100) urbanBrain.lessons.shift(); // keep last 100

      // Market notes
      const countyKey = deal.county || deal.city;
      if (!urbanBrain.marketNotes[countyKey]) urbanBrain.marketNotes[countyKey] = { deals: 0, avgARV: 0, arvSamples: [] };
      const mn = urbanBrain.marketNotes[countyKey];
      mn.deals++;
      if (underwrite.arv?.urbanARV) {
        mn.arvSamples.push(underwrite.arv.urbanARV);
        if (mn.arvSamples.length > 50) mn.arvSamples.shift();
        mn.avgARV = Math.round(mn.arvSamples.reduce((a,b)=>a+b,0) / mn.arvSamples.length);
      }

      urbanBrain.lastUpdated = new Date().toISOString();
      saveJSON(BRAIN_FILE, urbanBrain);
      saveBrainToSheet().catch(e => console.log('Sheet brain save:', e.message)); // local cache
      saveBrainToSheet().catch(e => console.log('Sheet brain save:', e.message)); // persistent
      logUnderwriteToSheet(underwrite).catch(e => console.log('UW log:', e.message)); // log row
      console.log(`🧠 Urban learned: ${underwrite.verdict} | ${ws.deals} deals from this wholesaler | avg ARV inflation ${ws.avgARVInflation}%`);
    } catch(e) {
      console.log('Brain update failed:', e.message);
    }
    // ────────────────────────────────────────────────────────────────────────

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
// Underwrite by address — used by Derek for auto-underwrite on new deals
app.post('/api/underwrite-by-address/:address', auth, async (req, res) => {
  try {
    const address = decodeURIComponent(req.params.address).toLowerCase().trim();
    const { deep } = req.body;
    const deals = await getDealsFromSheet();
    const deal = deals.find(d => (d.address || '').toLowerCase().trim() === address ||
                                  (d.address || '').toLowerCase().includes(address.split(' ')[0]));
    if (!deal) {
      console.log(`Auto-underwrite: no deal found for address "${address}"`);
      return res.status(404).json({ error: 'Deal not found by address' });
    }
    const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
    console.log(`🏙️ Auto-underwriting: ${deal.address} (uid: ${uid})`);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const sendStatus = (msg) => res.write(`data: ${JSON.stringify({ status: msg })}\n\n`);

    sendStatus(`Pulling comps for ${deal.address}...`);
    const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    sendStatus(`Got ${comps.length} data points — underwriting...`);

    const underwrite = await underwriteDeal(deal, comps, false, deep || false);
    res.write(`data: ${JSON.stringify({ done: true, underwrite })}\n\n`);
    res.end();
  } catch(e) {
    console.error('Auto-underwrite error:', e.message);
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    res.end();
  }
});

app.post('/api/underwrite/:uid', auth, async (req, res) => {
  try {
    const { uid } = req.params;
    const { forceRefresh, deep } = req.body;
    const deals = await getDealsFromSheet();
    // Match by uid, or by address fragment (for Derek's auto-trigger)
    const deal = deals.find(d => {
      const duid = d.uid || `${d.address}-${d.dateReceived}`;
      return duid === uid || d.uid === uid || 
             (uid.length > 8 && (d.address || '').toLowerCase().includes(uid.toLowerCase().split('-')[0]));
    });
    if (!deal) {
      console.log(`Deal not found for uid: ${uid} — available: ${deals.slice(0,3).map(d=>d.uid||d.address).join(', ')}`);
      return res.status(404).json({ error: 'Deal not found' });
    }

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
    let uw = underwrites[uid];
    if (!uw) {
      // Auto-underwrite on demand when chat is opened before underwrite ran
      const deals = await getDealsFromSheet();
      const deal = deals.find(d => (d.uid || `${d.address}-${d.dateReceived}`) === uid);
      if (!deal) return res.status(404).json({ error: 'Deal not found in sheet' });
      const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
      uw = await underwriteDeal(deal, comps, false, false);
    }

    const chatHistory = uw.chatHistory || [];
    chatHistory.push({ role: 'user', content: `${author?.toUpperCase() || 'USER'}: ${message}`, timestamp: new Date().toISOString() });

    const historyText = chatHistory.slice(-10).map(h => `${h.role === 'user' ? h.content : 'URBAN: ' + h.content}`).join('\n');

    const recentLessons = urbanBrain.lessons.slice(-10).map(l => `• ${l}`).join('\n');
    const ws = urbanBrain.wholesalerStats[uw.deal.contact1Email || uw.deal.wholesalerEmail || ''];
    const wHistory = ws ? `${ws.deals} prior deals, avg ARV inflation ${ws.avgARVInflation}%` : 'first deal from this wholesaler';
    const systemPrompt = `You are Urban, Coralstone Capital Group's real estate underwriter for Tampa Bay fix-and-flip deals. You report to Caleb and Grant.

THIS DEAL YOU ALREADY UNDERWROTE:
Address: ${uw.deal.address}, ${uw.deal.city}, ${uw.deal.state} ${uw.deal.zip}
Beds/Baths/Sqft: ${uw.deal.beds}/${uw.deal.baths}/${uw.deal.sqft}
Asking: $${parseInt(uw.deal.askingPrice || 0).toLocaleString()} | Your ARV: $${uw.arv?.urbanARV?.toLocaleString()} | Wholesaler ARV: $${uw.arv?.wholesalerARV?.toLocaleString()}
Your Rehab Estimate: $${uw.rehab?.urbanEstimate?.toLocaleString()} (${uw.rehab?.scopeLevel})
MAO: $${uw.financials?.mao?.toLocaleString()} | Net Profit at Asking: $${uw.financials?.netProfitAtAsking?.toLocaleString()}
Verdict: ${uw.verdict} (${uw.score}/10) — ${uw.verdictReason}
Wholesaler: ${uw.deal.wholesalerCompany || 'Unknown'} | ${wHistory}

WHAT YOU KNOW FROM PAST DEALS:
${recentLessons || 'No prior lessons yet'}

YOUR JOB IN THIS CHAT:
- Answer questions about this deal directly and specifically
- If Caleb or Grant gives you corrected numbers (better comps, actual repair costs, real ARV), immediately re-calculate MAO, net profit, and verdict — show the math
- If they tell you they're making an offer, making an offer at X, or passing — acknowledge and update your recommendation
- Be concise. No fluff. They're busy.
- Always end corrections with: "Updated verdict: [VERDICT] ([score]/10)"
- Sign corrections with what you learned: "🧠 Noted for future deals: [lesson]"`;

    const res2 = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: `${historyText}\n\n${author?.toUpperCase() || 'USER'}: ${message}` }]
    });

    const reply = res2.content[0].text;
    chatHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
    uw.chatHistory = chatHistory;

    // Every chat message is a potential learning moment — save all corrections
    const correctionWords = ['actually', 'correction', 'wrong', 'update', 'arv is', 'arv should', 'repairs are', 'repairs should', 'the price', 'i got a comp', 'comp at', 'sold for', 'change', 'adjust', 'no the'];
    const isCorrection = correctionWords.some(w => message.toLowerCase().includes(w));
    if (isCorrection) {
      const lesson = `[CORRECTION by ${author || 'user'} on ${uw.deal.address}, ${uw.deal.city}] ${message.slice(0, 300)} → Urban replied: ${reply.slice(0, 200)}`;
      urbanBrain.lessons.push(`[${new Date().toLocaleDateString()}] ${lesson}`);
      if (urbanBrain.lessons.length > 100) urbanBrain.lessons.shift();
      urbanBrain.correctionHistory.push({
        date: new Date().toISOString(),
        deal: uw.deal.address,
        city: uw.deal.city,
        correction: message,
        urbanReply: reply.slice(0, 300),
        author: author || 'unknown'
      });
      urbanBrain.lastUpdated = new Date().toISOString();
      saveJSON(BRAIN_FILE, urbanBrain);
      saveBrainToSheet().catch(e => console.log('Sheet brain save after correction:', e.message));
      console.log(`🧠 Correction learned: ${message.slice(0, 80)}`);
    }

    underwrites[uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);

    res.json({ reply, chatHistory, isCorrection });
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

// Brain — memory overview
app.get('/api/brain', auth, (req, res) => {
  const summary = {
    totalUnderwritten: urbanBrain.totalUnderwritten || 0,
    hotDeals: urbanBrain.hotDeals || 0,
    passedDeals: urbanBrain.passedDeals || 0,
    lastUpdated: urbanBrain.lastUpdated,
    wholesalers: Object.keys(urbanBrain.wholesalerStats).length,
    markets: Object.keys(urbanBrain.marketNotes),
    recentLessons: urbanBrain.lessons.slice(-5),
    wholesalerStats: urbanBrain.wholesalerStats,
    marketNotes: urbanBrain.marketNotes
  };
  res.json(summary);
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
