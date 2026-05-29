require('dotenv').config({ path: '../.env' });
const TAMPA = require('./tampaKnowledge');
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
const PASSWORD  = process.env.URBAN_PASSWORD || 'coralstone2025';
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

// saveBrain = save to local file + sheet (use this everywhere)
async function saveBrain() {
  saveJSON(BRAIN_FILE, urbanBrain);
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
async function getDealsFromSheet() {
  const s = getSheets();
  const res = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Active Deals!A1:CV1000' });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  return rows.slice(1).filter(r => {
    const addr = r[col['Address']];
    // Skip rows with no address OR redacted XXXX address — Urban can't underwrite without it
    if (!addr || addr.trim() === '' || addr.trim().toUpperCase() === 'XXXX') return false;
    return true;
  }).map(r => {
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
    // Two searches: (1) recently sold comps, (2) Zestimate for subject
    const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // Haiku for comps — fast and cheap
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are a real estate comp researcher for Tampa Bay FL fix-and-flip investors. Do TWO web searches:

1. Search Zillow for recently SOLD homes near "${address}, ${city}, ${state} ${zip}" — find 3-5 homes sold in the last 6 months within 1 mile. Target similar size: ${deal.beds||3}bd/${deal.baths||2}ba, ~${deal.sqft||1200}sqft. Look for SOLD prices only, not list prices.

2. Search for the Zestimate for "${address}, ${city}, ${state} ${zip}" on Zillow. Also check Redfin estimate if available.

Tampa Bay price context: SFRs typically range $150K-$600K depending on area. Hillsborough avg ~$380K, Pasco avg ~$290K, Pinellas avg ~$420K.

After searching, return ONLY a valid JSON array (no markdown, no backticks, no explanation) with all comps you found:
[
  {"address":"123 Oak Ave","city":"${city}","sqft":1350,"beds":3,"baths":2,"salePrice":248000,"saleDate":"2025-03","distanceMiles":0.4,"source":"zillow_sold"},
  {"address":"${address}","city":"${city}","sqft":null,"beds":null,"baths":null,"salePrice":265000,"saleDate":"2025-05","distanceMiles":0,"source":"zestimate"}
]

Include ONLY entries where you found real data. If you found no comps, return an empty array: []`
        }]
      })
    });

    const data = await searchRes.json();
    if (data.error) {
      console.log('Comp API error:', data.error.message);
      return comps;
    }

    // Find the text response block
    const textBlock = data.content?.find(c => c.type === 'text');
    if (!textBlock?.text) {
      console.log('No text block in comp response');
      return comps;
    }

    const raw = textBlock.text.trim();
    console.log(`Comp raw response (first 300): ${raw.slice(0, 300)}`);

    // Safely extract JSON array
    const arrStart = raw.indexOf('[');
    const arrEnd = raw.lastIndexOf(']');
    if (arrStart === -1 || arrEnd === -1 || arrEnd <= arrStart) {
      console.log('No JSON array found in comp response');
      return comps;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    } catch(parseErr) {
      console.log('Comp JSON parse error:', parseErr.message);
      // Try to salvage partial results by finding individual objects
      return comps;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.log('Empty or invalid comp array');
      return comps;
    }

    parsed.forEach(c => {
      if (c && typeof c === 'object' && c.salePrice) comps.push(c);
    });

    // Separate sold comps from estimates
    const soldComps = comps.filter(c => c.source && c.source.includes('sold') && c.salePrice);
    const estimates = comps.filter(c => c.source && (c.source.includes('zestimate') || c.source.includes('estimate')) && c.salePrice);

    console.log(`Comps: ${soldComps.length} sold, ${estimates.length} estimates`);

    // Compute ARV: weight sold comps 70%, estimates 30%
    if (soldComps.length > 0 || estimates.length > 0) {
      const soldPrices = soldComps.map(c => c.salePrice);
      const estPrices = estimates.map(c => c.salePrice);
      let arvEstimate;
      if (soldPrices.length > 0 && estPrices.length > 0) {
        const soldAvg = soldPrices.reduce((a,b)=>a+b,0)/soldPrices.length;
        const estAvg = estPrices.reduce((a,b)=>a+b,0)/estPrices.length;
        arvEstimate = Math.round(soldAvg * 0.7 + estAvg * 0.3);
      } else if (soldPrices.length > 0) {
        arvEstimate = Math.round(soldPrices.reduce((a,b)=>a+b,0)/soldPrices.length);
      } else {
        arvEstimate = Math.round(estPrices.reduce((a,b)=>a+b,0)/estPrices.length);
      }
      comps._meta.arvEstimate = arvEstimate;
      console.log(`ARV estimate: $${arvEstimate.toLocaleString()} (from ${soldComps.length} sold + ${estimates.length} estimates)`);
    }

  } catch(e) {
    console.log('Comp engine error:', e.message);
  }

  return comps;
}

// ── BRAIN CONTEXT ─────────────────────────────────────────────────────────────
function getBrainContext(wholesalerEmail, county) {
  // Lessons: last 40, plus a summary of older ones so nothing is lost
  const allLessons = urbanBrain.lessons || [];
  const recentLessons = allLessons.slice(-40).map(l => `- ${l}`).join('\n');
  const olderCount = Math.max(0, allLessons.length - 40);
  const lessonSummary = olderCount > 0
    ? `[+ ${olderCount} earlier lessons stored — key themes: corrections on ARV inflation, wholesaler patterns, market-specific rehab costs]\n`
    : '';
  const lessons = lessonSummary + (recentLessons || 'No lessons yet');

  // Wholesaler intel — rich context
  const wNotes = urbanBrain.wholesalerNotes[wholesalerEmail] || 'First time seeing this wholesaler';
  const ws = urbanBrain.wholesalerStats[wholesalerEmail];
  let wStats = 'No prior deals from this wholesaler';
  if (ws) {
    const topVerdict = ws.verdicts && Object.entries(ws.verdicts).sort((a,b)=>b[1]-a[1])[0];
    const inflationFlag = ws.verifiedInflator ? ' ⚠️ VERIFIED ARV INFLATOR' : ws.inflationWarning ? ' ⚠️ ARV inflation warning' : '';
    wStats = `${ws.deals} prior deals${inflationFlag} | avg ARV inflation: ${ws.avgARVInflation}% | most common verdict: ${topVerdict ? topVerdict[0] : 'mixed'} | corrections: ${ws.corrections || 0}`;
  }

  // Market context — price/sqft + what works in this market
  const mn = urbanBrain.marketNotes[county];
  let marketCtx = `${county || 'unknown county'}: limited data`;
  if (mn && mn.deals > 1) {
    const ppsqft = mn.avgARV && mn.avgSqft ? Math.round(mn.avgARV / mn.avgSqft) : null;
    const hotRate = mn.deals > 0 ? Math.round((mn.hotDeals || 0) / mn.deals * 100) : 0;
    marketCtx = `${county}: ${mn.deals} deals analyzed | avg Urban ARV $${mn.avgARV?.toLocaleString()} | ${ppsqft ? `avg $/sqft $${ppsqft}` : ''} | ${hotRate}% score HOT/BUY`;
  }

  return { lessons, wholesalerNotes: wNotes, wholesalerStats: wStats, marketContext: marketCtx };
}

// ── DEEP COMP ENGINE (Haiku searches + Sonnet analysis) ─────────────────────
// Cost: 2 Haiku searches ~$0.003 total. Sonnet only used for the analysis step.
async function fetchDeepComps(address, city, state, zip, beds, baths, sqft, propType) {
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
async function underwriteDeal(deal, comps, forceRefresh = false, deep = false) {
  const uid = deal.uid || `${deal.address}-${deal.dateReceived}`;
  if (underwrites[uid] && !forceRefresh) return underwrites[uid];

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

  // Sort by score descending, take top N
  const relevant = scored.sort((a, b) => b.score - a.score).slice(0, maxLessons);
  const rest = all.slice(-5).filter(l => !relevant.find(r => r.lesson === l)); // always include last 5

  return [...new Set([...relevant.map(r => r.lesson), ...rest])].join('\n');
}

const brain = getBrainContext(deal.contact1Email, deal.county || deal.city);
const relevantLessons = getRelevantLessons(deal);
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

  const prompt = `${deep ? 'DEEP ANALYSIS MODE — Sonnet is running. Be thorough. Show your full reasoning on ARV and rehab. Longer text fields allowed.\n\n' : ''}You are Urban, elite real estate underwriter for Coralstone Capital Group, Tampa Bay FL. 20+ years fix-and-flip experience in Pasco, Hillsborough, Polk, Pinellas, Hernando counties.

CORALSTONE CRITERIA:
- Hard money: 9.5% interest only, 90% LTV
- MAO = ARV × 70% - Repairs
- Minimum net profit: $40,000
- Markets: Pasco, Hillsborough, Polk, Pinellas, Hernando (within ~1hr Tampa)
- Full rehab: 5 month hold. Light cosmetic: 4 months.
- Wholesaler ARVs are usually INFLATED. Be skeptical. Find the TRUE ARV.
- If wholesaler ARV seems LOW, note the upside.
- Agent commission: 6% | Seller closing costs: 1.5% | HML origination: 2 points
- Target: 3/2 SFR 1200-2000sqft, $150-350K asking, Pasco/Hillsborough sweet spot

TAMPA BAY NEIGHBORHOOD INTEL ($/sqft benchmarks, 2025):
${(() => {
  const city = (deal.city||'').toLowerCase().trim();
  const zip = deal.zip || '';
  // Find neighborhood match
  const nb = Object.entries(TAMPA.neighborhoods).find(([name]) =>
    city.includes(name) || name.includes(city.split(' ')[0])
  );
  if (nb) {
    const [name, data] = nb;
    return name.toUpperCase() + ': $' + data.ppsf + '/sqft avg | Tier ' + data.tier + ' | Trend: ' + data.trend + ' | ' + data.notes;
  }
  return 'No specific neighborhood data — use comp-based judgment. See market conditions below.';
})()}

TAMPA BAY MARKET CONDITIONS (2025):
- FL insurance crisis: Roofs 15yr+ hard to insure. 20yr+ uninsurable. Budget $3-6K/yr insurance.
- Buyer pool strongest: $150-350K. FHA buyers active under $250K. Investors active everywhere.
- Days on market: A-tier ~25 days | B-tier ~35 days | C-tier ~55 days
- New construction competing in Wesley Chapel, Parrish, Riverview corridors — comp carefully.
- Peak season Feb-May. Slower Jun-Sep. Q4 pickup.

REPAIR COST BENCHMARKS (Tampa Bay contractors, 2025):
- Roof (shingle, 1500sqft): $8-13K | 2000sqft: $10-16K | 2500sqft: $13-20K
- HVAC full system: $6-10K | Condenser only: $3-5K
- Kitchen full gut: $15-30K | Cosmetic: $5-12K
- Master bath: $8-18K | Secondary bath: $5-10K
- LVP flooring: $3-6/sqft installed | Tile: $6-12/sqft
- Full repipe: $4-8K | Water heater: $1.2-2.5K
- Panel upgrade 200A: $2.5-5K | Electric rewire: $8-20K
- Interior paint (1500sqft): $3-6K | Exterior: $3-8K
- Impact windows: $10-25K whole home | Per window: $400-800
- Foundation repair: $5-30K+ (ALWAYS flag, get engineer)
- Sewer camera: $300-600 (ALWAYS on homes 25yr+)
- Permits + inspection budget: $1.5-4K

RED FLAGS TO ALWAYS FLAG:
${Object.entries(TAMPA.redFlags).map(([flag, data]) => `- ${flag.toUpperCase()} [${data.severity}]: ${data.detail}`).join('\n')}

WHAT MAKES A HOT DEAL FOR CORALSTONE:
${TAMPA.scoringFactors.HOT.map(f => '✅ ' + f).join('\n')}

WHAT IS A HARD NO:
${TAMPA.scoringFactors.HARD_NO.map(f => '❌ ' + f).join('\n')}

URBAN BRAIN — RELEVANT LESSONS (matched by county, wholesaler, recency):
${relevantLessons || 'No lessons yet — first deal in this area'}

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

${deal._extractionConfidence !== undefined ? `DATA QUALITY NOTE FROM DEREK: Extraction confidence ${deal._extractionConfidence}/10 — ${deal._extractionNote || (deal._extractionConfidence >= 8 ? 'high confidence, data reliable' : deal._extractionConfidence >= 5 ? 'medium confidence, some fields estimated' : 'LOW confidence — verify key fields before trusting numbers')}` : ''}

WHOLESALER NUMBERS:
Asking: $${askingPrice.toLocaleString()} | Their ARV: $${wholesalerARV.toLocaleString()} | Their Repairs: ${wholesalerRepairs ? '$'+wholesalerRepairs.toLocaleString() : 'NOT PROVIDED'}
Their MAO implication: $${wholesalerARV ? Math.round(wholesalerARV*0.7 - (wholesalerRepairs||0)).toLocaleString() : '?'} (ARV×70%-Repairs)
Gap vs asking: $${wholesalerARV ? Math.round(wholesalerARV*0.7 - (wholesalerRepairs||0) - askingPrice).toLocaleString() : '?'} (positive = room to negotiate, negative = overpriced)
Taxes: $${annualTaxes.toLocaleString()}/yr | Close: ${deal.closeDate} | EMD: ${deal.earnestMoney}

PRIVATE COMP DATABASE (Coralstone past deals — real numbers we paid for):
${(() => {
  const city = (deal.city||'').toLowerCase();
  const county = (deal.county||'').toLowerCase();
  const targetSqft = parseFloat(deal.sqft) || 0;
  const privatComps = Object.values(underwrites)
    .filter(uw =>
      uw.verdict && uw.arv?.urbanARV && uw.deal?.address &&
      uw.deal.address !== deal.address && // not the same deal
      !uw.restoredFromSheet && // has full data
      ((uw.deal.city||'').toLowerCase().includes(city.split(' ')[0]) ||
       (uw.deal.county||'').toLowerCase().includes(county.split(' ')[0]))
    )
    .map(uw => ({
      addr: uw.deal.address,
      arv: uw.arv.urbanARV,
      sqft: parseFloat(uw.deal.sqft) || 0,
      beds: uw.deal.beds,
      baths: uw.deal.baths,
      verdict: uw.verdict,
      ppsf: uw.arv.urbanARV && uw.deal.sqft ? Math.round(uw.arv.urbanARV / parseFloat(uw.deal.sqft)) : null,
      date: uw.underwroteAt ? new Date(uw.underwroteAt).toLocaleDateString() : '?'
    }))
    .sort((a, b) => {
      // sort by sqft proximity to subject
      const da = Math.abs(a.sqft - targetSqft);
      const db = Math.abs(b.sqft - targetSqft);
      return da - db;
    })
    .slice(0, 5);

  if (!privatComps.length) return 'None yet in this area — this may be first deal here.';
  return privatComps.map(c =>
    c.addr + ' | ' + (c.sqft||'?') + 'sqft ' + (c.beds||'?') + 'bd/' + (c.baths||'?') + 'ba' +
    ' | Our ARV: $' + c.arv.toLocaleString() + (c.ppsf ? ' ($'+c.ppsf+'/sqft)' : '') +
    ' | ' + c.verdict + ' | ' + c.date
  ).join('\n');
})()}

MARKET COMPS (Zillow/web search):
${compsText}

MARKET CONTEXT FOR THIS COUNTY (${deal.county || deal.city}):
${(() => {
  const mn = urbanBrain.marketNotes[deal.county || deal.city];
  if (!mn || mn.deals < 2) return 'Limited data — use comp-based judgment.';
  const ppsf = mn.avgARV && mn.avgSqft ? Math.round(mn.avgARV/mn.avgSqft) : null;
  return `${mn.deals} deals analyzed | Avg ARV: $${mn.avgARV?.toLocaleString()||'?'} | ${ppsf?'Avg $/sqft: $'+ppsf+' | ':''}HOT/BUY rate: ${Math.round((mn.hotDeals||0)/mn.deals*100)}%`;
})()}

Respond ONLY with a JSON object (no markdown, no backticks, just raw JSON).
PUT THESE FIELDS FIRST — they are most important:
{
  "verdict": "<HOT|BUY|REVIEW|PASS|HARD NO>",
  "score": <1-10>,
  "verdictReason": "<one punchy sentence why>",
  "recommendation": "<REQUIRED - 2-3 hard sentences. Example: 'Walk away. ARV is inflated by 15% and at $215K you have $8K profit — zero margin. Pass unless they come down to $160K.' OR: 'Pull the trigger. At $185K your profit is $62K at a clean 8.4% ROI. Roof is 8 years old, HVAC 2019 — it pencils. Counter at $175K to grab another $10K.'>",
  "offerStrategy": "<REQUIRED - if HOT/BUY: 'Offer $X, close in Y days, $Z EMD, AS-IS, 7-day inspection.' If PASS/HARD NO: 'Would work at $X — X% below ask. Not worth countering above that.'>",
  "arv": {
    "wholesalerARV": <number>,
    "urbanARV": <number>,
    "arvPerSqft": <urbanARV divided by sqft, or null if sqft unknown>,
    "marketAvgPerSqft": <what $/sqft comps support, or null>,
    "arvConfidence": "<HIGH|MEDIUM|LOW>",
    "arvNotes": "<specific reasoning — cite actual comp addresses and prices>",
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
  "urbanNotes": "<1 sentence max>"
}

IMPORTANT: arvNotes, recommendation, and notes fields can be detailed. All other text fields under 150 chars.. Valid JSON only. No markdown.`;

  const model = deep ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  console.log(`Underwriting ${deal.address} with ${model}`);

  const system = deep
    ? `You are Urban — elite fix-and-flip underwriter for Coralstone Capital Group, Tampa Bay FL. You have underwritten ${urbanBrain.totalUnderwritten||0} Tampa Bay deals. DEEP ANALYSIS MODE: Run 2 comp searches with different search strategies. Check active listings competing with the flip. Be extremely precise on rehab — go line by line. Give your highest-confidence ARV with detailed comp justification. Show your full reasoning. Do NOT truncate any field.`
    : `You are Urban — fix-and-flip underwriter for Coralstone Capital Group, Tampa Bay FL. You know Tampa Bay neighborhoods cold: prices, trends, buyer demand, contractor costs, red flags. You have underwritten ${urbanBrain.totalUnderwritten||0} Tampa Bay deals. You are direct and use real numbers — not vague ranges. Respond with ONLY valid JSON — no markdown, no backticks, nothing before or after the JSON object.`;

  const res = await getAnthropic().messages.create({
    model, max_tokens: deep ? 8192 : 6000,  // 6000 ensures recommendation+offerStrategy never truncate
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  const rawText = res.content[0].text.trim();
  console.log(`Raw underwrite response length: ${rawText.length}, preview: ${rawText.slice(0,100)}`);
  const f = rawText.indexOf('{'), l = rawText.lastIndexOf('}');
  if (f === -1 || l === -1) throw new Error(`No JSON object in response. Raw: ${rawText.slice(0,200)}`);
  let underwrite;
  try {
    underwrite = JSON.parse(rawText.slice(f, l + 1));
  } catch(jsonErr) {
    console.error('JSON parse error. Attempting cleanup...');
    // Try removing control characters and reparsing
    const cleaned = rawText.slice(f, l + 1)
      .replace(/[ -]/g, ' ')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    underwrite = JSON.parse(cleaned);
  }

  underwrite.uid = uid;
  underwrite.deal = deal;
  underwrite.comps = comps;
  underwrite.underwroteAt = new Date().toISOString();

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
     .sort((a, b) => b - a); // highest to lowest

    underwrite.negotiationLadder = pts.map(price => ({
      price,
      label: price === Math.round(ask) ? 'Asking' :
             price === mao ? 'MAO' :
             price < mao ? 'Stretch offer' :
             price > Math.round(ask * 0.98) ? 'Near ask' : 'Counter',
      profit: Math.round(arv - price - repairs - costs),
      meetsMin: Math.round(arv - price - repairs - costs) >= 40000,
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
  saveJSON(UNDERWRITES_FILE, underwrites);
  // Async persist verdict index to sheet — non-blocking
  persistVerdictIndexToSheet().catch(() => {});

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
    // ARV inflation flag — requires manual verification by Caleb/Grant
    // Auto-flags when: 3+ deals AND avg inflation > 15%
    // Once manually verified (ws.verifiedInflator = true), flag is permanent
    if (!ws.verifiedInflator && ws.arvSamples.length >= 3 && parseFloat(ws.avgARVInflation) > 15) {
      ws.inflationWarning = true;
      console.log(`⚠️ ARV INFLATION WARNING: ${ws.name || email} avg ${ws.avgARVInflation}% over ${ws.arvSamples.length} deals — NEEDS MANUAL VERIFICATION`);
    } else if (!ws.verifiedInflator && parseFloat(ws.avgARVInflation) <= 15) {
      ws.inflationWarning = false; // auto-clear if improves
    }
    urbanBrain.wholesalerNotes[email] = `${ws.name} (${ws.company}) | ${ws.deals} deals | avg ARV inflation: ${ws.avgARVInflation}%${ws.verifiedInflator ? ' | ⚠️ VERIFIED INFLATOR' : ws.inflationWarning ? ' | ⚠️ INFLATION WARNING (unverified)' : ''} | verdicts: ${JSON.stringify(ws.verdicts)}`;

    const lesson = `${underwrite.verdict} (${underwrite.score}/10) | ${deal.address}, ${deal.city} | ` +
      `Ask $${parseInt(deal.askingPrice||0).toLocaleString()} | ARV $${(underwrite.arv?.urbanARV||0).toLocaleString()} | ` +
      `Rehab $${(underwrite.rehab?.urbanEstimate||0).toLocaleString()} | Profit $${(underwrite.financials?.netProfitAtAsking||0).toLocaleString()} | ` +
      `${underwrite.verdictReason}` +
      (underwrite.recommendation ? ` | REC: ${underwrite.recommendation.slice(0,120)}` : '');
    urbanBrain.lessons.push('[' + new Date().toLocaleDateString() + '] ' + lesson);
    if (urbanBrain.lessons.length > 150) urbanBrain.lessons.shift();

    // Save brain immediately so lessons survive any crash or redeploy
    saveBrain().catch(() => {});

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

    const model = allChats.length > 15 ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';

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

app.post('/api/agent-query', async (req, res) => {
  const token = req.headers['x-urban-token'];
  if (token !== PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { question, deal, dealAddress } = req.body;
  console.log(`🤝 Agent query from Adam: ${question}`);
  try {
    // Answer using Haiku — cheap, fast
    const r = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are Urban, real estate underwriter for Coralstone Capital Group.
Answer this question from Adam (acquisitions agent) about a deal.

Deal context: ${JSON.stringify(deal || {}, null, 2).slice(0, 500)}
Brain context: ${urbanBrain.lessons?.slice(-5).join('; ') || 'none'}

Question: ${question}

Answer in 1-3 sentences. Be direct and specific.`
      }]
    });
    res.json({ answer: r.content[0].text });
  } catch(e) {
    res.json({ answer: `Urban error: ${e.message}` });
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

    const CONCURRENCY = 3;
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
          const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
          const uw = await underwriteDeal(deal, comps, false, false);
          underwrites[uw.uid] = uw; // uid is set inside underwriteDeal
          saveJSON(UNDERWRITES_FILE, underwrites);
          await logUnderwriteToSheet(uw);
          await saveBrain();
          results.push({ address: deal.address, verdict: uw.verdict, score: uw.score });
          send({ done: true, address: deal.address, verdict: uw.verdict, score: uw.score });
          completed++;
          console.log(`⚡ Batch: ${deal.address} → ${uw.verdict} (${completed}/${pending.length})`);
        } catch(e) {
          send({ error: e.message, address: deal.address });
          completed++;
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

app.get('/api/deals', auth, async (req, res) => {
  try {
    const deals = await getDealsFromSheet();
    const out = deals.map(d => {
      const uid = d.uid || `${d.address}-${d.dateReceived}`;
      const uw  = underwrites[uid];

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

      return {
        ...d,
        contact1Name:    d.contact1Name    || wsProfile?.name    || '',
        contact1Email:   wsEmail,
        contact1Phone:   d.contact1Phone   || wsProfile?.phone   || '',
        wholesalerCompany: d.wholesalerCompany || wsProfile?.company || '',
        // Underwrite data
        underwriteStatus: uw ? uw.verdict : (d.underwriteStatus || 'PENDING'),
        underwriteScore:  uw ? uw.score   : null,
        underwroteAt:     uw ? uw.underwroteAt : null,
        arv:              uw ? uw.arv      : null,
        financials:       uw ? uw.financials : null,
        // Stale
        isStale, daysOld, keptUntil: keptUntil || null,
        // Wholesaler brain stats
        wholesalerDeals:           wsProfile?.deals || 0,
        wholesalerAvgInflation:    wsProfile?.avgARVInflation || null,
        wholesalerInflationWarning: wsProfile?.inflationWarning || wsProfile?.verifiedInflator || false,
      };
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

    send({ status: deep ? '🔍 Deep analysis: running 3 parallel comp searches (Zillow + Redfin + county records)...' : 'Fetching comps...' });
    const comps = deep
      ? await fetchDeepComps(deal.address, deal.city, deal.state, deal.zip, deal.beds, deal.baths, deal.sqft, deal.propertyType)
      : await fetchComps(deal.address, deal.city, deal.state, deal.zip);
    send({ status: `Got ${comps.length} comps — ${deep ? 'running Sonnet deep analysis' : 'Urban is analyzing'}...` });

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
      : await fetchComps(deal.address, deal.city, deal.state, deal.zip);
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
        const comps = await fetchComps(deal.address, deal.city, deal.state, deal.zip);
        uw = await underwriteDeal(deal, comps, false, false);
      }
    }

    const chatHistory = uw.chatHistory || [];
    // Store clean message — author is tracked separately
    // Keep "AUTHOR: message" format for brain/correction detection but display strips it
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
      'Meets $40K min profit: '+(uw.financials?.meetsMinimumProfit?'YES ✅':'NO ❌'),
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
      '- MAO formula: ARV × 70% - Repairs | Min profit $40K | Hard money 9.5% | Pasco/Hillsborough/Polk/Pinellas/Hernando'
    ].filter(Boolean).join('\n')

    const historyForAPI = chatHistory.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }));

    // Chat uses Sonnet — this is human conversation, quality matters more than cost here
    const r2 = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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
            uw.financials.meetsMinimumProfit = (uw.financials.netProfitAtAsking || 0) >= 40000;
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
          uw.financials.meetsMinimumProfit = uw.financials.netProfitAtAsking >= 40000;
          if (arv > 0 && ask > 0) {
            uw.financials.roi = parseFloat(((uw.financials.netProfitAtAsking / (ask + repairs)) * 100).toFixed(1));
          }
        }
        // Recalculate negotiation ladder with corrected numbers
        const pts = [ask, Math.round(ask*0.95), Math.round((ask+uw.financials.mao)/2), uw.financials.mao, Math.round(uw.financials.mao*0.9)]
          .filter((p,i,arr) => p>0 && arr.indexOf(p)===i).sort((a,b)=>b-a);
        uw.negotiationLadder = pts.map(price => ({
          price,
          label: price >= Math.round(ask*0.98) ? 'Asking' : price === uw.financials.mao ? 'MAO' : price < uw.financials.mao ? 'Stretch' : 'Counter',
          profit: Math.round(arv - price - repairs - costs),
          meetsMin: Math.round(arv - price - repairs - costs) >= 40000
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

      // 5. IMMEDIATELY save to sheet so it survives the next redeploy
      await saveBrain();
      console.log('📝 Correction saved to brain + sheet: ' + message.slice(0,80));
    }

    underwrites[uid] = uw;
    saveJSON(UNDERWRITES_FILE, underwrites);
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

// Stats
app.get('/api/stats', auth, (req, res) => {
  // Include restored stubs for verdict counts, full objects for financials
  const allUw = Object.values(underwrites).filter(u => u.verdict);
  const full  = allUw.filter(u => !u.restoredFromSheet);
  const verdicts = {};
  allUw.forEach(u => { verdicts[u.verdict] = (verdicts[u.verdict]||0) + 1; });
  const all = full; // use full objects for score/profit calcs
  const profits = all.map(u => u.financials?.netProfitAtAsking).filter(p => p && p > 0);
  const avgProfit = profits.length ? Math.round(profits.reduce((a,b)=>a+b,0)/profits.length) : null;
  const scores = all.map(u => u.score).filter(Boolean);
  const avgScore = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
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
loadBrainFromSheet().catch(e => console.log('Brain boot load:', e.message));
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
        const [uid, verdict, score, address] = row;
        if (uid && verdict && !underwrites[uid]) {
          underwrites[uid] = { uid, verdict, score: parseInt(score)||0, deal: { address }, restoredFromSheet: true };
          restored++;
        }
      }
      if (restored > 0) {
        saveJSON(UNDERWRITES_FILE, underwrites);
        console.log('✅ Verdict index restored: ' + restored + ' deals (will not re-underwrite)');
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
    const idx = Object.entries(underwrites)
      .filter(([, uw]) => uw.verdict && uw.verdict !== 'PENDING')
      .map(([uid, uw]) => [uid, uw.verdict, String(uw.score || ''), uw.deal?.address || uid]);
    if (!idx.length) return;
    await s.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${BRAIN_TAB}!D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['UID', 'Verdict', 'Score', 'Address'], ...idx] }
    });
  } catch(e) { /* non-critical */ }
}

app.listen(PORT, async () => {
  console.log(`🏙️ Urban on port ${PORT}`);

  // RESTORE BRAIN + VERDICT INDEX FROM SHEET ON EVERY STARTUP
  // This is what keeps Grant's corrections and past underwrites alive across redeploys
  console.log('🔄 Restoring brain and verdict index from Google Sheet...');
  await restoreBrainFromSheet().catch(e => console.log('Restore err:', e.message));

  // Auto-run chat review on startup (if more than 12h since last review) — cheap Haiku
  const lastReview = urbanBrain.lastReviewAt ? new Date(urbanBrain.lastReviewAt) : null;
  const hoursSince = lastReview ? (Date.now() - lastReview) / 3600000 : 999;
  if (hoursSince > 12) {
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
  }

  // Schedule review every 24h
  setInterval(async () => {
    try {
      // Trigger via internal fetch (reuses the route logic cleanly)
      await fetch('http://localhost:' + PORT + '/api/review-chat', {
        method: 'POST', headers: { 'x-urban-token': PASSWORD }
      });
    } catch(e) { console.log('Scheduled review err:', e.message); }
  }, 24 * 60 * 60 * 1000);
});
