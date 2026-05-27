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
          content: `You are a real estate comp researcher. Do TWO web searches:

1. Search Zillow for recently sold homes near "${address}, ${city}, ${state} ${zip}" — find 3-5 homes sold in the last 6 months within 1 mile that are similar (same beds/baths/sqft range). Look for actual SOLD prices not list prices.

2. Search for the Zestimate or current estimated value of "${address}, ${city}, ${state} ${zip}" on Zillow or Redfin.

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

// ── DEEP COMP ENGINE (Haiku searches + Sonnet analysis) ─────────────────────
// Cost: 2 Haiku searches ~$0.003 total. Sonnet only used for the analysis step.
async function fetchDeepComps(address, city, state, zip, beds, baths, sqft, propType) {
  const comps = [];
  comps._meta = { arvEstimate: null, dataQuality: 'DEEP' };

  try {
    // 2 Haiku searches in parallel — cheap, fast
    const [r1, r2] = await Promise.all([
      // Search 1: recent sold comps
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

  const prompt = `${deep ? 'DEEP ANALYSIS MODE — Sonnet is running. Be thorough. Show your full reasoning on ARV and rehab. Longer text fields allowed.\n\n' : ''}You are Urban, elite real estate underwriter for Coralstone Capital Group, Tampa Bay FL. 20+ years fix-and-flip experience in Pasco, Hillsborough, Polk, Pinellas, Hernando counties.

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
  "recommendation": "<2-3 sentence max direct recommendation for Caleb and Grant>",
  "offerStrategy": "<if worth pursuing: offer price and key terms in 1-2 sentences>",
  "urbanNotes": "<1 sentence max>"
}

IMPORTANT: Keep ALL text values under 200 characters. Valid JSON only. No markdown.`;

  const model = deep ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  console.log(`Underwriting ${deal.address} with ${model}`);

  const system = deep
    ? 'You are an elite real estate underwriter with access to full market data. Respond with ONLY valid JSON. Be thorough and precise — this is a deep analysis. Do not truncate any field.'
    : 'You are a real estate underwriter. Always respond with ONLY valid JSON — no markdown, no backticks, no explanation before or after. Keep all text fields under 200 characters. Be concise.';

  const res = await getAnthropic().messages.create({
    model, max_tokens: deep ? 8192 : 4096,
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
  underwrite.chatHistory = underwrite.chatHistory || [];
  underwrite.model = model;

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

      // 4. IMMEDIATELY save to sheet so it survives the next redeploy
      await saveBrain();
      console.log('📝 Correction saved to brain + sheet: ' + message.slice(0,80));
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
