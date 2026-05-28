'use strict';

// ── TAMPA BAY MARKET KNOWLEDGE BASE ──────────────────────────────────────────
// Deep market intelligence for Urban's underwriting decisions
// Updated: 2025-2026 market conditions

const TAMPA_KNOWLEDGE = {

  // ── NEIGHBORHOOD TIERS ────────────────────────────────────────────────────
  // Price per sqft benchmarks by area/zip (2025)
  neighborhoods: {
    // HILLSBOROUGH — HOT MARKETS
    'south tampa':     { ppsf: 350, tier: 'A', trend: 'STABLE', notes: 'Hyde Park, Palma Ceia. Competitive. Hard to find deals.' },
    'hyde park':       { ppsf: 400, tier: 'A', trend: 'STABLE', notes: 'Premium. Rarely wholesale deals here.' },
    'seminole heights':{ ppsf: 240, tier: 'B', trend: 'IMPROVING', notes: 'Gentrifying fast. Strong ARV support. Good fix-flip market.' },
    'tampa heights':   { ppsf: 260, tier: 'B', trend: 'IMPROVING', notes: 'Near downtown. Strong buyer demand.' },
    'ybor city':       { ppsf: 200, tier: 'B', trend: 'IMPROVING', notes: 'Nightlife district. Vacation rental potential.' },
    'west tampa':      { ppsf: 190, tier: 'C', trend: 'IMPROVING', notes: 'Value play. Watch crime stats.' },
    'riverview':       { ppsf: 195, tier: 'B', trend: 'STABLE', notes: 'Good family area. Strong demand from first-time buyers.' },
    'brandon':         { ppsf: 185, tier: 'B', trend: 'STABLE', notes: 'Established suburb. Reliable exit market.' },
    'valrico':         { ppsf: 190, tier: 'B', trend: 'STABLE', notes: 'Good schools. Strong owner-occupant demand.' },
    'seffner':         { ppsf: 170, tier: 'C', trend: 'STABLE', notes: 'More rural feel. Slower DOM. Priced accordingly.' },
    'temple terrace':  { ppsf: 175, tier: 'C', trend: 'STABLE', notes: 'Near USF. Student rental market.' },
    'lutz':            { ppsf: 205, tier: 'B', trend: 'STABLE', notes: 'Good schools. Coralstone home market.' },
    'carrollwood':     { ppsf: 210, tier: 'B', trend: 'STABLE', notes: 'Established. Good resale. Active buyer market.' },
    'northdale':       { ppsf: 195, tier: 'B', trend: 'STABLE', notes: 'Similar to Carrollwood. Solid.' },
    'town n country':  { ppsf: 175, tier: 'C', trend: 'STABLE', notes: 'Value area. Watch flood zones near Cypress Creek.' },
    'palm river':      { ppsf: 165, tier: 'C', trend: 'STABLE', notes: 'Flood risk. Check FEMA maps carefully.' },

    // PASCO — CORALSTONE SWEET SPOT
    'land o lakes':    { ppsf: 195, tier: 'B', trend: 'IMPROVING', notes: 'Strong growth corridor. Good schools. Coralstone home base.' },
    'lutz (pasco)':    { ppsf: 200, tier: 'B', trend: 'IMPROVING', notes: 'Spillover from Hillsborough. Strong demand.' },
    'zephyrhills':     { ppsf: 155, tier: 'C', trend: 'STABLE', notes: 'Retirement community. Smaller buyer pool. Longer DOM.' },
    'dade city':       { ppsf: 145, tier: 'C', trend: 'STABLE', notes: 'Rural. Slower market. Value plays only.' },
    'new port richey': { ppsf: 165, tier: 'C', trend: 'IMPROVING', notes: 'Gulf Coast access. Growing. Watch older housing stock.' },
    'port richey':     { ppsf: 155, tier: 'C', trend: 'STABLE', notes: 'Older homes. Lots of septic/well. Due diligence heavy.' },
    'holiday':         { ppsf: 155, tier: 'C', trend: 'STABLE', notes: 'Older stock. Buyer demand improving with prices.' },
    'trinity':         { ppsf: 215, tier: 'B', trend: 'STABLE', notes: 'Master planned. Strong demand. Hard to get deals cheap.' },
    'odessa':          { ppsf: 230, tier: 'B', trend: 'STABLE', notes: 'Premium Pasco. Equestrian feel. Strong buyer market.' },
    'wesley chapel':   { ppsf: 210, tier: 'B', trend: 'IMPROVING', notes: 'Fastest growing area in Tampa Bay. Strong demand. New construction pressure on comps.' },

    // PINELLAS
    'st. petersburg':  { ppsf: 275, tier: 'A-B', trend: 'STABLE', notes: 'Hot market. Downtown St Pete commanding premiums. Strong demand.' },
    'clearwater':      { ppsf: 235, tier: 'B', trend: 'STABLE', notes: 'Beach adjacent. Strong demand. Watch Flood Zone AE.' },
    'largo':           { ppsf: 195, tier: 'B', trend: 'STABLE', notes: 'Good value in Pinellas. Active market.' },
    'dunedin':         { ppsf: 260, tier: 'B', trend: 'STABLE', notes: 'Lifestyle market. Strong demand from out-of-state buyers.' },
    'tarpon springs':  { ppsf: 210, tier: 'B', trend: 'STABLE', notes: 'Greek community. Good market.' },
    'safety harbor':   { ppsf: 240, tier: 'B', trend: 'STABLE', notes: 'Trendy small town. Strong demand.' },
    'pinellas park':   { ppsf: 175, tier: 'C', trend: 'STABLE', notes: 'Value in Pinellas. Good ARV support.' },
    'seminole':        { ppsf: 195, tier: 'B', trend: 'STABLE', notes: 'Good schools. Solid buyer market.' },

    // POLK
    'lakeland':        { ppsf: 160, tier: 'C', trend: 'IMPROVING', notes: 'Growing. Interstate corridor. Value market.' },
    'plant city':      { ppsf: 155, tier: 'C', trend: 'STABLE', notes: 'Agricultural area. Slower DOM. Reliable but patient.' },
    'auburndale':      { ppsf: 150, tier: 'C', trend: 'STABLE', notes: 'Central Polk. Value plays.' },
    'winter haven':    { ppsf: 155, tier: 'C', trend: 'STABLE', notes: 'Chain of lakes. Some premium lakefront.' },

    // HERNANDO
    'spring hill':     { ppsf: 145, tier: 'C', trend: 'IMPROVING', notes: 'Biggest wholesale market in Hernando. High volume, lower prices. Strong rental demand.' },
    'brooksville':     { ppsf: 135, tier: 'C', trend: 'STABLE', notes: 'More rural. Slower buyer market. Retirement focus.' },
    'weeki wachee':    { ppsf: 140, tier: 'C', trend: 'STABLE', notes: 'Rural. Nature tourism. Small buyer pool.' },
  },

  // ── CONTRACTOR COSTS (Tampa Bay, 2025) ────────────────────────────────────
  // These are ACTUAL Tampa Bay contractor rates for rehab estimation
  repairCosts: {
    // ROOF
    roof_shingle_1500sqft:   { low: 8000,  high: 13000, notes: '3-tab shingle. Most common.' },
    roof_shingle_2000sqft:   { low: 10000, high: 16000, notes: 'Mid-size home.' },
    roof_shingle_2500sqft:   { low: 13000, high: 20000, notes: 'Larger home.' },
    roof_metal_1500sqft:     { low: 18000, high: 28000, notes: 'Standing seam. Better insurance.' },
    roof_repair_minor:       { low: 1500,  high: 4000,  notes: 'Patching, flashing, etc.' },

    // HVAC
    hvac_full_system:        { low: 6000,  high: 10000, notes: '3-5 ton. Includes air handler.' },
    hvac_condenser_only:     { low: 3000,  high: 5000,  notes: 'Condenser replacement.' },
    hvac_ductwork:           { low: 3000,  high: 8000,  notes: 'Full duct replacement.' },
    hvac_service:            { low: 500,   high: 1500,  notes: 'Service + refrigerant charge.' },

    // ELECTRICAL
    electrical_panel_200amp: { low: 2500,  high: 5000,  notes: 'Panel upgrade. Common in older homes.' },
    electrical_rewire:       { low: 8000,  high: 20000, notes: 'Full rewire. Rarely needed.' },
    electrical_gfci_smoke:   { low: 800,   high: 2000,  notes: 'Code compliance. Always include.' },

    // PLUMBING
    plumbing_repipe_cpvc:    { low: 4000,  high: 8000,  notes: 'Full repipe. Galvanized or polybutylene.' },
    plumbing_water_heater:   { low: 1200,  high: 2500,  notes: 'Gas or electric 50gal.' },
    plumbing_sewer_camera:   { low: 300,   high: 600,   notes: 'Always camera older homes.' },
    plumbing_sewer_repair:   { low: 2000,  high: 15000, notes: 'Wide range depending on break location.' },
    septic_inspection:       { low: 400,   high: 800,   notes: 'Required on Pasco/Hernando.' },
    septic_pump_replace:     { low: 4000,  high: 12000, notes: 'If failed inspection.' },

    // KITCHEN
    kitchen_full_gut_mid:    { low: 15000, high: 30000, notes: 'New cabinets, granite, appliances, tile.' },
    kitchen_cosmetic:        { low: 5000,  high: 12000, notes: 'Paint cabinets, new hardware, countertops.' },
    kitchen_appliances:      { low: 2500,  high: 5000,  notes: 'Stainless set — fridge, range, dishwasher.' },

    // BATHROOMS
    bath_full_master:        { low: 8000,  high: 18000, notes: 'New tile, vanity, fixtures, shower.' },
    bath_full_secondary:     { low: 5000,  high: 10000, notes: 'Per bathroom.' },
    bath_cosmetic:           { low: 2000,  high: 5000,  notes: 'Vanity, fixtures, paint.' },

    // FLOORING
    flooring_lvp_per_sqft:   { low: 3,    high: 6,     notes: 'LVP. Most popular flip flooring. Per sqft installed.' },
    flooring_tile_per_sqft:  { low: 6,    high: 12,    notes: 'Per sqft installed.' },
    flooring_carpet_per_sqft:{ low: 2,    high: 4,     notes: 'Per sqft installed. Bedrooms only.' },

    // WINDOWS
    windows_single_unit:     { low: 400,  high: 800,   notes: 'Per window installed. Impact = 2x.' },
    windows_impact_home:     { low: 10000,high: 25000, notes: 'Full impact upgrade. Big insurance savings.' },

    // PAINT
    paint_interior_1500sqft: { low: 3000, high: 6000,  notes: 'Interior only, 1500sqft.' },
    paint_interior_2000sqft: { low: 4000, high: 8000,  notes: 'Interior only, 2000sqft.' },
    paint_exterior:          { low: 3000, high: 8000,  notes: 'Exterior including trim.' },

    // GENERAL
    demo_cleanup:            { low: 2000, high: 5000,  notes: 'Demolition and hauling.' },
    landscaping_basic:       { low: 1500, high: 4000,  notes: 'Cleanup, sod, mulch, plants.' },
    driveway_concrete:       { low: 4000, high: 8000,  notes: 'Standard 2-car. Per linear ft varies.' },
    foundation_repairs:      { low: 5000, high: 30000, notes: 'WIDE range. Get 3 quotes. Red flag.' },
    mold_remediation:        { low: 3000, high: 15000, notes: 'Depends heavily on extent.' },
    permits_inspection:      { low: 1500, high: 4000,  notes: 'Always budget for permits.' },
  },

  // ── HOLDING COST ASSUMPTIONS (Tampa Bay) ─────────────────────────────────
  holdingCosts: {
    insurance_monthly:    { sfr_typical: 150, notes: 'Vacant/rehab policy. Higher than owner-occ.' },
    utilities_monthly:    { sfr_typical: 200, notes: 'Electric, water, gas. Varies by season.' },
    property_mgmt:        0, // flip, not rental
    agent_commission:     0.06, // 6% total both sides
    closing_costs_sell:   0.015, // 1.5% seller closing costs
    hml_origination:      0.02, // 2 points typical
  },

  // ── RED FLAGS (always flag these) ─────────────────────────────────────────
  redFlags: {
    'flood zone ae':        { severity: 'HIGH', detail: 'AE = 100yr floodplain. Insurance $3K-8K/yr. Kills buyer pool.' },
    'flood zone ve':        { severity: 'HIGH', detail: 'VE = coastal high velocity. Very expensive. Rare inland.' },
    'polybutylene':         { severity: 'HIGH', detail: 'Gray PB pipe. Full repipe required. $5-10K.' },
    'galvanized':           { severity: 'HIGH', detail: 'Galvanized plumbing. Old. Repipe budget $5-10K.' },
    'aluminum wiring':      { severity: 'HIGH', detail: 'Fire hazard. Insurance issue. Full rewire or pig-tail every outlet.' },
    'knob and tube':        { severity: 'HIGH', detail: 'Very old wiring. Uninsurable. Full rewire required.' },
    'chinese drywall':      { severity: 'HIGH', detail: '2006-2008 construction. Corrosive. Full gut. Walk away.' },
    'asbestos':             { severity: 'HIGH', detail: 'Pre-1980 popcorn/tile. Abatement $3-15K. Get assessment.' },
    'septic':               { severity: 'MEDIUM', detail: 'Pasco/Hernando. Get inspection. Budget $400-12K if issue.' },
    'roof over 15 years':   { severity: 'MEDIUM', detail: 'Insurance issue. Budget replacement.' },
    'roof over 20 years':   { severity: 'HIGH', detail: 'Uninsurable in FL. Must replace before sell. Budget $10-18K.' },
    'hoa':                  { severity: 'LOW', detail: 'HOA restricts rental use. Buyer pool impact. Verify rules.' },
    'active hoa violation': { severity: 'HIGH', detail: 'Can prevent close. Fines accrue. Verify before offer.' },
    'foundation crack':     { severity: 'HIGH', detail: 'Get structural engineer. Could be cosmetic or catastrophic.' },
    'sinkhole':             { severity: 'HIGH', detail: 'Florida risk. Walk away unless remediated with docs.' },
    'code violations':      { severity: 'HIGH', detail: 'Open permits or violations. Research at county before offer.' },
    'title issue':          { severity: 'HIGH', detail: 'Liens, clouds, IRS. Title search essential.' },
  },

  // ── TAMPA BAY MARKET CONDITIONS (2025) ────────────────────────────────────
  marketConditions: {
    days_on_market:     { a_tier: 25, b_tier: 35, c_tier: 55, notes: 'Retail days on market by tier.' },
    list_to_sale_ratio: { a_tier: 0.98, b_tier: 0.96, c_tier: 0.94, notes: 'Average sale/list price ratio.' },
    buyer_profile:      'Heavy investor/institutional competition. First-time buyers priced out $200K+. Move-up buyers active $250-400K. Cash investors active everywhere.',
    insurance_crisis:   'FL insurance market constrained. Roof age critical — many carriers wont insure 15yr+ roofs. Citizens last resort. Budget $3-6K/yr typical. Coastal zones higher.',
    rate_environment:   'Rates 6.5-7.5% retail. Hard money 9-11%. Bridge/DSCR 8-10%. Buyers more rate sensitive than 2021-2022.',
    new_construction:   'New construction pressure on comps in Wesley Chapel, Parrish, Sarasota corridors. Retail buyers choosing new over old at similar price points.',
    seasonal:           'Peak buyer season Feb-May. Slower Jun-Sep (heat + hurricane season). Q4 pickup as snowbirds return.',
    investor_competition: 'iBuyers reduced. Private equity still active in bulk. Local investors most common competition at $150-300K.',
  },

  // ── DEAL SCORING WEIGHTS ──────────────────────────────────────────────────
  // What makes a HOT deal vs PASS
  scoringFactors: {
    HOT: [
      'Profit > $60K at asking price',
      'ARV confidence HIGH with 4+ comps < 0.5mi',
      'Asking price > 15% below MAO (room to negotiate)',
      'Light cosmetic scope — low execution risk',
      'No major red flags (roof <10yr, HVAC <10yr)',
      'Strong buyer market (A or B tier neighborhood)',
      'Under $300K asking (widest buyer pool)',
    ],
    BUY: [
      'Profit $40-60K at asking',
      'ARV confidence MEDIUM-HIGH',
      'Asking within 10% of MAO',
      'Full rehab but well-scoped',
      'No deal-breaker red flags',
    ],
    REVIEW: [
      'Profit $25-40K — below minimum but possible at counter',
      'ARV confidence LOW — comps thin',
      'Missing key info (condition, systems)',
      'Some red flags that need investigation',
      'Numbers work IF wholesaler comes down',
    ],
    PASS: [
      'Profit < $25K at asking with no counter room',
      'ARV inflated — real profit negative',
      'Multiple red flags',
      'Outside target market',
      'Seller unrealistic on price',
    ],
    HARD_NO: [
      'Chinese drywall, sinkhole, or severe structural',
      'Active code violations / open permits blocking close',
      'Title issues that cant be cleared',
      'Environmental contamination',
      'Negative profit even at aggressive counter',
      'HOA that prohibits flip/rental',
    ],
  },

  // ── OFFER STRATEGY RULES ──────────────────────────────────────────────────
  offerTerms: {
    standard: {
      inspection_period: '7-10 days',
      closing_timeline: '21-30 days',
      emd: '$2,500-5,000 for <$200K deals, $5,000-10,000 for $200K+',
      financing_contingency: 'None — cash or hard money',
      as_is: true,
      assignment_rights: 'Get if possible — keeps options open',
    },
    negotiation_tactics: [
      'Lead with close speed (21-day close = value to motivated seller)',
      'Minimal EMD until after inspection period',
      'AS-IS kills risk but justify with condition',
      'Access for contractors during inspection period',
      'If countering: move in $5K increments, not $10K',
      'Price reduction after inspection is normal — build in room',
    ],
  },

  // ── CORALSTONE SPECIFIC INTEL ─────────────────────────────────────────────
  coralstone: {
    sweet_spots: [
      'Pasco County $150-300K asking — least competition, know the market',
      'Hillsborough $200-350K — strong buyer pool, reliable exits',
      '3/2 SFR 1200-2000sqft — most active buyer segment',
      'HVAC 2015+ preferred — no HVAC = add $6-10K',
      'Roof <10 years preferred — adds confidence, saves insurance fight',
      'Vacant properties — faster close, no tenant issues',
    ],
    avoid: [
      'Flood Zone AE — insurance kills buyer pool',
      'Condo/HOA that restricts rental — limits exit',
      'Active tenant with lease — complicates timeline',
      'Lots with septic failure — open-ended cost',
      'Price points >$450K — thinner buyer pool, more competition',
      'Hernando unless deep value (Spring Hill <$175K ask)',
    ],
    target_exits: [
      'Owner-occupant retail buyers (3/2 SFR sweet spot)',
      'Investor buyers for cash-flow at $200K-',
      'First-time buyers with FHA ($250K and under)',
    ],
    hml_partners: 'Hard money at 9.5% is standard. 90% LTV on purchase. May need 100% on purchase + rehab depending on deal.',
  },
};

module.exports = TAMPA_KNOWLEDGE;
