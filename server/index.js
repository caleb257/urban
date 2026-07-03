// BUILD: 2026-06-11 19:20:56
require('dotenv').config({ path: '../.env' });
const DB = require('./db');
const TAMPA = require('./tampaKnowledge');

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
const EMBEDDED_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\"><!-- build:1781206739 -->\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Urban — Coralstone Capital Underwriter</title>\n<link href=\"https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css\">\n<script src=\"https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js\"></script>\n<style>\n:root{--bg:#0a0a0f;--bg2:#111118;--bg3:#18181f;--border:#22222e;--border2:#2e2e3e;--text:#e8e8f0;--muted:#666680;--accent:#c8a96e;--accent2:#e8c98e;--hot:#ff4444;--buy:#44cc88;--review:#f0a030;--pass:#6688aa;--go:#44cc88;--mono:'DM Mono',monospace;--sans:'DM Sans',sans-serif;--display:'Bebas Neue',sans-serif}\n*{box-sizing:border-box;margin:0;padding:0}\nbody{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}\n/* LOGIN */\n#login-screen{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:20px}\n#login-screen h1{font-family:var(--display);font-size:80px;color:var(--accent);letter-spacing:6px}\n#login-screen .sub{color:var(--muted);font-size:11px;letter-spacing:3px;text-transform:uppercase}\n#login-form{display:flex;gap:10px}\n#login-form input{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:12px 20px;border-radius:4px;font-family:var(--mono);font-size:14px;width:240px;outline:none}\n#login-form input:focus{border-color:var(--accent)}\n#login-btn{background:var(--accent);color:#000;border:none;padding:12px 28px;border-radius:4px;font-family:var(--sans);font-weight:700;cursor:pointer;font-size:14px;letter-spacing:1px}\n#login-err{color:var(--hot);font-size:12px;display:none}\n/* LAYOUT */\n#app{display:none;height:100vh;overflow:hidden}\n#sidebar{position:fixed;left:0;top:0;bottom:0;width:310px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:100}\n#main{margin-left:310px;height:100vh;overflow-y:auto;position:relative}\n/* SIDEBAR */\n#sidebar-header{padding:20px 18px 16px;border-bottom:1px solid var(--border)}\n#sidebar-header h1{font-family:var(--display);font-size:38px;color:var(--accent);letter-spacing:4px}\n#sidebar-header p{color:var(--muted);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px}\n#stats-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:12px 18px;border-bottom:1px solid var(--border)}\n.stat-chip{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px 10px;text-align:center}\n.stat-chip .val{font-family:var(--display);font-size:19px;color:var(--accent)}\n.stat-chip .lbl{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}\n#search-wrap{padding:10px 18px;border-bottom:1px solid var(--border)}\n#search-input{width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:8px 12px;border-radius:4px;font-family:var(--sans);font-size:13px;outline:none}\n#search-input:focus{border-color:var(--accent)}\n#filter-bar{display:flex;padding:8px 18px;gap:5px;border-bottom:1px solid var(--border);flex-wrap:wrap}\n.ftab{padding:3px 10px;border-radius:20px;font-size:11px;border:1px solid var(--border2);color:var(--muted);cursor:pointer;font-weight:500;letter-spacing:.5px;transition:all .15s}\n.ftab:hover{border-color:var(--accent);color:var(--accent)}\n.ftab.on{background:var(--accent);border-color:var(--accent);color:#000}\n#deal-list{flex:1;overflow-y:auto}\n.di{padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s}\n.di:hover{background:var(--bg3)}\n.di.active{background:var(--bg3);border-left:3px solid var(--accent);padding-left:15px}\n.di-addr{font-size:13px;font-weight:500;margin-bottom:3px}\n.di-city{font-size:11px;color:var(--muted);margin-bottom:5px}\n.di-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}\n.di-price{font-family:var(--mono);font-size:12px;color:var(--accent)}\n.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:1px;text-transform:uppercase}\n.b-HOT{background:linear-gradient(135deg,rgba(255,100,30,.3),rgba(255,200,0,.2));color:#ff8030;border:1px solid rgba(255,140,40,.5);text-shadow:0 0 8px rgba(255,120,0,.4)}\n.b-BUY{background:rgba(68,204,136,.2);color:var(--buy);border:1px solid rgba(68,204,136,.4)}\n.b-REVIEW{background:rgba(240,160,48,.2);color:var(--review);border:1px solid rgba(240,160,48,.4)}\n.b-PASS{background:rgba(102,136,170,.2);color:var(--pass);border:1px solid rgba(102,136,170,.4)}\n.b-HARDNO{background:rgba(68,17,34,.4);color:#cc4466;border:1px solid rgba(204,68,102,.3)}\n.b-PENDING{background:rgba(100,100,120,.2);color:var(--muted);border:1px solid var(--border2)}\n.di-score{font-family:var(--mono);font-size:11px;color:var(--muted)}\n#ref-btn{margin:10px 18px;background:var(--bg3);border:1px solid var(--border2);color:var(--muted);padding:8px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-family:var(--sans);width:calc(100% - 36px);transition:all .15s}\n#ref-btn:hover{border-color:var(--accent);color:var(--accent)}\n/* MAIN */\n#main-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:14px}\n#main-empty h2{font-family:var(--display);font-size:52px;color:var(--border2);letter-spacing:5px}\n#main-empty p{font-size:13px}\n#dv{display:none;padding:28px;max-width:1100px}\n.dv-addr{font-family:var(--display);font-size:44px;letter-spacing:2px;line-height:1}\n.dv-city{font-size:14px;color:var(--muted);margin-top:6px;letter-spacing:.5px}\n.dv-hm{display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap}\n.verdict-big{font-family:var(--display);font-size:30px;letter-spacing:3px;padding:6px 20px;border-radius:4px}\n.vHOT{background:rgba(255,68,68,.15);color:var(--hot);border:2px solid rgba(255,68,68,.5)}\n.vBUY{background:rgba(68,204,136,.15);color:var(--buy);border:2px solid rgba(68,204,136,.5)}\n.vREVIEW{background:rgba(240,160,48,.15);color:var(--review);border:2px solid rgba(240,160,48,.5)}\n.vPASS{background:rgba(102,136,170,.15);color:var(--pass);border:2px solid rgba(102,136,170,.5)}\n.vHARDNO{background:rgba(68,17,34,.3);color:#cc4466;border:2px solid rgba(204,68,102,.4)}\n.vPENDING{background:var(--bg3);color:var(--muted);border:2px solid var(--border2)}\n.sc{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:24px;border:2px solid var(--accent);color:var(--accent);background:rgba(200,169,110,.1)}\n.vr{color:var(--muted);font-size:14px;font-style:italic;flex:1;min-width:200px}\n.act-row{display:flex;gap:8px;margin:20px 0;flex-wrap:wrap}\n.btn{padding:9px 18px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--sans);font-size:13px;font-weight:500;transition:all .15s;display:flex;align-items:center;gap:5px}\n.btn:hover{border-color:var(--accent);color:var(--accent)}\n.btn.primary{background:var(--accent);color:#000;border-color:var(--accent)}\n.btn.primary:hover{background:var(--accent2)}\n.btn-deep{background:#1a1a2e;border-color:#6c63ff;color:#6c63ff}\n/* PENDING / LOADING */\n#pending-card{background:var(--bg2);border:1px dashed var(--border2);border-radius:6px;padding:40px;text-align:center;margin-bottom:20px;display:none}\n#pending-card h3{font-family:var(--display);font-size:28px;color:var(--muted);letter-spacing:2px;margin-bottom:10px}\n#pending-card p{color:var(--muted);font-size:13px;margin-bottom:18px}\n#loading-state{display:none;text-align:center;padding:60px}\n.spinner{width:32px;height:32px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 14px}\n@keyframes spin{to{transform:rotate(360deg)}}\n.load-txt{font-size:13px;color:var(--muted);font-family:var(--mono)}\n/* UW CONTENT & TABS */\n#uw-content{display:none}\n.stabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:20px;gap:0;overflow-x:auto}\n.stab{padding:9px 16px;cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;white-space:nowrap;letter-spacing:.5px;user-select:none}\n.stab:hover{color:var(--text)}\n.stab.on{color:var(--accent);border-bottom-color:var(--accent)}\n.tc{display:none}\n.tc.active{display:block}\n/* CARDS / GRID */\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:20px}\n.card{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:18px}\n.ct{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;font-weight:600}\n.m{margin-bottom:10px}\n.ml{font-size:11px;color:var(--muted);margin-bottom:3px}\n.mv{font-family:var(--mono);font-size:14px;color:var(--text)}\n.mv.big{font-family:var(--display);font-size:26px;color:var(--accent)}\n.mv.g{color:var(--buy)}.mv.r{color:var(--hot)}.mv.y{color:var(--review)}.mv.mu{color:var(--muted)}\nhr.d{border:none;border-top:1px solid var(--border);margin:10px 0}\n/* ARV */\n.arv-cmp{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-radius:6px;overflow:hidden;margin-bottom:14px}\n.arv-s{background:var(--bg2);padding:18px;text-align:center}\n.arv-l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}\n.arv-v{font-family:var(--display);font-size:30px}\n.arv-v.ws{color:var(--review)}.arv-v.ur{color:var(--buy)}\n.arv-dn{padding:10px 18px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;font-size:13px;color:var(--muted);text-align:center;margin-bottom:14px}\n.conf{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:1px}\n.conf-HIGH{background:rgba(68,204,136,.2);color:var(--buy)}\n.conf-MEDIUM{background:rgba(240,160,48,.2);color:var(--review)}\n.conf-LOW{background:rgba(255,68,68,.2);color:var(--hot)}\n/* REHAB */\n.ri{display:flex;flex-direction:column;gap:5px}\n.rr{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)}\n.rr:last-child{border-bottom:none}\n.rn{font-size:12px;color:var(--muted);text-transform:capitalize}\n.rv{font-family:var(--mono);font-size:13px;color:var(--text)}\n.rt{display:flex;justify-content:space-between;padding:10px 0 0}\n.rt .rn{color:var(--text);font-weight:600}\n.rt .rv{color:var(--accent);font-size:14px}\n.rrange{font-size:11px;color:var(--muted);margin-top:6px;font-family:var(--mono)}\n.scope-tag{display:inline-block;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:600;letter-spacing:1px;margin-bottom:10px}\n.sc-FULL{background:rgba(255,68,68,.15);color:var(--hot);border:1px solid rgba(255,68,68,.3)}\n.sc-MEDIUM{background:rgba(240,160,48,.15);color:var(--review);border:1px solid rgba(240,160,48,.3)}\n.sc-LIGHT{background:rgba(68,204,136,.15);color:var(--buy);border:1px solid rgba(68,204,136,.3)}\n/* FINANCIALS */\n.fr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)}\n.fr:last-child{border-bottom:none}\n.fl{font-size:13px;color:var(--muted)}\n.fv{font-family:var(--mono);font-size:13px;color:var(--text)}\n.fr.tot .fl{color:var(--text);font-weight:600}\n.fr.tot .fv{color:var(--accent);font-size:14px}\n.fr.g .fv{color:var(--buy)}.fr.r .fv{color:var(--hot)}\n/* OVERRIDES */\n.ov-input{background:var(--bg);border:1px solid var(--border2);color:var(--text);padding:6px 10px;border-radius:4px;font-family:var(--mono);font-size:13px;width:140px;outline:none}\n.ov-input:focus{border-color:var(--accent)}\n.ov-row{display:flex;gap:8px;margin-top:10px;align-items:center}\n.ov-lbl{font-size:12px;color:var(--muted)}\n.ov-btn{padding:6px 12px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--muted);cursor:pointer;font-size:12px;transition:all .15s}\n.ov-btn:hover{border-color:var(--accent);color:var(--accent)}\n/* COMPS TABLE */\n.comps-t{width:100%;border-collapse:collapse;font-size:12px}\n.comps-t th{padding:7px 10px;text-align:left;color:var(--muted);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--border)}\n.comps-t td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text)}\n.comps-t tr:last-child td{border-bottom:none}\n.comps-t td.p{font-family:var(--mono);color:var(--accent)}\n/* FLAGS */\n.flags{display:flex;flex-direction:column;gap:8px}\n.flag{padding:12px 14px;border-radius:4px;border-left:3px solid;background:var(--bg3)}\n.flag-HIGH{border-left:4px solid var(--hot);background:rgba(255,68,68,.06)}.flag-MEDIUM{border-left:4px solid var(--review);background:rgba(240,160,48,.04)}.flag-LOW{border-left:4px solid var(--pass);background:rgba(102,136,170,.04)}\n.fn{font-size:12px;font-weight:600;margin-bottom:4px}\n.flag-HIGH .fn{color:var(--hot)}.flag-MEDIUM .fn{color:var(--review)}.flag-LOW .fn{color:var(--pass)}\n.fd{font-size:12px;color:var(--muted);line-height:1.5}\n/* OVERVIEW */\n.rec-box{background:linear-gradient(135deg,rgba(200,169,110,.08),rgba(200,169,110,.03));border:1px solid rgba(200,169,110,.3);border-radius:8px;padding:20px 22px;margin-bottom:20px;position:relative}\n.rec-box::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);border-radius:8px 0 0 8px}\n.rec-txt{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:14px}\n.off-strat{font-size:13px;line-height:1.7;color:var(--accent);font-style:italic}\n/* CHAT */\n#chat-panel{position:fixed;right:0;top:0;bottom:0;width:380px;background:var(--bg2);border-left:1px solid var(--border);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s ease;z-index:200}\n#chat-panel.open{transform:translateX(0)}\n#chat-hdr{padding:18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}\n#chat-hdr h3{font-family:var(--display);font-size:24px;color:var(--accent);letter-spacing:2px}\n#chat-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px}\n#chat-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}\n.cm{max-width:88%}\n.cm.u{align-self:flex-end}\n.cm.u .bbl{background:var(--accent);color:#000;padding:9px 13px;border-radius:12px 12px 2px 12px;font-size:13px;line-height:1.5}\n.cm.a .bbl{background:var(--bg3);color:var(--text);padding:9px 13px;border-radius:12px 12px 12px 2px;font-size:13px;line-height:1.6;border:1px solid var(--border2)}\n.cts{font-size:10px;color:var(--muted);margin-top:3px}\n.sender{font-size:10px;font-weight:700;letter-spacing:.4px;color:var(--muted);margin-bottom:2px}\n.cm.u .sender{text-align:right;color:rgba(200,169,110,.6)}\n.cm.a .sender{color:var(--muted)}\n.cm.a .cts{text-align:left}.cm.u .cts{text-align:right}\n#chat-in-wrap{padding:14px;border-top:1px solid var(--border)}\n.auth-sel{display:flex;gap:7px;margin-bottom:8px}\n.auth-btn{flex:1;padding:6px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--muted);cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}\n.auth-btn.on{border-color:var(--accent);color:var(--accent);background:rgba(200,169,110,.1)}\n#chat-in{width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:9px 13px;border-radius:4px;font-family:var(--sans);font-size:13px;outline:none;resize:none;min-height:65px;line-height:1.5}\n#chat-in:focus{border-color:var(--accent)}\n#chat-send{width:100%;margin-top:7px;background:var(--bg3);border:1px solid var(--border2);color:var(--accent);padding:9px;border-radius:4px;cursor:pointer;font-family:var(--sans);font-size:13px;font-weight:600;transition:all .15s}\n#chat-send:hover{background:var(--accent);color:#000;border-color:var(--accent)}\n/* PROPERTY TAB */\n.fsec{background:var(--bg2);border:1px solid var(--border);border-radius:6px;margin-bottom:12px;overflow:hidden}\n.fst{font-size:10px;letter-spacing:2px;font-weight:700;color:var(--muted);background:var(--bg3);padding:10px 16px;text-transform:uppercase;border-bottom:1px solid var(--border)}\n.prow{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);gap:16px}\n.prow:last-child{border-bottom:none}\n.plbl{font-size:11px;color:var(--muted);flex:0 0 140px;padding-top:2px}\n.pval{font-size:13px;color:var(--text);text-align:right;flex:1;line-height:1.5;word-break:break-word}\n.prow.big .pval{font-size:20px;font-weight:700;color:var(--accent);font-family:var(--display)}\n.prow.warn .pval,.prow.warn .plbl{color:var(--hot)}\n.prow.pos .pval,.prow.pos .plbl{color:var(--go)}\n.pnote{font-size:12px;color:var(--text);line-height:1.6;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04)}\n.pnote:last-child{border-bottom:none}\n.pnote-lbl{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}\n/* MISC */\n::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}\na{color:var(--accent)}\n#sort-select:hover{border-color:var(--accent)}\n.neg-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)}\n.neg-row:last-child{border-bottom:none}\n.neg-label{font-size:10px;font-weight:700;padding:2px 9px;border-radius:3px;min-width:68px;text-align:center;letter-spacing:.5px}\n.neg-price{font-family:var(--mono);font-size:13px;color:var(--text);flex:1}\n.neg-profit{font-family:var(--mono);font-size:12px;font-weight:600;min-width:90px}\n.neg-roi{font-size:11px;color:var(--muted);font-family:var(--mono)}\n.neg-ok{color:var(--buy)}.neg-no{color:var(--review)}.neg-bad{color:var(--hot)}\n.leaflet-popup-content-wrapper{background:var(--bg3);color:var(--text);border-radius:8px;border:1px solid var(--border2)}\n.leaflet-popup-tip{background:var(--bg3);border:1px solid var(--border2)}\n.leaflet-popup-content{margin:14px 16px;font-family:var(--sans);min-width:200px}\n.leaflet-container a.leaflet-popup-close-button{color:var(--muted)}\n.leaflet-container{background:var(--bg2);font-family:var(--sans)}\n.map-pin-addr{font-size:14px;font-weight:600;color:var(--text);margin-bottom:3px}\n.map-pin-city{font-size:12px;color:var(--muted);margin-bottom:9px}\n.map-pin-meta{display:flex;align-items:center;gap:8px;margin-bottom:11px;flex-wrap:wrap}\n.map-pin-btn{display:block;width:100%;text-align:center;background:var(--accent);color:#000;border:none;border-radius:5px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--sans)}\n.ql-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-weight:600;text-decoration:none;transition:background .15s;white-space:nowrap}.ql-btn:hover{background:var(--bg2)}\n.NEEDCOMPS{background:rgba(224,148,32,.12) !important;color:#e09420 !important;border-color:rgba(224,148,32,.35) !important}\n.NEEDSADDRESS{background:rgba(155,89,182,.12) !important;color:#9b59b6 !important;border-color:rgba(155,89,182,.35) !important}\n</style>\n</head>\n<body>\n\n<!-- LOGIN -->\n<div id=\"login-screen\">\n  <h1>URBAN</h1>\n  <p class=\"sub\">Coralstone Capital Group · Underwriter</p>\n  <div id=\"login-form\">\n    <input type=\"password\" id=\"pw\" placeholder=\"Password\" autocomplete=\"current-password\">\n    <button id=\"login-btn\">ENTER</button>\n  </div>\n  <p id=\"login-err\">Wrong password</p>\n</div>\n\n<!-- APP -->\n<div id=\"app\">\n  <div id=\"sidebar\">\n    <div id=\"sidebar-header\" style=\"display:flex;align-items:center;justify-content:space-between\">\n      <div>\n        <h1>URBAN</h1>\n        <p>Coralstone Underwriter</p>\n      </div>\n      <button id=\"map-view-btn\" onclick=\"showMapView()\" title=\"Deal map\" style=\"width:38px;height:38px;flex-shrink:0;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--accent);font-size:16px;cursor:pointer\">🗺️</button>\n      <button id=\"profits-view-btn\" onclick=\"showProfitsView()\" title=\"Profits\" style=\"width:38px;height:38px;flex-shrink:0;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--accent);font-size:16px;cursor:pointer\">💰</button>\n    </div>\n    <div id=\"stats-bar\">\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-total\">—</div><div class=\"lbl\">Underwritten</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-avg\">—</div><div class=\"lbl\">Avg Score</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-hot\">—</div><div class=\"lbl\">💰 Buy</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-lessons\">—</div><div class=\"lbl\">Lessons</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-profit\">—</div><div class=\"lbl\">Avg Profit</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-pct\">—</div><div class=\"lbl\">BUY %</div></div>\n      <div class=\"stat-chip\" title=\"Urban ARV vs Wholesaler avg difference\"><div class=\"val\" id=\"st-arv-acc\" style=\"font-size:14px\">—</div><div class=\"lbl\">ARV vs WS</div><div style=\"font-size:9px;color:var(--muted);line-height:1.2\" id=\"st-arv-tot\"></div></div>\n      <div class=\"stat-chip\" title=\"Click to exclude Hard No deals from stats and list\" id=\"hardno-toggle-chip\" onclick=\"toggleHardNo()\" style=\"cursor:pointer;opacity:.7\">\n        <div class=\"val\" id=\"hardno-toggle-icon\">⛔</div>\n        <div class=\"lbl\" id=\"hardno-toggle-lbl\">Inc. Hard No</div>\n      </div>\n    </div>\n    <div id=\"search-wrap\" style=\"display:flex;gap:6px;align-items:center;padding:10px 18px\">\n      <input type=\"text\" id=\"search-input\" placeholder=\"Search...\" style=\"flex:1\">\n      <select id=\"sort-select\" title=\"Sort\" style=\"background:var(--bg3);border:1px solid var(--border2);color:var(--muted);padding:6px 5px;border-radius:4px;font-size:11px;font-family:var(--sans);outline:none;cursor:pointer;width:82px\"><option value=\"date-new\">↓ New</option><option value=\"date-old\">↑ Old</option><option value=\"score-high\">↓ Score</option><option value=\"expires\">⏰ Expires</option><option value=\"ask-low\">↑ Price</option></select>\n    </div>\n    <div id=\"filter-bar\">\n      <div class=\"ftab on\" data-f=\"ALL\">All</div>\n      <div class=\"ftab\" data-f=\"BUY\">💰 Buy</div>\n      \n      <div class=\"ftab\" data-f=\"REVIEW\">Review</div>\n      <div class=\"ftab\" data-f=\"PASS\">Pass</div>\n      <div class=\"ftab\" data-f=\"HARDNO\">Hard No</div>\n      <div class=\"ftab\" data-f=\"NEEDS_ARV\" title=\"Deals without sold comps — click ⚡ to pull live comps on each\">Need Comps</div>\n      <div class=\"ftab\" data-f=\"PENDING\">Pending</div>\n    </div>\n    <div id=\"deal-list\"></div>\n    <div style=\"display:flex;gap:6px;padding:0 12px\">\n      \n        <button id=\"add-deal-btn-sidebar\" onclick=\"openAddDeal()\" style=\"flex:1;background:rgba(255,200,80,.08);border:1px solid rgba(255,200,80,.25);border-radius:6px;color:var(--accent);font-size:12px;font-weight:700;padding:7px 10px;cursor:pointer;letter-spacing:.2px;white-space:nowrap\">&#x2795; Add Deal</button>\n        <button id=\"ref-btn\" style=\"flex:1\">↻ Pull from Derek's Sheet</button>\n      <button id=\"rewrite-all-btn\" onclick=\"doRewriteAll()\" title=\"Re-underwrite all deals with updated brain\" style=\"padding:8px 10px;font-size:10px;background:rgba(255,160,32,.1);border-color:rgba(255,160,32,.3);color:rgba(255,160,32,.8)\">⚡ All</button>\n    </div>\n    <div id=\"ws-scorecards\" style=\"padding:8px 12px;border-top:1px solid var(--border)\">\n      <div style=\"display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0\" onclick=\"toggleWsPanel()\">\n        <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.5px\">🏆 WHOLESALER SCORES</div>\n        <span id=\"ws-toggle-icon\" style=\"font-size:10px;color:var(--muted)\">▼</span>\n      </div>\n      <div id=\"ws-panel\" style=\"display:none;margin-top:6px\">\n        <div id=\"ws-list\" style=\"display:flex;flex-direction:column;gap:3px\"></div>\n        <div style=\"font-size:9px;color:var(--muted);margin-top:5px;opacity:.6\">Hit rate = BUY or HOT deals</div>\n      </div>\n    </div>\n  </div>\n\n  <div id=\"sold-modal\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;align-items:center;justify-content:center\">\n    <div style=\"background:var(--bg3);border:1px solid rgba(255,215,0,.3);border-radius:10px;padding:24px;width:360px;max-width:90vw\">\n      <div style=\"font-size:15px;font-weight:700;margin-bottom:4px;color:var(--gold)\">🤝 Lost to Another Buyer</div>\n      <div style=\"font-size:11px;color:var(--muted);margin-bottom:14px\">They sold it before we could lock it up. This logs why and trains Urban's brain — the deal leaves your active pipeline.</div>\n      <div style=\"display:flex;flex-direction:column;gap:10px\">\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:4px\">What happened?</div>\n          <select id=\"lost-reason\" style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:7px 10px;font-size:13px\">\n            <option value=\"lost_price\">Another buyer offered more</option>\n            <option value=\"lost_speed\">Another buyer moved faster / closed quicker</option>\n            <option value=\"seller_changed_mind\">Seller backed out / decided not to sell</option>\n            <option value=\"lost_unresponsive\">Wholesaler went unresponsive</option>\n            <option value=\"other\">Other</option>\n          </select>\n        </div>\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:4px\">What did it reportedly sell for? (optional — often unknown)</div>\n          <div style=\"display:flex;align-items:center;gap:4px\">\n            <span style=\"color:var(--muted)\">$</span>\n            <input id=\"lost-price\" type=\"number\" placeholder=\"Leave blank if unknown\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:7px 10px;font-size:14px;font-weight:600\">\n          </div>\n        </div>\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:4px\">Notes — this is what trains Urban</div>\n          <textarea id=\"lost-notes\" rows=\"3\" placeholder=\"e.g. Called 20 min after the email went out — wholesaler said someone already wired EMD at full ask. We were $6K under.\" style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:7px 10px;font-size:12px;box-sizing:border-box;resize:vertical;font-family:var(--sans)\"></textarea>\n        </div>\n      </div>\n      <div style=\"display:flex;gap:8px;margin-top:14px\">\n        <button onclick=\"closeLostForm()\" style=\"flex:1;padding:9px;background:transparent;border:1px solid var(--border2);border-radius:5px;color:var(--muted);cursor:pointer\">Cancel</button>\n        <button onclick=\"saveLost()\" id=\"lost-submit-btn\" style=\"flex:2;padding:9px;background:rgba(255,215,0,.15);border:1px solid rgba(255,215,0,.4);border-radius:5px;color:var(--gold);font-weight:700;cursor:pointer;font-size:13px\">Archive Deal</button>\n      </div>\n    </div>\n  </div>\n\n  <div id=\"purchased-modal\" style=\"display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;align-items:center;justify-content:center\">\n    <div style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:10px;padding:24px;width:320px;max-width:90vw\">\n      <div style=\"font-size:14px;font-weight:700;margin-bottom:12px\">🏠 Log Purchase</div>\n      <div style=\"display:flex;flex-direction:column;gap:10px\">\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Actual purchase price</div>\n          <div style=\"display:flex;align-items:center;gap:4px\"><span style=\"color:var(--muted)\">$</span><input id=\"oc-purchase\" type=\"number\" placeholder=\"0\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:14px;font-weight:600\"></div>\n        </div>\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Strategy</div>\n          <select id=\"oc-strategy\" onchange=\"updatePurchasedFormFields()\" style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:13px\">\n            <option value=\"flip\">Flip</option>\n            <option value=\"brrrr\">BRRRR / Hold</option>\n            <option value=\"wholesale\">Wholesale</option>\n          </select>\n        </div>\n        <div id=\"oc-flip-fields\">\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Actual rehab spend</div>\n          <div style=\"display:flex;align-items:center;gap:4px\"><span style=\"color:var(--muted)\">$</span><input id=\"oc-rehab\" type=\"number\" placeholder=\"0\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:14px;font-weight:600\"></div>\n        </div>\n        <div id=\"oc-arv-field\">\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Expected ARV</div>\n          <div style=\"display:flex;align-items:center;gap:4px\"><span style=\"color:var(--muted)\">$</span><input id=\"oc-arv\" type=\"number\" placeholder=\"0\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:14px;font-weight:600\"></div>\n        </div>\n        <div id=\"oc-wholesale-field\" style=\"display:none\">\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Wholesale fee charged</div>\n          <div style=\"display:flex;align-items:center;gap:4px\"><span style=\"color:var(--muted)\">$</span><input id=\"oc-wholesale-fee\" type=\"number\" placeholder=\"0\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:14px;font-weight:600\"></div>\n        </div>\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Actual profit (if known)</div>\n          <div style=\"display:flex;align-items:center;gap:4px\"><span style=\"color:var(--muted)\">$</span><input id=\"oc-profit\" type=\"number\" placeholder=\"Leave blank if not closed yet\" style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:14px;font-weight:600\"></div>\n        </div>\n        <div>\n          <div style=\"font-size:11px;color:var(--muted);margin-bottom:3px\">Notes</div>\n          <input id=\"oc-notes\" type=\"text\" placeholder=\"What Urban got right or wrong...\" style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:6px 8px;font-size:12px;box-sizing:border-box\">\n        </div>\n      </div>\n      <div style=\"display:flex;gap:8px;margin-top:14px\">\n        <button onclick=\"closePurchasedForm()\" style=\"flex:1;padding:8px;background:transparent;border:1px solid var(--border2);border-radius:5px;color:var(--muted);cursor:pointer\">Cancel</button>\n        <button onclick=\"savePurchasedOutcome()\" style=\"flex:2;padding:8px;background:rgba(60,200,130,.15);border:1px solid rgba(60,200,130,.4);border-radius:5px;color:var(--buy);font-weight:700;cursor:pointer\">Log Outcome</button>\n      </div>\n    </div>\n  </div>\n\n  <div id=\"main\">\n    <div id=\"main-empty\">\n      <h2>SELECT A DEAL</h2>\n      <p>Deals auto-underwrite when they arrive. Click one to review.</p>\n    </div>\n\n    <div id=\"main-map\" style=\"display:none;position:relative;width:calc(100vw - 310px);height:100vh\">\n      <div style=\"position:absolute;top:16px;left:16px;z-index:1000;display:flex;gap:8px;align-items:center\">\n        <button onclick=\"hideMapView()\" style=\"padding:8px 16px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--accent);font-family:var(--sans);font-size:13px;font-weight:600;cursor:pointer\">← Back to List</button>\n        <div id=\"map-pending-note-d\" style=\"display:none;align-items:center;gap:8px;padding:8px 14px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;font-size:12px;color:var(--muted)\">\n          <div class=\"spinner\" style=\"width:13px;height:13px;margin:0;border-width:2px\"></div>\n          <span id=\"map-pending-text-d\"></span>\n        </div>\n      </div>\n      <div id=\"map-canvas-d\" style=\"width:100%;height:100%\"></div>\n    </div>\n\n    <div id=\"main-profits\" style=\"display:none;width:calc(100vw - 310px);height:100vh;overflow-y:auto;padding:32px 40px;box-sizing:border-box\">\n      <div style=\"display:flex;align-items:center;gap:14px;margin-bottom:24px\">\n        <button onclick=\"hideProfitsView()\" style=\"padding:8px 16px;background:var(--bg2);border:1px solid var(--border2);border-radius:6px;color:var(--accent);font-family:var(--sans);font-size:13px;font-weight:600;cursor:pointer\">← Back to List</button>\n        <h2 style=\"font-size:22px;letter-spacing:1px;margin:0\">💰 PROFITS</h2>\n      </div>\n      <div id=\"profits-content-d\">Loading…</div>\n    </div>\n\n    <div id=\"dv\">\n      <div class=\"dv-addr\" id=\"dv-addr\"></div>\n      <div class=\"dv-city\" id=\"dv-city\"></div>\n      <div class=\"dv-hm\">\n        <div class=\"verdict-big vPENDING\" id=\"dv-v\">PENDING</div>\n        <div class=\"sc\" id=\"dv-sc\">?</div>\n        <div class=\"vr\" id=\"dv-vr\"></div>\n      </div>\n      <div class=\"act-row\">\n        <button class=\"btn primary\" id=\"btn-uw\">⚡ Underwrite</button>\n        <button class=\"btn btn-deep\" id=\"btn-deep\" title=\"Sonnet 4 — deeper, ~$0.05\">🔬 Deep</button>\n        <button class=\"btn\" id=\"btn-reuw\">↻ Re-run</button>\n        <button class=\"btn\" id=\"btn-regen\" title=\"Recalculate verdict from current numbers — no new comps, cheap\" style=\"background:rgba(100,200,150,.08);border-color:rgba(100,200,150,.25);color:rgba(100,200,150,.9)\">⚡ Regen</button>\n        <button class=\"btn\" id=\"btn-chat\">💬 Chat</button>\n        <button class=\"btn\" id=\"btn-sheet\">📊 Sheet</button>\n        <button class=\"btn\" id=\"btn-hard-no\" onclick=\"doMarkHardNo()\" title=\"Mark this deal as Hard No — removes from pipeline\" style=\"display:none;background:rgba(255,60,60,.12);border-color:rgba(255,60,60,.3);color:rgba(255,100,100,.9)\">⛔ Hard No</button>\n        <button class=\"btn\" id=\"btn-purchased\" onclick=\"showPurchasedForm()\" style=\"display:none;background:rgba(60,200,130,.1);border-color:rgba(60,200,130,.3);color:rgba(60,200,130,.9)\">🏠 Purchased</button>\n        <button class=\"btn\" id=\"btn-sold\" onclick=\"showLostForm()\" style=\"display:none;background:rgba(255,215,0,.1);border-color:rgba(255,215,0,.35);color:rgba(255,215,0,.9);font-weight:700\">🤝 Lost to Buyer</button>\n        <button class=\"btn\" id=\"btn-photos\" style=\"display:none;background:rgba(180,140,255,.12);border-color:rgba(180,140,255,.3);color:rgba(180,140,255,.9)\" onclick=\"openPhotos()\">📸 See Photos</button>\n      </div>\n\n      <!-- DEAL TERMS BAR — shows close date, inspection period, EMD when available -->\n      <div id=\"deal-terms-bar\" style=\"display:none;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 16px;margin-bottom:10px;display:none;gap:20px;flex-wrap:wrap\">\n        <div id=\"dt-close\" style=\"display:none\"><span style=\"font-size:10px;color:var(--muted)\">CLOSE DATE</span><br><span id=\"dt-close-val\" style=\"font-size:12px;font-weight:600;color:var(--gold)\"></span></div>\n        <div id=\"dt-insp\" style=\"display:none\"><span style=\"font-size:10px;color:var(--muted)\">INSPECTION</span><br><span id=\"dt-insp-val\" style=\"font-size:12px;font-weight:600\"></span></div>\n        <div id=\"dt-emd\" style=\"display:none\"><span style=\"font-size:10px;color:var(--muted)\">EMD</span><br><span id=\"dt-emd-val\" style=\"font-size:12px;font-weight:600\"></span></div>\n      </div>\n      <div id=\"pending-card\">\n        <h3>NOT YET UNDERWRITTEN</h3>\n        <p>Urban will auto-underwrite this deal in the background. Hit ⚡ to run it now.</p>\n        <button class=\"btn primary\" id=\"btn-uw-now\">⚡ Underwrite Now</button>\n      </div>\n\n      <div id=\"loading-state\">\n        <div class=\"spinner\"></div>\n        <div class=\"load-txt\" id=\"load-msg\">Initializing...</div>\n      </div>\n\n      <div id=\"uw-content\">\n        <div class=\"stabs\" id=\"stabs-row\">\n          <div class=\"stab on\" data-t=\"overview\">Overview</div>\n          <div class=\"stab\" data-t=\"arv\">ARV Analysis</div>\n          <div class=\"stab\" data-t=\"rehab\">Rehab</div>\n          <div class=\"stab\" data-t=\"financials\">Financials</div>\n          <div class=\"stab\" data-t=\"rental\">Rental</div>\n          <div class=\"stab\" data-t=\"newconstruction\">New Construction</div>\n          <div class=\"stab\" data-t=\"flags\">Risk Flags</div>\n          <div class=\"stab\" data-t=\"property\">Property</div>\n        </div>\n\n        <!-- OVERVIEW -->\n        <div class=\"tc active\" id=\"t-overview\">\n          <!-- SEEN-BY ROW -->\n          <div id=\"seen-by-row\" style=\"display:none;margin-bottom:10px;padding:7px 12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)\">\n            <span style=\"font-size:11px;color:var(--muted)\">👁 Reviewed by:</span>&nbsp;\n            <span id=\"seen-caleb\" style=\"font-size:11px;display:none\"><strong style=\"color:var(--buy)\">Caleb</strong>&nbsp;<span id=\"seen-caleb-when\" style=\"color:var(--muted);font-size:10px\"></span></span>\n            <span id=\"seen-grant\" style=\"font-size:11px;display:none\"><strong style=\"color:var(--accent)\">Grant</strong>&nbsp;<span id=\"seen-grant-when\" style=\"color:var(--muted);font-size:10px\"></span></span>\n            <span id=\"seen-nobody\" style=\"font-size:11px;color:var(--muted);opacity:.5\">Nobody yet</span>\n          </div>\n          <!-- PRICE SANITY WARNING — shows when asking price looks off -->\n          <div id=\"price-sanity-banner\" style=\"display:none;background:rgba(255,200,0,.08);border:1px solid rgba(255,200,0,.25);border-radius:6px;padding:10px 14px;margin-bottom:10px;align-items:center;gap:12px\">\n            <span style=\"font-size:18px\">⚠️</span>\n            <span style=\"flex:1;font-size:12px;color:var(--text)\" id=\"price-sanity-msg\">Asking price may be incorrect — verify against original email</span>\n          </div>\n          <!-- PHOTO LINK BANNER — shows when photos available -->\n          <div id=\"photo-banner\" style=\"display:none;background:rgba(180,140,255,.1);border:1px solid rgba(180,140,255,.25);border-radius:6px;padding:10px 14px;margin-bottom:14px;display:none;align-items:center;gap:12px\">\n            <span style=\"font-size:18px\">📸</span>\n            <span style=\"flex:1;font-size:12px;color:var(--text)\">Photos available for this property</span>\n            <a id=\"photo-banner-link\" href=\"#\" target=\"_blank\" rel=\"noopener\" style=\"padding:5px 14px;background:rgba(180,140,255,.2);border:1px solid rgba(180,140,255,.4);border-radius:4px;color:rgba(200,160,255,.95);font-size:11px;font-weight:700;text-decoration:none;letter-spacing:.5px\">VIEW PHOTOS ↗</a>\n          </div>\n          <!-- TEAM NOTES -->\n          <div id=\"notes-card\" style=\"background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px\">\n            <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">\n              <span style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.6px\">📝 TEAM NOTES</span>\n              <span id=\"notes-count\" style=\"font-size:10px;color:var(--muted)\"></span>\n            </div>\n            <div id=\"notes-list\" style=\"display:flex;flex-direction:column;gap:8px;margin-bottom:10px;max-height:220px;overflow-y:auto\"></div>\n            <div style=\"display:flex;gap:8px;align-items:flex-end\">\n              <textarea id=\"notes-input\" placeholder=\"Add a note — Urban will use it in analysis...\" rows=\"2\"\n                style=\"flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:8px 10px;font-size:12px;font-family:var(--sans);resize:none;outline:none;line-height:1.4\"></textarea>\n              <button onclick=\"addDealNote()\" style=\"padding:7px 14px;background:var(--accent);color:#000;border:none;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap\">Add Note</button>\n            </div>\n          </div>\n\n            <div id=\"neg-ladder\" style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px;margin-bottom:16px;display:none\">\n              <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">\n                <div class=\"ct\">Negotiation Ladder</div>\n                <div style=\"font-size:10px;color:var(--muted);display:flex;gap:16px\">\n                  <span style=\"width:100px;text-align:right;font-size:9px\">OFFER PRICE</span>\n                  <span style=\"width:110px;text-align:right;font-size:9px\">NET PROFIT</span>\n                  <span style=\"width:50px;text-align:right;font-size:9px\">ROI</span>\n                </div>\n              </div>\n              <div id=\"neg-rows\"></div>\n            </div>\n            <div class=\"rec-box\">\n            <div class=\"ct\" style=\"display:flex;align-items:center;gap:8px\">Urban's Recommendation <span style=\"font-size:9px;opacity:.5;font-weight:400;letter-spacing:.5px\">INDEPENDENT ANALYSIS</span></div>\n            <div class=\"rec-txt\" id=\"ov-rec\"></div>\n            <div class=\"off-strat\" id=\"ov-off\"></div>\n          </div>\n          <div class=\"grid\">\n            <div class=\"card\">\n              <div class=\"ct\">Key Numbers</div>\n              <div class=\"m\"><div class=\"ml\">Urban's TRUE ARV</div><div class=\"mv big\" id=\"ov-arv\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Rehab Estimate</div><div class=\"mv\" id=\"ov-rehab\"></div></div>\n              <div class=\"m\"><div class=\"ml\">MAO (Max Offer)</div><div class=\"mv\" id=\"ov-mao\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Asking Price</div><div class=\"mv\" id=\"ov-ask\"></div></div>\n              <hr class=\"d\">\n              <div class=\"m\"><div class=\"ml\">Net Profit @ Asking <span style=\"font-size:9px;opacity:.5\">(ARV minus all-in)</span></div><div class=\"mv\" id=\"ov-profit\"></div></div>\n              <div class=\"m\" id=\"ov-spread-row\" style=\"display:none\"><div class=\"ml\" style=\"font-size:10px;color:var(--muted)\">Room below MAO</div><div class=\"mv\" id=\"ov-spread-mao\" style=\"color:var(--buy);font-size:12px\"></div></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">ARV Comparison</div>\n              <div class=\"m\"><div class=\"ml\">Wholesaler's ARV</div><div class=\"mv y\" id=\"ov-warv\"></div></div>\n              <div class=\"m\"><div class=\"ml\">ARV Variance</div><div class=\"mv\" id=\"ov-arvdiff\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Wholesaler Credibility</div><div class=\"mv\" id=\"ov-cred\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Market Trend</div><div class=\"mv\" id=\"ov-trend\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Estimated Hold</div><div class=\"mv\" id=\"ov-hold\"></div></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">Criteria Check</div>\n              <div class=\"m\"><div class=\"ml\">Profit Min (10%)</div><div class=\"mv\" id=\"cc-profit\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Exit Market</div><div class=\"mv\" id=\"cc-mkt\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Flood Zone</div><div class=\"mv\" id=\"cc-flood\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Risk Level</div><div class=\"mv\" id=\"cc-risk\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Rehab Scope</div><div class=\"mv\" id=\"cc-scope\"></div></div>\n            </div>\n          </div>\n        </div>\n\n        <!-- ARV -->\n        <div class=\"tc\" id=\"t-arv\">\n          <div class=\"arv-cmp\">\n            <div class=\"arv-s\"><div class=\"arv-l\">Wholesaler's ARV</div><div class=\"arv-v ws\" id=\"arv-ws\"></div></div>\n            <div class=\"arv-s\"><div class=\"arv-l\">Urban's TRUE ARV</div><div class=\"arv-v ur\" id=\"arv-ur\"></div></div>\n          </div>\n          <div class=\"arv-dn\" id=\"arv-dn\"></div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Urban's Analysis <span class=\"conf\" id=\"arv-conf\"></span></div>\n              <div style=\"display:flex;gap:8px;padding:10px 0 6px;border-bottom:1px solid var(--border);margin-bottom:6px\">\n                <div style=\"flex:1\">\n                  <div style=\"font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px\">As-Is Value</div>\n                  <div class=\"big\" id=\"arv-asis\" style=\"font-size:20px\">—</div>\n                  <div style=\"font-size:10px;color:var(--muted);margin-top:2px\">What we could wholesale it for today</div>\n                </div>\n                <div style=\"flex:1\">\n                  <div style=\"font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px\">Full Rehab ARV</div>\n                  <div class=\"big g\" id=\"arv-ur-big\" style=\"font-size:20px\">—</div>\n                  <div style=\"font-size:10px;color:var(--muted);margin-top:2px\">After renovation value</div>\n                </div>\n                <div style=\"flex:1\">\n                  <div style=\"font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px\">Spread</div>\n                  <div class=\"big\" id=\"arv-spread\" style=\"font-size:20px\">—</div>\n                  <div style=\"font-size:10px;color:var(--muted);margin-top:2px\">Flip profit opportunity</div>\n                </div>\n              </div>\n            <p style=\"font-size:13px;color:var(--text);line-height:1.6\" id=\"arv-notes\"></p>\n          </div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Comparable Sales</div>\n            <table class=\"comps-t\"><thead><tr><th>Address</th><th>Beds/Baths</th><th>Sqft</th><th>Yr</th><th>Sale Price</th><th>$/sf</th><th>Date</th><th>Src</th></tr></thead>\n            <tbody id=\"comps-body\"></tbody></table>\n          </div>\n          <!-- EXIT ANALYSIS (populated by renderUW when exitAnalysis data exists) -->\n          <div id=\"exit-analysis\" style=\"display:none\" class=\"card\">\n            <div class=\"ct\">Exit Analysis</div>\n            <div class=\"grid g3\">\n              <div class=\"m\"><div class=\"ml\">Estimated DOM</div><div class=\"mv\" id=\"ex-dom\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">List-to-Sale Ratio</div><div class=\"mv\" id=\"ex-lsr\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">Realistic Sale Price</div><div class=\"mv\" id=\"ex-rsp\">—</div></div>\n            </div>\n            <div class=\"grid g2\" style=\"margin-top:10px\">\n              <div class=\"m\"><div class=\"ml\">Adjusted Profit</div><div class=\"mv fv\" id=\"ex-adj\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">Target Buyer</div><div class=\"mv\" id=\"ex-buyer\">—</div></div>\n            </div>\n          </div>\n          <div class=\"card\">\n            <div class=\"ct\">Override ARV</div>\n            <div class=\"ov-row\"><span class=\"ov-lbl\">New ARV: $</span><input type=\"number\" class=\"ov-input\" id=\"ov-arv-in\" placeholder=\"285000\"><button class=\"ov-btn\" id=\"btn-ov-arv\">Apply & Recalc</button></div>\n          </div>\n        </div>\n\n        <!-- REHAB -->\n        <div class=\"tc\" id=\"t-rehab\">\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Scope & Line Items</div>\n            <div id=\"rehab-scope\"></div>\n            <div class=\"ri\" id=\"rehab-li\"></div>\n            <div class=\"rrange\" id=\"rehab-rng\"></div>\n            <p style=\"font-size:13px;color:var(--muted);line-height:1.6;margin-top:12px\" id=\"rehab-notes\"></p>\n            <div style=\"margin-top:10px;padding:9px;background:var(--bg3);border-radius:4px;font-size:12px;color:var(--review)\" id=\"rehab-miss\"></div>\n          </div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Wholesaler vs Urban</div>\n            <div class=\"fr\"><span class=\"fl\">Wholesaler's Estimate</span><span class=\"fv y\" id=\"rh-ws\"></span></div>\n            <div class=\"fr\"><span class=\"fl\">Urban's Estimate</span><span class=\"fv\" id=\"rh-ur\"></span></div>\n            <div class=\"fr\"><span class=\"fl\">Confidence</span><span class=\"fv\" id=\"rh-conf\"></span></div>\n          </div>\n          <div class=\"card\">\n            <div class=\"ct\">Override Rehab</div>\n            <div class=\"ov-row\"><span class=\"ov-lbl\">New Rehab: $</span><input type=\"number\" class=\"ov-input\" id=\"ov-rehab-in\" placeholder=\"45000\"><button class=\"ov-btn\" id=\"btn-ov-rehab\">Apply & Recalc</button></div>\n          </div>\n        </div>\n\n        <!-- FINANCIALS -->\n        <div class=\"tc\" id=\"t-financials\">\n          <div class=\"grid\">\n\n            <!-- CARD 1: Deal Economics -->\n            <div class=\"card\">\n              <div class=\"ct\">Deal Economics</div>\n              <div class=\"fr\"><span class=\"fl\">Asking Price</span><span class=\"fv\" id=\"fi-ask\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Urban&#39;s ARV</span><span class=\"fv y\" id=\"fi-arv\" style=\"font-size:16px;font-weight:700\"></span></div>\n              <div class=\"fr\"><span class=\"fl\" style=\"font-size:11px;opacity:.7\">Expected Sale (96% of ARV)</span><span class=\"fv\" id=\"fi-sale\" style=\"font-size:12px;opacity:.8\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Rehab Budget</span><span class=\"fv\" id=\"fi-reh\"></span></div>\n              <hr class=\"d\">\n              <div class=\"fr tot\"><span class=\"fl\">MAO <span style=\"font-size:9px;font-weight:400;opacity:.6\">(ARV &#215; 70% &#8722; Repairs)</span></span><span class=\"fv\" id=\"fi-mao\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Asking vs MAO</span><span class=\"fv\" id=\"fi-oum\"></span></div>\n              <div class=\"fr\"><span class=\"fl\" style=\"font-size:11px;opacity:.7\">Room to negotiate</span><span class=\"fv\" id=\"fi-room\" style=\"font-size:12px\"></span></div>\n            </div>\n\n            <!-- CARD 2: Hard Money -->\n            <div class=\"card\">\n              <div class=\"ct\">Hard Money &#183; 9.5% Interest Only</div>\n              <div class=\"fr\"><span class=\"fl\">Loan Amount <span style=\"font-size:9px;opacity:.6\">(90% LTV)</span></span><span class=\"fv\" id=\"fi-loan\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Down Payment <span style=\"font-size:9px;opacity:.6\">(10% cash)</span></span><span class=\"fv\" id=\"fi-dp\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Monthly Interest</span><span class=\"fv\" id=\"fi-mo\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Hold Time</span><span class=\"fv\" id=\"fi-hold\"></span></div>\n              <hr class=\"d\">\n              <div class=\"fr\"><span class=\"fl\">Total Interest Cost</span><span class=\"fv\" id=\"fi-int\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Origination Fee <span style=\"font-size:9px;opacity:.6\">(2 pts)</span></span><span class=\"fv\" id=\"fi-pts\"></span></div>\n              <div class=\"fr tot\"><span class=\"fl\">Total Financing Cost</span><span class=\"fv\" id=\"fi-fin\"></span></div>\n            </div>\n\n            <!-- CARD 3: All-In Cost Breakdown -->\n            <div class=\"card\">\n              <div class=\"ct\">All-In Cost Breakdown</div>\n              <div class=\"fr\"><span class=\"fl\">Purchase Price</span><span class=\"fv\" id=\"fi-pp\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Rehab Budget</span><span class=\"fv\" id=\"fi-rh2\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Financing (int + pts)</span><span class=\"fv\" id=\"fi-fin2\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Holding Costs</span><span class=\"fv\" id=\"fi-hc\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Selling <span style=\"font-size:9px;opacity:.6\">(6% commission + 2% closing)</span></span><span class=\"fv\" id=\"fi-sc\"></span></div>\n              <div class=\"fr tot\"><span class=\"fl\">TOTAL ALL-IN</span><span class=\"fv\" id=\"fi-tot\" style=\"font-size:15px;font-weight:700\"></span></div>\n              <hr class=\"d\">\n              <div class=\"fr\" style=\"background:rgba(60,120,255,.06);border-radius:4px;padding:4px 6px;margin-top:4px\">\n                <span class=\"fl\" style=\"font-weight:600\">Cash to Close <span style=\"font-size:9px;opacity:.6\">(down pmt + rehab)</span></span>\n                <span class=\"fv\" id=\"fi-ctc\" style=\"font-size:14px;font-weight:700;color:var(--gold)\"></span>\n              </div>\n            </div>\n\n            <!-- CARD 4: Profit & Returns -->\n            <div class=\"card\">\n              <div class=\"ct\">Profit &amp; Returns</div>\n              <div class=\"fr\" style=\"padding:6px 0\">\n                <span class=\"fl\" style=\"font-weight:600\">Net Profit @ Asking</span>\n                <span class=\"fv\" id=\"fi-pa\" style=\"font-size:20px;font-weight:700\"></span>\n              </div>\n              <div class=\"fr\"><span class=\"fl\" style=\"font-size:11px;opacity:.7\">Profit Margin <span style=\"font-size:9px\">(% of ARV)</span></span><span class=\"fv\" id=\"fi-pm2\" style=\"font-size:13px\"></span></div>\n              <div class=\"fr\"><span class=\"fl\" style=\"font-size:11px;opacity:.7\">Return on All-In Cost</span><span class=\"fv\" id=\"fi-roi2\" style=\"font-size:13px\"></span></div>\n              <hr class=\"d\">\n              <div class=\"fr\" style=\"background:rgba(60,200,130,.08);border-radius:4px;padding:4px 6px\">\n                <span class=\"fl\" style=\"font-weight:600\">Cash-on-Cash Return <span style=\"font-size:9px;opacity:.6\">(profit / cash deployed)</span></span>\n                <span class=\"fv\" id=\"fi-coc\" style=\"font-size:14px;font-weight:700;color:var(--buy)\"></span>\n              </div>\n              <div class=\"fr\" style=\"margin-top:4px;background:rgba(60,200,130,.05);border-radius:4px;padding:4px 6px\">\n                <span class=\"fl\" style=\"font-weight:600;font-size:11px\">Annualized ROI</span>\n                <span class=\"fv\" id=\"fi-aroi\" style=\"font-size:13px;font-weight:700;color:var(--buy)\"></span>\n              </div>\n              <hr class=\"d\">\n              <div class=\"fr g\"><span class=\"fl\" style=\"font-size:11px\">Profit if paid at MAO (ceiling)</span><span class=\"fv\" id=\"fi-pm\" style=\"font-size:13px\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Meets Profit Min (10%)</span><span class=\"fv\" id=\"fi-min\"></span></div>\n            </div>\n\n          </div>\n\n          <!-- BOTTOM: Holding Costs Detail -->\n          <div class=\"card\" style=\"margin-top:14px\">\n            <div class=\"ct\">Holding Costs Detail <span style=\"font-size:10px;font-weight:400;opacity:.5\" id=\"fi-hold-months-lbl\"></span></div>\n            <div class=\"grid\" style=\"gap:12px\">\n              <div class=\"m\"><div class=\"ml\">Property Taxes (prorated)</div><div class=\"mv\" id=\"fi-tx\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Insurance</div><div class=\"mv\" id=\"fi-ins\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Utilities / Misc</div><div class=\"mv\" id=\"fi-ut\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Total Holding</div><div class=\"mv\" id=\"fi-hc2\" style=\"font-weight:600\"></div></div>\n            </div>\n          </div>\n        </div>\n\n          <div class=\"card\" style=\"margin-top:14px\" id=\"offer-ladder-card\">\n            <div class=\"ct\" style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">\n              <span>📋 Negotiation Ladder</span>\n              <div style=\"display:flex;gap:6px\">\n                <button onclick=\"copyOfferLadder()\" style=\"font-size:10px;padding:2px 10px;background:transparent;border:1px solid var(--border2);border-radius:4px;color:var(--muted);cursor:pointer\">Copy</button>\n              </div>\n            </div>\n\n            <!-- Gap analysis row -->\n            <div id=\"ol-gap-row\" style=\"display:none;margin-bottom:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;font-size:11px\">\n              <div style=\"display:flex;justify-content:space-between;align-items:center\">\n                <span style=\"color:var(--muted)\">Asking <strong id=\"ol-asking\" style=\"color:var(--text)\">—</strong></span>\n                <span id=\"ol-gap-label\" style=\"font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px\">—</span>\n                <span style=\"color:var(--muted)\">MAO <strong id=\"ol-mao-disp\" style=\"color:var(--text)\">—</strong></span>\n              </div>\n              <div id=\"ol-gap-bar-wrap\" style=\"margin-top:6px;height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden\">\n                <div id=\"ol-gap-bar\" style=\"height:4px;border-radius:2px;width:50%;transition:width .4s\"></div>\n              </div>\n            </div>\n\n            <!-- 4 tiers -->\n            <div style=\"display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:10px\">\n              <div style=\"background:var(--bg2);border-radius:6px;padding:8px 6px;text-align:center;border:1px solid rgba(60,200,130,.2)\">\n                <div style=\"font-size:8px;color:var(--muted);font-weight:700;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase\">Open</div>\n                <div id=\"ol-open\" style=\"font-size:15px;font-weight:800;color:var(--buy)\">—</div>\n                <div id=\"ol-open-profit\" style=\"font-size:9px;color:var(--muted);margin-top:3px\">—</div>\n                <div id=\"ol-open-gap\" style=\"font-size:8px;color:var(--muted);margin-top:1px;opacity:.7\">—</div>\n              </div>\n              <div style=\"background:var(--bg2);border-radius:6px;padding:8px 6px;text-align:center;border:1px solid rgba(255,200,0,.15)\">\n                <div style=\"font-size:8px;color:var(--muted);font-weight:700;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase\">Nudge</div>\n                <div id=\"ol-nudge\" style=\"font-size:15px;font-weight:800;color:var(--gold)\">—</div>\n                <div id=\"ol-nudge-profit\" style=\"font-size:9px;color:var(--muted);margin-top:3px\">—</div>\n                <div id=\"ol-nudge-gap\" style=\"font-size:8px;color:var(--muted);margin-top:1px;opacity:.7\">—</div>\n              </div>\n              <div style=\"background:var(--bg2);border-radius:6px;padding:8px 6px;text-align:center;border:1px solid rgba(255,140,0,.2)\">\n                <div style=\"font-size:8px;color:var(--muted);font-weight:700;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase\">Hold</div>\n                <div id=\"ol-counter\" style=\"font-size:15px;font-weight:800;color:var(--review)\">—</div>\n                <div id=\"ol-counter-profit\" style=\"font-size:9px;color:var(--muted);margin-top:3px\">—</div>\n                <div id=\"ol-counter-gap\" style=\"font-size:8px;color:var(--muted);margin-top:1px;opacity:.7\">—</div>\n              </div>\n              <div style=\"background:rgba(200,60,60,.06);border-radius:6px;padding:8px 6px;text-align:center;border:1px solid rgba(200,60,60,.2)\">\n                <div style=\"font-size:8px;color:var(--muted);font-weight:700;letter-spacing:.5px;margin-bottom:4px;text-transform:uppercase\">Walk</div>\n                <div id=\"ol-walk\" style=\"font-size:15px;font-weight:800;color:var(--red)\">—</div>\n                <div id=\"ol-walk-profit\" style=\"font-size:9px;color:var(--muted);margin-top:3px\">—</div>\n                <div style=\"font-size:8px;color:var(--muted);margin-top:1px;opacity:.7\">= MAO</div>\n              </div>\n            </div>\n\n            <!-- Counter input -->\n            <div style=\"display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:var(--bg2);border-radius:6px\">\n              <span style=\"font-size:11px;color:var(--muted);white-space:nowrap\">They counter at</span>\n              <div style=\"display:flex;align-items:center;gap:4px;flex:1\">\n                <span style=\"color:var(--muted);font-size:13px\">$</span>\n                <input id=\"ol-counter-input\" type=\"number\" placeholder=\"Enter their number\"\n                  style=\"flex:1;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:5px 8px;font-size:13px;font-weight:600\"\n                  oninput=\"evalCounter(this.value)\">\n              </div>\n              <div id=\"ol-counter-result\" style=\"font-size:11px;font-weight:700;min-width:80px;text-align:right\">—</div>\n            </div>\n\n            <!-- Script section - 4 tabs -->\n            <div style=\"margin-bottom:6px\">\n              <div style=\"display:flex;gap:4px;margin-bottom:6px\">\n                <button onclick=\"setScriptTab('open')\" id=\"stab-open\" class=\"stab stab-active\" style=\"flex:1;font-size:9px;padding:4px;border-radius:4px;cursor:pointer;font-weight:700;background:rgba(60,200,130,.15);border:1px solid rgba(60,200,130,.3);color:var(--buy)\">Open</button>\n                <button onclick=\"setScriptTab('nudge')\" id=\"stab-nudge\" class=\"stab\" style=\"flex:1;font-size:9px;padding:4px;border-radius:4px;cursor:pointer;font-weight:700;background:transparent;border:1px solid var(--border2);color:var(--muted)\">Nudge</button>\n                <button onclick=\"setScriptTab('hold')\" id=\"stab-hold\" class=\"stab\" style=\"flex:1;font-size:9px;padding:4px;border-radius:4px;cursor:pointer;font-weight:700;background:transparent;border:1px solid var(--border2);color:var(--muted)\">Hold</button>\n                <button onclick=\"setScriptTab('walk')\" id=\"stab-walk\" class=\"stab\" style=\"flex:1;font-size:9px;padding:4px;border-radius:4px;cursor:pointer;font-weight:700;background:transparent;border:1px solid var(--border2);color:var(--muted)\">Walk</button>\n              </div>\n              <div id=\"ol-script\" style=\"font-size:11px;color:var(--muted);line-height:1.6;padding:8px;background:var(--bg2);border-radius:5px;min-height:48px\"></div>\n            </div>\n          </div>\n\n        <!-- RENTAL -->\n        <div class=\"tc\" id=\"t-rental\">\n\n<!-- ═══ VERDICT ════════════════════════════════════════════════════════════ -->\n<div id=\"rn-verdict-banner\" style=\"display:none;border-radius:8px;padding:11px 16px;margin-bottom:14px;border:1px solid;align-items:center;gap:12px\">\n  <span id=\"rn-verdict-icon\" style=\"font-size:20px\"></span>\n  <div style=\"flex:1\">\n    <div id=\"rn-verdict-label\" style=\"font-size:12px;font-weight:800;letter-spacing:.7px\"></div>\n    <div id=\"rn-verdict-note\" style=\"font-size:11px;opacity:.7;margin-top:1px;line-height:1.4\"></div>\n  </div>\n  <div id=\"rn-brrrr-badge\" style=\"display:none;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(60,200,130,.15);color:var(--buy);border:1px solid rgba(60,200,130,.3)\">BRRRR ✅</div>\n</div>\n\n<!-- ═══ STEP 1 — INCOME ════════════════════════════════════════════════════ -->\n<div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:10px\">\n  <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.6px;margin-bottom:12px\">① RENTAL INCOME</div>\n  <div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px\">\n    <div>\n      <div style=\"font-size:11px;color:var(--muted);margin-bottom:5px\">Rent per unit / mo</div>\n      <div style=\"display:flex;align-items:center;gap:4px\">\n        <span style=\"color:var(--muted);font-size:12px\">$</span>\n        <input id=\"rn-in-rent-pu\" type=\"number\" placeholder=\"0\" oninput=\"rnCalc()\"\n          style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:7px 8px;font-size:15px;font-weight:700\">\n      </div>\n    </div>\n    <div>\n      <div style=\"font-size:11px;color:var(--muted);margin-bottom:5px\">Units</div>\n      <input id=\"rn-in-units\" type=\"number\" min=\"1\" max=\"20\" placeholder=\"1\" oninput=\"rnCalc()\"\n        style=\"width:100%;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:7px 8px;font-size:15px;font-weight:700\">\n    </div>\n    <div>\n      <div style=\"font-size:11px;color:var(--muted);margin-bottom:5px\">Vacancy</div>\n      <div style=\"display:flex;align-items:center;gap:4px\">\n        <input id=\"rn-in-vac\" type=\"number\" min=\"0\" max=\"30\" step=\"0.5\" placeholder=\"7\" oninput=\"rnCalc()\"\n          style=\"flex:1;background:var(--bg2);border:1px solid var(--border2);border-radius:5px;color:var(--text);padding:7px 8px;font-size:15px;font-weight:700\">\n        <span style=\"color:var(--muted);font-size:12px\">%</span>\n      </div>\n    </div>\n  </div>\n  <div style=\"display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg2);border-radius:6px\">\n    <span style=\"font-size:12px;color:var(--muted)\">Monthly gross rent</span>\n    <span id=\"rn-calc-gross\" style=\"font-size:18px;font-weight:800;color:var(--gold)\">—</span>\n  </div>\n  <div style=\"font-size:10px;color:var(--muted);margin-top:8px;opacity:.7\" id=\"rn-rent-source-note\"></div>\n</div>\n\n<!-- ═══ STEP 2 — EXPENSES ══════════════════════════════════════════════════ -->\n<div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:10px\">\n  <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.6px;margin-bottom:12px\">② MONTHLY EXPENSES</div>\n  <div style=\"display:flex;flex-direction:column;gap:6px\">\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">Property management</span>\n      <div style=\"display:flex;align-items:center;gap:4px\">\n        <input id=\"rn-in-pm\" type=\"number\" min=\"0\" max=\"20\" step=\"0.5\" placeholder=\"10\" oninput=\"rnCalc()\"\n          style=\"width:42px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:center\">\n        <span style=\"color:var(--muted);font-size:11px\">%</span>\n        <span id=\"rn-pm-calc\" style=\"font-size:12px;font-weight:600;color:var(--red);width:60px;text-align:right\"></span>\n      </div>\n    </div>\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">Property taxes / mo</span>\n      <div style=\"display:flex;align-items:center;gap:3px\">\n        <span style=\"color:var(--muted);font-size:11px\">$</span>\n        <input id=\"rn-in-tax\" type=\"number\" placeholder=\"auto\" oninput=\"rnCalc()\"\n          style=\"width:70px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:right\">\n      </div>\n    </div>\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">Insurance / mo <span style=\"font-size:10px;opacity:.5\">(FL varies)</span></span>\n      <div style=\"display:flex;align-items:center;gap:3px\">\n        <span style=\"color:var(--muted);font-size:11px\">$</span>\n        <input id=\"rn-in-ins\" type=\"number\" placeholder=\"enter\" oninput=\"rnCalc()\"\n          style=\"width:70px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:right\">\n      </div>\n    </div>\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">Maintenance / mo</span>\n      <div style=\"display:flex;align-items:center;gap:3px\">\n        <span style=\"color:var(--muted);font-size:11px\">$</span>\n        <input id=\"rn-in-maint\" type=\"number\" placeholder=\"125\" oninput=\"rnCalc()\"\n          style=\"width:70px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:right\">\n      </div>\n    </div>\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">CapEx reserve / mo <span style=\"font-size:10px;opacity:.5\">(roof/HVAC)</span></span>\n      <div style=\"display:flex;align-items:center;gap:3px\">\n        <span style=\"color:var(--muted);font-size:11px\">$</span>\n        <input id=\"rn-in-capex\" type=\"number\" placeholder=\"100\" oninput=\"rnCalc()\"\n          style=\"width:70px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:right\">\n      </div>\n    </div>\n\n    <div style=\"display:flex;align-items:center\">\n      <span style=\"font-size:12px;color:var(--muted);flex:1\">HOA / other / mo</span>\n      <div style=\"display:flex;align-items:center;gap:3px\">\n        <span style=\"color:var(--muted);font-size:11px\">$</span>\n        <input id=\"rn-in-other\" type=\"number\" placeholder=\"0\" oninput=\"rnCalc()\"\n          style=\"width:70px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:4px 6px;font-size:12px;text-align:right\">\n      </div>\n    </div>\n\n    <!-- Hidden inputs to keep rnCalc happy -->\n    <input id=\"rn-in-conv-rate\" type=\"hidden\" value=\"7.25\">\n    <input id=\"rn-in-conv-ltv\" type=\"hidden\" value=\"80\">\n\n  </div>\n  <div style=\"border-top:1px solid var(--border);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;align-items:center\">\n    <span style=\"font-size:12px;font-weight:700\">Total expenses / mo</span>\n    <span id=\"rn-calc-exp\" style=\"font-size:16px;font-weight:800;color:var(--red)\">—</span>\n  </div>\n</div>\n\n<!-- ═══ STEP 3 — NET OPERATING INCOME + LOAN ══════════════════════════════ -->\n<div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:10px\">\n  <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.6px;margin-bottom:12px\">③ CASH FLOW</div>\n\n  <div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px\">\n    <span style=\"font-size:13px;font-weight:600\">Net operating income</span>\n    <span id=\"rn-calc-noi\" style=\"font-size:18px;font-weight:800\">—</span>\n  </div>\n\n  <div style=\"background:var(--bg2);border-radius:6px;padding:10px 12px;margin-bottom:10px\">\n    <div style=\"font-size:10px;font-weight:700;color:var(--muted);margin-bottom:8px\">DSCR LOAN</div>\n    <div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap\">\n      <div style=\"display:flex;align-items:center;gap:4px\">\n        <input id=\"rn-in-dscr-rate\" type=\"number\" step=\"0.125\" placeholder=\"6.75\" oninput=\"rnCalc()\"\n          style=\"width:55px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:5px 7px;font-size:13px;font-weight:600;text-align:center\">\n        <span style=\"color:var(--muted);font-size:12px\">% rate</span>\n      </div>\n      <div style=\"display:flex;align-items:center;gap:4px\">\n        <input id=\"rn-in-dscr-ltv\" type=\"number\" step=\"5\" min=\"60\" max=\"80\" placeholder=\"75\" oninput=\"rnCalc()\"\n          style=\"width:50px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:5px 7px;font-size:13px;font-weight:600;text-align:center\">\n        <span style=\"color:var(--muted);font-size:12px\">% LTV</span>\n      </div>\n      <span style=\"font-size:11px;color:var(--muted)\">→ pmt <span id=\"rn-calc-dscr-pmt\" style=\"color:var(--text);font-weight:600\"></span></span>\n      <span style=\"font-size:10px;color:var(--muted)\">DSCR: <span id=\"rn-calc-dscr-ratio\" style=\"font-weight:700\"></span></span>\n    </div>\n  </div>\n\n  <div style=\"display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg2);border-radius:6px;border:2px solid var(--border2)\" id=\"rn-cf-result-row\">\n    <div>\n      <div style=\"font-size:11px;color:var(--muted);margin-bottom:2px\">Monthly cash flow</div>\n      <div style=\"font-size:10px;color:var(--muted)\">after loan payment</div>\n    </div>\n    <span id=\"rn-calc-dscr-cf\" style=\"font-size:26px;font-weight:900\">—</span>\n  </div>\n\n  <!-- Hidden for rnCalc -->\n  <span id=\"rn-calc-conv-cf\" style=\"display:none\"></span>\n  <span id=\"rn-calc-conv-pmt\" style=\"display:none\"></span>\n  <span id=\"rn-calc-conv-dp\" style=\"display:none\"></span>\n</div>\n\n<!-- ═══ STEP 4 — BRRRR ════════════════════════════════════════════════════ -->\n<div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:10px\" id=\"rn-brrrr-card\">\n  <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:14px\">\n    <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.6px\">④ BRRRR — GET YOUR MONEY BACK</div>\n    <span id=\"rn-brrrr-strat-pill\" style=\"font-size:10px;font-weight:700;padding:2px 10px;border-radius:10px\"></span>\n  </div>\n\n  <div style=\"display:flex;flex-direction:column;gap:8px\">\n\n    <div style=\"background:var(--bg2);border-radius:6px;padding:10px 12px\">\n      <div style=\"font-size:9px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:8px\">💰 WHAT YOU PUT IN</div>\n      <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px\">\n        <div>\n          <div style=\"font-size:12px;color:var(--muted)\">Purchase price</div>\n          <div style=\"font-size:10px;color:var(--muted);opacity:.6\">Edit to model different offer</div>\n        </div>\n        <div style=\"display:flex;align-items:center;gap:4px\">\n          <span style=\"color:var(--muted);font-size:12px\">$</span>\n          <input id=\"rn-in-purchase\" type=\"number\" placeholder=\"0\" oninput=\"rnCalc()\"\n            style=\"width:95px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--gold);padding:5px 8px;font-size:14px;font-weight:700;text-align:right\">\n        </div>\n      </div>\n      <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px\">\n        <div>\n          <div style=\"font-size:12px;color:var(--muted)\">Rental rehab</div>\n          <div style=\"font-size:10px;color:var(--muted);opacity:.6\">Less than flip — just make it rentable</div>\n        </div>\n        <div style=\"display:flex;align-items:center;gap:4px\">\n          <span style=\"color:var(--muted);font-size:12px\">$</span>\n          <input id=\"rn-in-rehab\" type=\"number\" placeholder=\"0\" oninput=\"rnCalc()\"\n            style=\"width:85px;background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:5px 8px;font-size:14px;font-weight:700;text-align:right\">\n        </div>\n      </div>\n      <div style=\"border-top:1px solid var(--border);padding-top:8px;display:flex;justify-content:space-between;align-items:center\">\n        <span style=\"font-size:12px;font-weight:700\">Total cash in</span>\n        <span id=\"rn-b-cashin\" style=\"font-size:16px;font-weight:800;color:var(--review)\">—</span>\n      </div>\n    </div>\n\n    <div style=\"border-left:2px solid var(--border2);margin-left:8px;padding-left:12px;display:flex;flex-direction:column;gap:6px\">\n      <div style=\"font-size:11px;color:var(--muted)\">After repair value: <span id=\"rn-b-arv\" style=\"color:var(--gold);font-weight:700\"></span></div>\n      <div style=\"display:flex;align-items:center;gap:6px;flex-wrap:wrap\">\n        <span style=\"font-size:11px;color:var(--muted)\">Refinance at</span>\n        <input id=\"rn-in-refi-ltv\" type=\"number\" step=\"5\" min=\"60\" max=\"80\" placeholder=\"75\" oninput=\"rnCalc()\"\n          style=\"width:44px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:12px;font-weight:700;text-align:center\">\n        <span style=\"font-size:11px;color:var(--muted)\">% LTV @</span>\n        <input id=\"rn-in-refi-rate\" type=\"number\" step=\"0.125\" placeholder=\"6.75\" oninput=\"rnCalc()\"\n          style=\"width:50px;background:var(--bg2);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:3px 5px;font-size:12px;font-weight:700;text-align:center\">\n        <span style=\"font-size:11px;color:var(--muted)\">%</span>\n        <span style=\"font-size:11px;color:var(--muted)\">→ loan <span id=\"rn-b-refi-loan\" style=\"color:var(--text);font-weight:700\"></span></span>\n      </div>\n      <div style=\"display:flex;justify-content:space-between;align-items:center\">\n        <span style=\"font-size:12px;color:var(--muted)\">💵 Cash returned at refi</span>\n        <span id=\"rn-b-cashout\" style=\"font-size:14px;font-weight:700;color:var(--buy)\">—</span>\n      </div>\n    </div>\n\n    <div style=\"border-top:2px solid var(--border2);padding-top:12px;margin-top:4px\">\n      <div style=\"display:flex;justify-content:space-between;align-items:center\" id=\"rn-cash-left-row\">\n        <div>\n          <div style=\"font-size:12px;font-weight:700\" id=\"rn-left-label\">Cash left in deal</div>\n          <div style=\"font-size:10px;color:var(--muted)\" id=\"rn-left-sublabel\">Goal: $0 or less ↓</div>\n        </div>\n        <span id=\"rn-b-left\" style=\"font-size:22px;font-weight:900\">—</span>\n      </div>\n      <div id=\"rn-b-infinite\" style=\"display:none;margin-top:8px;text-align:center;font-size:13px;font-weight:700;color:var(--buy);background:rgba(60,200,130,.1);border:1px solid rgba(60,200,130,.3);border-radius:6px;padding:8px\">\n        ♾️ FULL BRRRR — All cash out + property cash flows free.\n      </div>\n      <div id=\"rn-b-profit\" style=\"display:none;margin-top:8px;text-align:center;font-size:13px;font-weight:700;color:var(--buy);background:rgba(60,200,130,.12);border:1px solid rgba(60,200,130,.4);border-radius:6px;padding:10px\">\n        🏆 BRRRR + PROFIT — You pull out <span id=\"rn-b-profit-amt\" style=\"font-size:16px\"></span> MORE than you put in.\n      </div>\n    </div>\n\n    <div style=\"background:var(--bg2);border-radius:6px;padding:10px;margin-top:4px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px\">\n      <div style=\"text-align:center\">\n        <div style=\"font-size:10px;color:var(--muted);margin-bottom:3px\">Refi payment</div>\n        <div id=\"rn-b-pmt\" style=\"font-size:13px;font-weight:700\">—</div>\n      </div>\n      <div style=\"text-align:center\">\n        <div style=\"font-size:10px;color:var(--muted);margin-bottom:3px\">Cash flow / mo</div>\n        <div id=\"rn-b-cf\" style=\"font-size:13px;font-weight:700\">—</div>\n      </div>\n      <div style=\"text-align:center\">\n        <div style=\"font-size:10px;color:var(--muted);margin-bottom:3px\">DSCR</div>\n        <div id=\"rn-b-dscr\" style=\"font-size:13px;font-weight:700\">—</div>\n      </div>\n      <div style=\"text-align:center\">\n        <div style=\"font-size:10px;color:var(--muted);margin-bottom:3px\">Cash-on-cash</div>\n        <div id=\"rn-b-coc\" style=\"font-size:13px;font-weight:700\">—</div>\n      </div>\n    </div>\n\n  </div>\n\n  <div style=\"display:flex;justify-content:space-between;align-items:center;margin-top:10px\">\n    <div style=\"font-size:10px;color:var(--muted)\">Cap rate: <span id=\"rn-calc-cap\">—</span> · HUD FMR ref: <span id=\"rn-calc-hud\">—</span></div>\n    <button onclick=\"rnReset()\" style=\"font-size:10px;padding:3px 10px;background:transparent;border:1px solid var(--border2);border-radius:4px;color:var(--muted);cursor:pointer\">↺ Reset</button>\n  </div>\n</div>\n\n<!-- ═══ URBAN'S TAKE ═══════════════════════════════════════════════════════ -->\n<div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px\">\n  <div style=\"font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:8px\">URBAN'S TAKE</div>\n  <p id=\"rn-notes\" style=\"font-size:12px;line-height:1.7;color:var(--text);margin-bottom:10px\">—</p>\n  <div style=\"display:flex;gap:20px\">\n    <div><span style=\"font-size:11px;color:var(--muted)\">Hold? </span><span id=\"rn-worth\" style=\"font-weight:700;font-size:12px\">—</span></div>\n    <div><span style=\"font-size:11px;color:var(--muted)\">BRRRR? </span><span id=\"rn-worth-brrrr\" style=\"font-weight:700;font-size:12px\">—</span></div>\n  </div>\n</div>\n\n\n\n</div>\n\n                <!-- NEW CONSTRUCTION -->\n        <div class=\"tc\" id=\"t-newconstruction\">\n          <!-- Not Applicable State -->\n          <div id=\"nc-na-card\" class=\"card\" style=\"display:none\">\n            <div class=\"ct\" style=\"color:var(--muted)\">New Construction — Not Applicable</div>\n            <div style=\"padding:12px 0;font-size:13px;color:var(--text);line-height:1.7\" id=\"nc-na-reason\"></div>\n            <div style=\"margin-top:14px;padding-top:14px;border-top:1px solid var(--border1)\">\n              <div class=\"ct\" style=\"font-size:11px;margin-bottom:8px;color:var(--muted)\">Nearby New Construction Pressure</div>\n              <div style=\"font-size:13px;color:var(--text);line-height:1.6\" id=\"nc-nearby\"></div>\n            </div>\n          </div>\n          <!-- Applicable State -->\n          <div id=\"nc-applicable-card\" class=\"card\" style=\"display:none\">\n            <div class=\"ct\">New Construction Potential</div>\n            <div class=\"grid\" style=\"margin-bottom:14px\">\n              <div class=\"m\"><div class=\"ml\">Est. Lot Value</div><div class=\"mv big\" id=\"nc-lot\"></div></div>\n              <div class=\"m\"><div class=\"ml\">CCG Land Equity Required (50%)</div><div class=\"mv warn\" id=\"nc-equity\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Build Cost ($160/sqft)</div><div class=\"mv\" id=\"nc-build\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Construction Loan (@ 11.5%)</div><div class=\"mv\" id=\"nc-loan\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Est. Interest Cost</div><div class=\"mv\" id=\"nc-interest\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Est. New ARV</div><div class=\"mv big g\" id=\"nc-arv\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Net Profit (New Build)</div><div class=\"mv\" id=\"nc-profit\"></div></div>\n            </div>\n            <p style=\"font-size:13px;color:var(--text);line-height:1.7;margin-bottom:14px\" id=\"nc-notes\"></p>\n          </div>\n          <!-- Always show: empty state with nearby competition note -->\n          <div id=\"nc-empty-card\" style=\"display:none;padding:20px;text-align:center;color:var(--muted);font-size:13px\">\n            <div style=\"font-size:22px;margin-bottom:8px\">🏗️</div>\n            New construction analysis not generated.<br>\n            <span style=\"font-size:11px;opacity:.7\">Hit ⚡ Underwrite to run new construction analysis.</span>\n          </div>\n        </div>\n\n        <!-- FLAGS -->\n        <div class=\"tc\" id=\"t-flags\">\n          <div class=\"flags\" id=\"flags-list\">\n            <div class=\"flags-empty\" id=\"flags-empty\" style=\"display:none;padding:40px;text-align:center;color:var(--muted);font-size:13px\">\n              <div style=\"font-size:24px;margin-bottom:8px\">🔍</div>\n              <div>No risk flags analyzed yet.</div>\n              <div style=\"margin-top:4px;font-size:11px\">Hit ⚡ Underwrite for full risk analysis.</div>\n            </div>\n          </div>\n        </div>\n\n        <!-- PROPERTY — ALL DATA FROM SHEET -->\n        <div class=\"tc\" id=\"t-property\">\n          <div id=\"deal-full-info\"></div>\n        </div>\n\n      </div><!-- /uw-content -->\n    </div><!-- /dv -->\n  </div><!-- /main -->\n\n  <!-- CHAT PANEL -->\n  <div id=\"chat-panel\">\n    <div id=\"chat-hdr\">\n      <div>\n        <h3>URBAN AI</h3>\n        <div id=\"chat-deal-label\" style=\"font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px;letter-spacing:.3px\"></div>\n      </div>\n      <button id=\"chat-x\">✕</button>\n    </div>\n    <div id=\"chat-msgs\"></div>\n    <div id=\"chat-in-wrap\">\n      <div class=\"auth-sel\">\n        <button class=\"auth-btn on\" data-a=\"caleb\" onclick=\"setAuth('caleb')\">Caleb</button>\n        <button class=\"auth-btn\" data-a=\"grant\" onclick=\"setAuth('grant')\">Grant</button>\n      </div>\n      <textarea id=\"chat-in\" placeholder=\"Ask Urban anything about this deal. Correct numbers, give better comps, ask what-ifs. Urban remembers your corrections.\"></textarea>\n      <button id=\"chat-send\">Send ↵</button>\n    </div>\n  </div>\n</div>\n\n<script>\nconst $ = id => document.getElementById(id);\nconst fmt = n => (n != null && n !== '') ? '$' + parseInt(n).toLocaleString() : '—';\nconst pct = n => n != null ? parseFloat(n).toFixed(1) + '%' : '—';\n\nlet TOKEN = '', deals = [], curDeal = null, curUW = null, curFilter = 'ALL', author = 'caleb';\nlet autoUnderwriteRunning = false;\n\n// -- LOGIN ----------------------------------------------------------------------\n$('pw').addEventListener('keydown', e => e.key === 'Enter' && doLogin());\n$('login-btn').addEventListener('click', doLogin);\n// URL token support\n(function() {\n  const p = new URLSearchParams(window.location.search);\n  const h = new URLSearchParams(window.location.hash.replace('#',''));\n  const t = p.get('token') || h.get('token');\n  if (t) { $('pw').value = t; doLogin(); }\n})();\n\nasync function doLogin() {\n  const pwEl = document.getElementById('pw');\n  TOKEN = (pwEl ? pwEl.value : '').trim();\n  if (!TOKEN) return;\n  try {\n    const r = await fetch('/api/stats', { headers: { 'x-urban-token': TOKEN } });\n    if (r.ok) {\n      document.getElementById('login-screen').style.display = 'none';\n      document.getElementById('app').style.display = 'flex';\n      doLoadStats();\n      doLoadDeals();\n    } else {\n      document.getElementById('login-err').style.display = 'block';\n      TOKEN = '';\n    }\n  } catch(e) {\n    document.getElementById('login-err').style.display = 'block';\n    TOKEN = '';\n  }\n}\n\n// -- STATS ----------------------------------------------------------------------\nasync function doLoadStats() {\n  try {\n    const r = await fetch('/api/stats', { headers: { 'x-urban-token': TOKEN } });\n    const s = await r.json();\n    $('st-total').textContent = s.totalUnderwritten || 0;\n    $('st-avg').textContent = s.avgScore ? s.avgScore.toFixed(1) : '—';\n    $('st-hot').textContent = (s.verdicts?.HOT||0) + (s.verdicts?.BUY||0);\n    $('st-lessons').textContent = s.lessonsLearned || 0;\n    if ($('st-profit')) $('st-profit').textContent = s.avgProfit ? '$'+Math.round(s.avgProfit/1000)+'K' : '—';\n    if ($('st-pct')) {\n      const total = s.totalUnderwritten || 1;\n      const good = (s.verdicts?.HOT||0) + (s.verdicts?.BUY||0);\n      $('st-pct').textContent = Math.round(good/total*100) + '% BUY DEALS';\n    }\n    // If HARD NO toggle is on, recalculate stats from client-side deals array\n    if (hideHardNo && deals.length) {\n      const activeDeals = deals.filter(d => d.underwriteStatus !== 'HARD NO' && d.underwriteScore);\n      if (activeDeals.length) {\n        $('st-total').textContent = activeDeals.length;\n        const avgSc = activeDeals.reduce((s,d) => s+(d.underwriteScore||0), 0) / activeDeals.length;\n        $('st-avg').textContent = avgSc.toFixed(1);\n        const buys = activeDeals.filter(d => d.underwriteStatus === 'BUY' || d.underwriteStatus === 'HOT').length;\n        $('st-hot').textContent = buys;\n        if ($('st-pct')) $('st-pct').textContent = Math.round(buys/activeDeals.length*100) + '% BUY DEALS';\n      }\n    }\n    // ARV accuracy: avg Urban vs Wholesaler\n    if (s.arvAccuracy) {\n      const acc = s.arvAccuracy;\n      if ($('st-arv-acc')) {\n        const sign = acc.avgDiffPct >= 0 ? '+' : '';\n        $('st-arv-acc').textContent = sign + acc.avgDiffPct + '%';\n        $('st-arv-acc').style.color = Math.abs(acc.avgDiffPct) <= 5 ? 'var(--buy)' : Math.abs(acc.avgDiffPct) <= 15 ? 'var(--review)' : 'var(--hot)';\n      }\n      if ($('st-arv-tot')) {\n        const totK = Math.round(Math.abs(acc.totalDiffDollars) / 1000);\n        const dir = acc.totalDiffDollars >= 0 ? 'above WS' : 'below WS';\n        $('st-arv-tot').textContent = '$' + totK + 'K ' + dir + ' · ' + acc.dealCount + ' deals';\n      }\n    }\n  } catch {}\n}\n\n// -- DEALS ----------------------------------------------------------------------\nasync function doLoadDeals(skipAuto = false) {\n  $('ref-btn').textContent = '↻ Loading...';\n  try {\n    const r = await fetch('/api/deals', { headers: { 'x-urban-token': TOKEN } });\n    deals = await r.json();\n    renderList();\n    // Auto-underwrite any pending deals now (first load or forced)\n    if (!skipAuto && !autoUnderwriteRunning) {\n      autoUnderwritePending();\n    }\n    // Poll for new pending deals every 3 minutes while page is open\n    if (!window._uwPollStarted) {\n      window._uwPollStarted = true;\n      window._consecutiveRateLimits = 0;\n      window._rateLimitPauseUntil = 0;\n      window._uwPollInterval = setInterval(() => {\n        const now = Date.now();\n        // If we're in a rate limit pause, wait it out\n        if (window._rateLimitPauseUntil > now) {\n          const minsLeft = Math.ceil((window._rateLimitPauseUntil - now) / 60000);\n          console.log(`[Poll] Rate limit pause — ${minsLeft} min remaining`);\n          return;\n        }\n        const pending = deals.filter(d => {\n          if (d.underwriteStatus && d.underwriteStatus !== 'PENDING' && d.underwriteStatus !== '') return false;\n          if (d._rateLimited && (now - d._rateLimited) < 45 * 60 * 1000) return false; // 45-min cooldown per deal\n          return true;\n        });\n        if (pending.length > 0 && !autoUnderwriteRunning) {\n          console.log(`[Poll] ${pending.length} pending — auto-underwriting`);\n          autoUnderwritePending();\n        } else if (pending.length === 0) {\n          window._consecutiveRateLimits = 0;\n          window._rateLimitPauseUntil = 0;\n        }\n      }, 3 * 60 * 1000); // every 3 minutes\n    }\n  } catch(e) { console.log('Load deals error:', e.message); }\n  $('ref-btn').textContent = '↻ Pull from Derek\\'s Sheet';\n}\n\nasync function autoUnderwritePending() {\n  if (autoUnderwriteRunning) return;\n  const pending = deals.filter(d => !d.underwriteStatus || d.underwriteStatus === 'PENDING')\n    .filter(d => d.address && d.address !== 'XXXX');\n  if (!pending.length) { console.log('No pending deals to underwrite'); return; }\n  autoUnderwriteRunning = true;\n  console.log(`Auto-underwriting ${pending.length} pending deals (parallel batch)...`);\n\n  try {\n    const res = await fetch('/api/auto-underwrite-batch', {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({})\n    });\n    if (!res.ok) { console.log('Batch underwrite failed:', res.status); autoUnderwriteRunning = false; return; }\n    const reader = res.body.getReader();\n    const dec = new TextDecoder();\n    let buf = '';\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n      buf += dec.decode(value, { stream: true });\n      const lines = buf.split('\\n'); buf = lines.pop();\n      for (const line of lines) {\n        if (!line.startsWith('data: ')) continue;\n        try {\n          const data = JSON.parse(line.slice(6));\n          if (data.status) console.log('⏳', data.status);\n          if (data.done && data.address) {\n            console.log(`✅ ${data.address} → ${data.verdict} (${data.score}/10)`);\n            const idx = deals.findIndex(x => (x.address||'').toLowerCase() === (data.address||'').toLowerCase());\n            if (idx >= 0) { deals[idx].underwriteStatus = data.verdict; deals[idx].underwriteScore = data.score; }\n            renderList();\n            doLoadStats();\n            if (curDeal && (curDeal.address||'').toLowerCase() === (data.address||'').toLowerCase()) {\n              // refresh current deal view\n              selectDealByAddress(data.address);\n            }\n          }\n          if (data.finished) {\n            console.log(`🏁 Batch complete: ${data.total} deals processed`);\n            autoUnderwriteRunning = false;\n            doLoadDeals(true); // Refresh deal list with new verdicts (skip auto-underwrite)\n          }\n          if (data.error) {\n            const isRL = (data.error||'').includes('rate_limit') || (data.error||'').includes('429');\n            if (isRL && data.address) {\n              // Mark deal as temporarily rate-limited so batch doesn't keep retrying\n              const dIdx = deals.findIndex(d => d.address === data.address);\n              if (dIdx >= 0) deals[dIdx]._rateLimited = Date.now();\n              window._consecutiveRateLimits = (window._consecutiveRateLimits || 0) + 1;\n            }\n            if (!data.address) autoUnderwriteRunning = false;\n          }\n        } catch {}\n      }\n    }\n  } catch(e) {\n    autoUnderwriteRunning = false;\n    console.log('Batch underwrite error:', e.message);\n    autoUnderwriteRunning = false;\n  }\n  autoUnderwriteRunning = false;\n\n  // Legacy per-deal fallback (kept for manual single-deal use)\n  // Original per-deal loop removed — now using parallel batch endpoint\n  if (false) for (const d of pending) {\n    try {\n      const addr = encodeURIComponent(d.address);\n      const res = await fetch(`/api/underwrite-by-address/${addr}`, {\n        method: 'POST',\n        headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n        body: JSON.stringify({ deep: false })\n      });\n      // Read SSE stream\n      const reader = res.body.getReader();\n      const dec = new TextDecoder();\n      let buf = '';\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        buf += dec.decode(value, { stream: true });\n        const lines = buf.split('\\n'); buf = lines.pop();\n        for (const line of lines) {\n          if (!line.startsWith('data: ')) continue;\n          try {\n            const data = JSON.parse(line.slice(6));\n            if (data.done) {\n              const uw = data.underwrite;\n              console.log(`✅ ${d.address} → ${uw.verdict}`);\n              // Update in local list\n              const idx = deals.findIndex(x => x.address === d.address);\n              if (idx >= 0) { deals[idx].underwriteStatus = uw.verdict; deals[idx].underwriteScore = uw.score; }\n              renderList();\n              doLoadStats();\n              // If this deal is currently selected, show the result\n              if (curDeal && curDeal.address === d.address) renderUW(uw);\n            }\n            if (data.skipped) console.log(`⏩ ${d.address} already underwritten`);\n          } catch {}\n        }\n      }\n    } catch(e) { console.log(`Auto-underwrite failed for ${d.address}:`, e.message); }\n    await new Promise(r => setTimeout(r, 3000)); // 3s between deals\n  }\n  autoUnderwriteRunning = false;\n}\n\n$('ref-btn').addEventListener('click', () => {\n  // Manual refresh: reload deals from sheet but DO NOT re-underwrite\n  // User must click \"Run Batch Underwrite\" to re-underwrite\n  doLoadDeals(true); // true = skip auto-underwrite\n});\n$('search-input').addEventListener('input', renderList);\ndocument.getElementById('sort-select')?.addEventListener('change', renderList);\n// -- REVIEW CHATS (Urban learns from all conversations) ------------------------\nasync function doReviewChat() {\n  const btn = $('review-btn');\n  btn.disabled = true;\n  btn.textContent = '⏳ Reviewing...';\n  try {\n    const r = await fetch('/api/review-chat', {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' }\n    });\n    const data = await r.json();\n    if (data.ok) {\n      const msg = data.lessonsAdded > 0\n        ? `✅ ${data.lessonsAdded} new lessons added to Urban's brain!`\n        : '✅ Review complete — no new lessons needed.';\n      alert(msg + (data.lessons?.length ? '\\n\\n' + data.lessons.join('\\n') : ''));\n    } else {\n      alert('Error: ' + (data.error || 'unknown'));\n    }\n  } catch(e) {\n    alert('Review failed: ' + e.message);\n  }\n  btn.disabled = false;\n  btn.textContent = '📚 Review Chats';\n}\n\n// -- KEEP DEAL (reset 7-day expiry) -------------------------------------------\nasync function keepDeal(uid, address) {\n  try {\n    const r = await fetch('/api/keep-deal/' + encodeURIComponent(uid), {\n      method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ days: 7 })\n    });\n    if (r.ok) {\n      // Remove stale badge from current deal\n      curDeal.isStale = false;\n      document.querySelectorAll('.stale-badge').forEach(el => el.remove());\n      // Show confirmation\n      const btn = document.querySelector('.keep-btn');\n      if (btn) { btn.textContent = '✅ Kept 7 more days'; btn.disabled = true; }\n      // Reload list\n      await doLoadDeals(true);\n    }\n  } catch(e) { console.error('Keep deal error:', e); }\n}\n\ndocument.querySelectorAll('.ftab').forEach(t => t.addEventListener('click', () => {\n  document.querySelectorAll('.ftab').forEach(x => x.classList.remove('on'));\n  t.classList.add('on'); curFilter = t.dataset.f; renderList();\n}));\n\nfunction renderList() {\n  const q = $('search-input').value.toLowerCase();\n  const list = $('deal-list');\n  // Apply sort\n  const sortBy = $('sort-select')?.value || 'date-new';\n  deals.sort((a, b) => {\n    if (sortBy === 'expires') {\n      const ea = a.expires ? new Date(a.expires) : new Date(9999,0,1);\n      const eb = b.expires ? new Date(b.expires) : new Date(9999,0,1);\n      return ea - eb; // soonest first\n    }\n    if (sortBy === 'date-new') return new Date(b.dateReceived||0) - new Date(a.dateReceived||0);\n    if (sortBy === 'date-old') return new Date(a.dateReceived||0) - new Date(b.dateReceived||0);\n    if (sortBy === 'score-high') return (b.underwriteScore||0) - (a.underwriteScore||0);\n    if (sortBy === 'profit-high') {\n      // Try to get profit from underwrite cache — fall back to estimated MAO gap\n      const profA = a.netProfitAtAsking || 0;\n      const profB = b.netProfitAtAsking || 0;\n      return profB - profA;\n    }\n    if (sortBy === 'ask-low') return (parseFloat(a.askingPrice)||999999) - (parseFloat(b.askingPrice)||999999);\n    return 0;\n  });\n  const filtered = deals.filter(d => {\n    const status = d.needsAddress ? 'NEEDS ADDRESS' : (d.underwriteStatus || 'PENDING');\n    const normStatus = status === 'HARD NO' ? 'HARDNO' : status === 'NEED COMPS' ? 'NEEDCOMPS' : status === 'NEEDS ADDRESS' ? 'NEEDSADDRESS' : status;\n    if (hideHardNo && status === 'HARD NO' && curFilter !== 'HARDNO') return false; // HARD NO toggle\n    const matchFilter = curFilter === 'ALL' \n      || normStatus === curFilter\n      || (curFilter === 'BUY' && (status === 'BUY' || status === 'HOT'))\n      || (curFilter === 'PASS' && status === 'PASS')\n      || (curFilter === 'HARDNO' && status === 'HARD NO')\n      || (curFilter === 'NEEDS_ARV' && (!d.arv || !d.arv.wholesalerARV || d.arv.wholesalerARV === 0) && !['PASS','HARD NO'].includes(status));\n    const matchSearch = !q || `${d.address} ${d.city} ${d.wholesalerCompany} ${d.contact1Name}`.toLowerCase().includes(q);\n    return matchFilter && matchSearch;\n  });\n  list.innerHTML = '';\n  if (!filtered.length) {\n    list.innerHTML = '<div style=\"padding:24px 18px;color:var(--muted);font-size:13px;text-align:center\"><div style=\"font-size:22px;margin-bottom:8px\">🔍</div>No deals match<br><span style=\"font-size:11px;opacity:.7\">Try a different filter or search</span></div>';\n    return;\n  }\n  filtered.forEach(d => {\n    const uid = d.uid || `${d.address}-${d.dateReceived}`;\n    const status = d.underwriteStatus || 'PENDING';\n    // Show inflation warning if brain flags this wholesaler\n    const inflationWarn = d.wholesalerInflationWarning || d.inflationWarning;\n    const badgeCls = status === 'HARD NO' ? 'b-HARDNO' : `b-${status}`;\n    // Use underwrite financials.askingPrice when available (server already injects\n    // this into each deal object as d.financials). Catches K-format sheet entries\n    // like \"225\" (meaning $225K) where raw sheet value would show as $225.\n    const _fiAsk = d.financials && d.financials.askingPrice && parseFloat(d.financials.askingPrice) > 1000\n      ? parseFloat(d.financials.askingPrice) : 0;\n    const _rawAsk = parseFloat(d.askingPrice) || 0;\n    const _displayAsk = _fiAsk || (_rawAsk >= 1000 ? _rawAsk : null);\n    const price = _displayAsk ? fmt(_displayAsk) : (d.askingPrice ? fmt(d.askingPrice) : 'No price');\n    const isActive = curDeal && (curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`) === uid;\n    const el = document.createElement('div');\n    const warnBadge = inflationWarn ? ' <span style=\"color:#ff6b35;font-size:9px;font-weight:700;vertical-align:middle\" title=\"ARV Inflation Warning\">⚠️ ARV</span>' : '';\n    // High risk flag badge from underwrite\n    const hasHighFlag = (() => { try { const u = underwrites && underwrites[uid]; return u?.riskFlags?.some(f=>f.severity==='HIGH'); } catch { return false; } })();\n    el.className = 'di' + (isActive ? ' active' : '');\n    el.dataset.uid = uid;\n    // Calculate deal age\n    const ageDays = d.dateReceived\n      ? Math.floor((Date.now() - new Date(d.dateReceived)) / 86400000)\n      : null;\n    const ageLabel = ageDays === null ? '' : ageDays === 0 ? '🟢 Today' : ageDays === 1 ? '🟡 1d' : ageDays <= 3 ? `🟡 ${ageDays}d` : ageDays <= 7 ? `🟠 ${ageDays}d` : `🔴 ${ageDays}d`;\n    const staleLabel = d.isStale ? '<span class=\"stale-badge\">⏰ STALE</span>' : '';\n    // Expiration warning — show if expires within 7 days\n    let expiresLabel = '';\n    if (d.expires && !d.isStale) {\n      try {\n        const expDate = new Date(d.expires);\n        const daysLeft = Math.ceil((expDate - Date.now()) / 86400000);\n        if (daysLeft >= 0 && daysLeft <= 7) {\n          const exClr = daysLeft <= 2 ? '#ff4455' : daysLeft <= 4 ? 'var(--hot)' : 'var(--review)';\n          expiresLabel = '<span style=\"font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(255,80,80,.12);color:' + exClr + ';border:1px solid ' + exClr + ';opacity:.9\">⏰ ' + daysLeft + 'd left</span>';\n        }\n      } catch(e) {}\n    }\n    const sqftLabel = d.sqft ? `${parseInt(d.sqft).toLocaleString()} sf` : '';\n    const askPpsf = (d.askingPrice && d.sqft) ? Math.round(parseFloat(d.askingPrice)/parseFloat(d.sqft)) : 0;\n    const ppsqft = d.arv?.arvPerSqft ? ` · $${Math.round(d.arv.arvPerSqft)}/sf` : (askPpsf ? ` · $${askPpsf}/sf` : '');\n\n    const _beds=d.beds&&String(d.beds)!=='0'?d.beds+'bd':''; const _baths=d.baths&&String(d.baths)!=='0'?d.baths+'ba':''; const _bb=[_beds,_baths].filter(Boolean).join('/'); const _sqft=d.sqft&&parseInt(d.sqft)>0?parseInt(d.sqft).toLocaleString()+' sqft':''; const _spec=[_bb,_sqft].filter(Boolean).join(' · ');\n    el.innerHTML = `\n      <div class=\"di-addr\">${d.address || 'No address'}${['Land','Lot','Vacant Land','Acreage'].some(t=>d.propertyType?.toLowerCase().includes(t.toLowerCase()))?' <span title=\"Land/Lot\" style=\"font-size:10px\">🌿</span>':''}</div>\n      <div class=\"di-city\">${d.city}, ${d.state}${_spec?' · '+_spec:''}${ppsqft}${(d.propertyType&&d.propertyType!=='Single Family'&&d.propertyType!=='SFR')?` <span style=\"color:var(--gold);font-size:10px;opacity:.8;\">${d.propertyType.toUpperCase()}</span>`:''}</div>\n      <div class=\"di-meta\">\n        <span class=\"di-price\">${price}</span>\n        <span class=\"badge ${badgeCls}\">${status}</span>\n        ${d.underwriteScore ? `<span class=\"di-score\" style=\"font-weight:700\">${d.underwriteScore}/10</span>` : ''}\n        ${ageLabel ? `<span class=\"di-age\">${ageLabel}</span>` : ''}\n        ${staleLabel}\n        ${expiresLabel}\n      </div>`;\n    el.addEventListener('click', () => selectDeal(d));\n    list.appendChild(el);\n  });\n}\n\n// -- SELECT DEAL ----------------------------------------------------------------\nasync function selectDeal(d) {\n  curDeal = d;\n  // Fire seen-by + load notes in background (non-blocking)\n  const _uid = d.uid || (d.address + '-' + d.dateReceived);\n  markDealSeen(_uid);\n  loadDealNotes(_uid);\n  // Update chat header to show which deal is active\n  const chatLabel = $('chat-deal-label');\n  if (chatLabel) chatLabel.textContent = d.address ? `— ${d.address}` : '';\n\n  // Show/hide stale warning + keep button in deal header\n  const staleWarn = $('stale-warning');\n  if (staleWarn) {\n    if (d.isStale) {\n      const uid = d.uid || (d.address + '-' + d.dateReceived);\n      staleWarn.style.display = '';\n      staleWarn.innerHTML = `<span style=\"color:var(--hot);font-size:11px;font-weight:600\">⏰ ${d.daysOld} days old — may be taken</span>\n        <button class=\"keep-btn\" onclick=\"keepDeal('${uid}','${d.address}')\" style=\"margin-left:8px;padding:2px 8px;font-size:10px;background:rgba(255,60,90,.12);border:1px solid rgba(255,60,90,.3);color:var(--hot);border-radius:4px;cursor:pointer\">Keep in Urban 7 days</button>`;\n    } else {\n      staleWarn.style.display = 'none';\n    }\n  }\n  const uid = d.uid || `${d.address}-${d.dateReceived}`;\n  document.querySelectorAll('.di').forEach(el => el.classList.toggle('active', el.dataset.uid === uid));\n  show('main-empty', false);\n  show('dv', true);\n  $('dv-addr').textContent = d.address || d.city || '';\n  const countyPart = d.county ? (d.county.toLowerCase().includes('county') ? d.county : d.county + ' County') : '';\n  $('dv-city').textContent = [`${d.city||''}, ${d.state||''} ${d.zip||''}`.trim().replace(/^,\\s*/, ''), countyPart, d.propertyType ? (d.propertyType === 'Single Family' ? 'SFR' : d.propertyType) : 'SFR'].filter(Boolean).join(' · ');\n\n  // Always fill property tab with sheet data\n  fillPropTab(d);\n  updatePhotosUI(d);\n\n  // HARD NO button\n  const hardNoBtn = document.getElementById('btn-hard-no');\n  if (hardNoBtn) hardNoBtn.style.display = (d.underwriteStatus !== 'HARD NO') ? '' : 'none';\n  const purchBtn = document.getElementById('btn-purchased');\n  if (purchBtn) purchBtn.style.display = (d.underwriteStatus && d.underwriteStatus !== 'PENDING') ? '' : 'none';\n  const soldBtn = document.getElementById('btn-sold');\n  if (soldBtn) soldBtn.style.display = (d.underwriteStatus && d.underwriteStatus !== 'PENDING') ? '' : 'none';\n\n  // Price sanity warning banner\n  const sanityBanner = document.getElementById('price-sanity-banner');\n  const sanityMsg = document.getElementById('price-sanity-msg');\n  if (sanityBanner) {\n    // K-format detection: if sheet had e.g. \"365\" meaning $365K, server corrects it\n    // and sets d._rawAskingPrice to the original value\n    const _wasKformat = d._rawAskingPrice && parseFloat(d._rawAskingPrice) < 10000;\n    if (_wasKformat) {\n      sanityBanner.style.display = 'flex';\n      sanityBanner.style.background = 'rgba(100,180,255,.08)';\n      sanityBanner.style.borderColor = 'rgba(100,180,255,.3)';\n      if (sanityMsg) sanityMsg.innerHTML = '📋 Sheet had <strong>' + d._rawAskingPrice + '</strong> in Asking Price column — ' +\n        'auto-corrected to <strong>$' + parseInt(d.askingPrice).toLocaleString() + '</strong>. Verify with Derek.';\n      sanityBanner.style.background = 'rgba(255,200,0,.08)';\n      sanityBanner.style.borderColor = 'rgba(255,200,0,.25)';\n      const _psm = {\n        'ASK_NEAR_OR_ABOVE_ARV': '⚠️ Asking price is near or above ARV — verify against the original email before acting.',\n        'ASK_VS_WS_ARV_MISMATCH': '⚠️ Asking price differs significantly from wholesaler ARV — double-check the original email.',\n        'PRICE_HIGH_FOR_SQFT': '⚠️ Asking price seems high for the square footage — verify the listing.',\n        'PRICE_TOO_LOW': '⚠️ Asking price unusually low — may be a data entry error.'\n      };\n      if (sanityMsg) sanityMsg.innerHTML = _psm[d.priceSanityFlag] || '⚠️ Asking price may be incorrect.';\n    } else {\n      sanityBanner.style.display = 'none';\n    }\n  }\n\n  // Deal terms bar — close date, inspection period, EMD\n  const termsBar = document.getElementById('deal-terms-bar');\n  if (termsBar) {\n    const hasCd = d.closeDate, hasIp = d.inspectionPeriod, hasEmd = d.earnestMoney;\n    if (hasCd || hasIp || hasEmd) {\n      termsBar.style.display = 'flex';\n      const setTerm = (idEl, idVal, val) => {\n        const el = document.getElementById(idEl), v = document.getElementById(idVal);\n        if (el) el.style.display = val ? '' : 'none';\n        if (v) v.textContent = val || '';\n      };\n      setTerm('dt-close', 'dt-close-val', hasCd);\n      setTerm('dt-insp', 'dt-insp-val', hasIp);\n      setTerm('dt-emd', 'dt-emd-val', hasEmd);\n    } else {\n      termsBar.style.display = 'none';\n    }\n  }\n\n  // Try to load existing underwrite\n  try {\n    const r = await fetch(`/api/underwrite/${encodeURIComponent(uid)}`, { headers: { 'x-urban-token': TOKEN } });\n    if (r.ok) {\n      curUW = await r.json();\n      try { renderUW(curUW); } catch(re) { console.warn('renderUW err:', re.message, re.stack?.split('\\n')[1]); showPending(curUW); }\n    } else {\n      const p = (d.underwriteStatus && d.underwriteStatus !== 'PENDING')\n        ? { verdict: d.underwriteStatus, score: d.underwriteScore, verdictReason: 'Loading — hit Re-run for full data.' }\n        : null;\n      showPending(p);\n    }\n  } catch(fe) {\n    const p2 = (d.underwriteStatus && d.underwriteStatus !== 'PENDING')\n      ? { verdict: d.underwriteStatus, score: d.underwriteScore, verdictReason: 'Loading — hit Re-run for full data.' }\n      : null;\n    showPending(p2);\n  }\n}\n\nfunction showPending(partialUW) {\n  // If we have a restored stub with at least a verdict, show it\n  if (partialUW && partialUW.verdict && partialUW.verdict !== 'PENDING') {\n    // Show verdict badge and score\n    $('dv-v').textContent = partialUW.verdict;\n    $('dv-v').className = 'verdict-big v' + partialUW.verdict.replace(' ','');\n    $('dv-sc').textContent = partialUW.score || '?';\n    $('dv-vr').textContent = partialUW.verdictReason || 'Underwrite data restored from sheet';\n    partialUW._isPartial = true;\n    show('pending-card', false);\n    // Show partial content with what we have\n    show('uw-content', true);\n    show('loading-state', false);\n    // Show recommendation if available\n    if (partialUW.recommendation) {\n      const recEl = $('ov-rec');\n      if (recEl) recEl.textContent = partialUW.recommendation;\n    }\n    const offEl = $('ov-off');\n    if (offEl) {\n      offEl.textContent = partialUW.offerStrategy || '';\n      const offStr = offEl.closest ? offEl.closest('.off-str') : null;\n      if (offStr) offStr.style.display = partialUW.offerStrategy ? '' : 'none';\n    }\n    // Show re-underwrite notice\n    const existingNotice = document.getElementById('stale-uw-notice');\n    if (!existingNotice) {\n      const notice = document.createElement('div');\n      notice.id = 'stale-uw-notice';\n      notice.style.cssText = 'background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--muted)';\n      notice.innerHTML = '📋 Loaded from database. Hit <strong style=\"color:var(--accent)\">⚡ Underwrite</strong> to refresh with live comps.';\n      const uwContent = $('uw-content');\n      if (uwContent?.firstChild) uwContent.insertBefore(notice, uwContent.firstChild);\n    }\n    return;\n  }\n  $('dv-v').textContent = 'PENDING';\n  $('dv-v').className = 'verdict-big vPENDING';\n  $('dv-sc').textContent = '?';\n  $('dv-vr').textContent = 'Not yet underwritten';\n  show('pending-card', true);\n  show('loading-state', false);\n  show('uw-content', false);\n  const n = document.getElementById('stale-uw-notice');\n  if (n) n.remove();\n}\n\n// -- TABS -----------------------------------------------------------------------\nlet curTab = 'overview'; // tracks which tab is active for chat context\nfunction switchTab(name) {\n  curTab = name;\n  document.querySelectorAll('.stab').forEach(t => t.classList.toggle('on', t.dataset.t === name));\n  document.querySelectorAll('.tc').forEach(t => t.classList.remove('active'));\n  const el = $('t-' + name);\n  if (el) el.classList.add('active');\n  if (name === 'property' && curDeal) fillPropTab(curDeal);\n}\ndocument.querySelectorAll('.stab').forEach(t => {\n  t.addEventListener('click', () => switchTab(t.dataset.t));\n});\n\n// -- UNDERWRITE -----------------------------------------------------------------\n$('btn-uw').addEventListener('click', () => doUnderwrite(false, false));\n$('btn-uw-now').addEventListener('click', () => doUnderwrite(false, false));\n$('btn-deep').addEventListener('click', () => doUnderwrite(true, true));\n$('btn-reuw').addEventListener('click', () => doUnderwrite(true, false));\n\n$('btn-regen')?.addEventListener('click', async () => {\n  if (!curUW) return;\n  const uid = encodeURIComponent(curUW.uid);\n  const btn = $('btn-regen');\n  if (btn) { btn.textContent = 'Running...'; btn.disabled = true; }\n  try {\n    const r = await fetch(`/api/regen-verdict/${uid}`, {\n      method: 'POST', headers: { 'x-urban-token': TOKEN }\n    });\n    if (r.ok) {\n      const d = await r.json();\n      if (curUW) { curUW.verdict = d.verdict; curUW.score = d.score; curUW.verdictReason = d.verdictReason; curUW.recommendation = d.recommendation; curUW.offerStrategy = d.offerStrategy; }\n      renderUW(curUW);\n    }\n  } catch(e) {}\n  if (btn) { btn.textContent = '⚡ Regen'; btn.disabled = false; }\n});\n\nasync function doUnderwrite(force, deep) {\n  if (!curDeal) return;\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  show('pending-card', false);\n  show('uw-content', false);\n  show('loading-state', true);\n  $('load-msg').textContent = deep ? '🔬 Deep underwriting with Sonnet 4...' : '⚡ Fetching comps and underwriting...';\n\n  try {\n    // Always send full deal data as fallback so server doesn't need sheet lookup\n    const r = await fetch(`/api/underwrite/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ forceRefresh: force, deep, dealData: curDeal })\n    });\n\n    if (!r.ok && !r.headers.get('content-type')?.includes('event-stream')) {\n      show('loading-state', false);\n      const errText = await r.text().catch(() => 'Unknown error');\n      console.error('Underwrite HTTP error:', r.status, errText.slice(0, 200));\n      alert('Underwrite failed (HTTP ' + r.status + '). Check console.');\n      return;\n    }\n\n    const reader = r.body.getReader(), dec = new TextDecoder();\n    let buf = '', uwReceived = false;\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n      buf += dec.decode(value, { stream: true });\n      const lines = buf.split('\\n'); buf = lines.pop();\n      for (const line of lines) {\n        if (!line.startsWith('data: ')) continue;\n        try {\n          const data = JSON.parse(line.slice(6));\n          if (data.status) $('load-msg').textContent = data.status;\n          if (data.done && data.underwrite) {\n            uwReceived = true;\n            curUW = data.underwrite;\n            show('loading-state', false);\n            try { renderUW(curUW); } catch(re) { console.error('renderUW err:', re); }\n            doLoadStats();\n            const idx = deals.findIndex(x => x.address === curDeal.address);\n            if (idx >= 0) { deals[idx].underwriteStatus = curUW.verdict; deals[idx].underwriteScore = curUW.score; }\n            renderList();\n          }\n          if (data.error) {\n            const isRL = data.error.includes('rate_limit') || data.error.includes('429');\n            if (isRL) {\n              window._consecutiveRateLimits = (window._consecutiveRateLimits || 0) + 1;\n              // Pause retries for 60 minutes after a rate limit hit\n              window._rateLimitPauseUntil = Date.now() + 60 * 60 * 1000;\n              const msg = '⏳ Anthropic API rate limited — Urban will auto-retry in ~1 hour. Your deals are safe and will underwrite automatically.';\n              if ($('load-msg')) $('load-msg').textContent = msg;\n              show('loading-state', false); // Hide loading, show pending state\n              show('pending-card', true);\n              $('pending-card').querySelector && ($('pending-card').querySelector('h3') || {}).textContent !== undefined &&\n                ($('pending-card').innerHTML = '<h3>⏳ RATE LIMITED</h3><p>Anthropic API limit hit. Urban will auto-retry in ~1 hour.</p><button class=\"btn primary\" id=\"btn-uw-now\">⚡ Try Now</button>');\n              document.getElementById('btn-uw-now')?.addEventListener('click', () => { window._rateLimitPauseUntil = 0; autoUnderwritePending(); });\n            } else {\n              show('loading-state', false);\n              $('load-msg').textContent = '⚠️ ' + data.error + ' — try Re-run';\n              setTimeout(() => show('loading-state', false), 3000);\n            }\n            console.error('Underwrite error from server:', data.error);\n          }\n        } catch(pe) { /* ignore malformed SSE lines */ }\n      }\n    }\n    // If stream ended without a done event, show error\n    if (!uwReceived) {\n      show('loading-state', false);\n      $('load-msg').textContent = '⚠️ No result received — try Re-run';\n    }\n  } catch(e) {\n    show('loading-state', false);\n    console.error('doUnderwrite exception:', e);\n    alert('Error: ' + e.message);\n  }\n}\n\n// -- RENDER UNDERWRITE ----------------------------------------------------------\n// -- GLOBAL SAFE DOM HELPERS --------------------------------------------------\nconst set = (id, val, prop = 'textContent') => { const el = document.getElementById(id); if (el) el[prop] = val; };\nconst cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = c; };\nconst show = (id, visible, displayVal) => { const el = document.getElementById(id); if (el) el.style.display = visible ? (displayVal || 'block') : 'none'; };\n\nfunction renderUW(uw) {\n  if (!uw) return;\n  show('pending-card', false);\n  show('loading-state', false);\n  show('uw-content', true);\n  switchTab('overview');\n\n  const v = uw.verdict || 'REVIEW';\n  const vc = v.replace(/\\s/g,'').toUpperCase();\n  set('dv-v', v);\n  cls('dv-v', `verdict-big v${vc}`);\n  set('dv-sc', uw.score || '?');\n  set('dv-vr', uw.verdictReason || '');\n\n  // OVERVIEW\n  // Use server-recalculated profit (matches ladder calculation)\n  const _uvArv    = uw.arv?.urbanARV || 0;\n  const _uvAsk    = parseFloat(curDeal?.askingPrice) || 0;\n  const _uvRepair = uw.rehab?.urbanEstimate || 0;\n  const _uvCosts  = (uw.financials?.holdingCosts?.total || 0) +\n                    (uw.financials?.sellingCosts?.total || (_uvArv * 0.075)) +\n                    (uw.financials?.hardMoney?.totalInterest || 0) +\n                    (uw.financials?.hardMoney?.originationPoints || 0);\n  const profit = _uvArv > 0 && _uvAsk > 0\n    ? Math.round(_uvArv - _uvAsk - _uvRepair - _uvCosts)\n    : (uw.financials?.netProfitAtAsking || null);\n  const arvPpsf2 = uw.arv?.arvPerSqft || (uw.arv?.urbanARV && curDeal?.sqft ? Math.round(uw.arv.urbanARV / parseFloat(curDeal.sqft)) : null);\n  set('ov-arv', fmt(uw.arv?.urbanARV) + (arvPpsf2 ? ` (${arvPpsf2}/sf)` : ''));\n  set('ov-rehab', fmt(uw.rehab?.urbanEstimate));\n  set('ov-mao', fmt(uw.financials?.mao));\n  set('ov-ask', fmt(curDeal?.askingPrice));\n  const ask2 = parseFloat(curDeal?.askingPrice) || 0;\n  const profitMin = ask2 >= 1000000 ? 100000 : Math.max(ask2 * 0.10, 20000);\n  const profitPct = ask2 > 0 ? (profit / ask2 * 100).toFixed(1) : null;\n  const profitStr = profit != null ? fmt(profit) + (profitPct ? ` (${profitPct}%)` : '') : '—';\n  set('ov-profit', profitStr);\n  cls('ov-profit', `mv ${profit >= profitMin ? 'g' : profit >= 0 ? 'y' : 'r'}`);\n  // Room below MAO — how much cheaper we could get it vs ceiling\n  const _maoVal = uw.financials?.mao || 0;\n  const _askVal = parseFloat(curDeal?.askingPrice) || 0;\n  const _spreadRow = $('ov-spread-row');\n  if (_maoVal > 0 && _askVal > 0 && _askVal < _maoVal && _spreadRow) {\n    _spreadRow.style.display = '';\n    set('ov-spread-mao', `$${(_maoVal - _askVal).toLocaleString()} below ceiling`);\n  } else if (_spreadRow) { _spreadRow.style.display = 'none'; }\n  const wsArvVal = uw.arv?.wholesalerARV;\n  set('ov-warv', wsArvVal && wsArvVal > 0 ? fmt(wsArvVal) : 'Not provided');\n  const diff = (uw.arv?.wholesalerARV||0) - (uw.arv?.urbanARV||0);\n  const wsArv = uw.arv?.wholesalerARV || 0;\n  const arvDiffText = !wsArv\n    ? 'No wholesaler ARV provided'\n    : diff > 10000 ? `Wholesaler inflated by ${fmt(diff)}`\n    : diff < -10000 ? `Wholesaler undervalued — upside ${fmt(Math.abs(diff))}`\n    : 'Matches Urban';\n  set('ov-arvdiff', arvDiffText);\n  cls('ov-arvdiff', `mv ${diff > 10000 ? 'r' : diff < -10000 ? 'g' : ''}`);\n  const cred = uw.wholesalerCredibility?.assessment || 'UNKNOWN';\n  set('ov-cred', cred);\n  cls('ov-cred', 'mv ' + (cred==='TRUSTED'?'g':cred==='QUESTIONABLE'?'y':'mu'));\n  // Wholesaler track record from deal data (populated by server brain lookup)\n  const wsTrackRow = document.getElementById('ov-ws-track-row');\n  const wsTrackEl = document.getElementById('ov-ws-track');\n  const wsC = curDeal?.wholesalerCredibility;\n  if (wsC && wsTrackRow && wsTrackEl) {\n    wsTrackRow.style.display = '';\n    const arvAdj = wsC.arvInflation ? (parseFloat(wsC.arvInflation) > 0 ? '+' : '') + wsC.arvInflation + '% ARV inflation avg' : '';\n    wsTrackEl.textContent = wsC.deals + ' prior deal' + (wsC.deals !== 1 ? 's' : '') + (arvAdj ? ' · ' + arvAdj : '') + (wsC.rating ? ' · ' + wsC.rating : '');\n    wsTrackEl.style.color = wsC.arvInflation && parseFloat(wsC.arvInflation) > 15 ? 'var(--hot)' : wsC.arvInflation && parseFloat(wsC.arvInflation) > 5 ? 'var(--review)' : 'var(--buy)';\n  } else if (wsTrackRow) {\n    wsTrackRow.style.display = 'none';\n  }\n  set('ov-trend', uw.marketAnalysis?.trend || '—');\n  set('ov-hold', uw.financials?.holdMonths ? `${uw.financials.holdMonths} months` : '—');\n  const profMinPct = ask2 >= 1000000 ? '$100K' : Math.max(Math.round((ask2||0)*0.1/1000)*1000, 20000).toLocaleString();\n  {const _a=parseFloat(curDeal?.askingPrice)||0;\n  const _m=_a>=1000000?'$100K':('$'+Math.round(Math.max(_a*.10,20000)/1000)+'K');\n  const _uArv2=uw.arv?.urbanARV||0, _uRep2=uw.rehab?.urbanEstimate||0;\n  const _uCosts2=(uw.financials?.holdingCosts?.total||0)+(uw.financials?.sellingCosts?.total||(_uArv2*.075))+(uw.financials?.hardMoney?.totalInterest||0)+(uw.financials?.hardMoney?.originationPoints||0);\n  const _actualP = _uArv2>0&&_a>0 ? Math.round(_uArv2-_a-_uRep2-_uCosts2) : uw.financials?.netProfitAtAsking;\n  const _pMin = _a>=1000000?100000:Math.max(_a*.10,20000);\n  const _meetsP = _actualP != null && _actualP >= _pMin;\n  const _actualStr = _actualP != null ? ' ('+(_actualP>=0?'+':'')+fmt(_actualP)+')' : '';\n  set('cc-profit', _meetsP ? '\\u2705 YES'+_actualStr : '\\u274c NO (need '+_m+')');\n  cls('cc-profit', 'mv ' + (_meetsP ? 'g' : 'r'));\n}\n  const inMkt = ['pasco','hillsborough','polk','pinellas','hernando','sarasota'].some(c => (curDeal?.county||'').toLowerCase().includes(c));\n  const _cntyDisplay = (curDeal?.county||'').replace(' County','').trim() || curDeal?.city || '';\n  set('cc-mkt', inMkt ? '✅ In Market' + (_cntyDisplay ? ' · '+_cntyDisplay : '') : '⚠️ Outside CCG zones');\n  cls('cc-mkt', `mv ${inMkt ? 'g' : 'y'}`);\n  const flood = curDeal?.floodZone;\n  const hasFlood = flood && !['no','n/a','','none','x'].includes((flood||'').toLowerCase());\n  set('cc-flood', hasFlood ? `⚠️ ${flood}` : '✅ None');\n  cls('cc-flood', `mv ${hasFlood ? 'r' : 'g'}`);\n  const highFlags = (uw.riskFlags||[]).filter(f => f.severity==='HIGH').length;\n  const medFlags = (uw.riskFlags||[]).filter(f => f.severity==='MEDIUM').length;\n  set('cc-risk', highFlags > 0 ? ('\\u26a0\\ufe0f ' + highFlags + ' HIGH flag' + (highFlags>1?'s':'')) : medFlags > 0 ? (medFlags + ' medium' ) : '\\u2705 Low');\n  cls('cc-risk', `mv ${highFlags > 0 ? 'r' : 'g'}`);\n  set('cc-scope', uw.rehab?.scopeLevel || '—');\n  const recEl = $('ov-rec');\n  if (recEl) {\n    recEl.textContent = uw.recommendation || 'No recommendation yet — underwrite this deal to generate one.';\n    recEl.style.color = uw.recommendation ? '' : 'var(--muted)';\n  }\n  const offEl = $('ov-off');\n  if (offEl) {\n    offEl.textContent = uw.offerStrategy || '';\n    const offStr = offEl.closest('.off-str');\n    if (offStr) offStr.style.display = uw.offerStrategy ? '' : 'none';\n  }\n\n  // ARV TAB\n  const ac = uw.arv?.arvConfidence || 'LOW';\n  set('arv-ws', fmt(uw.arv?.wholesalerARV));\n  set('arv-ur', fmt(uw.arv?.urbanARV));\n  // As-is value and spread\n  if ($('arv-asis')) {\n    const _asis = uw.arv?.asIsValue;\n    const _arv = uw.arv?.urbanARV;\n    // If asIsValue missing but we have ARV, estimate at 82% (typical as-is discount)\n    const _asisEst = _asis || (_arv ? Math.round(_arv * 0.82) : null);\n    const _asisLabel = _asis ? fmt(_asis) : (_asisEst ? fmt(_asisEst) + ' (est.)' : '—');\n    set('arv-asis', _asisLabel);\n    set('arv-ur-big', _arv ? fmt(_arv) : '—');\n    if (_asis && _arv) {\n      const _spread = _arv - _asis;\n      const _spreadEl = $('arv-spread');\n      if (_spreadEl) {\n        _spreadEl.textContent = (_spread > 0 ? '+' : '') + fmt(_spread);\n        _spreadEl.style.color = _spread > 50000 ? 'var(--buy)' : _spread > 20000 ? 'var(--review)' : _spread > 0 ? 'var(--hot)' : 'var(--red)';\n        _spreadEl.style.fontWeight = '700';\n      }\n    } else {\n      set('arv-spread', '—');\n    }\n  }\n  const arvDnText = !wsArv\n    ? 'Wholesaler provided no ARV — Urban estimated independently from comps'\n    : diff > 1000 ? `Wholesaler is ${fmt(diff)} (${((diff/(uw.arv?.urbanARV||1))*100).toFixed(1)}%) ABOVE Urban TRUE ARV — INFLATED`\n    : diff < -1000 ? `Wholesaler is ${fmt(Math.abs(diff))} BELOW Urban's ARV — potential upside`\n    : `Wholesaler ARV matches Urban (${fmt(diff)} variance)`;\n  set('arv-dn', arvDnText);\n  set('arv-conf', ac);\n  cls('arv-conf', `conf conf-${ac}`);\n  set('arv-notes', uw.arv?.arvNotes || (uw._isPartial ? '⚡ Hit Underwrite for full ARV analysis with live comps and detailed reasoning.' : ''));\n  const compsTb = $('comps-body');\n  if (compsTb) compsTb.innerHTML = '';\n  // Use structured comps if available, else parse arvCompsUsed strings\n  const allComps = (uw.comps||[]).length > 0 ? (uw.comps||[]) : \n    (uw.arv?.compsUsed||[]).map(s => {\n      // Parse \"6785 21st Way S, Pinellas (1935sf 4bd/2ba, $385K, CCG database)\"\n      const priceMatch = s.match(/\\$([\\d.]+)K/i);\n      const sqftMatch = s.match(/(\\d+)sf/);\n      const bedsBathsMatch = s.match(/(\\d+)bd\\/(\\d+)ba/);\n      const addrMatch = s.match(/^([^(]+)/);\n      return {\n        address: (addrMatch?.[1]||s).trim(),\n        sold_price: priceMatch ? parseInt(priceMatch[1]) * 1000 : 0,\n        sqft: sqftMatch ? parseInt(sqftMatch[1]) : 0,\n        beds: bedsBathsMatch ? parseInt(bedsBathsMatch[1]) : 0,\n        baths: bedsBathsMatch ? parseInt(bedsBathsMatch[2]) : 0,\n        source: s.includes('CCG') ? 'CCG DB' : s.includes('Redfin') ? 'Redfin' : 'Urban'\n      };\n    });\n  if (compsTb) {\n    allComps.forEach(c => {\n      // Handle both Redfin API fields (salePrice/saleDate) and DB fields (sold_price/sold_date)\n      const price = c.salePrice || c.sold_price || 0;\n      const date  = (c.saleDate || c.sold_date || '').slice(0,10);\n      const ppsf  = c.ppsf ? Math.round(parseFloat(c.ppsf)) : (price && c.sqft ? Math.round(price/c.sqft) : null);\n      const pool  = c.pool === true ? '🏊' : '';\n      const yr    = c.year_built || '';\n      const src   = (c.source||'').includes('HCPA') ? '🏛️' : (c.source||'').includes('PCPAO') ? '🏛️' : '🔴';\n      const tr = document.createElement('tr');\n      tr.innerHTML = `\n        <td style=\"font-size:11px\">${pool} ${c.address||'—'}</td>\n        <td>${c.beds||'?'}bd / ${c.baths||'?'}ba</td>\n        <td>${c.sqft ? parseInt(c.sqft).toLocaleString() : '—'}</td>\n        <td>${yr || '—'}</td>\n        <td class=\"p\" style=\"color:var(--gold);font-weight:600\">${fmt(price)}</td>\n        <td style=\"color:var(--muted)\">${ppsf ? '$'+ppsf+'/sf' : '—'}</td>\n        <td style=\"color:var(--muted);font-size:11px\">${date}</td>\n        <td title=\"${c.source||''}\">${src}</td>`;\n      compsTb.appendChild(tr);\n    });\n    if (!uw.comps?.length) compsTb.innerHTML = '<tr><td colspan=\"8\" style=\"color:var(--muted);text-align:center;padding:20px;font-size:12px\">No live comps loaded yet<br><small style=\"opacity:.7\">Hit ⚡ Underwrite → pulls real sold comps from Zillow, Redfin &amp; Public Records</small></td></tr>';\n  }\n\n  // REHAB TAB\n  const sl = (uw.rehab?.scopeLevel||'').toUpperCase();\n  const sc = sl.includes('FULL')?'FULL':sl.includes('LIGHT')?'LIGHT':'MEDIUM';\n  const rehabScopeEl = $('rehab-scope');\n  if (rehabScopeEl) rehabScopeEl.innerHTML = `<div class=\"scope-tag sc-${sc}\">${uw.rehab?.scopeLevel||'MEDIUM'} · ${uw.financials?.holdMonths||5} Month Hold</div>`;\n  const liEl = $('rehab-li');\n  if (liEl) liEl.innerHTML = '';\n  const items = uw.rehab?.lineItems || {};\n  let tot = 0;\n  if (liEl) {\n    if (!Object.keys(items).length) {\n      liEl.innerHTML = '<div style=\"color:var(--muted);font-size:12px;padding:16px;text-align:center;border:1px dashed var(--border2);border-radius:6px\">No line items in this underwrite.<br><span style=\"font-size:11px;opacity:.7\">Hit <strong style=\\\"color:var(--gold)\\\">⚡ Underwrite</strong> for itemized breakdown.</span></div>';\n    }\n    // Ordered display with friendly labels + context\n    const _sqft = parseInt(curDeal?.sqft) || 0;\n    const _beds = parseInt(curDeal?.beds) || 0;\n    const _baths = parseFloat(curDeal?.baths) || 0;\n    const lineOrder = [\n      ['roof','Roof'],['hvac','HVAC'],['plumbing','Plumbing'],['electrical','Electrical'],\n      ['kitchen','Kitchen'],['bathrooms','Bathrooms'],['flooring','Flooring'],\n      ['windows','Windows / Doors'],['paint','Paint'],['landscaping','Landscaping'],\n      ['permits','Permits & Inspections'],['misc','Misc / Cleanup'],['contingency','Contingency'],['other','Other']\n    ];\n    const contextMap = {\n      kitchen: _sqft < 1200 ? '(small house cosmetic, min $10K)' : '(full kitchen refresh)',\n      bathrooms: _baths > 1 ? '($5K × ' + _baths + ' baths all-in)' : '($5K all-in)',\n      flooring: _sqft > 0 ? '(' + _sqft + ' sf × $3 installed)' : '($2/sf materials + $1/sf labor)',\n      paint: _sqft > 0 ? '(' + _sqft + ' sf × $2 interior)' : '',\n      misc: '(fixtures, hardware, dumpster, cleanup)',\n      contingency: '(10% buffer on scoped work)',\n      permits: '(required for any permitted work)'\n    };\n    lineOrder.forEach(([k, label]) => {\n      const vv = items[k];\n      if (!vv) return; tot += vv;\n      const ctx = contextMap[k] || '';\n      liEl.innerHTML += '<div class=\"rr\"><span class=\"rn\">' + label + (ctx ? ' <span style=\"font-size:10px;opacity:.5;font-style:italic\">' + ctx + '</span>' : '') + '</span><span class=\"rv\">' + fmt(vv) + '</span></div>';\n    });\n    // Catch any extra keys not in the order map\n    Object.entries(items).forEach(([k, vv]) => {\n      if (!vv) return;\n      const alreadyShown = lineOrder.some(([key]) => key === k);\n      if (!alreadyShown) { tot += vv; liEl.innerHTML += '<div class=\"rr\"><span class=\"rn\">' + k.replace(/_/g,' ') + '</span><span class=\"rv\">' + fmt(vv) + '</span></div>'; }\n    });\n    const rng2 = uw.rehab?.urbanEstimateRange;\n    const rngStr = rng2 ? ' <span style=\"font-size:10px;opacity:.5;font-style:italic\">range ' + fmt(rng2.low) + ' – ' + fmt(rng2.high) + '</span>' : '';\n    liEl.innerHTML += '<div class=\"rt\"><span class=\"rn\">TOTAL' + rngStr + '</span><span class=\"rv\">' + fmt(tot) + '</span></div>';\n  }\n  const rng = uw.rehab?.urbanEstimateRange;\n  set('rehab-rng', rng ? `Range: ${fmt(rng.low)} – ${fmt(rng.high)}` : '');\n  set('rehab-notes', uw.rehab?.notes || '');\n  set('rehab-miss', uw.rehab?.missingInfo ? `⚠️ Missing: ${uw.rehab.missingInfo}` : '');\n  set('rh-ws', uw.rehab?.wholesalerEstimate ? fmt(uw.rehab.wholesalerEstimate) : 'Not provided');\n  setTimeout(function() { renderOfferLadder(uw); }, 10);\n  set('rh-ur', fmt(uw.rehab?.urbanEstimate));\n  const rc = uw.rehab?.confidence || 'MEDIUM';\n  { const _e_rh_conf = $('rh-conf'); if (_e_rh_conf) _e_rh_conf.innerHTML = `<span class=\"conf conf-${rc}\">${rc}</span>`; }\n\n  // FINANCIALS TAB — all numbers recalculated client-side for accuracy\n  const f = uw.financials || {};\n  const fi_ask   = parseFloat(f.askingPrice || curDeal?.askingPrice) || 0;\n  const fi_arv   = uw.arv?.urbanARV || 0;\n  const fi_rehab = uw.rehab?.urbanEstimate || 0;\n  const fi_mao   = f.mao || Math.round(fi_arv * 0.7 - fi_rehab);\n  const fi_loan  = f.hardMoney?.loanAmount || Math.round(fi_ask * 0.90);\n  const fi_dp    = Math.round(fi_ask * 0.10);\n  const fi_int   = f.hardMoney?.totalInterest || 0;\n  const fi_pts   = f.hardMoney?.originationPoints || Math.round(fi_loan * 0.02);\n  const fi_hc    = f.holdingCosts?.total || 0;\n  const fi_sell  = f.sellingCosts?.total || Math.round(fi_arv * 0.075);\n  const fi_fin   = fi_int + fi_pts;\n  // Correctly sum all-in (override Claude's often-wrong totalCost)\n  const fi_tot   = fi_ask + fi_rehab + fi_fin + fi_hc + fi_sell;\n  // True profit = ARV - all costs\n  const fi_profit = fi_arv > 0 ? Math.round(fi_arv - fi_tot) : 0;\n  const fi_ctc   = fi_dp + fi_rehab;  // cash to close\n  const fi_hold  = f.holdMonths || 4;\n  const fi_sale  = Math.round(fi_arv * 0.96);\n\n  // CARD 1\n  set('fi-ask', fmt(fi_ask));\n  set('fi-arv', fmt(fi_arv));\n  set('fi-sale', fmt(fi_sale));\n  set('fi-reh', fmt(fi_rehab));\n  set('fi-mao', fmt(fi_mao));\n  const fi_oum = fi_ask - fi_mao;\n  set('fi-oum', fi_oum > 0 ? '+'+fmt(fi_oum)+' over MAO' : fmt(Math.abs(fi_oum))+' under MAO');\n  cls('fi-oum', 'fv ' + (fi_oum > 0 ? 'r' : 'g'));\n  set('fi-room', fi_oum > 0 ? 'Above ceiling — must negotiate down' : fmt(Math.abs(fi_oum))+' below ceiling — room to work');\n  cls('fi-room', 'fv ' + (fi_oum > 0 ? 'r' : 'g') + ' ' + (fi_oum <= 0 ? '' : ''));\n\n  // CARD 2\n  set('fi-loan', fmt(fi_loan));\n  set('fi-dp', fmt(fi_dp));\n  set('fi-mo', fmt(f.hardMoney?.monthlyPayment));\n  set('fi-hold', fi_hold + ' months');\n  set('fi-int', fmt(fi_int));\n  set('fi-pts', fmt(fi_pts));\n  set('fi-fin', fmt(fi_fin));\n  set('fi-hold-months-lbl', '(' + fi_hold + '-month hold)');\n\n  // CARD 3\n  set('fi-pp', fmt(fi_ask));\n  set('fi-rh2', fmt(fi_rehab));\n  set('fi-fin2', fmt(fi_fin));\n  set('fi-hc', fmt(fi_hc));\n  set('fi-sc', fmt(fi_sell));\n  set('fi-tot', fmt(fi_tot));\n  set('fi-ctc', fmt(fi_ctc));\n\n  // Holding detail\n  set('fi-tx', fmt(f.holdingCosts?.taxes));\n  set('fi-ins', fmt(f.holdingCosts?.insurance));\n  set('fi-ut', fmt(f.holdingCosts?.utilities));\n  set('fi-hc2', fmt(fi_hc));\n\n  // CARD 4 — Profit & Returns\n  const fi_pMin = fi_ask >= 1000000 ? 100000 : Math.max(fi_ask * 0.10, 20000);\n  const fi_profitPct = fi_arv > 0 ? (fi_profit / fi_arv * 100).toFixed(1) : '0';\n  const fi_roiPct = fi_tot > 0 ? (fi_profit / fi_tot * 100).toFixed(1) : '0';\n  const fi_coc = fi_ctc > 0 ? (fi_profit / fi_ctc * 100).toFixed(1) : '0';\n  const fi_aroiPct = fi_ctc > 0 && fi_hold > 0 ? ((fi_profit / fi_ctc) / (fi_hold / 12) * 100).toFixed(1) : '0';\n  const fi_profitAtMAO = Math.round(fi_arv - fi_mao - fi_rehab - fi_fin - fi_hc - fi_sell);\n\n  const fi_pColor = fi_profit >= fi_pMin ? 'g' : fi_profit >= 0 ? 'y' : 'r';\n  set('fi-pa', (fi_profit >= 0 ? '+' : '') + fmt(fi_profit));\n  cls('fi-pa', 'fv ' + fi_pColor);\n  set('fi-pm2', fi_profitPct + '% of ARV');\n  cls('fi-pm2', 'fv ' + (parseFloat(fi_profitPct) >= 20 ? 'g' : parseFloat(fi_profitPct) >= 10 ? 'y' : 'r'));\n  set('fi-roi2', fi_roiPct + '% return on total invested');\n  cls('fi-roi2', 'fv ' + (parseFloat(fi_roiPct) >= 30 ? 'g' : parseFloat(fi_roiPct) >= 15 ? 'y' : 'r'));\n  set('fi-coc', fi_coc + '%');\n  set('fi-aroi', fi_aroiPct + '% annualized');\n  const _pmStr = Math.abs(fi_profitAtMAO) < 5000 ? '≈ $0 (break-even)' : (fi_profitAtMAO >= 0 ? '+' : '') + fmt(fi_profitAtMAO);\n  set('fi-pm', _pmStr);\n  cls('fi-pm', 'fv ' + (fi_profitAtMAO >= fi_pMin ? 'g' : fi_profitAtMAO >= 0 ? 'y' : 'r'));\n  const _m3 = fi_ask>=1000000?'$100K+':('$'+Math.round(fi_pMin/1000)+'K min');\n  const _meets = fi_profit >= fi_pMin;\n  set('fi-min', _meets ? ('\\u2705 YES ('+_m3+')') : ('\\u274c NO ('+_m3+' needed)'));\n  cls('fi-min', 'fv ' + (_meets ? 'g' : 'r'));\n\n  // RENTAL TAB — editable live calculator + AI defaults\n  const rn = uw.rental || {};\n  const rnMR = rn.marketRent || {};\n  const rnInc = rn.income || {};\n  const rnExp = rn.expenses || {};\n  const fi_arv3  = uw.arv?.urbanARV || 0;\n  const fi_ask3  = parseFloat(curDeal?.askingPrice) || 0;\n  const fi_reh3  = uw.rehab?.urbanEstimate || 0;\n\n  // Unit count\n  const _uc = rnMR.unitCount || getUnitCount(curDeal?.propertyType) || 1;\n  const _rentPU = rnMR.rentPerUnit || (rnMR.estimated ? Math.round(rnMR.estimated / _uc) : 0);\n\n  // Populate editable inputs with AI estimates as defaults\n  const setIn = (id, val) => { const el = document.getElementById(id); if (el && !el._userEdited) el.value = val || ''; };\n  setIn('rn-in-rent-pu', _rentPU || Math.round((rnMR.estimated || 0) / Math.max(_uc, 1)));\n  setIn('rn-in-units', _uc);\n  setIn('rn-in-vac', Math.round((rnInc.vacancyRate || 0.07) * 100));\n  setIn('rn-in-pm',  10); // Caleb: 10% PM\n  // Use market_data values from DB if available (deal._propTaxRate, deal._insuranceMo)\n  const _propTaxRate = curDeal?._propTaxRate || 0.012; // default 1.2% FL\n  const _tax = rnExp.propertyTaxes?.monthly || (fi_arv3 ? Math.round(fi_arv3 * _propTaxRate / 12) : 0);\n  setIn('rn-in-tax', _tax);\n  const _insMo = curDeal?._insuranceMo || rnExp.insurance?.monthly || '';\n  setIn('rn-in-ins', _insMo); // from market DB or AI estimate\n  setIn('rn-in-maint', 125); // Caleb: $125/mo\n  setIn('rn-in-capex', rnExp.capexReserve?.monthly || 100);\n  setIn('rn-in-other', (rnExp.hoa?.monthly || parseFloat(curDeal?.hoaFee) || 0));\n  setIn('rn-in-dscr-rate',  6.75); // Caleb's actual rate\n  setIn('rn-in-dscr-ltv',   75);\n  setIn('rn-in-conv-rate',  7.25);\n  setIn('rn-in-conv-ltv',   80);\n  setIn('rn-in-refi-ltv',   75);\n  setIn('rn-in-refi-rate',  6.75); // Caleb's actual rate\n\n  // Unit pill\n  const _pill = document.getElementById('rn-unit-pill');\n  if (_pill) { _pill.style.display = _uc > 1 ? '' : 'none'; _pill.textContent = ['','','2-Unit Duplex','3-Unit Triplex','4-Unit Quad'][_uc] || (_uc+'-Unit'); }\n\n  // Rent source note\n  const _srcNote = document.getElementById('rn-rent-source-note');\n  if (_srcNote) {\n    const _src = rnMR.source || 'AI estimate';\n    const _conf = rnMR.confidence || '';\n    const hudStr = rnMR.hudFMR ? ' · HUD FMR: ' + (rnMR.hudFMR > 500 ? '$' + rnMR.hudFMR.toLocaleString() : rnMR.hudFMR) + '/mo' : '';\n    _srcNote.textContent = 'Source: ' + _src + (_conf ? ' · ' + _conf + ' confidence' : '') + hudStr + ' · Edit above to override';\n  }\n\n  // HUD FMR + assessment fields\n  const rn_hud = document.getElementById('rn-calc-hud');\n  if (rn_hud) rn_hud.textContent = rnMR.hudFMR ? '$' + rnMR.hudFMR.toLocaleString() + '/mo (' + (curDeal?.beds||'?') + 'BR ' + (curDeal?.county||'FL') + ')' : 'Not available';\n\n  // AI assessment fields\n  set('rn-notes', rn.notes || '');\n  set('rn-worth', rn.worthConsidering ? '✅ YES' : '❌ NO');\n  if (document.getElementById('rn-worth')) document.getElementById('rn-worth').className = 'mv ' + (rn.worthConsidering ? 'g' : 'r');\n  set('rn-worth-brrrr', rn.worthBRRRR ? '✅ YES' : '❌ NO');\n  if (document.getElementById('rn-worth-brrrr')) document.getElementById('rn-worth-brrrr').className = 'mv ' + (rn.worthBRRRR ? 'g' : 'r');\n\n  // Verdict banner\n  const _vrd = rn.rentalVerdict || (rn.worthConsidering ? 'POSSIBLE HOLD' : 'FLIP ONLY');\n  const _vBanner = document.getElementById('rn-verdict-banner');\n  if (_vBanner) {\n    _vBanner.style.display = 'flex';\n    const _vC = {'STRONG HOLD':'rgba(60,200,130,.12)','BRRRR CANDIDATE':'rgba(60,200,130,.1)','POSSIBLE HOLD':'rgba(255,160,32,.08)','FLIP ONLY':'rgba(100,100,120,.06)'}[_vrd] || 'rgba(100,100,120,.06)';\n    const _vB = {'STRONG HOLD':'var(--buy)','BRRRR CANDIDATE':'var(--buy)','POSSIBLE HOLD':'var(--review)','FLIP ONLY':'var(--muted)'}[_vrd] || 'var(--muted)';\n    _vBanner.style.background = _vC; _vBanner.style.borderColor = _vB;\n    const _vIcons = {'STRONG HOLD':'🏠','BRRRR CANDIDATE':'♻️','POSSIBLE HOLD':'🤔','FLIP ONLY':'🔨'};\n    set('rn-verdict-icon', _vIcons[_vrd] || '📊');\n    set('rn-verdict-label', _vrd);\n    if (document.getElementById('rn-verdict-label')) document.getElementById('rn-verdict-label').style.color = _vB;\n    set('rn-verdict-note', rn.notes || '');\n    const _bBadge = document.getElementById('rn-brrrr-badge');\n    if (_bBadge) _bBadge.style.display = (rn.worthBRRRR || _vrd.includes('BRRRR')) ? '' : 'none';\n  }\n\n  // Static BRRRR fields from ARV/deal\n  set('rn-b-arv', fmt(fi_arv3));\n  // Editable purchase price — lets Caleb model different offer prices\n  const _rnPurch = (id) => { const el = document.getElementById(id); if (el && !el._userEdited) el.value = fi_ask3 || ''; };\n  _rnPurch('rn-in-purchase');\n  // Rental rehab default: 40% of flip — just make it rentable, not retail-ready\n  const _rnRehabDef = rn.brrrr?.rentalRehab || Math.round(fi_reh3 * 0.40);\n  const _rnEl = document.getElementById('rn-in-rehab');\n  if (_rnEl && !_rnEl._userEdited) _rnEl.value = _rnRehabDef || '';\n\n  // Track user edits so we don't overwrite them\n  ['rn-in-rent-pu','rn-in-units','rn-in-vac','rn-in-pm','rn-in-tax','rn-in-ins','rn-in-maint','rn-in-capex','rn-in-other','rn-in-dscr-rate','rn-in-dscr-ltv','rn-in-conv-rate','rn-in-conv-ltv','rn-in-refi-ltv','rn-in-refi-rate','rn-in-rehab','rn-in-purchase'].forEach(id => {\n    const el = document.getElementById(id);\n    if (el && !el._hasListener) {\n      el._hasListener = true;\n      el.addEventListener('change', () => { el._userEdited = true; });\n    }\n  });\n\n  // Run calculator\n  rnCalc();\n\n\n  // FLAGS TAB\n  const flagEl = $('flags-list');\n  flagEl.innerHTML = '';\n  const flagsEmpty = $('flags-empty');\n  const sortedFlags = (uw.riskFlags||[]).sort((a,b) => ['HIGH','MEDIUM','LOW'].indexOf(a.severity)-['HIGH','MEDIUM','LOW'].indexOf(b.severity));\n  if (flagsEmpty) flagsEmpty.style.display = sortedFlags.length === 0 ? '' : 'none';\n  sortedFlags.forEach(f => {\n      const sev = (f.severity||'').toUpperCase();\n      const icon = sev === 'HIGH' ? '🔴' : sev === 'MEDIUM' ? '🟡' : '🔵';\n      const sevColor = sev === 'HIGH' ? '#ff4455' : sev === 'MEDIUM' ? 'var(--review)' : 'var(--muted)';\n      flagEl.innerHTML += '<div class=\"flag flag-' + sev + '\" style=\"margin-bottom:8px;border-radius:6px;overflow:hidden\">'\n        + '<div class=\"fn\" style=\"display:flex;align-items:center;gap:8px\">'\n        + '<span style=\"font-size:13px\">' + icon + '</span>'\n        + '<span style=\"flex:1;font-weight:700;font-size:12px;letter-spacing:.3px\">' + (f.flag||'Risk') + '</span>'\n        + '<span style=\"font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;background:' + sevColor + ';color:#000;opacity:.9\">' + sev + '</span>'\n        + '</div>'\n        + '<div class=\"fd\" style=\"font-size:12px;line-height:1.6;color:var(--text);padding:6px 10px 8px;opacity:.85\">' + (f.detail||'') + '</div>'\n        + '</div>';\n    });\n  if (!uw.riskFlags?.length) flagEl.innerHTML = '<div style=\"color:var(--muted);font-size:13px;padding:20px;text-align:center\">No risk flags identified</div>';\n\n\n\n  // EXIT ANALYSIS\n  const ex = uw.exitAnalysis;\n  const exEl = $('exit-analysis');\n  if (ex) {\n    if (exEl) exEl.style.display = '';\n    set('ex-dom', ex.estimatedDOM ? ex.estimatedDOM + ' days' : '—');\n    set('ex-lsr', ex.listToSaleRatio ? (ex.listToSaleRatio * 100).toFixed(0) + '% of list' : '—');\n    set('ex-rsp', ex.realisticSalePrice ? fmt(ex.realisticSalePrice) + (ex.realisticSalePriceNote ? ' (' + ex.realisticSalePriceNote + ')' : '') : '—');\n    const adj = ex.adjustedProfit;\n    set('ex-adj', adj != null ? (adj >= 0 ? '+' : '') + fmt(adj) : '—');\n    cls('ex-adj', `fv ${adj >= 40000 ? 'g' : adj >= 0 ? '' : 'r'}`);\n    set('ex-buyer', ex.buyerProfile || '—');\n  } else { if (exEl) exEl.style.display = 'none'; }\n\n  // CHAT HISTORY\n  renderChat(uw.chatHistory || []);\n}\n\n// -- PROPERTY TAB — ALL SHEET DATA ---------------------------------------------\nfunction fillPropTab(d) {\n  const el = $('deal-full-info');\n  if (!el) return;\n  const vv = x => {\n    if (!x || x === '' || x === '0') return null;\n    if (typeof x === 'string' && /^\\d{4}-\\d{2}-\\d{2}T/.test(x)) {\n      try { return new Date(x).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch {}\n    }\n    return x;\n  };\n  const money = x => x && parseFloat(x) ? '$' + parseFloat(x).toLocaleString() : null;\n  const lnk = (url, label) => url ? `<a href=\"${url}\" target=\"_blank\">${label} ↗</a>` : null;\n  const hasFlag = x => x && !['no','n/a','none','x',''].includes((x||'').toLowerCase().trim());\n\n  const prow = (label, val, opts={}) => {\n    if (val === null || val === undefined || val === '' || val === false || val === 'false' || val === 0) return '';\n    const cls = opts.warn ? 'warn' : opts.big ? 'big' : opts.pos ? 'pos' : '';\n    return `<div class=\"prow ${cls}\"><div class=\"plbl\">${label}</div><div class=\"pval\">${val}</div></div>`;\n  };\n  const sec = (icon, title, rows) => {\n    const content = rows.filter(Boolean).join('');\n    if (!content) return '';\n    return `<div class=\"fsec\"><div class=\"fst\">${icon} ${title}</div>${content}</div>`;\n  };\n  const note = (label, val, color) => val ? `<div class=\"pnote\" ${color?`style=\"color:${color}\"`:''}><div class=\"pnote-lbl\" ${color?`style=\"color:${color}\"`:''}>${label}</div>${val}</div>` : '';\n\n  // Quick Links (Street View, Appraiser, Permits, Redfin)\n  const _a2=d.address||(curUW&&curUW.deal&&curUW.deal.address)||'';\n  const _c2=d.city||(curUW&&curUW.deal&&curUW.deal.city)||'';\n  const _co2=((d.county||(curUW&&curUW.deal&&curUW.deal.county))||'').toLowerCase();\n  const _q2=encodeURIComponent(_a2+' '+_c2+' FL');\n  const _paM2={hillsborough:'https://www.hcpafl.org/Property-Search#/?query='+encodeURIComponent(_a2),pasco:'https://www.epascoapp.com/searches?query='+encodeURIComponent(_a2),hernando:'https://www.hernandopa.org/pa/jWeb/Searches?query='+encodeURIComponent(_a2),pinellas:'https://www.pcpao.gov/search/?q='+encodeURIComponent(_a2),polk:'https://www.polkpa.org/search?query='+encodeURIComponent(_a2),lake:'https://www.lakecopropappr.com/search/?query='+encodeURIComponent(_a2),manatee:'https://www.manateepao.com/search/?query='+encodeURIComponent(_a2),sarasota:'https://www.sc-pa.com/search/?query='+encodeURIComponent(_a2)};\n  const _paE2=Object.entries(_paM2).find(([k])=>_co2.includes(k));\n  const _paUrl2=_paE2?_paE2[1]:'https://www.google.com/search?q='+encodeURIComponent(_a2+' '+_c2+' FL property appraiser');\n  const _paLbl2=_paE2?(_paE2[0].charAt(0).toUpperCase()+_paE2[0].slice(1)+' Appraiser'):'Property Appraiser';\n  let _permitBtn='';\n  if(_co2.includes('pasco'))_permitBtn=`<a href=\"https://energovweb.pascocountyfl.net/EnerGov_Prod/SelfService#/search?SearchModule=Permits&query=${encodeURIComponent(_a2)}\" target=\"_blank\" rel=\"noopener\" class=\"ql-btn\">&#128296; Accella/EnerGov</a>`;\n  else if(_co2.includes('hillsborough'))_permitBtn=`<a href=\"https://www.hillsborough.permittingportal.com/search?query=${encodeURIComponent(_a2)}\" target=\"_blank\" rel=\"noopener\" class=\"ql-btn\">&#128296; Permit Portal</a>`;\n  const _qlHtml=`<div style=\"display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)\"><a href=\"https://www.google.com/maps?q=${_q2}&layer=c\" target=\"_blank\" rel=\"noopener\" class=\"ql-btn\">&#128694; Street View</a><a href=\"${_paUrl2}\" target=\"_blank\" rel=\"noopener\" class=\"ql-btn\">&#127963;&#65039; ${_paLbl2}</a>${_permitBtn}<a href=\"https://www.redfin.com/FL/${encodeURIComponent(_c2)}/find-homes\" target=\"_blank\" rel=\"noopener\" class=\"ql-btn\">&#128308; Redfin</a></div>`;\n\n  el.innerHTML = [\n    sec('📋', 'DEAL INFO', [\n      prow('Date Received', vv(d.dateReceived)),\n      prow('Days Active', vv(d.daysActive)),\n      prow('Expires', vv(d.expires), {warn: !!vv(d.expires)}),\n      prow('Email Subject', vv(d.emailSubject)),\n      prow('List / Source', vv(d.listName)),\n      prow('Photos', vv(d.photosIncluded)&&d.photosIncluded!=='false'&&d.photosIncluded!==false ? (d.photoCount&&parseInt(d.photoCount)>0 ? `${parseInt(d.photoCount)} photos included` : 'Photos included') : null),\n    ]),\n    sec('🏠', 'PROPERTY', [\n      prow('Address', `${d.address}<br><small style=\"color:var(--muted)\">${d.city}, ${d.state} ${d.zip} — ${d.county} County</small>`),\n      prow('Subdivision', vv(d.subdivision)),\n      prow('School District', vv(d.schoolDistrict)),\n      prow('Type', vv(d.propertyType)),\n      prow('Beds / Baths', `${vv(d.beds)||'?'} bd · ${vv(d.baths)||'?'} ba${vv(d.halfBaths)?' · '+d.halfBaths+' half':''}`),\n      prow('Sqft', vv(d.sqft) ? parseInt(d.sqft).toLocaleString()+' sqft'+(vv(d.lotSqft)?' · Lot: '+parseInt(d.lotSqft).toLocaleString()+' sqft':'')+(vv(d.lotAcres)?' ('+d.lotAcres+' ac)':'') : null),\n      prow('Year Built', vv(d.yearBuilt)),\n      prow('Stories', vv(d.stories)),\n      prow('Construction', vv(d.construction)),\n      prow('Foundation', vv(d.foundation)),\n      prow('Occupancy', vv(d.occupancy)),\n      prow('Pool', (d.pool&&d.pool!=='false'&&d.pool!==false&&String(d.pool).toLowerCase()!=='no') ? 'Yes'+(vv(d.poolNotes)?' — '+d.poolNotes:'') : null),\n      prow('Garage', (d.garage&&d.garage!=='false'&&d.garage!==false&&String(d.garage).toLowerCase()!=='no') ? (d.garage===true||d.garage==='true'?'Yes':d.garage)+(vv(d.garageSpaces)?' · '+d.garageSpaces+' spaces':'')+(vv(d.carport)?' · Carport':'') : null),\n      prow('Basement / Attic', [vv(d.basement)&&d.basement!=='false'&&d.basement!==false&&'Basement: '+d.basement,vv(d.attic)&&d.attic!=='false'&&d.attic!==false&&'Attic: '+d.attic].filter(Boolean).join(' · ')||null),\n      prow('Flood Zone', hasFlag(d.floodZone) ? d.floodZone : null, {warn: hasFlag(d.floodZone)}),\n      prow('HOA', hasFlag(d.hoa) ? d.hoa+(vv(d.hoaFee)?' — $'+parseFloat(d.hoaFee).toLocaleString()+'/mo':'') : null, {warn: true}),\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Open in Maps')}</div></div>` : '',\n    ]),\n    sec('💰', 'WHOLESALER NUMBERS', [\n      prow('Asking Price', money(d.askingPrice), {big: true}),\n      prow('Wholesaler ARV', money(d.wholesalerARV), {big: true}),\n      prow('Repairs Estimate', d.repairsEstimate ? money(d.repairsEstimate) : null),\n      prow('Assignment Fee', money(d.assignmentFee)),\n      prow('Equity', money(d.equity)),\n      prow('Annual Taxes', money(d.annualTaxes)),\n      prow('Rent (Current)', money(d.rentCurrent)),\n      prow('Rent (Market Est)', money(d.rentMarket)),\n      prow('Close Date', vv(d.closeDate)),\n      prow('Inspection Period', vv(d.inspectionPeriod)),\n      prow('Earnest Money', money(d.earnestMoney)),\n      prow('Financing Terms', vv(d.financingTerms)),\n      prow('Cash Only', d.cashOnly&&d.cashOnly!=='false'&&d.cashOnly!==false ? ((d.cashOnly===true||d.cashOnly==='true')?'Yes':'Cash Only') : null, {warn: true}),\n    ]),\n    sec('🔧', 'SYSTEMS & CONDITION', [\n      prow('Overall Condition', vv(d.overall_condition), {warn: (d.overall_condition||'').toLowerCase().includes('poor')||(d.overall_condition||'').toLowerCase().includes('bad')}),\n      prow('Roof', [vv(d.roofType),vv(d.roofAge)].filter(Boolean).join(' · ')||null),\n      prow('HVAC / AC', vv(d.acYear)),\n      prow('Water Heater', vv(d.waterHeater)),\n      prow('Electrical', vv(d.electrical)),\n      prow('Plumbing', vv(d.plumbing)),\n      prow('Windows', vv(d.windows)),\n      prow('Flooring', vv(d.flooring)),\n    ]),\n    [vv(d.kitchenNotes),vv(d.bathNotes),vv(d.whatIsUpdated),vv(d.whatNeedsWork),vv(d.highlights),vv(d.redFlags),vv(d.additionalNotes)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">📝 CONDITION NOTES</div>\n      ${note('Kitchen', vv(d.kitchenNotes))}\n      ${note('Bathrooms', vv(d.bathNotes))}\n      ${note('✅ What\\'s Updated', vv(d.whatIsUpdated), 'var(--go)')}\n      ${note('🔨 What Needs Work', vv(d.whatNeedsWork), 'var(--hot)')}\n      ${note('⭐ Highlights', vv(d.highlights), 'var(--go)')}\n      ${note('🚩 Red Flags', vv(d.redFlags), 'var(--hot)')}\n      ${note('Additional Notes', vv(d.additionalNotes))}\n    </div>` : '',\n    [vv(d.comp1),vv(d.comp2),vv(d.comp3)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">🏘️ WHOLESALER COMPS</div>\n      ${note('Comp 1', vv(d.comp1))}\n      ${note('Comp 2', vv(d.comp2))}\n      ${note('Comp 3', vv(d.comp3))}\n    </div>` : '',\n    sec('👤', 'SELLER INFO', [\n      prow('Seller Name', vv(d.sellerName)),\n      prow('Seller Phone', vv(d.sellerPhone)),\n      prow('Situation', vv(d.sellerSituation)),\n      prow('Motivation', vv(d.sellerMotivation)),\n    ]),\n    sec('📞', 'WHOLESALER CONTACT', [\n      prow('Company', vv(d.wholesalerCompany||d.contact1Company)),\n      prow('Contact 1', [vv(d.contact1Name),vv(d.contact1Title)].filter(Boolean).join(' · ')),\n      prow('Phone', [vv(d.contact1Phone),vv(d.contact1Phone2)].filter(Boolean).join(' · ')),\n      prow('Email', vv(d.contact1Email)),\n      vv(d.contact1Website) ? `<div class=\"prow\"><div class=\"plbl\">Website</div><div class=\"pval\">${lnk(d.contact1Website.startsWith('http')?d.contact1Website:'https://'+d.contact1Website, d.contact1Website)}</div></div>` : '',\n      vv(d.contact2Name) ? prow('Contact 2', [vv(d.contact2Name),vv(d.contact2Title),vv(d.contact2Company)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact2Phone) ? prow('Phone 2', [vv(d.contact2Phone),vv(d.contact2Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact3Name) ? prow('Contact 3', [vv(d.contact3Name),vv(d.contact3Phone),vv(d.contact3Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.allPhones) ? prow('All Phones', d.allPhones) : null,\n      vv(d.allEmails) ? prow('All Emails', d.allEmails) : null,\n      vv(d.allNames) ? prow('All Names', d.allNames) : null,\n    ]),\n    sec('🔗', 'LINKS', [\n      `<div class=\"prow\"><div class=\"plbl\">Zillow</div><div class=\"pval\">${d.zillowLink ? lnk(d.zillowLink,'View on Zillow') : lnk('https://www.zillow.com/homes/'+encodeURIComponent(d.address+' '+d.city+' '+d.state)+'_rb/','Search Zillow')}</div></div>`,\n      vv(d.driveLink) ? `<div class=\"prow\"><div class=\"plbl\">Google Drive</div><div class=\"pval\">${lnk(d.driveLink,'Open Drive Folder')}</div></div>` : '',\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Google Maps')}</div></div>` : '',\n      vv(d.allOtherLinks) ? `<div class=\"prow\"><div class=\"plbl\">Other Links</div><div class=\"pval\" style=\"word-break:break-all;font-size:11px\">${d.allOtherLinks}</div></div>` : '',\n      (vv(d.photoLinks) || vv(d.driveLink)) ? (() => {\n        const _photoUrl = d.photoLinks || d.driveLink;\n        const _cnt = d.photoCount && parseInt(d.photoCount) > 0 ? ' (' + parseInt(d.photoCount) + ' photos)' : '';\n        return `<div class=\"prow\" style=\"border:1px solid rgba(180,140,255,.3);border-radius:5px;background:rgba(180,140,255,.1);padding:8px 12px\">\n          <div class=\"plbl\" style=\"color:rgba(200,160,255,.85);font-size:11px;font-weight:700;margin-bottom:4px\">📸 PHOTOS${_cnt}</div>\n          <div class=\"pval\"><a href=\"${_photoUrl}\" target=\"_blank\" rel=\"noopener\" style=\"display:inline-block;padding:6px 16px;background:rgba(180,140,255,.2);border:1px solid rgba(180,140,255,.45);border-radius:4px;color:rgba(210,175,255,.98);font-size:12px;font-weight:700;text-decoration:none;letter-spacing:.3px\">VIEW PHOTOS ↗</a></div>\n        </div>`;\n      })() : '',\n    ]),\n  ,\n    _qlHtml,\n  ].join('');\n}\n\n// -- OVERRIDES -----------------------------------------------------------------\n$('btn-ov-arv').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-arv-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'urbanARV', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n$('btn-ov-rehab').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-rehab-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'rehab', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n\n// -- CHAT ----------------------------------------------------------------------\n$('btn-chat').addEventListener('click', () => $('chat-panel').classList.add('open'));\n$('chat-x').addEventListener('click', () => $('chat-panel').classList.remove('open'));\ndocument.addEventListener('keydown', e => { if (e.key==='Escape') $('chat-panel').classList.remove('open'); });\nfunction setAuth(a) {\n  author = a;\n  document.querySelectorAll('.auth-btn').forEach(b => b.classList.toggle('on', b.dataset.a === a));\n}\n$('chat-send').addEventListener('click', doChat);\n$('chat-in').addEventListener('keydown', e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) doChat(); });\n\nasync function doChat() {\n  const msg = $('chat-in').value.trim();\n  if (!msg) return;\n  if (!curDeal) {\n    addMsg('a', '⚠️ No deal selected — click a deal in the list first.');\n    return;\n  }\n\n  // Derive uid from the currently selected deal — always fresh, never stale\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  const address = curDeal.address;\n  const tab = (typeof curTab !== 'undefined' ? curTab : null) || 'overview';\n\n  $('chat-in').value = '';\n  addMsg('u', `${author.toUpperCase()}: ${msg}`);\n\n  // Add thinking bubble and keep reference to it\n  const thinkingEl = document.createElement('div');\n  thinkingEl.className = 'cm a';\n  thinkingEl.innerHTML = `<div class=\"bbl\">⏳ Urban is thinking about ${address}...</div>`;\n  const chatMsgs = $('chat-msgs');\n  chatMsgs.appendChild(thinkingEl);\n  chatMsgs.scrollTop = chatMsgs.scrollHeight;\n\n  try {\n    const r = await fetch(`/api/chat/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ message: msg, author, address, city: curDeal.city, activeTab: tab })\n    });\n\n    // Remove thinking bubble safely\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n\n    if (!r.ok) {\n      const err = await r.json().catch(() => ({ error: `Server error ${r.status}` }));\n      addMsg('a', `⚠️ ${err.error || 'Unknown error'}`);\n      return;\n    }\n\n    const data = await r.json();\n    if (data.reply) addMsg('a', data.reply);\n    else if (data.error) addMsg('a', `⚠️ ${data.error}`);\n\n    // If Urban recalculated numbers, refresh the underwrite panel so UI reflects changes\n    if (data.updated && curDeal) {\n      // Re-fetch the deal's underwrite and refresh the display\n      try {\n        const r2 = await fetch(`/api/underwrite/${encodeURIComponent(data.uid || uid)}`, {\n          headers: { 'x-urban-token': TOKEN }\n        });\n        if (r2.ok) {\n          const fresh = await r2.json();\n          curUW = fresh;\n          renderUW(fresh);\n          // Flash the verdict badge to show it changed\n          const badge = document.querySelector('.verdict-badge');\n          if (badge) {\n            badge.style.transition = 'opacity .3s';\n            badge.style.opacity = '0.3';\n            setTimeout(() => badge.style.opacity = '1', 300);\n          }\n        }\n      } catch {}\n    }\n  } catch(e) {\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n    addMsg('a', '⚠️ Could not reach Urban. Check your connection.');\n    console.error('Chat error:', e.message);\n  }\n}\n\nfunction renderChat(history) {\n  const msgs = $('chat-msgs');\n  msgs.innerHTML = '';\n  if (!history?.length) {\n    msgs.innerHTML = (() => {\n    const d = curDeal;\n    if (!d) return '<div style=\"color:var(--muted);font-size:12px;text-align:center;padding:20px\">Select a deal to start chatting with Urban.</div>';\n    return `<div style=\"color:var(--muted);font-size:11px;padding:14px;line-height:1.7;border-bottom:1px solid var(--border);background:var(--bg2)\">\n      <div style=\"font-weight:700;color:var(--text);margin-bottom:6px\">📋 ${d.address}, ${d.city} FL</div>\n      Ask Urban anything. Give better comps, correct the ARV, update repair costs — Urban recalculates everything and remembers your corrections permanently.\n      <div style=\"margin-top:10px;display:flex;flex-wrap:wrap;gap:6px\">\n        ${[\n          'What if repairs are $45K?',\n          'Give me 3 better comps',\n          'What\\'s the biggest risk here?',\n          'Counter-offer script for $210K',\n          'Is ARV supportable?',\n          'Worst-case scenario?'\n        ].map(q => '<span onclick=\"document.getElementById(\\'chat-in\\').value=\\''+q+'\\';document.getElementById(\\'chat-in\\').focus()\" style=\"cursor:pointer;font-size:10px;padding:3px 8px;border-radius:12px;background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.2);color:rgba(255,215,0,.7);user-select:none\" title=\"Click to use prompt\">'+q+'</span>').join('')}\n      </div>\n    </div>`;\n  })();\n    return;\n  }\n  history.forEach(h => addMsg(h.role==='user'?'u':'a', h.content, h.timestamp));\n}\n\n// Lightweight markdown -> HTML for chat bubbles. Escapes first so the model's\n// own text can never break the page, then handles the formatting Claude\n// actually uses in practice: **bold**, \"- \" bullet lists, and line breaks.\nfunction mdToHtml(text) {\n  let h = (text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n  h = h.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');\n  h = h.replace(/^[-*] (.+)$/gm, '<li>$1</li>');\n  h = h.replace(/(<li>[\\s\\S]*?<\\/li>(\\n(?=<li>))?)+/g, function(m) {\n    return '<ul style=\"margin:6px 0 6px 18px;padding:0\">' + m.replace(/\\n/g,'') + '</ul>';\n  });\n  h = h.replace(/\\n/g, '<br>');\n  return h;\n}\nfunction addMsg(role, content, ts) {\n  const msgs = $('chat-msgs');\n  const d = document.createElement('div');\n  d.className = `cm ${role}`;\n  // Parse \"CALEB: \" or \"GRANT: \" prefix for sender label\n  let senderLabel = role === 'a' ? 'URBAN' : '';\n  let bodyText = content;\n  const prefixMatch = content.match(/^(CALEB|GRANT|USER):\\s*/i);\n  if (prefixMatch) {\n    senderLabel = prefixMatch[1].toUpperCase();\n    bodyText = content.slice(prefixMatch[0].length);\n  }\n  let displayContent = mdToHtml(bodyText);\n  const timeStr = ts ? new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';\n  d.innerHTML = `\n    <div class=\"sender\">${senderLabel}${timeStr ? ' · ' + timeStr : ''}</div>\n    <div class=\"bbl\">${displayContent}</div>`;\n  msgs.appendChild(d);\n  msgs.scrollTop = msgs.scrollHeight;\n}\n\n// -- SHEET LINK -----------------------------------------------------------------\n$('btn-sheet').addEventListener('click', () => {\n  window.open('https://docs.google.com/spreadsheets/d/1las1OYRL2ZgIZjq5_K4bcMM9dAhGxgMOBghfyR29ynU', '_blank');\n});\n\n// -- HARD NO TOGGLE -----------------------------------------------------------\nlet hideHardNo = false;\nfunction toggleHardNo() {\n  hideHardNo = !hideHardNo;\n  const chip = document.getElementById('hardno-toggle-chip');\n  const icon = document.getElementById('hardno-toggle-icon');\n  const lbl = document.getElementById('hardno-toggle-lbl');\n  if (chip) chip.style.opacity = hideHardNo ? '1' : '.7';\n  if (icon) icon.textContent = hideHardNo ? '✅' : '⛔';\n  if (lbl) lbl.textContent = hideHardNo ? 'Ex. Hard No' : 'Inc. Hard No';\n  renderList();\n  doLoadStats();\n}\n\n// -- RE-UNDERWRITE ALL --------------------------------------------------------\nlet rewriteAllRunning = false;\nasync function doRewriteAll() {\n  if (rewriteAllRunning) return;\n  const btn = document.getElementById('rewrite-all-btn');\n  const toRewrite = deals.filter(d => d.uid && d.underwriteStatus && d.underwriteStatus !== 'PENDING' && d.underwriteStatus !== 'HARD NO');\n  if (!toRewrite.length) { alert('No eligible deals to re-underwrite.'); return; }\n  if (!confirm('Re-underwrite ' + toRewrite.length + ' deals with the updated brain? This runs in the background and may take a few minutes.')) return;\n  rewriteAllRunning = true;\n  if (btn) { btn.textContent = '⏳ 0/' + toRewrite.length; btn.style.opacity = '.6'; btn.style.pointerEvents = 'none'; }\n  let done = 0;\n  for (const d of toRewrite) {\n    try {\n      const uid = d.uid;\n      await fetch('/api/underwrite/' + encodeURIComponent(uid), {\n        method: 'POST',\n        headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n        body: JSON.stringify({ force: true, deep: false })\n      });\n      done++;\n      if (btn) btn.textContent = '⏳ ' + done + '/' + toRewrite.length;\n      await new Promise(r => setTimeout(r, 800)); // pace API calls\n    } catch(e) { done++; }\n  }\n  rewriteAllRunning = false;\n  if (btn) { btn.textContent = '✅ Done'; btn.style.opacity = '1'; btn.style.pointerEvents = ''; }\n  await doLoadDeals();\n  setTimeout(() => { if (btn) btn.textContent = '⚡ All'; }, 3000);\n}\n\n// -- UNIT COUNT HELPER (matches server-side) ---------------------------------\nfunction getUnitCount(propertyType) {\n  if (!propertyType) return 1;\n  const t = propertyType.toLowerCase();\n  if (t.includes('duplex') || t.includes('2-unit') || t.includes('two unit')) return 2;\n  if (t.includes('triplex') || t.includes('3-unit') || t.includes('three unit')) return 3;\n  if (t.includes('quadplex') || t.includes('4-unit') || t.includes('four unit') || t.includes('quad')) return 4;\n  const n = t.match(/(\\d+)[-\\s]?unit/);\n  if (n) return Math.min(parseInt(n[1]), 20);\n  if (t.includes('multi')) return 2;\n  return 1;\n}\n\n// -- RENTAL LIVE CALCULATOR ----------------------------------------------------\nfunction rnCalc() {\n  const g = id => parseFloat(document.getElementById(id)?.value) || 0;\n  const fi_arv = (typeof curUW !== 'undefined' && curUW?.arv?.urbanARV) || 0;\n  const fi_ask = parseFloat(curDeal?.askingPrice) || 0;\n  const fi_reh = (typeof curUW !== 'undefined' && curUW?.rehab?.urbanEstimate) || 0;\n\n  // Income\n  const rentPU  = g('rn-in-rent-pu');\n  const units   = Math.max(1, g('rn-in-units') || 1);\n  const gross   = Math.round(rentPU * units);\n  const vacPct  = g('rn-in-vac') / 100;\n  const egi     = Math.round(gross * (1 - vacPct));\n\n  // Expenses\n  const pmPct   = (g('rn-in-pm') || 10) / 100; // default 10%\n  const pm      = Math.round(gross * pmPct);\n  const tax     = g('rn-in-tax');\n  const ins     = g('rn-in-ins');\n  const maint   = g('rn-in-maint') || 125; // Caleb default\n  const capex   = g('rn-in-capex') || 100;\n  const other   = g('rn-in-other');\n  const totExp  = pm + tax + ins + maint + capex + other;\n  const noi     = Math.round(egi - totExp);\n\n  // Metrics\n  const capRate = fi_arv > 0 ? (noi * 12 / fi_arv * 100).toFixed(2) : null;\n  const gy      = fi_arv > 0 && gross > 0 ? (gross * 12 / fi_arv * 100).toFixed(2) : null;\n  const ptr     = fi_arv > 0 && gross > 0 ? (fi_arv / (gross * 12)).toFixed(1) : null;\n\n  // DSCR Loan\n  const dscrRate = g('rn-in-dscr-rate') || 8.0;\n  const dscrLtv  = (g('rn-in-dscr-ltv') || 75) / 100;\n  const dscrLoan = Math.round(fi_arv * dscrLtv);\n  const dscrMo   = dscrRate / 100 / 12;\n  const dscrPmt  = dscrLoan > 0 ? Math.round(dscrLoan * dscrMo / (1 - Math.pow(1 + dscrMo, -360))) : 0;\n  const dscrCf   = Math.round(noi - dscrPmt);\n  const dscrRat  = dscrPmt > 0 ? (noi / dscrPmt).toFixed(2) : null;\n\n  // Conventional\n  const convRate = g('rn-in-conv-rate') || 7.25;\n  const convLtv  = (g('rn-in-conv-ltv') || 80) / 100;\n  const convLoan = Math.round(fi_arv * convLtv);\n  const convMo   = convRate / 100 / 12;\n  const convPmt  = convLoan > 0 ? Math.round(convLoan * convMo / (1 - Math.pow(1 + convMo, -360))) : 0;\n  const convCf   = Math.round(noi - convPmt);\n  const convDp   = Math.round(fi_arv * (1 - convLtv));\n\n  // BRRRR\n  const refiLtv  = (g('rn-in-refi-ltv') || 75) / 100;\n  const refiRate = g('rn-in-refi-rate') || 7.5;\n  const refiLoan = Math.round(fi_arv * refiLtv);\n  const rnPurchase = g('rn-in-purchase') || fi_ask;\n  const rnRehab  = g('rn-in-rehab') || Math.round(fi_reh * 0.40);\n  const cashIn   = rnPurchase + rnRehab;\n  const cashOut  = Math.round(refiLoan); // cash pulled out at refi (covers purchase)\n  const cashLeft = Math.round(cashIn - refiLoan);\n  const infinite = cashLeft <= 0;\n  const refiMo   = refiRate / 100 / 12;\n  const refiPmt  = refiLoan > 0 ? Math.round(refiLoan * refiMo / (1 - Math.pow(1 + refiMo, -360))) : 0;\n  const bCf      = Math.round(noi - refiPmt);\n  const bDscr    = refiPmt > 0 ? (noi / refiPmt).toFixed(2) : null;\n  const bCoc     = (!infinite && cashLeft > 0) ? (bCf * 12 / cashLeft * 100).toFixed(1) : null;\n\n  // Determine strategy\n  let strat = 'FLIP ONLY';\n  if (fi_arv > 0 && refiLoan > 0) {\n    if (infinite && bCf >= 100) strat = 'FULL BRRRR ♾️';\n    else if (cashLeft < cashIn * 0.35 && bCf >= 0) strat = 'STRONG BRRRR';\n    else if (cashLeft < cashIn * 0.60 && bCf >= 0) strat = 'PARTIAL BRRRR';\n    else if (bCf >= 0) strat = 'POSSIBLE HOLD';\n  }\n\n  // -- UPDATE UI --------------------------------------------------------------\n  const setEl = (id, val, cls) => { const el = document.getElementById(id); if (el) { el.textContent = val; if (cls) el.className = cls; } };\n  const fmtN = n => n != null ? '$' + Math.abs(n).toLocaleString() : '—';\n  const signedFmt = n => (n >= 0 ? '+' : '-') + fmtN(n);\n  const cfColor = n => n >= 200 ? 'var(--buy)' : n >= 0 ? 'var(--review)' : 'var(--red)';\n\n  // Hero numbers\n  setEl('rn-hero-rent', gross > 0 ? fmtN(gross) + '/mo' : '—');\n  if (units > 1) setEl('rn-hero-rent-note', fmtN(rentPU) + '/unit × ' + units + ' units');\n  else document.getElementById('rn-hero-rent-note') && (document.getElementById('rn-hero-rent-note').textContent = '/month');\n\n  const heroCf = document.getElementById('rn-hero-cf');\n  if (heroCf) { heroCf.textContent = dscrCf !== 0 ? signedFmt(dscrCf) + '/mo' : '—'; heroCf.style.color = cfColor(dscrCf); }\n  const heroLeft = document.getElementById('rn-hero-left');\n  if (heroLeft) { heroLeft.textContent = infinite ? '♾️ Full recycle' : fmtN(cashLeft); heroLeft.style.color = infinite ? 'var(--buy)' : cashLeft < cashIn * 0.35 ? 'var(--buy)' : 'var(--text)'; }\n\n  // Income\n  setEl('rn-calc-gross', gross > 0 ? fmtN(gross) + '/mo' : '—');\n  setEl('rn-calc-egi',   egi > 0   ? fmtN(egi)   + '/mo' : '—');\n  setEl('rn-calc-exp',   totExp > 0 ? '−' + fmtN(totExp) + '/mo' : '—');\n\n  // NOI\n  const noiEl = document.getElementById('rn-calc-noi');\n  if (noiEl) { noiEl.textContent = noi !== 0 ? signedFmt(noi) + '/mo' : '—'; noiEl.style.color = noi >= 0 ? 'var(--buy)' : 'var(--red)'; }\n  setEl('rn-calc-cap', capRate ? capRate + '%' : '—');\n  setEl('rn-calc-gy',  gy  ? gy  + '%' : '—');\n  setEl('rn-calc-ptr', ptr ? ptr + 'x' : '—');\n\n  // DSCR Loan\n  setEl('rn-calc-dscr-pmt', dscrPmt ? fmtN(dscrPmt) : '—');\n  const dCfEl = document.getElementById('rn-calc-dscr-cf');\n  if (dCfEl) { dCfEl.textContent = dscrCf !== 0 ? signedFmt(dscrCf) + '/mo' : '—'; dCfEl.style.color = cfColor(dscrCf); }\n  // Cash flow row border highlight\n  const cfRow = document.getElementById('rn-cf-result-row');\n  if (cfRow) { cfRow.style.borderColor = cfColor(dscrCf).replace('var(--', '').replace(')', '') === 'red' ? 'rgba(200,60,60,.4)' : dscrCf >= 100 ? 'rgba(60,200,130,.4)' : 'var(--border2)'; }\n  const dRatEl = document.getElementById('rn-calc-dscr-ratio');\n  if (dRatEl) { dRatEl.textContent = dscrRat ? dscrRat + 'x ' + (parseFloat(dscrRat)>=1.25?'✅':'⚠️') : '—'; dRatEl.style.color = parseFloat(dscrRat)>=1.25?'var(--buy)':parseFloat(dscrRat)>=1.0?'var(--review)':'var(--red)'; }\n\n  // Conventional\n  setEl('rn-calc-conv-pmt', convPmt ? fmtN(convPmt) : '—');\n  const cCfEl = document.getElementById('rn-calc-conv-cf');\n  if (cCfEl) { cCfEl.textContent = convCf !== 0 ? signedFmt(convCf) + '/mo' : '—'; cCfEl.style.color = cfColor(convCf); }\n  setEl('rn-calc-conv-dp', convDp > 0 ? fmtN(convDp) + ' down' : '—');\n\n  // BRRRR\n  setEl('rn-b-cashin',   fmtN(cashIn));\n  setEl('rn-b-arv',      fmtN(fi_arv));\n  // Keep purchase input in sync if user hasn't edited it\n  const _piEl = document.getElementById('rn-in-purchase');\n  if (_piEl && !_piEl._userEdited && rnPurchase > 0) _piEl.value = rnPurchase;\n  setEl('rn-b-refi-loan', fmtN(refiLoan));\n  const coEl = document.getElementById('rn-b-cashout');\n  if (coEl) { coEl.textContent = fmtN(cashOut); coEl.style.color = 'var(--buy)'; }\n  // profit/profitAmt MUST be declared before they are used below\n  const profit    = cashIn > 0 && refiLoan > cashIn;\n  const profitAmt = profit ? Math.round(refiLoan - cashIn) : 0;\n  const clEl = document.getElementById('rn-b-left');\n  if (clEl) {\n    if (profit) {\n      clEl.textContent = '+' + fmtN(profitAmt);\n      clEl.style.color = 'var(--buy)';\n    } else if (infinite) {\n      clEl.textContent = '♾️  $0';\n      clEl.style.color = 'var(--buy)';\n    } else {\n      clEl.textContent = fmtN(Math.max(0, cashLeft));\n      clEl.style.color = cashLeft < cashIn*0.25 ? 'var(--buy)' : cashLeft < cashIn*0.5 ? 'var(--review)' : 'var(--red)';\n    }\n  }\n\n  const infEl = document.getElementById('rn-b-infinite');\n  if (infEl) infEl.style.display = (infinite && !profit) ? '' : 'none';\n\n  const profEl = document.getElementById('rn-b-profit');\n  const profAmtEl = document.getElementById('rn-b-profit-amt');\n  if (profEl) profEl.style.display = profit ? '' : 'none';\n  if (profAmtEl) profAmtEl.textContent = profit ? fmtN(profitAmt) : '';\n\n  // Update cash-left labels\n  const leftLabel = document.getElementById('rn-left-label');\n  const leftSub   = document.getElementById('rn-left-sublabel');\n  if (profit) {\n    if (leftLabel) leftLabel.textContent = 'Profit pulled out';\n    if (leftSub)   leftSub.textContent   = 'Refi pays back more than you put in 🏆';\n  } else if (infinite) {\n    if (leftLabel) leftLabel.textContent = 'Cash left in deal';\n    if (leftSub)   leftSub.textContent   = '♾️ Goal hit — full cash recycle';\n  } else {\n    if (leftLabel) leftLabel.textContent = 'Cash left in deal';\n    if (leftSub)   leftSub.textContent   = 'Goal: $0 or less ↓';\n  }\n  setEl('rn-b-pmt', refiPmt ? fmtN(refiPmt) : '—');\n  const bCfEl = document.getElementById('rn-b-cf');\n  if (bCfEl) { bCfEl.textContent = bCf !== 0 ? signedFmt(bCf) + '/mo' : '—'; bCfEl.style.color = cfColor(bCf); }\n  const bDEl = document.getElementById('rn-b-dscr');\n  if (bDEl) { bDEl.textContent = bDscr ? bDscr + 'x ' + (parseFloat(bDscr)>=1.25?'✅':'⚠️') : '—'; bDEl.style.color = parseFloat(bDscr)>=1.25?'var(--buy)':parseFloat(bDscr)>=1.0?'var(--review)':'var(--red)'; }\n  setEl('rn-b-coc', bCoc ? bCoc + '% annual' : infinite ? '♾️' : '—');\n\n  // Strategy pill\n  const sEl = document.getElementById('rn-brrrr-strat-pill');\n  if (sEl) {\n    sEl.textContent = strat;\n    const isGood = strat.includes('FULL') || strat.includes('STRONG');\n    const isMed  = strat.includes('PARTIAL') || strat.includes('POSSIBLE');\n    sEl.style.background = isGood ? 'rgba(60,200,130,.15)' : isMed ? 'rgba(255,160,32,.12)' : 'rgba(120,120,140,.1)';\n    sEl.style.color = isGood ? 'var(--buy)' : isMed ? 'var(--review)' : 'var(--muted)';\n    sEl.style.border = '1px solid ' + (isGood ? 'rgba(60,200,130,.3)' : isMed ? 'rgba(255,160,32,.25)' : 'var(--border)');\n    sEl.style.padding = '2px 10px';\n    sEl.style.borderRadius = '10px';\n    sEl.style.fontSize = '10px';\n    sEl.style.fontWeight = '700';\n  }\n}\n\nfunction rnReset() {\n  ['rn-in-rent-pu','rn-in-units','rn-in-vac','rn-in-pm','rn-in-tax','rn-in-ins','rn-in-maint','rn-in-capex','rn-in-other','rn-in-dscr-rate','rn-in-dscr-ltv','rn-in-conv-rate','rn-in-conv-ltv','rn-in-refi-ltv','rn-in-refi-rate','rn-in-rehab','rn-in-purchase'].forEach(id => {\n    const el = document.getElementById(id);\n    if (el) el._userEdited = false;\n  });\n  if (typeof curUW !== 'undefined' && curUW) renderUW(curUW);\n}\n\n// -- OFFER LADDER --------------------------------------------------------------\nvar _olScriptTab = 'open';\nvar _olData = {};\n\nfunction renderOfferLadder(uw) {\n  var card = document.getElementById('offer-ladder-card');\n  if (!card) return;\n  var arv   = uw && uw.arv && uw.arv.urbanARV || 0;\n  var rehab = uw && uw.rehab && uw.rehab.urbanEstimate || 0;\n  if (!arv || !rehab) { card.style.display = 'none'; return; }\n  card.style.display = '';\n\n  // Asking price — prefer underwrite financials over raw sheet (handles K-format sheet entries)\n  var fi = uw.financials || {};\n  var uwAsk = fi.askingPrice && parseFloat(fi.askingPrice) > 1000 ? parseFloat(fi.askingPrice) : 0;\n  var rawAsk = curDeal ? parseFloat(curDeal.askingPrice) || 0 : 0;\n  var ask = uwAsk || (rawAsk >= 1000 ? rawAsk : 0);\n\n  // Holding and selling costs for profit calc\n  var holdCost = (fi.holdingCosts && fi.holdingCosts.total) || Math.round(arv * 0.04);\n  var sellCost = (fi.sellingCosts && fi.sellingCosts.total) || Math.round(arv * 0.075);\n  var hmlCost  = (fi.hardMoney && (fi.hardMoney.totalInterest || 0) + (fi.hardMoney.originationPoints || 0)) || Math.round(arv * 0.035);\n  var totalCosts = rehab + holdCost + sellCost + hmlCost;\n\n  var mao     = Math.round(arv * 0.70 - rehab);\n  var open_   = Math.round(mao * 0.88);\n  var nudge   = Math.round(mao * 0.91);\n  var hold    = Math.round(mao * 0.94);\n  var walk    = mao;\n\n  var fN = function(n) { return '$' + Math.round(n).toLocaleString(); };\n  var fK = function(n) { return '$' + Math.round(n / 1000) + 'K'; };\n  var profitAt = function(price) { return Math.round(arv - price - totalCosts); };\n  var gapPct = function(price) { return ask > 0 ? Math.round(((ask - price) / ask) * 100) : 0; };\n\n  // Store for counter eval\n  _olData = { mao: mao, open_: open_, nudge: nudge, hold: hold, arv: arv, totalCosts: totalCosts, ask: ask };\n\n  var sE = function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };\n  var sH = function(id, v) { var e = document.getElementById(id); if (e) e.innerHTML = v; };\n\n  // Tier prices\n  sE('ol-open', fN(open_));\n  sE('ol-nudge', fN(nudge));\n  sE('ol-counter', fN(hold));\n  sE('ol-walk', fN(walk));\n\n  // Profits at each tier\n  var pOpen  = profitAt(open_);\n  var pNudge = profitAt(nudge);\n  var pHold  = profitAt(hold);\n  var pWalk  = profitAt(walk);\n  var pc = function(p) { return p >= 0 ? 'color:var(--buy)' : 'color:var(--red)'; };\n  sH('ol-open-profit',   '<span style=\"'+pc(pOpen)+'\">'+fK(pOpen)+' profit</span>');\n  sH('ol-nudge-profit',  '<span style=\"'+pc(pNudge)+'\">'+fK(pNudge)+' profit</span>');\n  sH('ol-counter-profit','<span style=\"'+pc(pHold)+'\">'+fK(pHold)+' profit</span>');\n  sH('ol-walk-profit',   '<span style=\"'+pc(pWalk)+'\">'+fK(pWalk)+' profit</span>');\n\n  // Gap labels\n  if (ask > 0) {\n    var gO = gapPct(open_); var gN = gapPct(nudge); var gH = gapPct(hold);\n    sE('ol-open-gap',    gO + '% below ask');\n    sE('ol-nudge-gap',   gN + '% below ask');\n    sE('ol-counter-gap', gH + '% below ask');\n  } else {\n    sE('ol-open-gap', ''); sE('ol-nudge-gap', ''); sE('ol-counter-gap', '');\n  }\n\n  // Gap analysis row\n  var gapRow = document.getElementById('ol-gap-row');\n  if (ask > 0 && gapRow) {\n    gapRow.style.display = '';\n    sE('ol-asking', fN(ask));\n    sE('ol-mao-disp', fN(mao));\n    var spreadK = Math.round((ask - open_) / 1000);\n    var pctFromMao = Math.min(100, Math.max(0, Math.round((ask / mao - 1) * 100)));\n    var gapLabel = document.getElementById('ol-gap-label');\n    var gapBar   = document.getElementById('ol-gap-bar');\n    var spreadStr = fK(ask - open_) + ' spread';\n    if (ask <= mao) {\n      if (gapLabel) { gapLabel.textContent = 'Under MAO ✅'; gapLabel.style.background = 'rgba(60,200,130,.15)'; gapLabel.style.color = 'var(--buy)'; }\n      if (gapBar) { gapBar.style.width = '20%'; gapBar.style.background = 'var(--buy)'; }\n      spreadStr = 'Ask is under MAO';\n    } else if (pctFromMao <= 10) {\n      if (gapLabel) { gapLabel.textContent = spreadStr + ' — Closeable'; gapLabel.style.background = 'rgba(255,200,0,.12)'; gapLabel.style.color = 'var(--gold)'; }\n      if (gapBar) { gapBar.style.width = Math.round(20 + pctFromMao * 4) + '%'; gapBar.style.background = 'var(--gold)'; }\n    } else if (pctFromMao <= 20) {\n      if (gapLabel) { gapLabel.textContent = spreadStr + ' — Tight'; gapLabel.style.background = 'rgba(255,140,0,.12)'; gapLabel.style.color = 'var(--review)'; }\n      if (gapBar) { gapBar.style.width = Math.round(60 + pctFromMao) + '%'; gapBar.style.background = 'var(--review)'; }\n    } else {\n      if (gapLabel) { gapLabel.textContent = spreadStr + ' — Far apart'; gapLabel.style.background = 'rgba(200,60,60,.1)'; gapLabel.style.color = 'var(--red)'; }\n      if (gapBar) { gapBar.style.width = '95%'; gapBar.style.background = 'var(--red)'; }\n    }\n  } else if (gapRow) { gapRow.style.display = 'none'; }\n\n  // Clear counter input\n  var ci = document.getElementById('ol-counter-input');\n  if (ci) ci.value = '';\n  sE('ol-counter-result', '—');\n\n  // Render script for current tab\n  _renderScript(uw, open_, nudge, hold, mao, ask, arv, pOpen, pNudge, pHold);\n}\n\nfunction _renderScript(uw, open_, nudge, hold, mao, ask, arv, pOpen, pNudge, pHold) {\n  var sc = document.getElementById('ol-script');\n  if (!sc) return;\n  var wsName = curDeal && (curDeal.contact1Name || curDeal.wholesalerCompany || '') || '';\n  var firstName = wsName.split(' ')[0] || 'them';\n  var fN = function(n) { return '$' + Math.round(n).toLocaleString(); };\n  var ppsf = curUW && curUW.arv && curUW.arv.arvPerSqft ? ' ($' + Math.round(curUW.arv.arvPerSqft) + '/sf)' : '';\n  var scripts = {\n    'open': '<span style=\"color:var(--muted);font-size:9px;font-weight:700;letter-spacing:1px;display:block;margin-bottom:4px\">OPENING OFFER</span>' +\n      '\"Hey ' + firstName + ' — we ran the numbers on this one. We can do <strong style=\"color:var(--buy)\">' + fN(open_) + '</strong>. ' +\n      'Based on our comps, ARV is around ' + fN(arv) + ppsf + ' and we have a significant rehab scope here. That is where the math puts us.\"',\n    'nudge': '<span style=\"color:var(--muted);font-size:9px;font-weight:700;letter-spacing:1px;display:block;margin-bottom:4px\">IF THEY PUSH BACK</span>' +\n      '\"I hear you. Look — I want to get this done. We can stretch to <strong style=\"color:var(--gold)\">' + fN(nudge) + '</strong>. That is us moving significantly from our opening. ' +\n      'It is tight for us at that number but if you can get there, we will sign today.\"',\n    'hold': '<span style=\"color:var(--muted);font-size:9px;font-weight:700;letter-spacing:1px;display:block;margin-bottom:4px\">STANDING FIRM</span>' +\n      '\"' + firstName + ', I have pushed this as far as I can go. <strong style=\"color:var(--review)\">' + fN(hold) + '</strong> is the number. ' +\n      'The comps do not support going higher — last comparable sale in that zip came in at ' + fN(arv) + ' and our repair scope is real. ' +\n      'At this price we make it work. Above this, the deal does not pencil for us.\"',\n    'walk': '<span style=\"color:var(--muted);font-size:9px;font-weight:700;letter-spacing:1px;display:block;margin-bottom:4px\">WALKING AWAY</span>' +\n      '\"' + firstName + ' — does not work for us at that number. The comps just do not support it and we do not stretch past what the math allows. ' +\n      'No hard feelings — keep us in mind. When something else comes through in that market, give us a shot. We close what we sign.\"'\n  };\n  sc.innerHTML = scripts[_olScriptTab] || scripts['open'];\n}\n\nfunction setScriptTab(tab) {\n  _olScriptTab = tab;\n  document.querySelectorAll('.stab').forEach(function(b) {\n    b.style.background = 'transparent';\n    b.style.borderColor = 'var(--border2)';\n    b.style.color = 'var(--muted)';\n  });\n  var active = document.getElementById('stab-' + tab);\n  if (active) {\n    var colors = {open: 'rgba(60,200,130,.15)/#rgba(60,200,130,.3)/var(--buy)', nudge: 'rgba(255,200,0,.12)/rgba(255,200,0,.3)/var(--gold)', hold: 'rgba(255,140,0,.12)/rgba(255,140,0,.3)/var(--review)', walk: 'rgba(200,60,60,.1)/rgba(200,60,60,.2)/var(--red)'};\n    var parts = (colors[tab] || '').split('/');\n    active.style.background = parts[0] || '';\n    active.style.borderColor = parts[1] || '';\n    active.style.color = parts[2] || '';\n  }\n  if (curUW && _olData.mao) {\n    _renderScript(curUW, _olData.open_, _olData.nudge, _olData.hold, _olData.mao, _olData.ask, _olData.arv, 0, 0, 0);\n  }\n}\n\nfunction evalCounter(val) {\n  var num = parseFloat(val) || 0;\n  var res = document.getElementById('ol-counter-result');\n  if (!res || !_olData.mao || num <= 0) { if (res) res.innerHTML = '—'; return; }\n  var fN = function(n) { return '$' + Math.round(n).toLocaleString(); };\n  var profit = Math.round(_olData.arv - num - (_olData.mao - _olData.open_ + num - _olData.open_) - (_olData.arv * 0.15 + (_olData.mao - _olData.open_)));\n  if (num <= _olData.open_) {\n    res.innerHTML = '<span style=\"color:var(--buy);font-weight:700\">✅ Under our open</span>';\n  } else if (num <= _olData.nudge) {\n    res.innerHTML = '<span style=\"color:var(--buy);font-weight:700\">✅ Accept</span>';\n  } else if (num <= _olData.hold) {\n    res.innerHTML = '<span style=\"color:var(--gold);font-weight:700\">🤝 Counter at ' + fN(_olData.nudge) + '</span>';\n  } else if (num <= _olData.mao) {\n    res.innerHTML = '<span style=\"color:var(--review);font-weight:700\">⚠️ Hold at ' + fN(_olData.hold) + '</span>';\n  } else {\n    var over = Math.round((num - _olData.mao) / 1000);\n    res.innerHTML = '<span style=\"color:var(--red);font-weight:700\">🚶 Walk — $' + over + 'K over</span>';\n  }\n}\n\nfunction copyOfferLadder() {\n  var d = _olData;\n  if (!d.mao) return;\n  var fN = function(n) { return '$' + Math.round(n).toLocaleString(); };\n    'Open:  ' + fN(d.open_) + '\\n' +\n    'Nudge: ' + fN(d.nudge) + '\\n' +\n    'Hold:  ' + fN(d.hold) + '\\n' +\n    'Walk:  ' + fN(d.mao) + '\\n' +\n    (d.ask > 0 ? 'Ask:   ' + fN(d.ask) + ' (spread: ' + fN(d.ask - d.open_) + ')' : '');\n  if (navigator.clipboard) {\n    navigator.clipboard.writeText(t).then(function() {\n      var b = document.querySelector('[onclick=\"copyOfferLadder()\"]');\n      if (b) { b.textContent = 'Copied!'; setTimeout(function() { b.textContent = 'Copy'; }, 2000); }\n    });\n  }\n}\n\n// -- DEAL NOTES + SEEN-BY ---------------------------------------------------\nvar _notesUid = null;\n\nfunction loadDealNotes(uid) {\n  _notesUid = uid;\n  var enc = encodeURIComponent(uid);\n  fetch('/api/notes/' + enc, { headers: { 'x-urban-token': TOKEN } })\n    .then(function(r) { return r.json(); })\n    .then(function(data) { renderNotes(data.notes || [], data.seenBy || {}); })\n    .catch(function() {});\n}\n\nfunction renderNotes(notes, seenBy) {\n  // --- seen-by row ---\n  var row = document.getElementById('seen-by-row');\n  var nobody = document.getElementById('seen-nobody');\n  var cEl = document.getElementById('seen-caleb');\n  var gEl = document.getElementById('seen-grant');\n  if (row) {\n    row.style.display = 'flex';\n    var hasSeen = Object.keys(seenBy).length > 0;\n    if (nobody) nobody.style.display = hasSeen ? 'none' : '';\n    if (cEl) {\n      if (seenBy.caleb) {\n        cEl.style.display = '';\n        var cWhen = document.getElementById('seen-caleb-when');\n        if (cWhen) cWhen.textContent = timeAgo(seenBy.caleb);\n      } else { cEl.style.display = 'none'; }\n    }\n    if (gEl) {\n      if (seenBy.grant) {\n        gEl.style.display = '';\n        var gWhen = document.getElementById('seen-grant-when');\n        if (gWhen) gWhen.textContent = timeAgo(seenBy.grant);\n      } else { gEl.style.display = 'none'; }\n    }\n  }\n  // --- notes list ---\n  var list = document.getElementById('notes-list');\n  var count = document.getElementById('notes-count');\n  if (!list) return;\n  if (!notes || notes.length === 0) {\n    list.innerHTML = '<div style=\"font-size:11px;color:var(--muted);opacity:.5;padding:4px 0\">No notes yet. Add one below — Urban will use it next time it analyzes this deal.</div>';\n    if (count) count.textContent = '';\n    return;\n  }\n  if (count) count.textContent = notes.length + ' note' + (notes.length !== 1 ? 's' : '');\n  list.innerHTML = notes.map(function(n) {\n    var isCaleb = (n.author || '').toLowerCase() === 'caleb';\n    var color = isCaleb ? 'var(--buy)' : 'var(--accent)';\n    var name = isCaleb ? 'Caleb' : 'Grant';\n    var dt = n.created_at ? timeAgo(n.created_at) : '';\n    return '<div style=\"background:var(--bg3);border-radius:5px;padding:8px 10px;border-left:2px solid ' + color + '\">' +\n      '<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:4px\">' +\n        '<strong style=\"font-size:11px;color:' + color + '\">' + name + '</strong>' +\n        '<span style=\"font-size:10px;color:var(--muted)\">' + dt + '</span>' +\n      '</div>' +\n      '<div style=\"font-size:12px;color:var(--text);line-height:1.5\">' + escHtml(n.note) + '</div>' +\n    '</div>';\n  }).join('');\n  // Scroll to bottom\n  list.scrollTop = list.scrollHeight;\n}\n\nfunction addDealNote() {\n  var inp = document.getElementById('notes-input');\n  var note = inp ? inp.value.trim() : '';\n  if (!note || !_notesUid) return;\n  var btn = document.querySelector('[onclick=\"addDealNote()\"]');\n  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }\n  fetch('/api/notes/' + encodeURIComponent(_notesUid), {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', 'x-urban-token': TOKEN },\n    body: JSON.stringify({ note: note, author: author })\n  }).then(function(r) { return r.json(); })\n    .then(function(data) {\n      if (inp) inp.value = '';\n      renderNotes(data.notes || [], data.seenBy || {});\n    })\n    .catch(function(e) { console.error('Note save failed', e); })\n    .finally(function() {\n      if (btn) { btn.textContent = 'Add Note'; btn.disabled = false; }\n    });\n}\n\nfunction markDealSeen(uid) {\n  if (!uid || !TOKEN) return;\n  fetch('/api/seen/' + encodeURIComponent(uid), {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', 'x-urban-token': TOKEN },\n    body: JSON.stringify({ author: author })\n  }).catch(function() {});\n}\n\nfunction escHtml(s) {\n  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');\n}\n\nfunction timeAgo(ts) {\n  if (!ts) return '';\n  var diff = Math.floor((Date.now() - new Date(ts)) / 1000);\n  if (diff < 60)   return 'just now';\n  if (diff < 3600) return Math.floor(diff/60) + 'm ago';\n  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';\n  var d = new Date(ts);\n  return (d.getMonth()+1)+'/'+(d.getDate())+'/'+d.getFullYear();\n}\n\n// -- DEAL MAP -------------------------------------------------------------------\nconst MAP_DEFAULT_CENTER = [28.15, -82.45]; // Tampa Bay — CCG's buy box\nlet leafletMapD = null;\nlet mapMarkersD = [];\nlet geoCacheD = {};\ntry { geoCacheD = JSON.parse(localStorage.getItem('urban_geo_cache') || '{}'); } catch(e) { geoCacheD = {}; }\nfunction saveGeoCacheD() { try { localStorage.setItem('urban_geo_cache', JSON.stringify(geoCacheD)); } catch(e) {} }\n\nfunction showMapView() {\n  show('main-empty', false);\n  show('dv', false);\n  document.getElementById('main-map').style.display = 'block';\n  if (!leafletMapD) {\n    leafletMapD = L.map('map-canvas-d', { zoomControl: true }).setView(MAP_DEFAULT_CENTER, 10);\n    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(leafletMapD);\n  }\n  setTimeout(() => { leafletMapD.invalidateSize(); plotMapPinsD(); }, 60);\n}\nfunction hideMapView() {\n  document.getElementById('main-map').style.display = 'none';\n  if (curDeal) { show('dv', true); } else { show('main-empty', true); setUserBadge(); }\n}\n\n// -- PROFITS VIEW -----------------------------------------------------------\nfunction showProfitsView() {\n  show('main-empty', false);\n  show('dv', false);\n  document.getElementById('main-map').style.display = 'none';\n  document.getElementById('main-profits').style.display = 'block';\n  fetch('/api/profits', { headers: { 'x-urban-token': TOKEN } })\n    .then(r => r.json())\n    .then(renderProfitsD)\n    .catch(e => { document.getElementById('profits-content-d').innerHTML = '<p style=\"color:var(--hot)\">Could not load profits: ' + e.message + '</p>'; });\n}\nfunction hideProfitsView() {\n  document.getElementById('main-profits').style.display = 'none';\n  if (curDeal) { show('dv', true); } else { show('main-empty', true); }\n}\nfunction renderProfitsD(data) {\n  const t = data.totals || {};\n  const rows = data.rows || [];\n  const fmtP = n => (n >= 0 ? '+' : '') + fmt(n);\n  let html = '';\n  html += '<div style=\"display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:28px\">';\n  const tiles = [\n    ['Total Profit', fmtP(t.all||0), 'var(--accent)'],\n    ['Flip', fmtP(t.flip||0), 'var(--hot)'],\n    ['BRRRR', fmtP(t.brrrr||0), 'var(--pass)'],\n    ['Wholesale', fmtP(t.wholesale||0), 'var(--buy)'],\n    ['Other', fmtP(t.other||0), 'var(--review)'],\n  ];\n  tiles.forEach(([lbl, val, color]) => {\n    html += '<div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px\"><div style=\"font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px\">' + lbl + '</div><div style=\"font-family:var(--display);font-size:28px;color:' + color + '\">' + val + '</div></div>';\n  });\n  html += '</div>';\n  if (t.pendingCount) {\n    html += '<div style=\"margin-bottom:20px;padding:12px 16px;background:rgba(240,160,48,.08);border:1px solid rgba(240,160,48,.3);border-radius:8px;color:var(--review);font-size:13px\">⚠️ ' + t.pendingCount + ' purchased deal' + (t.pendingCount===1?'':'s') + ' logged without a profit figure yet — update them from the deal\\'s Purchased status once they close.</div>';\n  }\n  html += '<table style=\"width:100%;border-collapse:collapse;font-size:13px\">';\n  html += '<thead><tr style=\"text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px\"><th style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">Address</th><th style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">Strategy</th><th style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">Purchase</th><th style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">Profit</th><th style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">Logged</th></tr></thead><tbody>';\n  rows.forEach(r => {\n    const profitColor = r.actualProfit == null ? 'var(--muted)' : r.actualProfit >= 0 ? 'var(--buy)' : 'var(--hot)';\n    const profitTxt = r.actualProfit == null ? 'Not logged yet' : fmtP(r.actualProfit);\n    html += '<tr><td style=\"padding:9px 10px;border-bottom:1px solid var(--border)\">' + r.address + ', ' + r.city + '</td>' +\n      '<td style=\"padding:9px 10px;border-bottom:1px solid var(--border);text-transform:capitalize\">' + r.strategy + (r.wholesaleFee ? ' (' + fmt(r.wholesaleFee) + ' fee)' : '') + '</td>' +\n      '<td style=\"padding:9px 10px;border-bottom:1px solid var(--border)\">' + fmt(r.purchasePrice) + '</td>' +\n      '<td style=\"padding:9px 10px;border-bottom:1px solid var(--border);color:' + profitColor + ';font-weight:700\">' + profitTxt + '</td>' +\n      '<td style=\"padding:9px 10px;border-bottom:1px solid var(--border);color:var(--muted)\">' + (r.loggedAt ? new Date(r.loggedAt).toLocaleDateString() : '') + '</td></tr>';\n  });\n  html += '</tbody></table>';\n  if (!rows.length) html += '<p style=\"color:var(--muted)\">No purchased deals logged yet.</p>';\n  document.getElementById('profits-content-d').innerHTML = html;\n}\nfunction mapPinColorD(v) {\n  const m = {HOT:'#ff4444', BUY:'#44cc88', REVIEW:'#f0a030', PASS:'#6688aa', 'HARD NO':'#cc4466', 'NEED COMPS':'#e09420', 'NEEDS ADDRESS':'#9b59b6', PENDING:'#666680'};\n  return m[v] || '#666680';\n}\nfunction plotMapPinsD() {\n  mapMarkersD.forEach(m => leafletMapD.removeLayer(m));\n  mapMarkersD = [];\n\n  const dealsForMap = deals.filter(d => {\n    const status = d.underwriteStatus || 'PENDING';\n    if (hideHardNo && status === 'HARD NO') return false;\n    if (curFilter === 'ALL') return true;\n    if (curFilter === 'PENDING') return status === 'PENDING' || !d.underwriteStatus;\n    if (curFilter === 'BUY') return status === 'BUY' || status === 'HOT';\n    if (curFilter === 'HARDNO') return status === 'HARD NO';\n    return status === curFilter;\n  });\n\n  const located = [], missing = [];\n  let unmappable = 0;\n  dealsForMap.forEach(d => {\n    const uid = d.uid || `${d.address}-${d.dateReceived}`;\n    const geo = geoCacheD[uid];\n    if (geo && geo.lat != null) located.push({ d, uid, geo });\n    else if (geo && geo.failed) unmappable++;\n    else missing.push({ uid, address: d.address, city: d.city });\n  });\n\n  located.forEach(item => {\n    const d = item.d;\n    const status = d.underwriteStatus || 'PENDING';\n    const badgeCls = status === 'HARD NO' ? 'b-HARDNO' : `b-${status}`;\n    const _fiAsk = d.financials && d.financials.askingPrice && parseFloat(d.financials.askingPrice) > 1000 ? parseFloat(d.financials.askingPrice) : 0;\n    const _rawAsk = parseFloat(d.askingPrice) || 0;\n    const ask = _fiAsk || (_rawAsk >= 1000 ? _rawAsk : 0);\n    const color = mapPinColorD(status);\n\n    const marker = L.circleMarker([item.geo.lat, item.geo.lng], { radius: 9, fillColor: color, color: '#0a0a0f', weight: 2, fillOpacity: .9 }).addTo(leafletMapD);\n    const popupHtml = `<div class=\"map-pin-addr\">${d.address||''}</div>` +\n      `<div class=\"map-pin-city\">${d.city||''}${d.state?', '+d.state:''}</div>` +\n      `<div class=\"map-pin-meta\"><span class=\"badge ${badgeCls}\">${status}</span>` +\n      (d.underwriteScore ? `<span class=\"di-score\" style=\"font-weight:700\">${d.underwriteScore}/10</span>` : '') +\n      (ask > 0 ? `<span class=\"di-price\">${fmt(ask)}</span>` : '') + `</div>` +\n      `<button class=\"map-pin-btn\" onclick='__selectFromMap(${JSON.stringify(item.uid)})'>View Deal</button>`;\n    marker.bindPopup(popupHtml);\n    mapMarkersD.push(marker);\n  });\n\n  if (located.length) {\n    leafletMapD.fitBounds(L.latLngBounds(located.map(i => [i.geo.lat, i.geo.lng])), { padding: [50,50], maxZoom: 14 });\n  }\n\n  const note = document.getElementById('map-pending-note-d');\n  const noteText = document.getElementById('map-pending-text-d');\n  const noteSpin = note ? note.querySelector('.spinner') : null;\n  if (missing.length) {\n    note.style.display = 'flex';\n    if (noteSpin) noteSpin.style.display = '';\n    noteText.textContent = `Locating ${missing.length} more propert${missing.length===1?'y':'ies'}…`;\n    geocodeMissingDealsD(missing);\n  } else if (unmappable && note) {\n    note.style.display = 'flex';\n    if (noteSpin) noteSpin.style.display = 'none';\n    noteText.textContent = `${unmappable} propert${unmappable===1?'y':'ies'} could not be located`;\n  } else if (note) {\n    note.style.display = 'none';\n  }\n}\nfunction geocodeMissingDealsD(missing) {\n  const items = missing.slice(0, 60).map(m => ({ uid: m.uid, address: m.address, city: m.city }));\n  if (!items.length) return;\n  fetch('/api/geocode-batch', {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ items })\n  }).then(r => r.json()).then(result => {\n    Object.keys(result).forEach(uid => { geoCacheD[uid] = result[uid]; });\n    items.forEach(it => { if (!result[it.uid]) geoCacheD[it.uid] = { failed: true }; });\n    saveGeoCacheD();\n    const note = document.getElementById('map-pending-note-d');\n    if (note) note.style.display = 'none';\n    if (document.getElementById('main-map').style.display !== 'none') plotMapPinsD();\n  }).catch(() => {\n    const note = document.getElementById('map-pending-note-d');\n    if (note) note.style.display = 'none';\n  });\n}\nfunction __selectFromMap(uid) {\n  const d = deals.find(x => (x.uid || `${x.address}-${x.dateReceived}`) === uid);\n  if (!d) return;\n  hideMapView();\n  selectDeal(d);\n}\n\n// -- WHOLESALER SCORECARDS -----------------------------------------------------\nvar _wsPanelOpen = false;\nfunction toggleWsPanel() {\n  _wsPanelOpen = !_wsPanelOpen;\n  var p = document.getElementById('ws-panel');\n  var icon = document.getElementById('ws-toggle-icon');\n  if (p) p.style.display = _wsPanelOpen ? '' : 'none';\n  if (icon) icon.textContent = _wsPanelOpen ? '▲' : '▼';\n  if (_wsPanelOpen) renderWholesalerScores();\n}\nfunction renderWholesalerScores() {\n  var list = document.getElementById('ws-list');\n  if (!list || !deals || !deals.length) return;\n  var scores = {};\n  deals.forEach(function(d) {\n    var ws = d.wholesalerName || d.source || d.city || '';\n    if (!scores[ws]) scores[ws] = { total: 0, buys: 0 };\n    scores[ws].total++;\n    var v = d.underwriteStatus || '';\n    if (v === 'BUY' || v === 'HOT') scores[ws].buys++;\n  });\n  var sorted = Object.entries(scores).sort(function(a, b) { return b[1].total - a[1].total; }).slice(0, 8);\n  list.innerHTML = '';\n  sorted.forEach(function(entry) {\n    var ws = entry[0]; var s = entry[1];\n    var rate = s.total > 0 ? Math.round(s.buys / s.total * 100) : 0;\n    var grade = rate >= 20 ? 'A' : rate >= 10 ? 'B' : 'C';\n    var clr = grade === 'A' ? 'var(--buy)' : grade === 'B' ? 'var(--review)' : 'var(--muted)';\n    var row = document.createElement('div');\n    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)';\n    row.innerHTML = '<div style=\"width:16px;height:16px;border-radius:50%;background:' + clr + ';color:var(--bg);font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0\">' + grade + '</div><div style=\"flex:1;min-width:0\"><div style=\"font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">' + ws + '</div><div style=\"font-size:9px;color:var(--muted)\">' + s.buys + ' buy / ' + s.total + ' total</div></div><div style=\"font-size:12px;font-weight:700;color:' + clr + '\">' + rate + '%</div>';\n    list.appendChild(row);\n  });\n  if (!sorted.length) list.innerHTML = '<div style=\"font-size:10px;color:var(--muted);padding:6px\">No deals loaded yet</div>';\n}\n\n// -- OUTCOME TRACKING ---------------------------------------------------------\nfunction showPurchasedForm() {\n  if (!curDeal || !curUW) return;\n  var m = document.getElementById('purchased-modal');\n  if (!m) return;\n  var p = document.getElementById('oc-purchase'); if (p) p.value = parseFloat(curDeal.askingPrice) || '';\n  var r = document.getElementById('oc-rehab');   if (r) r.value = curUW.rehab && curUW.rehab.urbanEstimate || '';\n  var a = document.getElementById('oc-arv');     if (a) a.value = curUW.arv && curUW.arv.urbanARV || '';\n  var s = document.getElementById('oc-strategy'); if (s) s.value = 'flip';\n  var wf = document.getElementById('oc-wholesale-fee'); if (wf) wf.value = '';\n  var pf = document.getElementById('oc-profit'); if (pf) pf.value = '';\n  updatePurchasedFormFields();\n  m.style.display = 'flex';\n}\nfunction updatePurchasedFormFields() {\n  var s = document.getElementById('oc-strategy'); if (!s) return;\n  var isWholesale = s.value === 'wholesale';\n  var flipFields = document.getElementById('oc-flip-fields');\n  var arvField = document.getElementById('oc-arv-field');\n  var wholesaleField = document.getElementById('oc-wholesale-field');\n  if (flipFields) flipFields.style.display = isWholesale ? 'none' : '';\n  if (arvField) arvField.style.display = isWholesale ? 'none' : '';\n  if (wholesaleField) wholesaleField.style.display = isWholesale ? '' : 'none';\n}\nfunction closePurchasedForm() {\n  var m = document.getElementById('purchased-modal'); if (m) m.style.display = 'none';\n}\nasync function savePurchasedOutcome() {\n  if (!curUW) return;\n  var purchase = parseFloat(document.getElementById('oc-purchase') && document.getElementById('oc-purchase').value) || 0;\n  var rehab    = parseFloat(document.getElementById('oc-rehab')    && document.getElementById('oc-rehab').value)    || 0;\n  var arv      = parseFloat(document.getElementById('oc-arv')      && document.getElementById('oc-arv').value)      || 0;\n  var strategy = document.getElementById('oc-strategy') && document.getElementById('oc-strategy').value || 'flip';\n  var notes    = document.getElementById('oc-notes')    && document.getElementById('oc-notes').value    || '';\n  var wholesaleFee = document.getElementById('oc-wholesale-fee') && document.getElementById('oc-wholesale-fee').value || '';\n  var actualProfit = document.getElementById('oc-profit') && document.getElementById('oc-profit').value || '';\n  if (!purchase) { alert('Enter the purchase price'); return; }\n  var btn = document.querySelector('[onclick=\"savePurchasedOutcome()\"]');\n  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }\n  try {\n    var r = await fetch('/api/outcome/' + encodeURIComponent(curUW.uid), {\n      method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ purchase: purchase, rehab: rehab, arv: arv, strategy: strategy, wholesaleFee: wholesaleFee, actualProfit: actualProfit, notes: notes, address: curDeal && curDeal.address, author: author })\n    });\n    if (r.ok) {\n      curUW = await r.json();\n      closePurchasedForm();\n      deals = deals.filter(function(d) { return d.address !== curDeal.address; });\n      curDeal = null;\n      document.getElementById('dv').style.display = 'none';\n      document.getElementById('main-empty').style.display = '';\n      renderList();\n      doLoadStats();\n    } else {\n      var errTxt = await r.text().catch(function(){ return ''; });\n      console.error('Purchase save failed:', r.status, errTxt);\n      alert('Could not save (HTTP ' + r.status + '). Check console.');\n    }\n  } catch(e) {\n    console.error('outcome save error:', e.message);\n    alert('Network error: ' + e.message);\n  }\n  if (btn) { btn.textContent = 'Log Outcome'; btn.disabled = false; }\n}\n\n// -- LOST TO ANOTHER BUYER / ARCHIVE -------------------------------------------\nfunction showLostForm() {\n  if (!curDeal) return;\n  var m = document.getElementById('sold-modal');\n  if (!m) return;\n  var r = document.getElementById('lost-reason'); if (r) r.value = 'lost_price';\n  var p = document.getElementById('lost-price');  if (p) p.value = '';\n  var n = document.getElementById('lost-notes');  if (n) n.value = '';\n  m.style.display = 'flex';\n}\nfunction closeLostForm() {\n  var m = document.getElementById('sold-modal');\n  if (m) m.style.display = 'none';\n}\nasync function saveLost() {\n  if (!curDeal) return;\n  var uid = (curUW && curUW.uid) || curDeal.uid || (curDeal.address + '-' + curDeal.dateReceived);\n  var reason     = document.getElementById('lost-reason') && document.getElementById('lost-reason').value || 'other';\n  var theirPrice = document.getElementById('lost-price')  && document.getElementById('lost-price').value  || '';\n  var notes      = document.getElementById('lost-notes')  && document.getElementById('lost-notes').value  || '';\n  var btn = document.getElementById('lost-submit-btn');\n  if (btn) { btn.textContent = 'Archiving...'; btn.disabled = true; }\n  try {\n    var r = await fetch('/api/lost/' + encodeURIComponent(uid), {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ reason: reason, theirPrice: theirPrice, notes: notes, address: curDeal.address, city: curDeal.city, state: curDeal.state, author: author })\n    });\n    if (r.ok) {\n      closeLostForm();\n      deals = deals.filter(function(d) { return d.address !== curDeal.address; });\n      curDeal = null; curUW = null;\n      document.getElementById('dv').style.display = 'none';\n      document.getElementById('main-empty').style.display = '';\n      renderList();\n      doLoadStats();\n      var banner = document.createElement('div');\n      banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(60,200,130,.9);color:#000;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.4)';\n      banner.textContent = \"Logged as lost — Urban's brain updated.\";\n      document.body.appendChild(banner);\n      setTimeout(function() { document.body.removeChild(banner); }, 3000);\n    } else {\n      var errTxt = await r.text().catch(function(){ return ''; });\n      console.error('Lost-deal save failed:', r.status, errTxt);\n      alert('Could not save (HTTP ' + r.status + '). Check console.');\n      if (btn) { btn.textContent = 'Archive Deal'; btn.disabled = false; }\n    }\n  } catch(e) {\n    console.error('lost save:', e);\n    alert('Network error: ' + e.message);\n    if (btn) { btn.textContent = 'Archive Deal'; btn.disabled = false; }\n  }\n}\n\n// -- HARD NO ACTION -----------------------------------------------------------\nasync function doMarkHardNo() {\n  if (!curDeal) return;\n  const uid = curUW?.uid || curDeal?.uid;\n  if (!uid) return;\n  const reason = prompt('Reason for Hard No (optional):', 'Manually marked — not a fit');\n  if (reason === null) return; // cancelled\n  const btn = document.getElementById('btn-hard-no');\n  if (btn) { btn.textContent = '⏳ Saving...'; btn.style.opacity = '.6'; }\n  try {\n    const r = await fetch('/api/override/' + encodeURIComponent(uid), {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ field: 'verdict', value: 'HARD NO', reason: reason || 'Manually marked', author })\n    });\n    if (r.ok) {\n      // Update local deal status\n      const d = deals.find(d => d.uid === uid);\n      if (d) { d.underwriteStatus = 'HARD NO'; d.underwriteScore = 1; }\n      if (btn) { btn.textContent = '✅ Marked'; btn.style.display = 'none'; }\n      renderList();\n      doLoadStats();\n    } else {\n      if (btn) { btn.textContent = '⛔ Hard No'; btn.style.opacity = '1'; }\n      alert('Could not update verdict — please re-underwrite to try again.');\n    }\n  } catch(e) {\n    if (btn) { btn.textContent = '⛔ Hard No'; btn.style.opacity = '1'; }\n  }\n}\n\n// -- PHOTOS -------------------------------------------------------------------\nfunction openPhotos() {\n  const url = curDeal?.photoLinks || curDeal?.driveLink || curDeal?.allOtherLinks;\n  if (url) window.open(url, '_blank', 'noopener');\n}\n\nconst PHOTO_TRACKING_PATTERNS = ['click.email.','email.21propertygroup.com/c/','click.mailchi.mp','mailtrack.io','/click?','email-click.','hs-link.'];\nfunction isTrackingPhotoUrl(url) { return !!url && PHOTO_TRACKING_PATTERNS.some(p => url.includes(p)); }\n\nfunction updatePhotosUI(deal) {\n  // Check all possible photo link fields — prefer resolved direct links\n  let photoUrl = deal?.photoLinks || deal?.driveLink;\n  const isTracking = isTrackingPhotoUrl(photoUrl);\n  // If it's a tracking URL, also check allOtherLinks for a direct Dropbox/Drive link\n  if (!photoUrl || isTracking) {\n    if (deal?.allOtherLinks) {\n      const links = (deal.allOtherLinks || '').split(/[\\s,;]+/).filter(u => u.startsWith('http'));\n      const direct = links.find(u => u.includes('dropbox') || u.includes('drive.google') || u.includes('/photos') || u.includes('album'));\n      if (direct) photoUrl = direct; // prefer direct link\n    }\n  }\n  const hasPhotos = !!photoUrl;\n  const stillTracking = isTrackingPhotoUrl(photoUrl);\n\n  // Header button\n  const btn = document.getElementById('btn-photos');\n  if (btn) {\n    btn.style.display = hasPhotos ? '' : 'none';\n    btn.textContent = stillTracking ? '📸 See Photos ⚠️' : '📸 See Photos';\n    btn.title = stillTracking ? 'Link may expire — if it fails, check the original email.' : 'View property photos';\n    btn.onclick = () => photoUrl && window.open(photoUrl, '_blank', 'noopener');\n  }\n  // Overview banner\n  const banner = document.getElementById('photo-banner');\n  const bannerLink = document.getElementById('photo-banner-link');\n  if (banner) banner.style.display = hasPhotos ? 'flex' : 'none';\n  if (bannerLink && photoUrl) {\n    bannerLink.href = photoUrl;\n    // Warn if still a tracking URL (server hasn't resolved it yet)\n    const bannerText = banner.querySelector('span');\n    if (bannerText) bannerText.textContent = stillTracking\n      ? 'Photos available — link may expire soon'\n      : 'Photos available for this property';\n  }\n}\n\n// -- POSTMESSAGE BRIDGE (for testing) -----------------------------------------\nwindow.addEventListener('message', e => {\n  if (e.data?.action === 'selectDeal' && e.data.index >= 0 && deals[e.data.index]) selectDeal(deals[e.data.index]);\n  if (e.data?.action === 'underwrite') doUnderwrite(true, false);\n  if (e.data?.action === 'deepUnderwrite') doUnderwrite(true, true);\n  if (e.data?.action === 'switchTab') switchTab(e.data.tab);\n  if (e.data?.action === 'getDeals') e.source?.postMessage({ deals: deals.map(d=>({address:d.address,status:d.underwriteStatus})) }, '*');\n});\n\n// ── ADD DEAL ─────────────────────────────────────────────────────────────────\nfunction openAddDeal(){const m=document.getElementById('add-deal-modal');if(m){m.style.display='flex';setTimeout(()=>document.getElementById('add-deal-text')?.focus(),50);}}\nfunction closeAddDeal(){const m=document.getElementById('add-deal-modal');if(m)m.style.display='none';const t=document.getElementById('add-deal-text');if(t)t.value='';const s=document.getElementById('add-deal-status');if(s)s.textContent='';}\nasync function submitAddDeal(){\n  const text=(document.getElementById('add-deal-text')?.value||'').trim();if(!text)return;\n  const btn=document.getElementById('add-deal-btn'),status=document.getElementById('add-deal-status');\n  btn.disabled=true;btn.textContent='Parsing...';\n  try{\n    const r=await fetch('/api/add-deal',{method:'POST',headers:{'x-urban-token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({text,addedBy:TOKEN==='ccg-caleb-K9x4mP2v'?'Caleb':'Grant'})});\n    const data=await r.json();\n    if(r.ok){status.style.color='var(--buy)';status.textContent='Added: '+data.uid+' — underwriting. Tell Derek to log it.';btn.textContent='Done';\n      if(data.deal){deals.unshift({...data.deal,underwriteStatus:'PENDING'});renderList();}\n      setTimeout(()=>{closeAddDeal();if(data.uid)selectDeal(deals.find(d=>d.uid===data.uid)||{uid:data.uid,address:data.uid});},1800);\n    } else if(r.status===409){status.style.color='var(--accent)';status.textContent=data.error;btn.textContent='Parse & Underwrite';btn.disabled=false;\n      if(data.existingUid)setTimeout(()=>{closeAddDeal();selectDeal(deals.find(d=>d.uid===data.existingUid));},1200);\n    } else{status.style.color='#cc4466';status.textContent=data.error||'Error';btn.textContent='Parse & Underwrite';btn.disabled=false;}\n  }catch(e){status.style.color='#cc4466';status.textContent='Error: '+e.message;btn.textContent='Parse & Underwrite';btn.disabled=false;}\n}\nfunction setUserBadge(){\n  const isCaleb=TOKEN==='ccg-caleb-K9x4mP2v';\n  document.title=isCaleb?'Urban — Caleb':'Urban — Grant';\n  const logo=document.querySelector('.logo-text,.hdr-brand,h1');if(logo)logo.title=isCaleb?'Logged in: Caleb (Admin)':'Logged in: Grant';\n}\n</script>\n<div id=\"add-deal-modal\" style=\"display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);align-items:center;justify-content:center\">\n  <div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:28px;width:520px;max-width:95vw\">\n    <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:16px\">\n      <div style=\"font-size:16px;font-weight:800;color:var(--text)\">&#x2795; Add a Deal</div>\n      <button onclick=\"closeAddDeal()\" style=\"background:transparent;border:none;color:var(--muted);font-size:22px;cursor:pointer\">&#x00D7;</button>\n    </div>\n    <div style=\"font-size:12px;color:var(--muted);margin-bottom:12px\">Paste a text message, email, or deal sheet. Urban parses + underwrites immediately. Will flag for Derek to log.</div>\n    <textarea id=\"add-deal-text\" placeholder=\"Paste deal info here...\" style=\"width:100%;height:160px;background:var(--bg3);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:13px;padding:12px;box-sizing:border-box;resize:vertical\"></textarea>\n    <button id=\"add-deal-btn\" onclick=\"submitAddDeal()\" style=\"width:100%;margin-top:12px;padding:13px;background:rgba(255,200,80,.1);border:1px solid rgba(255,200,80,.3);border-radius:8px;color:var(--accent);font-size:14px;font-weight:800;cursor:pointer;letter-spacing:.3px\">&#x26A1; Parse &amp; Underwrite</button>\n    <div id=\"add-deal-status\" style=\"margin-top:10px;font-size:12px;color:var(--muted);text-align:center;min-height:18px\"></div>\n  </div>\n</div>\n</body>\n</html>\n";
const INDEX_PATH = __dirname + '/../public/index.html';
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.type('html').send(EMBEDDED_HTML);
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

  const model = deep ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
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
    let deal = deals.find(d => (d.uid||'').toLowerCase().trim() === (oldUid||'').toLowerCase().trim())
             || deals.find(d => d.needsAddress && (d.city||'').toLowerCase().trim() === (oldUid||'').toLowerCase().trim());
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
// Configure via Railway env vars: ADAM_IMAP_HOST, ADAM_IMAP_USER, ADAM_IMAP_PASS
// ════════════════════════════════════════════════════════════════════════════════
const ADAM_LOG = [];                  // in-memory activity log
const ADAM_SEEN = new Set();          // email UIDs already processed this session
let adamRunning = false;

function adamLog(msg, type='info') {
  const entry = { ts: new Date().toISOString(), msg, type };
  ADAM_LOG.unshift(entry);
  if (ADAM_LOG.length > 200) ADAM_LOG.length = 200;
  console.log(`[ADAM] [${type.toUpperCase()}] ${msg}`);
  return entry;
}

// ── Core: parse a raw email into a deal using Claude ─────────────────────────
async function adamParseEmail(subject, body, fromEmail) {
  const fullText = `Subject: ${subject}\nFrom: ${fromEmail}\n\n${body}`.slice(0, 4000);

  // Quick pre-filter: skip obvious non-deals
  const lowerText = fullText.toLowerCase();
  const dealKeywords = ['asking', 'arv', 'bed', 'bath', 'sqft', 'sq ft', 'flip', 'rehab', 'off-market', 'offmarket', 'wholesale', 'price', 'opportunity', 'block', 'cbs', 'slab', 'sfr'];
  if (!dealKeywords.some(k => lowerText.includes(k))) {
    adamLog(`Skipped (no deal keywords): ${subject.slice(0,60)}`, 'skip');
    return null;
  }

  // Parse with Claude
  const parse = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 600,
    system: 'Extract FL real estate deal info from email. Return ONLY valid JSON (no markdown): { "isDeal": true/false, "address": "", "city": "", "state": "FL", "zip": "", "askingPrice": 0, "beds": 0, "baths": 0, "sqft": 0, "yearBuilt": 0, "construction": "", "wholesaler": "", "wholesalerPhone": "", "arv": 0, "rehab": 0, "floodZone": "", "notes": "", "isXXXX": false }. Set isDeal=false if this is not a property deal email. Set isXXXX=true if the address is intentionally withheld (shows XXXX or similar).',
    messages: [{ role: 'user', content: fullText }],
  });
  let parsed;
  try { parsed = JSON.parse(parse.content[0].text.replace(/```json?|```/g,'').trim()); }
  catch(e) { adamLog(`Parse error: ${e.message}`, 'error'); return null; }
  if (!parsed.isDeal) { adamLog(`Not a deal: ${subject.slice(0,60)}`, 'skip'); return null; }
  return parsed;
}

// ── Core: add a parsed deal to Urban ─────────────────────────────────────────
async function adamAddDeal(parsed, source) {
  if (!parsed.address || !parsed.city) {
    adamLog(`No address extracted from: ${source}`, 'warn');
    return { ok: false, reason: 'no_address' };
  }
  if (parsed.isXXXX) {
    adamLog(`XXXX address from: ${parsed.wholesaler || source} — skipping, needs call`, 'warn');
    return { ok: false, reason: 'xxxx_address', wholesaler: parsed.wholesaler };
  }
  const uid = (parsed.address + ', ' + parsed.city).trim();
  if (!deals) global.deals = [];
  const dupe = deals.find(d => (d.address||'').toLowerCase() === parsed.address.toLowerCase());
  if (dupe) {
    adamLog(`Duplicate skipped: ${uid}`, 'skip');
    return { ok: false, reason: 'duplicate', uid };
  }
  const county = inferCounty(parsed.city) || '';
  const deal = {
    uid, address: parsed.address, city: parsed.city, state: 'FL', zip: parsed.zip||'',
    county, beds: parsed.beds||0, baths: parsed.baths||0, sqft: parsed.sqft||0,
    yearBuilt: parsed.yearBuilt||0, construction: parsed.construction||'',
    askingPrice: parsed.askingPrice||0, wholesaler: parsed.wholesaler||'',
    wholesalerPhone: parsed.wholesalerPhone||'', floodZone: parsed.floodZone||'',
    source: 'adam-auto', addedBy: 'adam', isAdam: true,
    dateReceived: new Date().toISOString(), needsSheet: true,
  };
  if(!global.deals) global.deals = [];
  global.deals.push(deal);
  underwrites[uid] = underwrites[uid] || {};
  setTimeout(() => runUnderwrite(uid, false).catch(()=>{}), 500);
  adamLog(`Added: ${uid} (ask: ${parsed.askingPrice||'?'}, ARV: ${parsed.arv||'?'})`, 'add');
  // Save to brain log
  urbanBrain.adamDeals = urbanBrain.adamDeals || [];
  urbanBrain.adamDeals.unshift({ uid, ts: new Date().toISOString(), ask: parsed.askingPrice, arv: parsed.arv });
  if (urbanBrain.adamDeals.length > 100) urbanBrain.adamDeals.length = 100;
  saveBrain().catch(()=>{});
  return { ok: true, uid };
}

// ── IMAP: poll inbox for new emails ──────────────────────────────────────────
async function adamCheckInbox() {
  const host = process.env.ADAM_IMAP_HOST;
  const user = process.env.ADAM_IMAP_USER;
  const pass = process.env.ADAM_IMAP_PASS;
  if (!host || !user || !pass) {
    adamLog('IMAP not configured — set ADAM_IMAP_HOST, ADAM_IMAP_USER, ADAM_IMAP_PASS in Railway env', 'warn');
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false, tls: { rejectUnauthorized: false } });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let processed = 0, added = 0;
    try {
      // Get last 20 unseen emails
      const uids = await client.search({ unseen: true }, { uid: true });
      const recent = uids.slice(-20);
      for (const uid of recent) {
        if (ADAM_SEEN.has(uid)) continue;
        ADAM_SEEN.add(uid);
        const msg = await client.fetchOne(uid.toString(), { source: true, envelope: true }, { uid: true });
        const subject = msg.envelope?.subject || '';
        const from = msg.envelope?.from?.[0]?.address || '';
        const raw = msg.source?.toString() || '';
        // Strip MIME headers to get body text
        const bodyStart = raw.indexOf('\r\n\r\n') + 4;
        const body = raw.slice(bodyStart, bodyStart + 5000)
          .replace(/<[^>]+>/g, ' ').replace(/=\r\n/g, '').replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ').trim();
        processed++;
        const parsed = await adamParseEmail(subject, body, from);
        if (parsed) { const r = await adamAddDeal(parsed, subject); if (r.ok) added++; }
        // Mark as seen
        await client.messageFlagsAdd(uid.toString(), ['\\Seen'], { uid: true });
      }
    } finally { lock.release(); }
    await client.logout();
    adamLog(`Cycle done: checked ${processed} emails, added ${added} deals`, 'cycle');
    return { ok: true, processed, added };
  } catch(e) {
    adamLog(`IMAP error: ${e.message}`, 'error');
    return { ok: false, error: e.message };
  }
}

// ── Start IMAP polling if configured ─────────────────────────────────────────
if (process.env.ADAM_IMAP_HOST) {
  adamLog('IMAP configured — starting 5-minute polling cycle');
  setTimeout(() => {
    adamCheckInbox().catch(()=>{});
    setInterval(() => adamCheckInbox().catch(()=>{}), 5 * 60 * 1000);
  }, 10000); // 10s delay on startup to let server finish initializing
}

// ── API endpoints ─────────────────────────────────────────────────────────────
app.get('/api/adam/status', auth, (req, res) => {
  res.json({
    configured: !!(process.env.ADAM_IMAP_HOST),
    imapHost: process.env.ADAM_IMAP_HOST || 'not set',
    imapUser: process.env.ADAM_IMAP_USER || 'not set',
    logCount: ADAM_LOG.length,
    recentLog: ADAM_LOG.slice(0,10),
    totalAdamDeals: (urbanBrain.adamDeals||[]).length,
    recentDeals: (urbanBrain.adamDeals||[]).slice(0,5),
    seenUIDs: ADAM_SEEN.size,
  });
});

app.post('/api/adam/run', auth, async (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  adamLog('Manual IMAP run triggered by ' + req.author);
  const result = await adamCheckInbox();
  res.json(result);
});

app.post('/api/adam/process', auth, async (req, res) => {
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
    if (!deals) global.deals = [];
    const liveDeals = await getDealsFromSheet();
    const existing = liveDeals.find(d => (d.uid||'').toLowerCase()===uid.toLowerCase() || (d.address||'').toLowerCase()===(parsed.address||'').toLowerCase());
    if (existing) return res.status(409).json({ error: 'Already in Urban: ' + (existing.uid||existing.address), existingUid: existing.uid });
    const county = inferCounty(parsed.city) || '';
    const deal = { uid, address: parsed.address, city: parsed.city, state: parsed.state||'FL', zip: parsed.zip||'', county, beds: parsed.beds||0, baths: parsed.baths||0, sqft: parsed.sqft||0, yearBuilt: parsed.yearBuilt||0, construction: parsed.construction||'', askingPrice: parsed.askingPrice||0, wholesaler: parsed.wholesaler||req.author, wholesalerPhone: parsed.wholesalerPhone||'', source: 'manual-upload', addedBy: addedBy||req.author, isManual: true, dateReceived: new Date().toISOString(), needsSheet: true };
    if(!global.deals)global.deals=[];
    global.deals.push(deal);
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
