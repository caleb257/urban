/**
 * URBAN AUTO-UNDERWRITE TRIGGER
 * ==============================
 * Add this to the Google Sheet that Derek sends deals to.
 * 
 * Setup:
 * 1. In Google Sheets, go to Extensions → Apps Script
 * 2. Replace the default code with this entire file
 * 3. Save (Ctrl+S)
 * 4. Set up a trigger:
 *    - Click "Triggers" (clock icon on left)
 *    - Add Trigger: Function = onSheetEdit, Event = "On edit"
 *    - Save
 * 
 * Now every time Derek adds a new row, Urban underwrites it within seconds.
 */

const URBAN_WEBHOOK_URL = 'https://urban-production-cffb.up.railway.app/api/webhook/new-deal';
const URBAN_SECRET = 'coralstone2025';

/**
 * Fires on every edit to the spreadsheet.
 * Only triggers the webhook when a new deal row is added
 * (a new row with an address in column A or B).
 */
function onSheetEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    
    // Only watch the Active Deals tab
    if (sheetName !== 'Active Deals') return;
    
    // Only trigger when editing column A or B (address columns)
    const col = e.range.getColumn();
    if (col > 3) return; // Only first 3 columns trigger
    
    const row = e.range.getRow();
    if (row <= 1) return; // Skip header
    
    // Check if this looks like a new deal (has an address)
    const addressCell = sheet.getRange(row, 1).getValue() || 
                        sheet.getRange(row, 2).getValue();
    if (!addressCell || String(addressCell).trim().length < 5) return;
    
    // Don't re-trigger if we just triggered for this row recently
    const lastTriggerKey = 'lastTriggerRow_' + sheetName;
    const props = PropertiesService.getScriptProperties();
    const lastRow = parseInt(props.getProperty(lastTriggerKey) || '0');
    const lastTime = parseInt(props.getProperty('lastTriggerTime') || '0');
    const now = Date.now();
    
    // Debounce: don't trigger same row within 30 seconds
    if (lastRow === row && (now - lastTime) < 30000) return;
    
    props.setProperty(lastTriggerKey, String(row));
    props.setProperty('lastTriggerTime', String(now));
    
    // Fire the Urban webhook
    const payload = {
      secret: URBAN_SECRET,
      source: 'google_sheets',
      sheetName: sheetName,
      row: row,
      address: String(addressCell).trim(),
      triggeredAt: new Date().toISOString()
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(URBAN_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      Logger.log(`Urban webhook triggered for row ${row}: ${addressCell}`);
    } else {
      Logger.log(`Urban webhook failed: ${responseCode} - ${response.getContentText()}`);
    }
    
  } catch(err) {
    Logger.log('Urban webhook error: ' + err.message);
  }
}

/**
 * Manual trigger — run this function from the Apps Script editor
 * to test the webhook connection.
 */
function testWebhook() {
  const response = UrlFetchApp.fetch(URBAN_WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ secret: URBAN_SECRET, source: 'manual_test' }),
    muteHttpExceptions: true
  });
  Logger.log('Response: ' + response.getResponseCode() + ' - ' + response.getContentText());
}
