// BUILD: 2026-06-11 19:20:56
require('dotenv').config({ path: '../.env' });
const DB = require('./db');
const TAMPA = require('./tampaKnowledge');
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

// HTML embedded directly in server — bypasses any file system caching issues
// Updated: 2026-06-12T14:49:16.053Z
const EMBEDDED_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\"><!-- build:1781206739 -->\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Urban — Coralstone Capital Underwriter</title>\n<link href=\"https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap\" rel=\"stylesheet\">\n<style>\n:root{--bg:#0a0a0f;--bg2:#111118;--bg3:#18181f;--border:#22222e;--border2:#2e2e3e;--text:#e8e8f0;--muted:#666680;--accent:#c8a96e;--accent2:#e8c98e;--hot:#ff4444;--buy:#44cc88;--review:#f0a030;--pass:#6688aa;--go:#44cc88;--mono:'DM Mono',monospace;--sans:'DM Sans',sans-serif;--display:'Bebas Neue',sans-serif}\n*{box-sizing:border-box;margin:0;padding:0}\nbody{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}\n/* LOGIN */\n#login-screen{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:20px}\n#login-screen h1{font-family:var(--display);font-size:80px;color:var(--accent);letter-spacing:6px}\n#login-screen .sub{color:var(--muted);font-size:11px;letter-spacing:3px;text-transform:uppercase}\n#login-form{display:flex;gap:10px}\n#login-form input{background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:12px 20px;border-radius:4px;font-family:var(--mono);font-size:14px;width:240px;outline:none}\n#login-form input:focus{border-color:var(--accent)}\n#login-btn{background:var(--accent);color:#000;border:none;padding:12px 28px;border-radius:4px;font-family:var(--sans);font-weight:700;cursor:pointer;font-size:14px;letter-spacing:1px}\n#login-err{color:var(--hot);font-size:12px;display:none}\n/* LAYOUT */\n#app{display:none;height:100vh;overflow:hidden}\n#sidebar{position:fixed;left:0;top:0;bottom:0;width:310px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:100}\n#main{margin-left:310px;height:100vh;overflow-y:auto;position:relative}\n/* SIDEBAR */\n#sidebar-header{padding:20px 18px 16px;border-bottom:1px solid var(--border)}\n#sidebar-header h1{font-family:var(--display);font-size:38px;color:var(--accent);letter-spacing:4px}\n#sidebar-header p{color:var(--muted);font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px}\n#stats-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:12px 18px;border-bottom:1px solid var(--border)}\n.stat-chip{background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:8px 10px;text-align:center}\n.stat-chip .val{font-family:var(--display);font-size:19px;color:var(--accent)}\n.stat-chip .lbl{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}\n#search-wrap{padding:10px 18px;border-bottom:1px solid var(--border)}\n#search-input{width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:8px 12px;border-radius:4px;font-family:var(--sans);font-size:13px;outline:none}\n#search-input:focus{border-color:var(--accent)}\n#filter-bar{display:flex;padding:8px 18px;gap:5px;border-bottom:1px solid var(--border);flex-wrap:wrap}\n.ftab{padding:3px 10px;border-radius:20px;font-size:11px;border:1px solid var(--border2);color:var(--muted);cursor:pointer;font-weight:500;letter-spacing:.5px;transition:all .15s}\n.ftab:hover{border-color:var(--accent);color:var(--accent)}\n.ftab.on{background:var(--accent);border-color:var(--accent);color:#000}\n#deal-list{flex:1;overflow-y:auto}\n.di{padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s}\n.di:hover{background:var(--bg3)}\n.di.active{background:var(--bg3);border-left:3px solid var(--accent);padding-left:15px}\n.di-addr{font-size:13px;font-weight:500;margin-bottom:3px}\n.di-city{font-size:11px;color:var(--muted);margin-bottom:5px}\n.di-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}\n.di-price{font-family:var(--mono);font-size:12px;color:var(--accent)}\n.badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:1px;text-transform:uppercase}\n.b-HOT{background:rgba(255,68,68,.2);color:var(--hot);border:1px solid rgba(255,68,68,.4)}\n.b-BUY{background:rgba(68,204,136,.2);color:var(--buy);border:1px solid rgba(68,204,136,.4)}\n.b-REVIEW{background:rgba(240,160,48,.2);color:var(--review);border:1px solid rgba(240,160,48,.4)}\n.b-PASS{background:rgba(102,136,170,.2);color:var(--pass);border:1px solid rgba(102,136,170,.4)}\n.b-HARDNO{background:rgba(68,17,34,.4);color:#cc4466;border:1px solid rgba(204,68,102,.3)}\n.b-PENDING{background:rgba(100,100,120,.2);color:var(--muted);border:1px solid var(--border2)}\n.di-score{font-family:var(--mono);font-size:11px;color:var(--muted)}\n#ref-btn{margin:10px 18px;background:var(--bg3);border:1px solid var(--border2);color:var(--muted);padding:8px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-family:var(--sans);width:calc(100% - 36px);transition:all .15s}\n#ref-btn:hover{border-color:var(--accent);color:var(--accent)}\n/* MAIN */\n#main-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:14px}\n#main-empty h2{font-family:var(--display);font-size:52px;color:var(--border2);letter-spacing:5px}\n#main-empty p{font-size:13px}\n#dv{display:none;padding:28px;max-width:1100px}\n.dv-addr{font-family:var(--display);font-size:44px;letter-spacing:2px;line-height:1}\n.dv-city{font-size:14px;color:var(--muted);margin-top:6px;letter-spacing:.5px}\n.dv-hm{display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap}\n.verdict-big{font-family:var(--display);font-size:30px;letter-spacing:3px;padding:6px 20px;border-radius:4px}\n.vHOT{background:rgba(255,68,68,.15);color:var(--hot);border:2px solid rgba(255,68,68,.5)}\n.vBUY{background:rgba(68,204,136,.15);color:var(--buy);border:2px solid rgba(68,204,136,.5)}\n.vREVIEW{background:rgba(240,160,48,.15);color:var(--review);border:2px solid rgba(240,160,48,.5)}\n.vPASS{background:rgba(102,136,170,.15);color:var(--pass);border:2px solid rgba(102,136,170,.5)}\n.vHARDNO{background:rgba(68,17,34,.3);color:#cc4466;border:2px solid rgba(204,68,102,.4)}\n.vPENDING{background:var(--bg3);color:var(--muted);border:2px solid var(--border2)}\n.sc{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:24px;border:2px solid var(--accent);color:var(--accent);background:rgba(200,169,110,.1)}\n.vr{color:var(--muted);font-size:14px;font-style:italic;flex:1;min-width:200px}\n.act-row{display:flex;gap:8px;margin:20px 0;flex-wrap:wrap}\n.btn{padding:9px 18px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--text);cursor:pointer;font-family:var(--sans);font-size:13px;font-weight:500;transition:all .15s;display:flex;align-items:center;gap:5px}\n.btn:hover{border-color:var(--accent);color:var(--accent)}\n.btn.primary{background:var(--accent);color:#000;border-color:var(--accent)}\n.btn.primary:hover{background:var(--accent2)}\n.btn-deep{background:#1a1a2e;border-color:#6c63ff;color:#6c63ff}\n/* PENDING / LOADING */\n#pending-card{background:var(--bg2);border:1px dashed var(--border2);border-radius:6px;padding:40px;text-align:center;margin-bottom:20px;display:none}\n#pending-card h3{font-family:var(--display);font-size:28px;color:var(--muted);letter-spacing:2px;margin-bottom:10px}\n#pending-card p{color:var(--muted);font-size:13px;margin-bottom:18px}\n#loading-state{display:none;text-align:center;padding:60px}\n.spinner{width:32px;height:32px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 14px}\n@keyframes spin{to{transform:rotate(360deg)}}\n.load-txt{font-size:13px;color:var(--muted);font-family:var(--mono)}\n/* UW CONTENT & TABS */\n#uw-content{display:none}\n.stabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:20px;gap:0;overflow-x:auto}\n.stab{padding:9px 16px;cursor:pointer;font-size:12px;font-weight:500;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s;white-space:nowrap;letter-spacing:.5px;user-select:none}\n.stab:hover{color:var(--text)}\n.stab.on{color:var(--accent);border-bottom-color:var(--accent)}\n.tc{display:none}\n.tc.active{display:block}\n/* CARDS / GRID */\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-bottom:20px}\n.card{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:18px}\n.ct{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;font-weight:600}\n.m{margin-bottom:10px}\n.ml{font-size:11px;color:var(--muted);margin-bottom:3px}\n.mv{font-family:var(--mono);font-size:14px;color:var(--text)}\n.mv.big{font-family:var(--display);font-size:26px;color:var(--accent)}\n.mv.g{color:var(--buy)}.mv.r{color:var(--hot)}.mv.y{color:var(--review)}.mv.mu{color:var(--muted)}\nhr.d{border:none;border-top:1px solid var(--border);margin:10px 0}\n/* ARV */\n.arv-cmp{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-radius:6px;overflow:hidden;margin-bottom:14px}\n.arv-s{background:var(--bg2);padding:18px;text-align:center}\n.arv-l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}\n.arv-v{font-family:var(--display);font-size:30px}\n.arv-v.ws{color:var(--review)}.arv-v.ur{color:var(--buy)}\n.arv-dn{padding:10px 18px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;font-size:13px;color:var(--muted);text-align:center;margin-bottom:14px}\n.conf{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:1px}\n.conf-HIGH{background:rgba(68,204,136,.2);color:var(--buy)}\n.conf-MEDIUM{background:rgba(240,160,48,.2);color:var(--review)}\n.conf-LOW{background:rgba(255,68,68,.2);color:var(--hot)}\n/* REHAB */\n.ri{display:flex;flex-direction:column;gap:5px}\n.rr{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)}\n.rr:last-child{border-bottom:none}\n.rn{font-size:12px;color:var(--muted);text-transform:capitalize}\n.rv{font-family:var(--mono);font-size:13px;color:var(--text)}\n.rt{display:flex;justify-content:space-between;padding:10px 0 0}\n.rt .rn{color:var(--text);font-weight:600}\n.rt .rv{color:var(--accent);font-size:14px}\n.rrange{font-size:11px;color:var(--muted);margin-top:6px;font-family:var(--mono)}\n.scope-tag{display:inline-block;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:600;letter-spacing:1px;margin-bottom:10px}\n.sc-FULL{background:rgba(255,68,68,.15);color:var(--hot);border:1px solid rgba(255,68,68,.3)}\n.sc-MEDIUM{background:rgba(240,160,48,.15);color:var(--review);border:1px solid rgba(240,160,48,.3)}\n.sc-LIGHT{background:rgba(68,204,136,.15);color:var(--buy);border:1px solid rgba(68,204,136,.3)}\n/* FINANCIALS */\n.fr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)}\n.fr:last-child{border-bottom:none}\n.fl{font-size:13px;color:var(--muted)}\n.fv{font-family:var(--mono);font-size:13px;color:var(--text)}\n.fr.tot .fl{color:var(--text);font-weight:600}\n.fr.tot .fv{color:var(--accent);font-size:14px}\n.fr.g .fv{color:var(--buy)}.fr.r .fv{color:var(--hot)}\n/* OVERRIDES */\n.ov-input{background:var(--bg);border:1px solid var(--border2);color:var(--text);padding:6px 10px;border-radius:4px;font-family:var(--mono);font-size:13px;width:140px;outline:none}\n.ov-input:focus{border-color:var(--accent)}\n.ov-row{display:flex;gap:8px;margin-top:10px;align-items:center}\n.ov-lbl{font-size:12px;color:var(--muted)}\n.ov-btn{padding:6px 12px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--muted);cursor:pointer;font-size:12px;transition:all .15s}\n.ov-btn:hover{border-color:var(--accent);color:var(--accent)}\n/* COMPS TABLE */\n.comps-t{width:100%;border-collapse:collapse;font-size:12px}\n.comps-t th{padding:7px 10px;text-align:left;color:var(--muted);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--border)}\n.comps-t td{padding:9px 10px;border-bottom:1px solid var(--border);color:var(--text)}\n.comps-t tr:last-child td{border-bottom:none}\n.comps-t td.p{font-family:var(--mono);color:var(--accent)}\n/* FLAGS */\n.flags{display:flex;flex-direction:column;gap:8px}\n.flag{padding:12px 14px;border-radius:4px;border-left:3px solid;background:var(--bg3)}\n.flag-HIGH{border-color:var(--hot)}.flag-MEDIUM{border-color:var(--review)}.flag-LOW{border-color:var(--pass)}\n.fn{font-size:12px;font-weight:600;margin-bottom:4px}\n.flag-HIGH .fn{color:var(--hot)}.flag-MEDIUM .fn{color:var(--review)}.flag-LOW .fn{color:var(--pass)}\n.fd{font-size:12px;color:var(--muted);line-height:1.5}\n/* OVERVIEW */\n.rec-box{background:linear-gradient(135deg,rgba(200,169,110,.08),rgba(200,169,110,.03));border:1px solid rgba(200,169,110,.3);border-radius:8px;padding:20px 22px;margin-bottom:20px;position:relative}\n.rec-box::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent);border-radius:8px 0 0 8px}\n.rec-txt{font-size:14px;line-height:1.8;color:var(--text);margin-bottom:14px}\n.off-strat{font-size:13px;line-height:1.7;color:var(--accent);font-style:italic}\n/* CHAT */\n#chat-panel{position:fixed;right:0;top:0;bottom:0;width:380px;background:var(--bg2);border-left:1px solid var(--border);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s ease;z-index:200}\n#chat-panel.open{transform:translateX(0)}\n#chat-hdr{padding:18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}\n#chat-hdr h3{font-family:var(--display);font-size:24px;color:var(--accent);letter-spacing:2px}\n#chat-x{background:none;border:none;color:var(--muted);cursor:pointer;font-size:20px}\n#chat-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}\n.cm{max-width:88%}\n.cm.u{align-self:flex-end}\n.cm.u .bbl{background:var(--accent);color:#000;padding:9px 13px;border-radius:12px 12px 2px 12px;font-size:13px;line-height:1.5}\n.cm.a .bbl{background:var(--bg3);color:var(--text);padding:9px 13px;border-radius:12px 12px 12px 2px;font-size:13px;line-height:1.6;border:1px solid var(--border2)}\n.cts{font-size:10px;color:var(--muted);margin-top:3px}\n.sender{font-size:10px;font-weight:700;letter-spacing:.4px;color:var(--muted);margin-bottom:2px}\n.cm.u .sender{text-align:right;color:rgba(200,169,110,.6)}\n.cm.a .sender{color:var(--muted)}\n.cm.a .cts{text-align:left}.cm.u .cts{text-align:right}\n#chat-in-wrap{padding:14px;border-top:1px solid var(--border)}\n.auth-sel{display:flex;gap:7px;margin-bottom:8px}\n.auth-btn{flex:1;padding:6px;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);color:var(--muted);cursor:pointer;font-size:12px;font-weight:600;transition:all .15s}\n.auth-btn.on{border-color:var(--accent);color:var(--accent);background:rgba(200,169,110,.1)}\n#chat-in{width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);padding:9px 13px;border-radius:4px;font-family:var(--sans);font-size:13px;outline:none;resize:none;min-height:65px;line-height:1.5}\n#chat-in:focus{border-color:var(--accent)}\n#chat-send{width:100%;margin-top:7px;background:var(--bg3);border:1px solid var(--border2);color:var(--accent);padding:9px;border-radius:4px;cursor:pointer;font-family:var(--sans);font-size:13px;font-weight:600;transition:all .15s}\n#chat-send:hover{background:var(--accent);color:#000;border-color:var(--accent)}\n/* PROPERTY TAB */\n.fsec{background:var(--bg2);border:1px solid var(--border);border-radius:6px;margin-bottom:12px;overflow:hidden}\n.fst{font-size:10px;letter-spacing:2px;font-weight:700;color:var(--muted);background:var(--bg3);padding:10px 16px;text-transform:uppercase;border-bottom:1px solid var(--border)}\n.prow{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);gap:16px}\n.prow:last-child{border-bottom:none}\n.plbl{font-size:11px;color:var(--muted);flex:0 0 140px;padding-top:2px}\n.pval{font-size:13px;color:var(--text);text-align:right;flex:1;line-height:1.5;word-break:break-word}\n.prow.big .pval{font-size:20px;font-weight:700;color:var(--accent);font-family:var(--display)}\n.prow.warn .pval,.prow.warn .plbl{color:var(--hot)}\n.prow.pos .pval,.prow.pos .plbl{color:var(--go)}\n.pnote{font-size:12px;color:var(--text);line-height:1.6;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04)}\n.pnote:last-child{border-bottom:none}\n.pnote-lbl{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}\n/* MISC */\n::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}\na{color:var(--accent)}\n</style>\n</head>\n<body>\n\n<!-- LOGIN -->\n<div id=\"login-screen\">\n  <h1>URBAN</h1>\n  <p class=\"sub\">Coralstone Capital Group · Underwriter</p>\n  <div id=\"login-form\">\n    <input type=\"password\" id=\"pw\" placeholder=\"Password\" autocomplete=\"current-password\">\n    <button id=\"login-btn\">ENTER</button>\n  </div>\n  <p id=\"login-err\">Wrong password</p>\n</div>\n\n<!-- APP -->\n<div id=\"app\">\n  <div id=\"sidebar\">\n    <div id=\"sidebar-header\">\n      <h1>URBAN</h1>\n      <p>Coralstone Underwriter</p>\n    </div>\n    <div id=\"stats-bar\">\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-total\">—</div><div class=\"lbl\">Underwritten</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-avg\">—</div><div class=\"lbl\">Avg Score</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-hot\">—</div><div class=\"lbl\">💰 Buy</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-lessons\">—</div><div class=\"lbl\">Lessons</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-profit\">—</div><div class=\"lbl\">Avg Profit</div></div>\n      <div class=\"stat-chip\"><div class=\"val\" id=\"st-pct\">—</div><div class=\"lbl\">BUY %</div></div>\n    </div>\n    <div id=\"search-wrap\">\n      <input type=\"text\" id=\"search-input\" placeholder=\"Search address, city, wholesaler...\">\n    </div>\n    <div id=\"filter-bar\">\n      <div class=\"ftab on\" data-f=\"ALL\">All</div>\n      <div class=\"ftab\" data-f=\"BUY\">💰 Buy</div>\n      \n      <div class=\"ftab\" data-f=\"REVIEW\">Review</div>\n      <div class=\"ftab\" data-f=\"PASS\">Pass</div>\n      <div class=\"ftab\" data-f=\"HARDNO\">Hard No</div>\n      <div class=\"ftab\" data-f=\"NEEDS_ARV\">No ARV</div>\n      <div class=\"ftab\" data-f=\"PENDING\">Pending</div>\n    </div>\n    <div id=\"deal-list\"></div>\n    <button id=\"ref-btn\">↻ Pull from Derek's Sheet</button>\n  </div>\n\n  <div id=\"main\">\n    <div id=\"main-empty\">\n      <h2>SELECT A DEAL</h2>\n      <p>Deals auto-underwrite when they arrive. Click one to review.</p>\n    </div>\n\n    <div id=\"dv\">\n      <div class=\"dv-addr\" id=\"dv-addr\"></div>\n      <div class=\"dv-city\" id=\"dv-city\"></div>\n      <div class=\"dv-hm\">\n        <div class=\"verdict-big vPENDING\" id=\"dv-v\">PENDING</div>\n        <div class=\"sc\" id=\"dv-sc\">?</div>\n        <div class=\"vr\" id=\"dv-vr\"></div>\n      </div>\n      <div class=\"act-row\">\n        <button class=\"btn primary\" id=\"btn-uw\">⚡ Underwrite</button>\n        <button class=\"btn btn-deep\" id=\"btn-deep\" title=\"Sonnet 4 — deeper, ~$0.05\">🔬 Deep</button>\n        <button class=\"btn\" id=\"btn-reuw\">↻ Re-run</button>\n        <button class=\"btn\" id=\"btn-regen\" title=\"Recalculate verdict from current numbers — no new comps, cheap\" style=\"background:rgba(100,200,150,.08);border-color:rgba(100,200,150,.25);color:rgba(100,200,150,.9)\">⚡ Regen</button>\n        <button class=\"btn\" id=\"btn-chat\">💬 Chat</button>\n        <button class=\"btn\" id=\"btn-sheet\">📊 Sheet</button>\n      </div>\n\n      <div id=\"pending-card\">\n        <h3>NOT YET UNDERWRITTEN</h3>\n        <p>Urban hasn't analyzed this deal yet.</p>\n        <button class=\"btn primary\" id=\"btn-uw-now\">⚡ Underwrite Now</button>\n      </div>\n\n      <div id=\"loading-state\">\n        <div class=\"spinner\"></div>\n        <div class=\"load-txt\" id=\"load-msg\">Initializing...</div>\n      </div>\n\n      <div id=\"uw-content\">\n        <div class=\"stabs\" id=\"stabs-row\">\n          <div class=\"stab on\" data-t=\"overview\">Overview</div>\n          <div class=\"stab\" data-t=\"arv\">ARV Analysis</div>\n          <div class=\"stab\" data-t=\"rehab\">Rehab</div>\n          <div class=\"stab\" data-t=\"financials\">Financials</div>\n          <div class=\"stab\" data-t=\"rental\">Rental</div>\n          <div class=\"stab\" data-t=\"newconstruction\">New Construction</div>\n          <div class=\"stab\" data-t=\"flags\">Risk Flags</div>\n          <div class=\"stab\" data-t=\"property\">Property</div>\n        </div>\n\n        <!-- OVERVIEW -->\n        <div class=\"tc active\" id=\"t-overview\">\n          <!-- NEGOTIATION LADDER -->\n            <div id=\"neg-ladder\" style=\"background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:16px;margin-bottom:16px;display:none\">\n              <div class=\"ct\" style=\"margin-bottom:10px\">Negotiation Ladder</div>\n              <div id=\"neg-rows\"></div>\n            </div>\n            <div class=\"rec-box\">\n            <div class=\"ct\">Urban's Recommendation</div>\n            <div class=\"rec-txt\" id=\"ov-rec\"></div>\n            <div class=\"off-strat\" id=\"ov-off\"></div>\n          </div>\n          <div class=\"grid\">\n            <div class=\"card\">\n              <div class=\"ct\">Key Numbers</div>\n              <div class=\"m\"><div class=\"ml\">Urban's TRUE ARV</div><div class=\"mv big\" id=\"ov-arv\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Rehab Estimate</div><div class=\"mv\" id=\"ov-rehab\"></div></div>\n              <div class=\"m\"><div class=\"ml\">MAO (Max Offer)</div><div class=\"mv\" id=\"ov-mao\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Asking Price</div><div class=\"mv\" id=\"ov-ask\"></div></div>\n              <hr class=\"d\">\n              <div class=\"m\"><div class=\"ml\">Net Profit @ Asking</div><div class=\"mv\" id=\"ov-profit\"></div></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">ARV Comparison</div>\n              <div class=\"m\"><div class=\"ml\">Wholesaler's ARV</div><div class=\"mv y\" id=\"ov-warv\"></div></div>\n              <div class=\"m\"><div class=\"ml\">ARV Variance</div><div class=\"mv\" id=\"ov-arvdiff\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Wholesaler Credibility</div><div class=\"mv\" id=\"ov-cred\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Market Trend</div><div class=\"mv\" id=\"ov-trend\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Estimated Hold</div><div class=\"mv\" id=\"ov-hold\"></div></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">Criteria Check</div>\n              <div class=\"m\"><div class=\"ml\">Profit Min (10%)</div><div class=\"mv\" id=\"cc-profit\"></div></div>\n              <div class=\"m\"><div class=\"ml\">In Market</div><div class=\"mv\" id=\"cc-mkt\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Flood Zone</div><div class=\"mv\" id=\"cc-flood\"></div></div>\n              <div class=\"m\"><div class=\"ml\">High Risk Flags</div><div class=\"mv\" id=\"cc-risk\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Rehab Scope</div><div class=\"mv\" id=\"cc-scope\"></div></div>\n            </div>\n          </div>\n        </div>\n\n        <!-- ARV -->\n        <div class=\"tc\" id=\"t-arv\">\n          <div class=\"arv-cmp\">\n            <div class=\"arv-s\"><div class=\"arv-l\">Wholesaler's ARV</div><div class=\"arv-v ws\" id=\"arv-ws\"></div></div>\n            <div class=\"arv-s\"><div class=\"arv-l\">Urban's TRUE ARV</div><div class=\"arv-v ur\" id=\"arv-ur\"></div></div>\n          </div>\n          <div class=\"arv-dn\" id=\"arv-dn\"></div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Urban's Analysis <span class=\"conf\" id=\"arv-conf\"></span></div>\n            <p style=\"font-size:13px;color:var(--text);line-height:1.6\" id=\"arv-notes\"></p>\n          </div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Comparable Sales</div>\n            <table class=\"comps-t\"><thead><tr><th>Address</th><th>Beds/Baths</th><th>Sqft</th><th>Yr</th><th>Sale Price</th><th>$/sf</th><th>Date</th><th>Src</th></tr></thead>\n            <tbody id=\"comps-body\"></tbody></table>\n          </div>\n          <!-- EXIT ANALYSIS (populated by renderUW when exitAnalysis data exists) -->\n          <div id=\"exit-analysis\" style=\"display:none\" class=\"card\">\n            <div class=\"ct\">Exit Analysis</div>\n            <div class=\"grid g3\">\n              <div class=\"m\"><div class=\"ml\">Estimated DOM</div><div class=\"mv\" id=\"ex-dom\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">List-to-Sale Ratio</div><div class=\"mv\" id=\"ex-lsr\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">Realistic Sale Price</div><div class=\"mv\" id=\"ex-rsp\">—</div></div>\n            </div>\n            <div class=\"grid g2\" style=\"margin-top:10px\">\n              <div class=\"m\"><div class=\"ml\">Adjusted Profit</div><div class=\"mv fv\" id=\"ex-adj\">—</div></div>\n              <div class=\"m\"><div class=\"ml\">Target Buyer</div><div class=\"mv\" id=\"ex-buyer\">—</div></div>\n            </div>\n          </div>\n          <div class=\"card\">\n            <div class=\"ct\">Override ARV</div>\n            <div class=\"ov-row\"><span class=\"ov-lbl\">New ARV: $</span><input type=\"number\" class=\"ov-input\" id=\"ov-arv-in\" placeholder=\"285000\"><button class=\"ov-btn\" id=\"btn-ov-arv\">Apply & Recalc</button></div>\n          </div>\n        </div>\n\n        <!-- REHAB -->\n        <div class=\"tc\" id=\"t-rehab\">\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Scope & Line Items</div>\n            <div id=\"rehab-scope\"></div>\n            <div class=\"ri\" id=\"rehab-li\"></div>\n            <div class=\"rrange\" id=\"rehab-rng\"></div>\n            <p style=\"font-size:13px;color:var(--muted);line-height:1.6;margin-top:12px\" id=\"rehab-notes\"></p>\n            <div style=\"margin-top:10px;padding:9px;background:var(--bg3);border-radius:4px;font-size:12px;color:var(--review)\" id=\"rehab-miss\"></div>\n          </div>\n          <div class=\"card\" style=\"margin-bottom:14px\">\n            <div class=\"ct\">Wholesaler vs Urban</div>\n            <div class=\"fr\"><span class=\"fl\">Wholesaler's Estimate</span><span class=\"fv y\" id=\"rh-ws\"></span></div>\n            <div class=\"fr\"><span class=\"fl\">Urban's Estimate</span><span class=\"fv\" id=\"rh-ur\"></span></div>\n            <div class=\"fr\"><span class=\"fl\">Confidence</span><span class=\"fv\" id=\"rh-conf\"></span></div>\n          </div>\n          <div class=\"card\">\n            <div class=\"ct\">Override Rehab</div>\n            <div class=\"ov-row\"><span class=\"ov-lbl\">New Rehab: $</span><input type=\"number\" class=\"ov-input\" id=\"ov-rehab-in\" placeholder=\"45000\"><button class=\"ov-btn\" id=\"btn-ov-rehab\">Apply & Recalc</button></div>\n          </div>\n        </div>\n\n        <!-- FINANCIALS -->\n        <div class=\"tc\" id=\"t-financials\">\n          <div class=\"grid\">\n            <div class=\"card\">\n              <div class=\"ct\">Deal Economics</div>\n              <div class=\"fr\"><span class=\"fl\">Asking Price</span><span class=\"fv\" id=\"fi-ask\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Urban's ARV</span><span class=\"fv\" id=\"fi-arv\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Rehab Budget</span><span class=\"fv\" id=\"fi-reh\"></span></div>\n              <div class=\"fr tot\"><span class=\"fl\">MAO (ARV×70%−Repairs)</span><span class=\"fv\" id=\"fi-mao\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Over/Under MAO</span><span class=\"fv\" id=\"fi-oum\"></span></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">Hard Money · 9.5% Interest Only</div>\n              <div class=\"fr\"><span class=\"fl\">Loan (90% LTV)</span><span class=\"fv\" id=\"fi-loan\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Monthly Payment</span><span class=\"fv\" id=\"fi-mo\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Hold Time</span><span class=\"fv\" id=\"fi-hold\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Total Interest</span><span class=\"fv\" id=\"fi-int\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Origination (2 pts)</span><span class=\"fv\" id=\"fi-pts\"></span></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">All-In Cost Breakdown</div>\n              <div class=\"fr\"><span class=\"fl\">Purchase Price</span><span class=\"fv\" id=\"fi-pp\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Rehab</span><span class=\"fv\" id=\"fi-rh2\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Financing (interest + pts)</span><span class=\"fv\" id=\"fi-fin\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Holding Costs</span><span class=\"fv\" id=\"fi-hc\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Selling (6% + 2%)</span><span class=\"fv\" id=\"fi-sc\"></span></div>\n              <div class=\"fr tot\"><span class=\"fl\">Total All-In</span><span class=\"fv\" id=\"fi-tot\"></span></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">Profit</div>\n              <div class=\"fr\"><span class=\"fl\">Net Profit @ Asking</span><span class=\"fv\" id=\"fi-pa\" style=\"font-size:17px\"></span></div>\n              <div class=\"fr g\"><span class=\"fl\">Net Profit @ MAO</span><span class=\"fv\" id=\"fi-pm\" style=\"font-size:17px\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">ROI</span><span class=\"fv\" id=\"fi-roi\"></span></div>\n              <div class=\"fr\"><span class=\"fl\">Meets $40k Minimum</span><span class=\"fv\" id=\"fi-min\"></span></div>\n            </div>\n          </div>\n        </div>\n\n        <!-- RENTAL -->\n        <div class=\"tc\" id=\"t-rental\">\n          <div class=\"grid\">\n            <div class=\"card\">\n              <div class=\"ct\">Rental Metrics</div>\n              <div class=\"m\"><div class=\"ml\">Market Rent</div><div class=\"mv big\" id=\"rn-rent\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Gross Yield</div><div class=\"mv\" id=\"rn-gy\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Net Yield</div><div class=\"mv\" id=\"rn-ny\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Monthly Cash Flow</div><div class=\"mv\" id=\"rn-cf\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Cap Rate</div><div class=\"mv\" id=\"rn-cap\"></div></div>\n            </div>\n            <div class=\"card\">\n              <div class=\"ct\">Urban's Rental Take</div>\n              <p style=\"font-size:13px;color:var(--text);line-height:1.7\" id=\"rn-notes\"></p>\n              <div style=\"margin-top:14px\"><div class=\"ml\">Worth Considering?</div><div class=\"mv\" id=\"rn-worth\"></div></div>\n            </div>\n          </div>\n        </div>\n\n        <!-- NEW CONSTRUCTION -->\n        <div class=\"tc\" id=\"t-newconstruction\">\n          <div class=\"card\">\n            <div class=\"ct\">New Construction Potential</div>\n            <div class=\"grid\" style=\"margin-bottom:14px\">\n              <div class=\"m\"><div class=\"ml\">Est. Lot Value</div><div class=\"mv big\" id=\"nc-lot\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Build Cost (@ $150/sqft)</div><div class=\"mv\" id=\"nc-build\"></div></div>\n              <div class=\"m\"><div class=\"ml\">Est. New ARV</div><div class=\"mv\" id=\"nc-arv\"></div></div>\n            </div>\n            <p style=\"font-size:13px;color:var(--text);line-height:1.7;margin-bottom:14px\" id=\"nc-notes\"></p>\n          </div>\n        </div>\n\n        <!-- FLAGS -->\n        <div class=\"tc\" id=\"t-flags\">\n          <div class=\"flags\" id=\"flags-list\">\n            <div class=\"flags-empty\" id=\"flags-empty\" style=\"display:none;padding:40px;text-align:center;color:var(--muted);font-size:13px\">\n              <div style=\"font-size:24px;margin-bottom:8px\">🔍</div>\n              <div>No risk flags analyzed yet.</div>\n              <div style=\"margin-top:4px;font-size:11px\">Hit ⚡ Underwrite for full risk analysis.</div>\n            </div>\n          </div>\n        </div>\n\n        <!-- PROPERTY — ALL DATA FROM SHEET -->\n        <div class=\"tc\" id=\"t-property\">\n          <div id=\"deal-full-info\"></div>\n        </div>\n\n      </div><!-- /uw-content -->\n    </div><!-- /dv -->\n  </div><!-- /main -->\n\n  <!-- CHAT PANEL -->\n  <div id=\"chat-panel\">\n    <div id=\"chat-hdr\">\n      <div>\n        <h3>URBAN AI</h3>\n        <div id=\"chat-deal-label\" style=\"font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:2px;letter-spacing:.3px\"></div>\n      </div>\n      <button id=\"chat-x\">✕</button>\n    </div>\n    <div id=\"chat-msgs\"></div>\n    <div id=\"chat-in-wrap\">\n      <div class=\"auth-sel\">\n        <button class=\"auth-btn on\" data-a=\"caleb\" onclick=\"setAuth('caleb')\">Caleb</button>\n        <button class=\"auth-btn\" data-a=\"grant\" onclick=\"setAuth('grant')\">Grant</button>\n      </div>\n      <textarea id=\"chat-in\" placeholder=\"Ask Urban anything about this deal. Correct numbers, give better comps, ask what-ifs. Urban remembers your corrections.\"></textarea>\n      <button id=\"chat-send\">Send ↵</button>\n    </div>\n  </div>\n</div>\n\n<script>\nconst $ = id => document.getElementById(id);\nconst fmt = n => (n != null && n !== '') ? '$' + parseInt(n).toLocaleString() : '—';\nconst pct = n => n != null ? parseFloat(n).toFixed(1) + '%' : '—';\n\nlet TOKEN = '', deals = [], curDeal = null, curUW = null, curFilter = 'ALL', author = 'caleb';\nlet autoUnderwriteRunning = false;\n\n// ── LOGIN ──────────────────────────────────────────────────────────────────────\n$('pw').addEventListener('keydown', e => e.key === 'Enter' && doLogin());\n$('login-btn').addEventListener('click', doLogin);\n// URL token support\n(function() {\n  const p = new URLSearchParams(window.location.search);\n  const h = new URLSearchParams(window.location.hash.replace('#',''));\n  const t = p.get('token') || h.get('token');\n  if (t) { $('pw').value = t; doLogin(); }\n})();\n\nasync function doLogin() {\n  const pwEl = document.getElementById('pw');\n  TOKEN = (pwEl ? pwEl.value : '').trim();\n  if (!TOKEN) return;\n  try {\n    const r = await fetch('/api/stats', { headers: { 'x-urban-token': TOKEN } });\n    if (r.ok) {\n      document.getElementById('login-screen').style.display = 'none';\n      document.getElementById('app').style.display = 'flex';\n      doLoadStats();\n      doLoadDeals();\n    } else {\n      document.getElementById('login-err').style.display = 'block';\n      TOKEN = '';\n    }\n  } catch(e) {\n    document.getElementById('login-err').style.display = 'block';\n    TOKEN = '';\n  }\n}\n\n// ── STATS ──────────────────────────────────────────────────────────────────────\nasync function doLoadStats() {\n  try {\n    const r = await fetch('/api/stats', { headers: { 'x-urban-token': TOKEN } });\n    const s = await r.json();\n    $('st-total').textContent = s.totalUnderwritten || 0;\n    $('st-avg').textContent = s.avgScore ? s.avgScore.toFixed(1) : '—';\n    $('st-hot').textContent = (s.verdicts?.HOT||0) + (s.verdicts?.BUY||0);\n    $('st-lessons').textContent = s.lessonsLearned || 0;\n    if ($('st-profit')) $('st-profit').textContent = s.avgProfit ? '$'+Math.round(s.avgProfit/1000)+'K avg' : '—';\n    if ($('st-pct')) {\n      const total = s.totalUnderwritten || 1;\n      const good = (s.verdicts?.HOT||0) + (s.verdicts?.BUY||0);\n      $('st-pct').textContent = Math.round(good/total*100) + '% BUY DEALS';\n    }\n  } catch {}\n}\n\n// ── DEALS ──────────────────────────────────────────────────────────────────────\nasync function doLoadDeals(skipAuto = false) {\n  $('ref-btn').textContent = '↻ Loading...';\n  try {\n    const r = await fetch('/api/deals', { headers: { 'x-urban-token': TOKEN } });\n    deals = await r.json();\n    renderList();\n    // Auto-underwrite any pending deals now (first load or forced)\n    if (!skipAuto && !autoUnderwriteRunning) {\n      autoUnderwritePending();\n    }\n    // Poll for new pending deals every 3 minutes while page is open\n    if (!window._uwPollStarted) {\n      window._uwPollStarted = true;\n      window._consecutiveRateLimits = 0;\n      window._rateLimitPauseUntil = 0;\n      window._uwPollInterval = setInterval(() => {\n        const now = Date.now();\n        // If we're in a rate limit pause, wait it out\n        if (window._rateLimitPauseUntil > now) {\n          const minsLeft = Math.ceil((window._rateLimitPauseUntil - now) / 60000);\n          console.log(`[Poll] Rate limit pause — ${minsLeft} min remaining`);\n          return;\n        }\n        const pending = deals.filter(d => {\n          if (d.underwriteStatus && d.underwriteStatus !== 'PENDING' && d.underwriteStatus !== '') return false;\n          if (d._rateLimited && (now - d._rateLimited) < 45 * 60 * 1000) return false; // 45-min cooldown per deal\n          return true;\n        });\n        if (pending.length > 0 && !autoUnderwriteRunning) {\n          console.log(`[Poll] ${pending.length} pending — auto-underwriting`);\n          autoUnderwritePending();\n        } else if (pending.length === 0) {\n          window._consecutiveRateLimits = 0;\n          window._rateLimitPauseUntil = 0;\n        }\n      }, 3 * 60 * 1000); // every 3 minutes\n    }\n  } catch(e) { console.log('Load deals error:', e.message); }\n  $('ref-btn').textContent = '↻ Pull from Derek\\'s Sheet';\n}\n\nasync function autoUnderwritePending() {\n  if (autoUnderwriteRunning) return;\n  const pending = deals.filter(d => !d.underwriteStatus || d.underwriteStatus === 'PENDING')\n    .filter(d => d.address && d.address !== 'XXXX');\n  if (!pending.length) { console.log('No pending deals to underwrite'); return; }\n  autoUnderwriteRunning = true;\n  console.log(`Auto-underwriting ${pending.length} pending deals (parallel batch)...`);\n\n  try {\n    const res = await fetch('/api/auto-underwrite-batch', {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({})\n    });\n    if (!res.ok) { console.log('Batch underwrite failed:', res.status); autoUnderwriteRunning = false; return; }\n    const reader = res.body.getReader();\n    const dec = new TextDecoder();\n    let buf = '';\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n      buf += dec.decode(value, { stream: true });\n      const lines = buf.split('\\n'); buf = lines.pop();\n      for (const line of lines) {\n        if (!line.startsWith('data: ')) continue;\n        try {\n          const data = JSON.parse(line.slice(6));\n          if (data.status) console.log('⏳', data.status);\n          if (data.done && data.address) {\n            console.log(`✅ ${data.address} → ${data.verdict} (${data.score}/10)`);\n            const idx = deals.findIndex(x => (x.address||'').toLowerCase() === (data.address||'').toLowerCase());\n            if (idx >= 0) { deals[idx].underwriteStatus = data.verdict; deals[idx].underwriteScore = data.score; }\n            renderList();\n            doLoadStats();\n            if (curDeal && (curDeal.address||'').toLowerCase() === (data.address||'').toLowerCase()) {\n              // refresh current deal view\n              selectDealByAddress(data.address);\n            }\n          }\n          if (data.finished) {\n            console.log(`🏁 Batch complete: ${data.total} deals processed`);\n            autoUnderwriteRunning = false;\n            doLoadDeals(true); // Refresh deal list with new verdicts (skip auto-underwrite)\n          }\n          if (data.error) {\n            const isRL = (data.error||'').includes('rate_limit') || (data.error||'').includes('429');\n            if (isRL && data.address) {\n              // Mark deal as temporarily rate-limited so batch doesn't keep retrying\n              const dIdx = deals.findIndex(d => d.address === data.address);\n              if (dIdx >= 0) deals[dIdx]._rateLimited = Date.now();\n              window._consecutiveRateLimits = (window._consecutiveRateLimits || 0) + 1;\n            }\n            if (!data.address) autoUnderwriteRunning = false;\n          }\n        } catch {}\n      }\n    }\n  } catch(e) {\n    autoUnderwriteRunning = false;\n    console.log('Batch underwrite error:', e.message);\n    autoUnderwriteRunning = false;\n  }\n  autoUnderwriteRunning = false;\n\n  // Legacy per-deal fallback (kept for manual single-deal use)\n  // Original per-deal loop removed — now using parallel batch endpoint\n  if (false) for (const d of pending) {\n    try {\n      const addr = encodeURIComponent(d.address);\n      const res = await fetch(`/api/underwrite-by-address/${addr}`, {\n        method: 'POST',\n        headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n        body: JSON.stringify({ deep: false })\n      });\n      // Read SSE stream\n      const reader = res.body.getReader();\n      const dec = new TextDecoder();\n      let buf = '';\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        buf += dec.decode(value, { stream: true });\n        const lines = buf.split('\\n'); buf = lines.pop();\n        for (const line of lines) {\n          if (!line.startsWith('data: ')) continue;\n          try {\n            const data = JSON.parse(line.slice(6));\n            if (data.done) {\n              const uw = data.underwrite;\n              console.log(`✅ ${d.address} → ${uw.verdict}`);\n              // Update in local list\n              const idx = deals.findIndex(x => x.address === d.address);\n              if (idx >= 0) { deals[idx].underwriteStatus = uw.verdict; deals[idx].underwriteScore = uw.score; }\n              renderList();\n              doLoadStats();\n              // If this deal is currently selected, show the result\n              if (curDeal && curDeal.address === d.address) renderUW(uw);\n            }\n            if (data.skipped) console.log(`⏩ ${d.address} already underwritten`);\n          } catch {}\n        }\n      }\n    } catch(e) { console.log(`Auto-underwrite failed for ${d.address}:`, e.message); }\n    await new Promise(r => setTimeout(r, 3000)); // 3s between deals\n  }\n  autoUnderwriteRunning = false;\n}\n\n$('ref-btn').addEventListener('click', () => {\n  // Manual refresh: reload deals from sheet but DO NOT re-underwrite\n  // User must click \"Run Batch Underwrite\" to re-underwrite\n  doLoadDeals(true); // true = skip auto-underwrite\n});\n$('search-input').addEventListener('input', renderList);\n// ── REVIEW CHATS (Urban learns from all conversations) ────────────────────────\nasync function doReviewChat() {\n  const btn = $('review-btn');\n  btn.disabled = true;\n  btn.textContent = '⏳ Reviewing...';\n  try {\n    const r = await fetch('/api/review-chat', {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' }\n    });\n    const data = await r.json();\n    if (data.ok) {\n      const msg = data.lessonsAdded > 0\n        ? `✅ ${data.lessonsAdded} new lessons added to Urban's brain!`\n        : '✅ Review complete — no new lessons needed.';\n      alert(msg + (data.lessons?.length ? '\\n\\n' + data.lessons.join('\\n') : ''));\n    } else {\n      alert('Error: ' + (data.error || 'unknown'));\n    }\n  } catch(e) {\n    alert('Review failed: ' + e.message);\n  }\n  btn.disabled = false;\n  btn.textContent = '📚 Review Chats';\n}\n\n// ── KEEP DEAL (reset 7-day expiry) ───────────────────────────────────────────\nasync function keepDeal(uid, address) {\n  try {\n    const r = await fetch('/api/keep-deal/' + encodeURIComponent(uid), {\n      method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ days: 7 })\n    });\n    if (r.ok) {\n      // Remove stale badge from current deal\n      curDeal.isStale = false;\n      document.querySelectorAll('.stale-badge').forEach(el => el.remove());\n      // Show confirmation\n      const btn = document.querySelector('.keep-btn');\n      if (btn) { btn.textContent = '✅ Kept 7 more days'; btn.disabled = true; }\n      // Reload list\n      await doLoadDeals(true);\n    }\n  } catch(e) { console.error('Keep deal error:', e); }\n}\n\ndocument.querySelectorAll('.ftab').forEach(t => t.addEventListener('click', () => {\n  document.querySelectorAll('.ftab').forEach(x => x.classList.remove('on'));\n  t.classList.add('on'); curFilter = t.dataset.f; renderList();\n}));\n\nfunction renderList() {\n  const q = $('search-input').value.toLowerCase();\n  const list = $('deal-list');\n  // Apply sort\n  const sortBy = $('sort-select')?.value || 'date-new';\n  deals.sort((a, b) => {\n    if (sortBy === 'date-new') return new Date(b.dateReceived||0) - new Date(a.dateReceived||0);\n    if (sortBy === 'date-old') return new Date(a.dateReceived||0) - new Date(b.dateReceived||0);\n    if (sortBy === 'score-high') return (b.underwriteScore||0) - (a.underwriteScore||0);\n    if (sortBy === 'profit-high') {\n      // Try to get profit from underwrite cache — fall back to estimated MAO gap\n      const profA = a.netProfitAtAsking || 0;\n      const profB = b.netProfitAtAsking || 0;\n      return profB - profA;\n    }\n    if (sortBy === 'ask-low') return (parseFloat(a.askingPrice)||999999) - (parseFloat(b.askingPrice)||999999);\n    return 0;\n  });\n  const filtered = deals.filter(d => {\n    const status = d.underwriteStatus || 'PENDING';\n    const normStatus = status === 'HARD NO' ? 'HARDNO' : status;\n    const matchFilter = curFilter === 'ALL' \n      || normStatus === curFilter\n      || (curFilter === 'PASS' && status === 'PASS')\n      || (curFilter === 'HARDNO' && status === 'HARD NO')\n      || (curFilter === 'NEEDS_ARV' && (!d.arv || !d.arv.wholesalerARV || d.arv.wholesalerARV === 0) && !['PASS','HARD NO'].includes(status));\n    const matchSearch = !q || `${d.address} ${d.city} ${d.wholesalerCompany} ${d.contact1Name}`.toLowerCase().includes(q);\n    return matchFilter && matchSearch;\n  });\n  list.innerHTML = '';\n  if (!filtered.length) {\n    list.innerHTML = '<div style=\"padding:20px;color:var(--muted);font-size:13px;text-align:center\">No deals found</div>';\n    return;\n  }\n  filtered.forEach(d => {\n    const uid = d.uid || `${d.address}-${d.dateReceived}`;\n    const status = d.underwriteStatus || 'PENDING';\n    // Show inflation warning if brain flags this wholesaler\n    const inflationWarn = d.wholesalerInflationWarning || d.inflationWarning;\n    const badgeCls = status === 'HARD NO' ? 'b-HARDNO' : `b-${status}`;\n    const price = d.askingPrice ? fmt(d.askingPrice) : 'No price';\n    const isActive = curDeal && (curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`) === uid;\n    const el = document.createElement('div');\n    const warnBadge = inflationWarn ? ' <span style=\"color:#ff6b35;font-size:9px;font-weight:700;vertical-align:middle\" title=\"ARV Inflation Warning\">⚠️ ARV</span>' : '';\n    // High risk flag badge from underwrite\n    const hasHighFlag = (() => { try { const u = underwrites && underwrites[uid]; return u?.riskFlags?.some(f=>f.severity==='HIGH'); } catch { return false; } })();\n    el.className = 'di' + (isActive ? ' active' : '');\n    el.dataset.uid = uid;\n    // Calculate deal age\n    const ageDays = d.dateReceived\n      ? Math.floor((Date.now() - new Date(d.dateReceived)) / 86400000)\n      : null;\n    const ageLabel = ageDays === null ? '' : ageDays === 0 ? '🟢 Today' : ageDays === 1 ? '🟡 1d' : ageDays <= 3 ? `🟡 ${ageDays}d` : ageDays <= 7 ? `🟠 ${ageDays}d` : `🔴 ${ageDays}d`;\n    const staleLabel = d.isStale ? '<span class=\"stale-badge\">⏰ STALE</span>' : '';\n    const sqftLabel = d.sqft ? `${parseInt(d.sqft).toLocaleString()} sf` : '';\n    const ppsqft = (d.underwriteScore && d.arv?.arvPerSqft) ? ` · $${Math.round(d.arv.arvPerSqft)}/sf` : '';\n\n    el.innerHTML = `\n      <div class=\"di-addr\">${d.address || 'No address'}</div>\n      <div class=\"di-city\">${d.city}, ${d.state} · ${d.beds||'?'}bd/${d.baths||'?'}ba · ${d.sqft ? parseInt(d.sqft).toLocaleString() : '?'} sqft${ppsqft}</div>\n      <div class=\"di-meta\">\n        <span class=\"di-price\">${price}</span>\n        <span class=\"badge ${badgeCls}\">${status}</span>\n        ${d.underwriteScore ? `<span class=\"di-score\">${d.underwriteScore}/10</span>` : ''}\n        ${ageLabel ? `<span class=\"di-age\">${ageLabel}</span>` : ''}\n        ${staleLabel}\n      </div>`;\n    el.addEventListener('click', () => selectDeal(d));\n    list.appendChild(el);\n  });\n}\n\n// ── SELECT DEAL ────────────────────────────────────────────────────────────────\nasync function selectDeal(d) {\n  curDeal = d;\n  // Update chat header to show which deal is active\n  const chatLabel = $('chat-deal-label');\n  if (chatLabel) chatLabel.textContent = d.address ? `— ${d.address}` : '';\n\n  // Show/hide stale warning + keep button in deal header\n  const staleWarn = $('stale-warning');\n  if (staleWarn) {\n    if (d.isStale) {\n      const uid = d.uid || (d.address + '-' + d.dateReceived);\n      staleWarn.style.display = '';\n      staleWarn.innerHTML = `<span style=\"color:var(--hot);font-size:11px;font-weight:600\">⏰ ${d.daysOld} days old — may be taken</span>\n        <button class=\"keep-btn\" onclick=\"keepDeal('${uid}','${d.address}')\" style=\"margin-left:8px;padding:2px 8px;font-size:10px;background:rgba(255,60,90,.12);border:1px solid rgba(255,60,90,.3);color:var(--hot);border-radius:4px;cursor:pointer\">Keep in Urban 7 days</button>`;\n    } else {\n      staleWarn.style.display = 'none';\n    }\n  }\n  const uid = d.uid || `${d.address}-${d.dateReceived}`;\n  document.querySelectorAll('.di').forEach(el => el.classList.toggle('active', el.dataset.uid === uid));\n  show('main-empty', false);\n  show('dv', true);\n  $('dv-addr').textContent = d.address || 'Unknown';\n  const countyPart = d.county ? (d.county.toLowerCase().includes('county') ? d.county : d.county + ' County') : '';\n  $('dv-city').textContent = [`${d.city||''}, ${d.state||''} ${d.zip||''}`.trim().replace(/^,\\s*/, ''), countyPart, d.propertyType || 'SFR'].filter(Boolean).join(' · ');\n\n  // Always fill property tab with sheet data\n  fillPropTab(d);\n\n  // Try to load existing underwrite\n  try {\n    const r = await fetch(`/api/underwrite/${encodeURIComponent(uid)}`, { headers: { 'x-urban-token': TOKEN } });\n    if (r.ok) {\n      curUW = await r.json();\n      try { renderUW(curUW); } catch(re) { console.warn('renderUW err:', re.message, re.stack?.split('\\n')[1]); showPending(curUW); }\n    } else {\n      const p = (d.underwriteStatus && d.underwriteStatus !== 'PENDING')\n        ? { verdict: d.underwriteStatus, score: d.underwriteScore, verdictReason: 'Loading — hit Re-run for full data.' }\n        : null;\n      showPending(p);\n    }\n  } catch(fe) {\n    const p2 = (d.underwriteStatus && d.underwriteStatus !== 'PENDING')\n      ? { verdict: d.underwriteStatus, score: d.underwriteScore, verdictReason: 'Loading — hit Re-run for full data.' }\n      : null;\n    showPending(p2);\n  }\n}\n\nfunction showPending(partialUW) {\n  // If we have a restored stub with at least a verdict, show it\n  if (partialUW && partialUW.verdict && partialUW.verdict !== 'PENDING') {\n    // Show verdict badge and score\n    $('dv-v').textContent = partialUW.verdict;\n    $('dv-v').className = 'verdict-big v' + partialUW.verdict.replace(' ','');\n    $('dv-sc').textContent = partialUW.score || '?';\n    $('dv-vr').textContent = partialUW.verdictReason || 'Underwrite data restored from sheet';\n    partialUW._isPartial = true;\n    show('pending-card', false);\n    // Show partial content with what we have\n    show('uw-content', true);\n    show('loading-state', false);\n    // Show recommendation if available\n    if (partialUW.recommendation) {\n      const recEl = $('ov-rec');\n      if (recEl) recEl.textContent = partialUW.recommendation;\n    }\n    const offEl = $('ov-off');\n    if (offEl) {\n      offEl.textContent = partialUW.offerStrategy || '';\n      const offStr = offEl.closest ? offEl.closest('.off-str') : null;\n      if (offStr) offStr.style.display = partialUW.offerStrategy ? '' : 'none';\n    }\n    // Show re-underwrite notice\n    const existingNotice = document.getElementById('stale-uw-notice');\n    if (!existingNotice) {\n      const notice = document.createElement('div');\n      notice.id = 'stale-uw-notice';\n      notice.style.cssText = 'background:rgba(200,169,110,.08);border:1px solid rgba(200,169,110,.2);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--muted)';\n      notice.innerHTML = '📋 Verdict loaded from history. Hit <strong style=\"color:var(--gold)\">⚡ Underwrite</strong> for fresh live comps, flags, and full analysis.';\n      const uwContent = $('uw-content');\n      if (uwContent?.firstChild) uwContent.insertBefore(notice, uwContent.firstChild);\n    }\n    return;\n  }\n  $('dv-v').textContent = 'PENDING';\n  $('dv-v').className = 'verdict-big vPENDING';\n  $('dv-sc').textContent = '?';\n  $('dv-vr').textContent = 'Not yet underwritten';\n  show('pending-card', true);\n  show('loading-state', false);\n  show('uw-content', false);\n  const n = document.getElementById('stale-uw-notice');\n  if (n) n.remove();\n}\n\n// ── TABS ───────────────────────────────────────────────────────────────────────\nlet curTab = 'overview'; // tracks which tab is active for chat context\nfunction switchTab(name) {\n  curTab = name;\n  document.querySelectorAll('.stab').forEach(t => t.classList.toggle('on', t.dataset.t === name));\n  document.querySelectorAll('.tc').forEach(t => t.classList.remove('active'));\n  const el = $('t-' + name);\n  if (el) el.classList.add('active');\n  if (name === 'property' && curDeal) fillPropTab(curDeal);\n}\ndocument.querySelectorAll('.stab').forEach(t => {\n  t.addEventListener('click', () => switchTab(t.dataset.t));\n});\n\n// ── UNDERWRITE ─────────────────────────────────────────────────────────────────\n$('btn-uw').addEventListener('click', () => doUnderwrite(false, false));\n$('btn-uw-now').addEventListener('click', () => doUnderwrite(false, false));\n$('btn-deep').addEventListener('click', () => doUnderwrite(true, true));\n$('btn-reuw').addEventListener('click', () => doUnderwrite(true, false));\n\n$('btn-regen')?.addEventListener('click', async () => {\n  if (!curUW) return;\n  const uid = encodeURIComponent(curUW.uid);\n  const btn = $('btn-regen');\n  if (btn) { btn.textContent = 'Running...'; btn.disabled = true; }\n  try {\n    const r = await fetch(`/api/regen-verdict/${uid}`, {\n      method: 'POST', headers: { 'x-urban-token': TOKEN }\n    });\n    if (r.ok) {\n      const d = await r.json();\n      if (curUW) { curUW.verdict = d.verdict; curUW.score = d.score; curUW.verdictReason = d.verdictReason; curUW.recommendation = d.recommendation; curUW.offerStrategy = d.offerStrategy; }\n      renderUW(curUW);\n    }\n  } catch(e) {}\n  if (btn) { btn.textContent = '⚡ Regen'; btn.disabled = false; }\n});\n\nasync function doUnderwrite(force, deep) {\n  if (!curDeal) return;\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  show('pending-card', false);\n  show('uw-content', false);\n  show('loading-state', true);\n  $('load-msg').textContent = deep ? '🔬 Deep underwriting with Sonnet 4...' : '⚡ Fetching comps and underwriting...';\n\n  try {\n    // Always send full deal data as fallback so server doesn't need sheet lookup\n    const r = await fetch(`/api/underwrite/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ forceRefresh: force, deep, dealData: curDeal })\n    });\n\n    if (!r.ok && !r.headers.get('content-type')?.includes('event-stream')) {\n      show('loading-state', false);\n      const errText = await r.text().catch(() => 'Unknown error');\n      console.error('Underwrite HTTP error:', r.status, errText.slice(0, 200));\n      alert('Underwrite failed (HTTP ' + r.status + '). Check console.');\n      return;\n    }\n\n    const reader = r.body.getReader(), dec = new TextDecoder();\n    let buf = '', uwReceived = false;\n    while (true) {\n      const { done, value } = await reader.read();\n      if (done) break;\n      buf += dec.decode(value, { stream: true });\n      const lines = buf.split('\\n'); buf = lines.pop();\n      for (const line of lines) {\n        if (!line.startsWith('data: ')) continue;\n        try {\n          const data = JSON.parse(line.slice(6));\n          if (data.status) $('load-msg').textContent = data.status;\n          if (data.done && data.underwrite) {\n            uwReceived = true;\n            curUW = data.underwrite;\n            show('loading-state', false);\n            try { renderUW(curUW); } catch(re) { console.error('renderUW err:', re); }\n            doLoadStats();\n            const idx = deals.findIndex(x => x.address === curDeal.address);\n            if (idx >= 0) { deals[idx].underwriteStatus = curUW.verdict; deals[idx].underwriteScore = curUW.score; }\n            renderList();\n          }\n          if (data.error) {\n            const isRL = data.error.includes('rate_limit') || data.error.includes('429');\n            if (isRL) {\n              window._consecutiveRateLimits = (window._consecutiveRateLimits || 0) + 1;\n              // Pause retries for 60 minutes after a rate limit hit\n              window._rateLimitPauseUntil = Date.now() + 60 * 60 * 1000;\n              const msg = '⏳ Anthropic API rate limited — Urban will auto-retry in ~1 hour. Your deals are safe and will underwrite automatically.';\n              if ($('load-msg')) $('load-msg').textContent = msg;\n              show('loading-state', false); // Hide loading, show pending state\n              show('pending-card', true);\n              $('pending-card').querySelector && ($('pending-card').querySelector('h3') || {}).textContent !== undefined &&\n                ($('pending-card').innerHTML = '<h3>⏳ RATE LIMITED</h3><p>Anthropic API limit hit. Urban will auto-retry in ~1 hour.</p><button class=\"btn primary\" id=\"btn-uw-now\">⚡ Try Now</button>');\n              document.getElementById('btn-uw-now')?.addEventListener('click', () => { window._rateLimitPauseUntil = 0; autoUnderwritePending(); });\n            } else {\n              show('loading-state', false);\n              $('load-msg').textContent = '⚠️ ' + data.error + ' — try Re-run';\n              setTimeout(() => show('loading-state', false), 3000);\n            }\n            console.error('Underwrite error from server:', data.error);\n          }\n        } catch(pe) { /* ignore malformed SSE lines */ }\n      }\n    }\n    // If stream ended without a done event, show error\n    if (!uwReceived) {\n      show('loading-state', false);\n      $('load-msg').textContent = '⚠️ No result received — try Re-run';\n    }\n  } catch(e) {\n    show('loading-state', false);\n    console.error('doUnderwrite exception:', e);\n    alert('Error: ' + e.message);\n  }\n}\n\n// ── RENDER UNDERWRITE ──────────────────────────────────────────────────────────\n// ── GLOBAL SAFE DOM HELPERS ──────────────────────────────────────────────────\nconst set = (id, val, prop = 'textContent') => { const el = document.getElementById(id); if (el) el[prop] = val; };\nconst cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = c; };\nconst show = (id, visible, displayVal) => { const el = document.getElementById(id); if (el) el.style.display = visible ? (displayVal || 'block') : 'none'; };\n\nfunction renderUW(uw) {\n  if (!uw) return;\n  show('pending-card', false);\n  show('loading-state', false);\n  show('uw-content', true);\n  switchTab('overview');\n\n  const v = uw.verdict || 'REVIEW';\n  const vc = v.replace(/\\s/g,'').toUpperCase();\n  set('dv-v', v);\n  cls('dv-v', `verdict-big v${vc}`);\n  set('dv-sc', uw.score || '?');\n  set('dv-vr', uw.verdictReason || '');\n\n  // OVERVIEW\n  const profit = uw.financials?.netProfitAtAsking;\n  const arvPpsf2 = uw.arv?.arvPerSqft || (uw.arv?.urbanARV && curDeal?.sqft ? Math.round(uw.arv.urbanARV / parseFloat(curDeal.sqft)) : null);\n  set('ov-arv', fmt(uw.arv?.urbanARV) + (arvPpsf2 ? ` (${arvPpsf2}/sf)` : ''));\n  set('ov-rehab', fmt(uw.rehab?.urbanEstimate));\n  set('ov-mao', fmt(uw.financials?.mao));\n  set('ov-ask', fmt(curDeal?.askingPrice));\n  const ask2 = parseFloat(curDeal?.askingPrice) || 0;\n  const profitMin = ask2 >= 1000000 ? 100000 : Math.max(ask2 * 0.10, 20000);\n  const profitPct = ask2 > 0 ? (profit / ask2 * 100).toFixed(1) : null;\n  const profitStr = profit != null ? fmt(profit) + (profitPct ? ` (${profitPct}%)` : '') : '—';\n  set('ov-profit', profitStr);\n  cls('ov-profit', `mv ${profit >= profitMin ? 'g' : profit >= 0 ? 'y' : 'r'}`);\n  const wsArvVal = uw.arv?.wholesalerARV;\n  set('ov-warv', wsArvVal && wsArvVal > 0 ? fmt(wsArvVal) : 'Not provided');\n  const diff = (uw.arv?.wholesalerARV||0) - (uw.arv?.urbanARV||0);\n  const wsArv = uw.arv?.wholesalerARV || 0;\n  const arvDiffText = !wsArv\n    ? 'No wholesaler ARV provided'\n    : diff > 10000 ? `Wholesaler inflated by ${fmt(diff)}`\n    : diff < -10000 ? `Wholesaler undervalued — upside ${fmt(Math.abs(diff))}`\n    : 'Matches Urban';\n  set('ov-arvdiff', arvDiffText);\n  cls('ov-arvdiff', `mv ${diff > 10000 ? 'r' : diff < -10000 ? 'g' : ''}`);\n  const cred = uw.wholesalerCredibility?.assessment || 'UNKNOWN';\n  set('ov-cred', cred);\n  cls('ov-cred', `mv ${cred==='TRUSTED'?'g':cred==='QUESTIONABLE'?'y':'mu'}`);\n  set('ov-trend', uw.marketAnalysis?.trend || '—');\n  set('ov-hold', uw.financials?.holdMonths ? `${uw.financials.holdMonths} months` : '—');\n  const profMinPct = ask2 >= 1000000 ? '$100K' : Math.max(Math.round((ask2||0)*0.1/1000)*1000, 20000).toLocaleString();\n  set('cc-profit', uw.financials?.meetsMinimumProfit ? '✅ Yes (≥10%)' : '❌ No (need 10%)');\n  cls('cc-profit', `mv ${uw.financials?.meetsMinimumProfit ? 'g' : 'r'}`);\n  const inMkt = ['pasco','hillsborough','polk','pinellas','hernando'].some(c => (curDeal?.county||'').toLowerCase().includes(c));\n  set('cc-mkt', inMkt ? '✅ In Market' : '⚠️ Extended');\n  cls('cc-mkt', `mv ${inMkt ? 'g' : 'y'}`);\n  const flood = curDeal?.floodZone;\n  const hasFlood = flood && !['no','n/a','','none','x'].includes((flood||'').toLowerCase());\n  set('cc-flood', hasFlood ? `⚠️ ${flood}` : '✅ None');\n  cls('cc-flood', `mv ${hasFlood ? 'r' : 'g'}`);\n  const highFlags = (uw.riskFlags||[]).filter(f => f.severity==='HIGH').length;\n  set('cc-risk', highFlags > 0 ? `⚠️ ${highFlags} High` : '✅ Low');\n  cls('cc-risk', `mv ${highFlags > 0 ? 'r' : 'g'}`);\n  set('cc-scope', uw.rehab?.scopeLevel || '—');\n  const recEl = $('ov-rec');\n  if (recEl) {\n    recEl.textContent = uw.recommendation || 'No recommendation yet — underwrite this deal to generate one.';\n    recEl.style.color = uw.recommendation ? '' : 'var(--muted)';\n  }\n  const offEl = $('ov-off');\n  if (offEl) {\n    offEl.textContent = uw.offerStrategy || '';\n    const offStr = offEl.closest('.off-str');\n    if (offStr) offStr.style.display = uw.offerStrategy ? '' : 'none';\n  }\n\n  // ARV TAB\n  set('arv-ws', fmt(uw.arv?.wholesalerARV));\n  set('arv-ur', fmt(uw.arv?.urbanARV));\n  const arvDnText = !wsArv\n    ? 'Wholesaler provided no ARV — Urban estimated independently from comps'\n    : diff > 1000 ? `Wholesaler is ${fmt(diff)} (${((diff/(uw.arv?.urbanARV||1))*100).toFixed(1)}%) ABOVE Urban TRUE ARV — INFLATED`\n    : diff < -1000 ? `Wholesaler is ${fmt(Math.abs(diff))} BELOW Urban's ARV — potential upside`\n    : `Wholesaler ARV matches Urban (${fmt(diff)} variance)`;\n  set('arv-dn', arvDnText);\n  set('arv-conf', ac);\n  cls('arv-conf', `conf conf-${ac}`);\n  set('arv-notes', uw.arv?.arvNotes || (uw._isPartial ? '⚡ Hit Underwrite for full ARV analysis with live comps and detailed reasoning.' : ''));\n  const compsTb = $('comps-body');\n  if (compsTb) compsTb.innerHTML = '';\n  // Use structured comps if available, else parse arvCompsUsed strings\n  const allComps = (uw.comps||[]).length > 0 ? (uw.comps||[]) : \n    (uw.arv?.compsUsed||[]).map(s => {\n      // Parse \"6785 21st Way S, Pinellas (1935sf 4bd/2ba, $385K, CCG database)\"\n      const priceMatch = s.match(/\\$([\\d.]+)K/i);\n      const sqftMatch = s.match(/(\\d+)sf/);\n      const bedsBathsMatch = s.match(/(\\d+)bd\\/(\\d+)ba/);\n      const addrMatch = s.match(/^([^(]+)/);\n      return {\n        address: (addrMatch?.[1]||s).trim(),\n        sold_price: priceMatch ? parseInt(priceMatch[1]) * 1000 : 0,\n        sqft: sqftMatch ? parseInt(sqftMatch[1]) : 0,\n        beds: bedsBathsMatch ? parseInt(bedsBathsMatch[1]) : 0,\n        baths: bedsBathsMatch ? parseInt(bedsBathsMatch[2]) : 0,\n        source: s.includes('CCG') ? 'CCG DB' : s.includes('Redfin') ? 'Redfin' : 'Urban'\n      };\n    });\n  if (compsTb) {\n    allComps.forEach(c => {\n      // Handle both Redfin API fields (salePrice/saleDate) and DB fields (sold_price/sold_date)\n      const price = c.salePrice || c.sold_price || 0;\n      const date  = (c.saleDate || c.sold_date || '').slice(0,10);\n      const ppsf  = c.ppsf ? Math.round(parseFloat(c.ppsf)) : (price && c.sqft ? Math.round(price/c.sqft) : null);\n      const pool  = c.pool === true ? '🏊' : '';\n      const yr    = c.year_built || '';\n      const src   = (c.source||'').includes('HCPA') ? '🏛️' : (c.source||'').includes('PCPAO') ? '🏛️' : '🔴';\n      const tr = document.createElement('tr');\n      tr.innerHTML = `\n        <td style=\"font-size:11px\">${pool} ${c.address||'—'}</td>\n        <td>${c.beds||'?'}bd / ${c.baths||'?'}ba</td>\n        <td>${c.sqft ? parseInt(c.sqft).toLocaleString() : '—'}</td>\n        <td>${yr || '—'}</td>\n        <td class=\"p\" style=\"color:var(--gold);font-weight:600\">${fmt(price)}</td>\n        <td style=\"color:var(--muted)\">${ppsf ? '$'+ppsf+'/sf' : '—'}</td>\n        <td style=\"color:var(--muted);font-size:11px\">${date}</td>\n        <td title=\"${c.source||''}\">${src}</td>`;\n      compsTb.appendChild(tr);\n    });\n    if (!uw.comps?.length) compsTb.innerHTML = '<tr><td colspan=\"8\" style=\"color:var(--muted);text-align:center;padding:20px;font-size:12px\">No comps in DB — Urban ARV derived from Florida market benchmarks<br><small>Hit ⚡ Underwrite to fetch live comps from MLS</small></td></tr>';\n  }\n\n  // REHAB TAB\n  const sl = (uw.rehab?.scopeLevel||'').toUpperCase();\n  const sc = sl.includes('FULL')?'FULL':sl.includes('LIGHT')?'LIGHT':'MEDIUM';\n  const rehabScopeEl = $('rehab-scope');\n  if (rehabScopeEl) rehabScopeEl.innerHTML = `<div class=\"scope-tag sc-${sc}\">${uw.rehab?.scopeLevel||'MEDIUM'} · ${uw.financials?.holdMonths||5} Month Hold</div>`;\n  const liEl = $('rehab-li');\n  if (liEl) liEl.innerHTML = '';\n  const items = uw.rehab?.lineItems || {};\n  let tot = 0;\n  if (liEl) {\n    if (!Object.keys(items).length) {\n      liEl.innerHTML = '<div style=\"color:var(--muted);font-size:12px;padding:16px;text-align:center;border:1px dashed var(--border2);border-radius:6px\">No line items in this underwrite.<br><span style=\"font-size:11px;opacity:.7\">Hit <strong style=\\\"color:var(--gold)\\\">⚡ Underwrite</strong> for itemized breakdown.</span></div>';\n    }\n    Object.entries(items).forEach(([k, vv]) => {\n      if (!vv) return; tot += vv;\n      liEl.innerHTML += `<div class=\"rr\"><span class=\"rn\">${k.replace(/_/g,' ')}</span><span class=\"rv\">${fmt(vv)}</span></div>`;\n    });\n    liEl.innerHTML += `<div class=\"rt\"><span class=\"rn\">TOTAL</span><span class=\"rv\">${fmt(tot)}</span></div>`;\n  }\n  const rng = uw.rehab?.urbanEstimateRange;\n  set('rehab-rng', rng ? `Range: ${fmt(rng.low)} – ${fmt(rng.high)}` : '');\n  set('rehab-notes', uw.rehab?.notes || '');\n  set('rehab-miss', uw.rehab?.missingInfo ? `⚠️ Missing: ${uw.rehab.missingInfo}` : '');\n  set('rh-ws', uw.rehab?.wholesalerEstimate ? fmt(uw.rehab.wholesalerEstimate) : 'Not provided');\n  set('rh-ur', fmt(uw.rehab?.urbanEstimate));\n  const rc = uw.rehab?.confidence || 'MEDIUM';\n  { const _e_rh_conf = $('rh-conf'); if (_e_rh_conf) _e_rh_conf.innerHTML = `<span class=\"conf conf-${rc}\">${rc}</span>`; }\n\n  // FINANCIALS TAB\n  const f = uw.financials || {};\n  set('fi-ask', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-arv', fmt(uw.arv?.urbanARV));\n  set('fi-reh', fmt(uw.rehab?.urbanEstimate));\n  set('fi-mao', fmt(f.mao));\n  const oum = f.overUnderMAO;\n  set('fi-oum', oum != null ? `${oum>0?'+':''}${fmt(oum)} ${oum>0?'over':'under'} MAO` : '—');\n  cls('fi-oum', `fv ${oum>0?'r':'g'}`);\n  set('fi-loan', fmt(f.hardMoney?.loanAmount));\n  set('fi-mo', fmt(f.hardMoney?.monthlyPayment));\n  set('fi-hold', f.holdMonths ? `${f.holdMonths} months` : '—');\n  set('fi-int', fmt(f.hardMoney?.totalInterest));\n  set('fi-pts', fmt(f.hardMoney?.originationPoints));\n  set('fi-pp', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-rh2', fmt(uw.rehab?.urbanEstimate));\n  set('fi-fin', fmt((f.hardMoney?.totalInterest||0) + (f.hardMoney?.originationPoints||0)));\n  set('fi-hc', fmt(f.holdingCosts?.total));\n  set('fi-sc', fmt(f.sellingCosts?.total));\n  set('fi-tot', fmt(f.totalCost));\n  const pa = f.netProfitAtAsking;\n  set('fi-pa', fmt(pa));\n  cls('fi-pa', `fv ${pa>=40000?'g':pa>=0?'':'r'}`);\n  set('fi-pm', fmt(f.netProfitAtMAO));\n  set('fi-roi', f.roi ? `${parseFloat(f.roi).toFixed(1)}%` : '—');\n  set('fi-min', f.meetsMinimumProfit ? '✅ YES' : '❌ NO');\n  cls('fi-min', `fv ${f.meetsMinimumProfit?'g':'r'}`);\n\n  // RENTAL TAB\n  const rn = uw.rental || {};\n  set('rn-rent', rn.marketRent ? fmt(rn.marketRent)+'/mo' : '—');\n  set('rn-gy', pct(rn.grossYield));\n  set('rn-ny', pct(rn.netYield));\n  const cf = rn.cashFlow;\n  set('rn-cf', cf != null ? fmt(cf)+'/mo' : '—');\n  cls('rn-cf', `mv ${cf>=0?'g':'r'}`);\n  set('rn-cap', pct(rn.capRate));\n  set('rn-notes', rn.notes || '');\n  set('rn-worth', rn.worthConsidering ? '✅ Worth considering as rental' : '❌ Flip is stronger exit');\n  cls('rn-worth', `mv ${rn.worthConsidering?'g':'mu'}`);\n\n  // NEW CONSTRUCTION TAB\n  const nc = uw.newConstruction || {};\n  set('nc-lot', fmt(nc.lotValue));\n  set('nc-build', fmt(nc.estimatedBuildCost));\n  set('nc-arv', fmt(nc.estimatedNewARV));\n  set('nc-notes', nc.notes || '');\n\n  // FLAGS TAB\n  const flagEl = $('flags-list');\n  flagEl.innerHTML = '';\n  const flagsEmpty = $('flags-empty');\n  const sortedFlags = (uw.riskFlags||[]).sort((a,b) => ['HIGH','MEDIUM','LOW'].indexOf(a.severity)-['HIGH','MEDIUM','LOW'].indexOf(b.severity));\n  if (flagsEmpty) flagsEmpty.style.display = sortedFlags.length === 0 ? '' : 'none';\n  sortedFlags.forEach(f => {\n      flagEl.innerHTML += `<div class=\"flag flag-${f.severity}\"><div class=\"fn\">⚑ ${f.flag} · ${f.severity}</div><div class=\"fd\">${f.detail}</div></div>`;\n    });\n  if (!uw.riskFlags?.length) flagEl.innerHTML = '<div style=\"color:var(--muted);font-size:13px;padding:20px;text-align:center\">No risk flags identified</div>';\n\n  // NEGOTIATION LADDER\n  const ladder = uw.negotiationLadder;\n  const ladderEl = $('neg-ladder');\n  if (ladder?.length) {\n    if (ladderEl) ladderEl.style.display = '';\n    const _nr = $('neg-rows');\n    if (_nr) {\n      _nr.innerHTML = ladder.map(r => {\n        const pc = r.meetsMin ? 'neg-ok' : r.profit >= 0 ? 'neg-no' : 'neg-bad';\n        const lc = r.label === 'Asking' ? 'background:rgba(255,160,32,.15);color:var(--review)' :\n                   r.label === 'MAO'    ? 'background:rgba(60,200,130,.15);color:var(--buy)' :\n                   r.label === 'Stretch'? 'background:rgba(60,120,255,.12);color:#7799ff' : '';\n        return `<div class=\"neg-row\">\n          <span class=\"neg-label\" style=\"${lc}\">${r.label}</span>\n          <span class=\"neg-price\">$${r.price.toLocaleString()}</span>\n          <span class=\"neg-profit ${pc}\">${r.profit >= 0 ? '+' : ''}$${r.profit.toLocaleString()}</span>\n          ${r.roi !== undefined ? `<span class=\"neg-roi\">${r.roi}%</span>` : ''}\n        </div>`;\n      }).join('');\n    }\n  } else {\n    if (ladderEl) ladderEl.style.display = 'none';\n  }\n\n  // EXIT ANALYSIS\n  const ex = uw.exitAnalysis;\n  const exEl = $('exit-analysis');\n  if (ex) {\n    if (exEl) exEl.style.display = '';\n    set('ex-dom', ex.estimatedDOM ? ex.estimatedDOM + ' days' : '—');\n    set('ex-lsr', ex.listToSaleRatio ? (ex.listToSaleRatio * 100).toFixed(0) + '% of list' : '—');\n    set('ex-rsp', ex.realisticSalePrice ? fmt(ex.realisticSalePrice) + (ex.realisticSalePriceNote ? ' (' + ex.realisticSalePriceNote + ')' : '') : '—');\n    const adj = ex.adjustedProfit;\n    set('ex-adj', adj != null ? (adj >= 0 ? '+' : '') + fmt(adj) : '—');\n    cls('ex-adj', `fv ${adj >= 40000 ? 'g' : adj >= 0 ? '' : 'r'}`);\n    set('ex-buyer', ex.buyerProfile || '—');\n  } else { if (exEl) exEl.style.display = 'none'; }\n\n  // CHAT HISTORY\n  renderChat(uw.chatHistory || []);\n}\n\n// ── PROPERTY TAB — ALL SHEET DATA ─────────────────────────────────────────────\nfunction fillPropTab(d) {\n  const el = $('deal-full-info');\n  if (!el) return;\n  const vv = x => (x && x !== '' && x !== '0') ? x : null;\n  const money = x => x && parseFloat(x) ? '$' + parseFloat(x).toLocaleString() : null;\n  const lnk = (url, label) => url ? `<a href=\"${url}\" target=\"_blank\">${label} ↗</a>` : null;\n  const hasFlag = x => x && !['no','n/a','none','x',''].includes((x||'').toLowerCase().trim());\n\n  const prow = (label, val, opts={}) => {\n    if (!val) return '';\n    const cls = opts.warn ? 'warn' : opts.big ? 'big' : opts.pos ? 'pos' : '';\n    return `<div class=\"prow ${cls}\"><div class=\"plbl\">${label}</div><div class=\"pval\">${val}</div></div>`;\n  };\n  const sec = (icon, title, rows) => {\n    const content = rows.filter(Boolean).join('');\n    if (!content) return '';\n    return `<div class=\"fsec\"><div class=\"fst\">${icon} ${title}</div>${content}</div>`;\n  };\n  const note = (label, val, color) => val ? `<div class=\"pnote\" ${color?`style=\"color:${color}\"`:''}><div class=\"pnote-lbl\" ${color?`style=\"color:${color}\"`:''}>${label}</div>${val}</div>` : '';\n\n  el.innerHTML = [\n    sec('📋', 'DEAL INFO', [\n      prow('Date Received', vv(d.dateReceived)),\n      prow('Days Active', vv(d.daysActive)),\n      prow('Expires', vv(d.expires), {warn: !!vv(d.expires)}),\n      prow('Email Subject', vv(d.emailSubject)),\n      prow('List / Source', vv(d.listName)),\n      prow('Photos', vv(d.photosIncluded) ? `${d.photosIncluded} · ${vv(d.photoCount)||'?'} photos` : null),\n    ]),\n    sec('🏠', 'PROPERTY', [\n      prow('Address', `${d.address}<br><small style=\"color:var(--muted)\">${d.city}, ${d.state} ${d.zip} — ${d.county} County</small>`),\n      prow('Subdivision', vv(d.subdivision)),\n      prow('School District', vv(d.schoolDistrict)),\n      prow('Type', vv(d.propertyType)),\n      prow('Beds / Baths', `${vv(d.beds)||'?'} bd · ${vv(d.baths)||'?'} ba${vv(d.halfBaths)?' · '+d.halfBaths+' half':''}`),\n      prow('Sqft', vv(d.sqft) ? parseInt(d.sqft).toLocaleString()+' sqft'+(vv(d.lotSqft)?' · Lot: '+parseInt(d.lotSqft).toLocaleString()+' sqft':'')+(vv(d.lotAcres)?' ('+d.lotAcres+' ac)':'') : null),\n      prow('Year Built', vv(d.yearBuilt)),\n      prow('Stories', vv(d.stories)),\n      prow('Construction', vv(d.construction)),\n      prow('Foundation', vv(d.foundation)),\n      prow('Occupancy', vv(d.occupancy)),\n      prow('Pool', vv(d.pool) ? d.pool+(vv(d.poolNotes)?' — '+d.poolNotes:'') : null),\n      prow('Garage', vv(d.garage) ? d.garage+(vv(d.garageSpaces)?' · '+d.garageSpaces+' spaces':'')+(vv(d.carport)?' · Carport':'') : null),\n      prow('Basement / Attic', [vv(d.basement)&&'Basement: '+d.basement, vv(d.attic)&&'Attic: '+d.attic].filter(Boolean).join(' · ')||null),\n      prow('Flood Zone', hasFlag(d.floodZone) ? d.floodZone : null, {warn: hasFlag(d.floodZone)}),\n      prow('HOA', hasFlag(d.hoa) ? d.hoa+(vv(d.hoaFee)?' — $'+parseFloat(d.hoaFee).toLocaleString()+'/mo':'') : null, {warn: true}),\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Open in Maps')}</div></div>` : '',\n    ]),\n    sec('💰', 'WHOLESALER NUMBERS', [\n      prow('Asking Price', money(d.askingPrice), {big: true}),\n      prow('Wholesaler ARV', money(d.wholesalerARV), {big: true}),\n      prow('Repairs Estimate', money(d.repairsEstimate)||'Not provided'),\n      prow('Assignment Fee', money(d.assignmentFee)),\n      prow('Equity', money(d.equity)),\n      prow('Annual Taxes', money(d.annualTaxes)),\n      prow('Rent (Current)', money(d.rentCurrent)),\n      prow('Rent (Market Est)', money(d.rentMarket)),\n      prow('Close Date', vv(d.closeDate)),\n      prow('Inspection Period', vv(d.inspectionPeriod)),\n      prow('Earnest Money', money(d.earnestMoney)),\n      prow('Financing Terms', vv(d.financingTerms)),\n      prow('Cash Only', vv(d.cashOnly), {warn: (d.cashOnly||'').toLowerCase()==='yes'}),\n    ]),\n    sec('🔧', 'SYSTEMS & CONDITION', [\n      prow('Overall Condition', vv(d.overall_condition), {warn: (d.overall_condition||'').toLowerCase().includes('poor')||(d.overall_condition||'').toLowerCase().includes('bad')}),\n      prow('Roof', [vv(d.roofType),vv(d.roofAge)].filter(Boolean).join(' · ')||null),\n      prow('HVAC / AC', vv(d.acYear)),\n      prow('Water Heater', vv(d.waterHeater)),\n      prow('Electrical', vv(d.electrical)),\n      prow('Plumbing', vv(d.plumbing)),\n      prow('Windows', vv(d.windows)),\n      prow('Flooring', vv(d.flooring)),\n    ]),\n    [vv(d.kitchenNotes),vv(d.bathNotes),vv(d.whatIsUpdated),vv(d.whatNeedsWork),vv(d.highlights),vv(d.redFlags),vv(d.additionalNotes)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">📝 CONDITION NOTES</div>\n      ${note('Kitchen', vv(d.kitchenNotes))}\n      ${note('Bathrooms', vv(d.bathNotes))}\n      ${note('✅ What\\'s Updated', vv(d.whatIsUpdated), 'var(--go)')}\n      ${note('🔨 What Needs Work', vv(d.whatNeedsWork), 'var(--hot)')}\n      ${note('⭐ Highlights', vv(d.highlights), 'var(--go)')}\n      ${note('🚩 Red Flags', vv(d.redFlags), 'var(--hot)')}\n      ${note('Additional Notes', vv(d.additionalNotes))}\n    </div>` : '',\n    [vv(d.comp1),vv(d.comp2),vv(d.comp3)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">🏘️ WHOLESALER COMPS</div>\n      ${note('Comp 1', vv(d.comp1))}\n      ${note('Comp 2', vv(d.comp2))}\n      ${note('Comp 3', vv(d.comp3))}\n    </div>` : '',\n    sec('👤', 'SELLER INFO', [\n      prow('Seller Name', vv(d.sellerName)),\n      prow('Seller Phone', vv(d.sellerPhone)),\n      prow('Situation', vv(d.sellerSituation)),\n      prow('Motivation', vv(d.sellerMotivation)),\n    ]),\n    sec('📞', 'WHOLESALER CONTACT', [\n      prow('Company', vv(d.wholesalerCompany||d.contact1Company)),\n      prow('Contact 1', [vv(d.contact1Name),vv(d.contact1Title)].filter(Boolean).join(' · ')),\n      prow('Phone', [vv(d.contact1Phone),vv(d.contact1Phone2)].filter(Boolean).join(' · ')),\n      prow('Email', vv(d.contact1Email)),\n      vv(d.contact1Website) ? `<div class=\"prow\"><div class=\"plbl\">Website</div><div class=\"pval\">${lnk(d.contact1Website.startsWith('http')?d.contact1Website:'https://'+d.contact1Website, d.contact1Website)}</div></div>` : '',\n      vv(d.contact2Name) ? prow('Contact 2', [vv(d.contact2Name),vv(d.contact2Title),vv(d.contact2Company)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact2Phone) ? prow('Phone 2', [vv(d.contact2Phone),vv(d.contact2Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact3Name) ? prow('Contact 3', [vv(d.contact3Name),vv(d.contact3Phone),vv(d.contact3Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.allPhones) ? prow('All Phones', d.allPhones) : null,\n      vv(d.allEmails) ? prow('All Emails', d.allEmails) : null,\n      vv(d.allNames) ? prow('All Names', d.allNames) : null,\n    ]),\n    sec('🔗', 'LINKS', [\n      `<div class=\"prow\"><div class=\"plbl\">Zillow</div><div class=\"pval\">${d.zillowLink ? lnk(d.zillowLink,'View on Zillow') : lnk('https://www.zillow.com/homes/'+encodeURIComponent(d.address+' '+d.city+' '+d.state)+'_rb/','Search Zillow')}</div></div>`,\n      vv(d.driveLink) ? `<div class=\"prow\"><div class=\"plbl\">Google Drive</div><div class=\"pval\">${lnk(d.driveLink,'Open Drive Folder')}</div></div>` : '',\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Google Maps')}</div></div>` : '',\n      vv(d.allOtherLinks) ? `<div class=\"prow\"><div class=\"plbl\">Other Links</div><div class=\"pval\" style=\"font-size:11px\">${d.allOtherLinks}</div></div>` : '',\n      vv(d.photoLinks) ? `<div class=\"prow\"><div class=\"plbl\">Photos</div><div class=\"pval\" style=\"font-size:11px\">${d.photoLinks}</div></div>` : '',\n    ]),\n  ].join('');\n}\n\n// ── OVERRIDES ─────────────────────────────────────────────────────────────────\n$('btn-ov-arv').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-arv-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'urbanARV', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n$('btn-ov-rehab').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-rehab-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'rehab', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n\n// ── CHAT ──────────────────────────────────────────────────────────────────────\n$('btn-chat').addEventListener('click', () => $('chat-panel').classList.add('open'));\n$('chat-x').addEventListener('click', () => $('chat-panel').classList.remove('open'));\nfunction setAuth(a) {\n  author = a;\n  document.querySelectorAll('.auth-btn').forEach(b => b.classList.toggle('on', b.dataset.a === a));\n}\n$('chat-send').addEventListener('click', doChat);\n$('chat-in').addEventListener('keydown', e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) doChat(); });\n\nasync function doChat() {\n  const msg = $('chat-in').value.trim();\n  if (!msg) return;\n  if (!curDeal) {\n    addMsg('a', '⚠️ No deal selected — click a deal in the list first.');\n    return;\n  }\n\n  // Derive uid from the currently selected deal — always fresh, never stale\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  const address = curDeal.address;\n  const tab = (typeof curTab !== 'undefined' ? curTab : null) || 'overview';\n\n  $('chat-in').value = '';\n  addMsg('u', `${author.toUpperCase()}: ${msg}`);\n\n  // Add thinking bubble and keep reference to it\n  const thinkingEl = document.createElement('div');\n  thinkingEl.className = 'cm a';\n  thinkingEl.innerHTML = `<div class=\"bbl\">⏳ Urban is thinking about ${address}...</div>`;\n  const chatMsgs = $('chat-msgs');\n  chatMsgs.appendChild(thinkingEl);\n  chatMsgs.scrollTop = chatMsgs.scrollHeight;\n\n  try {\n    const r = await fetch(`/api/chat/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ message: msg, author, address, city: curDeal.city, activeTab: tab })\n    });\n\n    // Remove thinking bubble safely\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n\n    if (!r.ok) {\n      const err = await r.json().catch(() => ({ error: `Server error ${r.status}` }));\n      addMsg('a', `⚠️ ${err.error || 'Unknown error'}`);\n      return;\n    }\n\n    const data = await r.json();\n    if (data.reply) addMsg('a', data.reply);\n    else if (data.error) addMsg('a', `⚠️ ${data.error}`);\n\n    // If Urban recalculated numbers, refresh the underwrite panel so UI reflects changes\n    if (data.updated && curDeal) {\n      // Re-fetch the deal's underwrite and refresh the display\n      try {\n        const r2 = await fetch(`/api/underwrite/${encodeURIComponent(data.uid || uid)}/result`, {\n          headers: { 'x-urban-token': TOKEN }\n        });\n        if (r2.ok) {\n          const fresh = await r2.json();\n          curUW = fresh;\n          renderUW(fresh);\n          // Flash the verdict badge to show it changed\n          const badge = document.querySelector('.verdict-badge');\n          if (badge) {\n            badge.style.transition = 'opacity .3s';\n            badge.style.opacity = '0.3';\n            setTimeout(() => badge.style.opacity = '1', 300);\n          }\n        }\n      } catch {}\n    }\n  } catch(e) {\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n    addMsg('a', '⚠️ Could not reach Urban. Check your connection.');\n    console.error('Chat error:', e.message);\n  }\n}\n\nfunction renderChat(history) {\n  const msgs = $('chat-msgs');\n  msgs.innerHTML = '';\n  if (!history?.length) {\n    msgs.innerHTML = (() => {\n    const d = curDeal;\n    if (!d) return '<div style=\"color:var(--muted);font-size:12px;text-align:center;padding:20px\">Select a deal to start chatting with Urban.</div>';\n    return `<div style=\"color:var(--muted);font-size:11px;padding:14px;line-height:1.7;border-bottom:1px solid var(--border);background:var(--bg2)\">\n      <div style=\"font-weight:700;color:var(--text);margin-bottom:6px\">📋 ${d.address}, ${d.city} FL</div>\n      Ask Urban anything. Give better comps, correct the ARV, update repair costs — Urban recalculates everything and remembers your corrections permanently.\n      <div style=\"margin-top:6px;font-size:10px;opacity:.6\">Try: \"The roof was replaced in 2021\" · \"I have a comp at $285K\" · \"What if ARV is $310K?\"</div>\n    </div>`;\n  })();\n    return;\n  }\n  history.forEach(h => addMsg(h.role==='user'?'u':'a', h.content, h.timestamp));\n}\n\nfunction addMsg(role, content, ts) {\n  const msgs = $('chat-msgs');\n  const d = document.createElement('div');\n  d.className = `cm ${role}`;\n  // Parse \"CALEB: \" or \"GRANT: \" prefix for sender label\n  let displayContent = content.replace(/\\n/g,'<br>');\n  let senderLabel = role === 'a' ? 'URBAN' : '';\n  const prefixMatch = content.match(/^(CALEB|GRANT|USER):\\s*/i);\n  if (prefixMatch) {\n    senderLabel = prefixMatch[1].toUpperCase();\n    displayContent = content.slice(prefixMatch[0].length).replace(/\\n/g,'<br>');\n  }\n  const timeStr = ts ? new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';\n  d.innerHTML = `\n    <div class=\"sender\">${senderLabel}${timeStr ? ' · ' + timeStr : ''}</div>\n    <div class=\"bbl\">${displayContent}</div>`;\n  msgs.appendChild(d);\n  msgs.scrollTop = msgs.scrollHeight;\n}\n\n// ── SHEET LINK ─────────────────────────────────────────────────────────────────\n$('btn-sheet').addEventListener('click', () => {\n  window.open('https://docs.google.com/spreadsheets/d/1las1OYRL2ZgIZjq5_K4bcMM9dAhGxgMOBghfyR29ynU', '_blank');\n});\n\n// ── POSTMESSAGE BRIDGE (for testing) ─────────────────────────────────────────\nwindow.addEventListener('message', e => {\n  if (e.data?.action === 'selectDeal' && e.data.index >= 0 && deals[e.data.index]) selectDeal(deals[e.data.index]);\n  if (e.data?.action === 'underwrite') doUnderwrite(true, false);\n  if (e.data?.action === 'deepUnderwrite') doUnderwrite(true, true);\n  if (e.data?.action === 'switchTab') switchTab(e.data.tab);\n  if (e.data?.action === 'getDeals') e.source?.postMessage({ deals: deals.map(d=>({address:d.address,status:d.underwriteStatus})) }, '*');\n});\n</script>\n</body>\n</html>\n  cls('cc-profit', `mv ${uw.financials?.meetsMinimumProfit ? 'g' : 'r'}`);\n  const inMkt = ['pasco','hillsborough','polk','pinellas','hernando'].some(c => (curDeal?.county||'').toLowerCase().includes(c));\n  set('cc-mkt', inMkt ? '✅ In Market' : '⚠️ Extended');\n  cls('cc-mkt', `mv ${inMkt ? 'g' : 'y'}`);\n  const flood = curDeal?.floodZone;\n  const hasFlood = flood && !['no','n/a','','none','x'].includes((flood||'').toLowerCase());\n  set('cc-flood', hasFlood ? `⚠️ ${flood}` : '✅ None');\n  cls('cc-flood', `mv ${hasFlood ? 'r' : 'g'}`);\n  const highFlags = (uw.riskFlags||[]).filter(f => f.severity==='HIGH').length;\n  set('cc-risk', highFlags > 0 ? `⚠️ ${highFlags} High` : '✅ Low');\n  cls('cc-risk', `mv ${highFlags > 0 ? 'r' : 'g'}`);\n  set('cc-scope', uw.rehab?.scopeLevel || '—');\n  const recEl = $('ov-rec');\n  if (recEl) {\n    recEl.textContent = uw.recommendation || 'No recommendation yet — underwrite this deal to generate one.';\n    recEl.style.color = uw.recommendation ? '' : 'var(--muted)';\n  }\n  const offEl = $('ov-off');\n  if (offEl) {\n    offEl.textContent = uw.offerStrategy || '';\n    const offStr = offEl.closest('.off-str');\n    if (offStr) offStr.style.display = uw.offerStrategy ? '' : 'none';\n  }\n\n  // ARV TAB\n  set('arv-ws', fmt(uw.arv?.wholesalerARV));\n  set('arv-ur', fmt(uw.arv?.urbanARV));\n  const arvDnText = !wsArv\n    ? 'Wholesaler provided no ARV — Urban estimated independently from comps'\n    : diff > 1000 ? `Wholesaler is ${fmt(diff)} (${((diff/(uw.arv?.urbanARV||1))*100).toFixed(1)}%) ABOVE Urban TRUE ARV — INFLATED`\n    : diff < -1000 ? `Wholesaler is ${fmt(Math.abs(diff))} BELOW Urban's ARV — potential upside`\n    : `Wholesaler ARV matches Urban (${fmt(diff)} variance)`;\n  set('arv-dn', arvDnText);\n  set('arv-conf', ac);\n  cls('arv-conf', `conf conf-${ac}`);\n  set('arv-notes', uw.arv?.arvNotes || (uw._isPartial ? '⚡ Hit Underwrite for full ARV analysis with live comps and detailed reasoning.' : ''));\n  const compsTb = $('comps-body');\n  if (compsTb) compsTb.innerHTML = '';\n  // Use structured comps if available, else parse arvCompsUsed strings\n  const allComps = (uw.comps||[]).length > 0 ? (uw.comps||[]) : \n    (uw.arv?.compsUsed||[]).map(s => {\n      // Parse \"6785 21st Way S, Pinellas (1935sf 4bd/2ba, $385K, CCG database)\"\n      const priceMatch = s.match(/\\$([\\d.]+)K/i);\n      const sqftMatch = s.match(/(\\d+)sf/);\n      const bedsBathsMatch = s.match(/(\\d+)bd\\/(\\d+)ba/);\n      const addrMatch = s.match(/^([^(]+)/);\n      return {\n        address: (addrMatch?.[1]||s).trim(),\n        sold_price: priceMatch ? parseInt(priceMatch[1]) * 1000 : 0,\n        sqft: sqftMatch ? parseInt(sqftMatch[1]) : 0,\n        beds: bedsBathsMatch ? parseInt(bedsBathsMatch[1]) : 0,\n        baths: bedsBathsMatch ? parseInt(bedsBathsMatch[2]) : 0,\n        source: s.includes('CCG') ? 'CCG DB' : s.includes('Redfin') ? 'Redfin' : 'Urban'\n      };\n    });\n  if (compsTb) {\n    allComps.forEach(c => {\n      // Handle both Redfin API fields (salePrice/saleDate) and DB fields (sold_price/sold_date)\n      const price = c.salePrice || c.sold_price || 0;\n      const date  = (c.saleDate || c.sold_date || '').slice(0,10);\n      const ppsf  = c.ppsf ? Math.round(parseFloat(c.ppsf)) : (price && c.sqft ? Math.round(price/c.sqft) : null);\n      const pool  = c.pool === true ? '🏊' : '';\n      const yr    = c.year_built || '';\n      const src   = (c.source||'').includes('HCPA') ? '🏛️' : (c.source||'').includes('PCPAO') ? '🏛️' : '🔴';\n      const tr = document.createElement('tr');\n      tr.innerHTML = `\n        <td style=\"font-size:11px\">${pool} ${c.address||'—'}</td>\n        <td>${c.beds||'?'}bd / ${c.baths||'?'}ba</td>\n        <td>${c.sqft ? parseInt(c.sqft).toLocaleString() : '—'}</td>\n        <td>${yr || '—'}</td>\n        <td class=\"p\" style=\"color:var(--gold);font-weight:600\">${fmt(price)}</td>\n        <td style=\"color:var(--muted)\">${ppsf ? '$'+ppsf+'/sf' : '—'}</td>\n        <td style=\"color:var(--muted);font-size:11px\">${date}</td>\n        <td title=\"${c.source||''}\">${src}</td>`;\n      compsTb.appendChild(tr);\n    });\n    if (!uw.comps?.length) compsTb.innerHTML = '<tr><td colspan=\"8\" style=\"color:var(--muted);text-align:center;padding:16px\">No comps — Urban estimated from market knowledge</td></tr>';\n  }\n\n  // REHAB TAB\n  const sl = (uw.rehab?.scopeLevel||'').toUpperCase();\n  const sc = sl.includes('FULL')?'FULL':sl.includes('LIGHT')?'LIGHT':'MEDIUM';\n  const rehabScopeEl = $('rehab-scope');\n  if (rehabScopeEl) rehabScopeEl.innerHTML = `<div class=\"scope-tag sc-${sc}\">${uw.rehab?.scopeLevel||'MEDIUM'} · ${uw.financials?.holdMonths||5} Month Hold</div>`;\n  const liEl = $('rehab-li');\n  if (liEl) liEl.innerHTML = '';\n  const items = uw.rehab?.lineItems || {};\n  let tot = 0;\n  if (liEl) {\n    if (!Object.keys(items).length) {\n      liEl.innerHTML = '<div style=\"color:var(--muted);font-size:12px;padding:12px 0\">⚡ Hit Underwrite for full rehab line items.</div>';\n    }\n    Object.entries(items).forEach(([k, vv]) => {\n      if (!vv) return; tot += vv;\n      liEl.innerHTML += `<div class=\"rr\"><span class=\"rn\">${k.replace(/_/g,' ')}</span><span class=\"rv\">${fmt(vv)}</span></div>`;\n    });\n    liEl.innerHTML += `<div class=\"rt\"><span class=\"rn\">TOTAL</span><span class=\"rv\">${fmt(tot)}</span></div>`;\n  }\n  const rng = uw.rehab?.urbanEstimateRange;\n  set('rehab-rng', rng ? `Range: ${fmt(rng.low)} – ${fmt(rng.high)}` : '');\n  set('rehab-notes', uw.rehab?.notes || '');\n  set('rehab-miss', uw.rehab?.missingInfo ? `⚠️ Missing: ${uw.rehab.missingInfo}` : '');\n  set('rh-ws', uw.rehab?.wholesalerEstimate ? fmt(uw.rehab.wholesalerEstimate) : 'Not provided');\n  set('rh-ur', fmt(uw.rehab?.urbanEstimate));\n  const rc = uw.rehab?.confidence || 'MEDIUM';\n  { const _e_rh_conf = $('rh-conf'); if (_e_rh_conf) _e_rh_conf.innerHTML = `<span class=\"conf conf-${rc}\">${rc}</span>`; }\n\n  // FINANCIALS TAB\n  const f = uw.financials || {};\n  set('fi-ask', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-arv', fmt(uw.arv?.urbanARV));\n  set('fi-reh', fmt(uw.rehab?.urbanEstimate));\n  set('fi-mao', fmt(f.mao));\n  const oum = f.overUnderMAO;\n  set('fi-oum', oum != null ? `${oum>0?'+':''}${fmt(oum)} ${oum>0?'over':'under'} MAO` : '—');\n  cls('fi-oum', `fv ${oum>0?'r':'g'}`);\n  set('fi-loan', fmt(f.hardMoney?.loanAmount));\n  set('fi-mo', fmt(f.hardMoney?.monthlyPayment));\n  set('fi-hold', f.holdMonths ? `${f.holdMonths} months` : '—');\n  set('fi-int', fmt(f.hardMoney?.totalInterest));\n  set('fi-pts', fmt(f.hardMoney?.originationPoints));\n  set('fi-pp', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-rh2', fmt(uw.rehab?.urbanEstimate));\n  set('fi-fin', fmt((f.hardMoney?.totalInterest||0) + (f.hardMoney?.originationPoints||0)));\n  set('fi-hc', fmt(f.holdingCosts?.total));\n  set('fi-sc', fmt(f.sellingCosts?.total));\n  set('fi-tot', fmt(f.totalCost));\n  const pa = f.netProfitAtAsking;\n  set('fi-pa', fmt(pa));\n  cls('fi-pa', `fv ${pa>=40000?'g':pa>=0?'':'r'}`);\n  set('fi-pm', fmt(f.netProfitAtMAO));\n  set('fi-roi', f.roi ? `${parseFloat(f.roi).toFixed(1)}%` : '—');\n  set('fi-min', f.meetsMinimumProfit ? '✅ YES' : '❌ NO');\n  cls('fi-min', `fv ${f.meetsMinimumProfit?'g':'r'}`);\n\n  // RENTAL TAB\n  const rn = uw.rental || {};\n  set('rn-rent', rn.marketRent ? fmt(rn.marketRent)+'/mo' : '—');\n  set('rn-gy', pct(rn.grossYield));\n  set('rn-ny', pct(rn.netYield));\n  const cf = rn.cashFlow;\n  set('rn-cf', cf != null ? fmt(cf)+'/mo' : '—');\n  cls('rn-cf', `mv ${cf>=0?'g':'r'}`);\n  set('rn-cap', pct(rn.capRate));\n  set('rn-notes', rn.notes || '');\n  set('rn-worth', rn.worthConsidering ? '✅ Worth considering as rental' : '❌ Flip is stronger exit');\n  cls('rn-worth', `mv ${rn.worthConsidering?'g':'mu'}`);\n\n  // NEW CONSTRUCTION TAB\n  const nc = uw.newConstruction || {};\n  set('nc-lot', fmt(nc.lotValue));\n  set('nc-build', fmt(nc.estimatedBuildCost));\n  set('nc-arv', fmt(nc.estimatedNewARV));\n  set('nc-notes', nc.notes || '');\n\n  // FLAGS TAB\n  const flagEl = $('flags-list');\n  flagEl.innerHTML = '';\n  const flagsEmpty = $('flags-empty');\n  const sortedFlags = (uw.riskFlags||[]).sort((a,b) => ['HIGH','MEDIUM','LOW'].indexOf(a.severity)-['HIGH','MEDIUM','LOW'].indexOf(b.severity));\n  if (flagsEmpty) flagsEmpty.style.display = sortedFlags.length === 0 ? '' : 'none';\n  sortedFlags.forEach(f => {\n      flagEl.innerHTML += `<div class=\"flag flag-${f.severity}\"><div class=\"fn\">⚑ ${f.flag} · ${f.severity}</div><div class=\"fd\">${f.detail}</div></div>`;\n    });\n  if (!uw.riskFlags?.length) flagEl.innerHTML = '<div style=\"color:var(--muted);font-size:13px;padding:20px;text-align:center\">No risk flags identified</div>';\n\n  // NEGOTIATION LADDER\n  const ladder = uw.negotiationLadder;\n  const ladderEl = $('neg-ladder');\n  if (ladder?.length) {\n    if (ladderEl) ladderEl.style.display = '';\n    const _nr = $('neg-rows');\n    if (_nr) {\n      _nr.innerHTML = ladder.map(r => {\n        const pc = r.meetsMin ? 'neg-ok' : r.profit >= 0 ? 'neg-no' : 'neg-bad';\n        const lc = r.label === 'Asking' ? 'background:rgba(255,160,32,.15);color:var(--review)' :\n                   r.label === 'MAO'    ? 'background:rgba(60,200,130,.15);color:var(--buy)' :\n                   r.label === 'Stretch'? 'background:rgba(60,120,255,.12);color:#7799ff' : '';\n        return `<div class=\"neg-row\">\n          <span class=\"neg-label\" style=\"${lc}\">${r.label}</span>\n          <span class=\"neg-price\">$${r.price.toLocaleString()}</span>\n          <span class=\"neg-profit ${pc}\">${r.profit >= 0 ? '+' : ''}$${r.profit.toLocaleString()}</span>\n          ${r.roi !== undefined ? `<span class=\"neg-roi\">${r.roi}%</span>` : ''}\n        </div>`;\n      }).join('');\n    }\n  } else {\n    if (ladderEl) ladderEl.style.display = 'none';\n  }\n\n  // EXIT ANALYSIS\n  const ex = uw.exitAnalysis;\n  const exEl = $('exit-analysis');\n  if (ex) {\n    if (exEl) exEl.style.display = '';\n    set('ex-dom', ex.estimatedDOM ? ex.estimatedDOM + ' days' : '—');\n    set('ex-lsr', ex.listToSaleRatio ? (ex.listToSaleRatio * 100).toFixed(0) + '% of list' : '—');\n    set('ex-rsp', ex.realisticSalePrice ? fmt(ex.realisticSalePrice) + (ex.realisticSalePriceNote ? ' (' + ex.realisticSalePriceNote + ')' : '') : '—');\n    const adj = ex.adjustedProfit;\n    set('ex-adj', adj != null ? (adj >= 0 ? '+' : '') + fmt(adj) : '—');\n    cls('ex-adj', `fv ${adj >= 40000 ? 'g' : adj >= 0 ? '' : 'r'}`);\n    set('ex-buyer', ex.buyerProfile || '—');\n  } else { if (exEl) exEl.style.display = 'none'; }\n\n  // CHAT HISTORY\n  renderChat(uw.chatHistory || []);\n}\n\n// ── PROPERTY TAB — ALL SHEET DATA ─────────────────────────────────────────────\nfunction fillPropTab(d) {\n  const el = $('deal-full-info');\n  if (!el) return;\n  const vv = x => (x && x !== '' && x !== '0') ? x : null;\n  const money = x => x && parseFloat(x) ? '$' + parseFloat(x).toLocaleString() : null;\n  const lnk = (url, label) => url ? `<a href=\"${url}\" target=\"_blank\">${label} ↗</a>` : null;\n  const hasFlag = x => x && !['no','n/a','none','x',''].includes((x||'').toLowerCase().trim());\n\n  const prow = (label, val, opts={}) => {\n    if (!val) return '';\n    const cls = opts.warn ? 'warn' : opts.big ? 'big' : opts.pos ? 'pos' : '';\n    return `<div class=\"prow ${cls}\"><div class=\"plbl\">${label}</div><div class=\"pval\">${val}</div></div>`;\n  };\n  const sec = (icon, title, rows) => {\n    const content = rows.filter(Boolean).join('');\n    if (!content) return '';\n    return `<div class=\"fsec\"><div class=\"fst\">${icon} ${title}</div>${content}</div>`;\n  };\n  const note = (label, val, color) => val ? `<div class=\"pnote\" ${color?`style=\"color:${color}\"`:''}><div class=\"pnote-lbl\" ${color?`style=\"color:${color}\"`:''}>${label}</div>${val}</div>` : '';\n\n  el.innerHTML = [\n    sec('📋', 'DEAL INFO', [\n      prow('Date Received', vv(d.dateReceived)),\n      prow('Days Active', vv(d.daysActive)),\n      prow('Expires', vv(d.expires), {warn: !!vv(d.expires)}),\n      prow('Email Subject', vv(d.emailSubject)),\n      prow('List / Source', vv(d.listName)),\n      prow('Photos', vv(d.photosIncluded) ? `${d.photosIncluded} · ${vv(d.photoCount)||'?'} photos` : null),\n    ]),\n    sec('🏠', 'PROPERTY', [\n      prow('Address', `${d.address}<br><small style=\"color:var(--muted)\">${d.city}, ${d.state} ${d.zip} — ${d.county} County</small>`),\n      prow('Subdivision', vv(d.subdivision)),\n      prow('School District', vv(d.schoolDistrict)),\n      prow('Type', vv(d.propertyType)),\n      prow('Beds / Baths', `${vv(d.beds)||'?'} bd · ${vv(d.baths)||'?'} ba${vv(d.halfBaths)?' · '+d.halfBaths+' half':''}`),\n      prow('Sqft', vv(d.sqft) ? parseInt(d.sqft).toLocaleString()+' sqft'+(vv(d.lotSqft)?' · Lot: '+parseInt(d.lotSqft).toLocaleString()+' sqft':'')+(vv(d.lotAcres)?' ('+d.lotAcres+' ac)':'') : null),\n      prow('Year Built', vv(d.yearBuilt)),\n      prow('Stories', vv(d.stories)),\n      prow('Construction', vv(d.construction)),\n      prow('Foundation', vv(d.foundation)),\n      prow('Occupancy', vv(d.occupancy)),\n      prow('Pool', vv(d.pool) ? d.pool+(vv(d.poolNotes)?' — '+d.poolNotes:'') : null),\n      prow('Garage', vv(d.garage) ? d.garage+(vv(d.garageSpaces)?' · '+d.garageSpaces+' spaces':'')+(vv(d.carport)?' · Carport':'') : null),\n      prow('Basement / Attic', [vv(d.basement)&&'Basement: '+d.basement, vv(d.attic)&&'Attic: '+d.attic].filter(Boolean).join(' · ')||null),\n      prow('Flood Zone', hasFlag(d.floodZone) ? d.floodZone : null, {warn: hasFlag(d.floodZone)}),\n      prow('HOA', hasFlag(d.hoa) ? d.hoa+(vv(d.hoaFee)?' — $'+parseFloat(d.hoaFee).toLocaleString()+'/mo':'') : null, {warn: true}),\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Open in Maps')}</div></div>` : '',\n    ]),\n    sec('💰', 'WHOLESALER NUMBERS', [\n      prow('Asking Price', money(d.askingPrice), {big: true}),\n      prow('Wholesaler ARV', money(d.wholesalerARV), {big: true}),\n      prow('Repairs Estimate', money(d.repairsEstimate)||'Not provided'),\n      prow('Assignment Fee', money(d.assignmentFee)),\n      prow('Equity', money(d.equity)),\n      prow('Annual Taxes', money(d.annualTaxes)),\n      prow('Rent (Current)', money(d.rentCurrent)),\n      prow('Rent (Market Est)', money(d.rentMarket)),\n      prow('Close Date', vv(d.closeDate)),\n      prow('Inspection Period', vv(d.inspectionPeriod)),\n      prow('Earnest Money', money(d.earnestMoney)),\n      prow('Financing Terms', vv(d.financingTerms)),\n      prow('Cash Only', vv(d.cashOnly), {warn: (d.cashOnly||'').toLowerCase()==='yes'}),\n    ]),\n    sec('🔧', 'SYSTEMS & CONDITION', [\n      prow('Overall Condition', vv(d.overall_condition), {warn: (d.overall_condition||'').toLowerCase().includes('poor')||(d.overall_condition||'').toLowerCase().includes('bad')}),\n      prow('Roof', [vv(d.roofType),vv(d.roofAge)].filter(Boolean).join(' · ')||null),\n      prow('HVAC / AC', vv(d.acYear)),\n      prow('Water Heater', vv(d.waterHeater)),\n      prow('Electrical', vv(d.electrical)),\n      prow('Plumbing', vv(d.plumbing)),\n      prow('Windows', vv(d.windows)),\n      prow('Flooring', vv(d.flooring)),\n    ]),\n    [vv(d.kitchenNotes),vv(d.bathNotes),vv(d.whatIsUpdated),vv(d.whatNeedsWork),vv(d.highlights),vv(d.redFlags),vv(d.additionalNotes)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">📝 CONDITION NOTES</div>\n      ${note('Kitchen', vv(d.kitchenNotes))}\n      ${note('Bathrooms', vv(d.bathNotes))}\n      ${note('✅ What\\'s Updated', vv(d.whatIsUpdated), 'var(--go)')}\n      ${note('🔨 What Needs Work', vv(d.whatNeedsWork), 'var(--hot)')}\n      ${note('⭐ Highlights', vv(d.highlights), 'var(--go)')}\n      ${note('🚩 Red Flags', vv(d.redFlags), 'var(--hot)')}\n      ${note('Additional Notes', vv(d.additionalNotes))}\n    </div>` : '',\n    [vv(d.comp1),vv(d.comp2),vv(d.comp3)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">🏘️ WHOLESALER COMPS</div>\n      ${note('Comp 1', vv(d.comp1))}\n      ${note('Comp 2', vv(d.comp2))}\n      ${note('Comp 3', vv(d.comp3))}\n    </div>` : '',\n    sec('👤', 'SELLER INFO', [\n      prow('Seller Name', vv(d.sellerName)),\n      prow('Seller Phone', vv(d.sellerPhone)),\n      prow('Situation', vv(d.sellerSituation)),\n      prow('Motivation', vv(d.sellerMotivation)),\n    ]),\n    sec('📞', 'WHOLESALER CONTACT', [\n      prow('Company', vv(d.wholesalerCompany||d.contact1Company)),\n      prow('Contact 1', [vv(d.contact1Name),vv(d.contact1Title)].filter(Boolean).join(' · ')),\n      prow('Phone', [vv(d.contact1Phone),vv(d.contact1Phone2)].filter(Boolean).join(' · ')),\n      prow('Email', vv(d.contact1Email)),\n      vv(d.contact1Website) ? `<div class=\"prow\"><div class=\"plbl\">Website</div><div class=\"pval\">${lnk(d.contact1Website.startsWith('http')?d.contact1Website:'https://'+d.contact1Website, d.contact1Website)}</div></div>` : '',\n      vv(d.contact2Name) ? prow('Contact 2', [vv(d.contact2Name),vv(d.contact2Title),vv(d.contact2Company)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact2Phone) ? prow('Phone 2', [vv(d.contact2Phone),vv(d.contact2Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact3Name) ? prow('Contact 3', [vv(d.contact3Name),vv(d.contact3Phone),vv(d.contact3Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.allPhones) ? prow('All Phones', d.allPhones) : null,\n      vv(d.allEmails) ? prow('All Emails', d.allEmails) : null,\n      vv(d.allNames) ? prow('All Names', d.allNames) : null,\n    ]),\n    sec('🔗', 'LINKS', [\n      `<div class=\"prow\"><div class=\"plbl\">Zillow</div><div class=\"pval\">${d.zillowLink ? lnk(d.zillowLink,'View on Zillow') : lnk('https://www.zillow.com/homes/'+encodeURIComponent(d.address+' '+d.city+' '+d.state)+'_rb/','Search Zillow')}</div></div>`,\n      vv(d.driveLink) ? `<div class=\"prow\"><div class=\"plbl\">Google Drive</div><div class=\"pval\">${lnk(d.driveLink,'Open Drive Folder')}</div></div>` : '',\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Google Maps')}</div></div>` : '',\n      vv(d.allOtherLinks) ? `<div class=\"prow\"><div class=\"plbl\">Other Links</div><div class=\"pval\" style=\"font-size:11px\">${d.allOtherLinks}</div></div>` : '',\n      vv(d.photoLinks) ? `<div class=\"prow\"><div class=\"plbl\">Photos</div><div class=\"pval\" style=\"font-size:11px\">${d.photoLinks}</div></div>` : '',\n    ]),\n  ].join('');\n}\n\n// ── OVERRIDES ─────────────────────────────────────────────────────────────────\n$('btn-ov-arv').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-arv-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'urbanARV', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n$('btn-ov-rehab').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-rehab-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'rehab', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n\n// ── CHAT ──────────────────────────────────────────────────────────────────────\n$('btn-chat').addEventListener('click', () => $('chat-panel').classList.add('open'));\n$('chat-x').addEventListener('click', () => $('chat-panel').classList.remove('open'));\nfunction setAuth(a) {\n  author = a;\n  document.querySelectorAll('.auth-btn').forEach(b => b.classList.toggle('on', b.dataset.a === a));\n}\n$('chat-send').addEventListener('click', doChat);\n$('chat-in').addEventListener('keydown', e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) doChat(); });\n\nasync function doChat() {\n  const msg = $('chat-in').value.trim();\n  if (!msg) return;\n  if (!curDeal) {\n    addMsg('a', '⚠️ No deal selected — click a deal in the list first.');\n    return;\n  }\n\n  // Derive uid from the currently selected deal — always fresh, never stale\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  const address = curDeal.address;\n  const tab = (typeof curTab !== 'undefined' ? curTab : null) || 'overview';\n\n  $('chat-in').value = '';\n  addMsg('u', `${author.toUpperCase()}: ${msg}`);\n\n  // Add thinking bubble and keep reference to it\n  const thinkingEl = document.createElement('div');\n  thinkingEl.className = 'cm a';\n  thinkingEl.innerHTML = `<div class=\"bbl\">⏳ Urban is thinking about ${address}...</div>`;\n  const chatMsgs = $('chat-msgs');\n  chatMsgs.appendChild(thinkingEl);\n  chatMsgs.scrollTop = chatMsgs.scrollHeight;\n\n  try {\n    const r = await fetch(`/api/chat/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ message: msg, author, address, city: curDeal.city, activeTab: tab })\n    });\n\n    // Remove thinking bubble safely\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n\n    if (!r.ok) {\n      const err = await r.json().catch(() => ({ error: `Server error ${r.status}` }));\n      addMsg('a', `⚠️ ${err.error || 'Unknown error'}`);\n      return;\n    }\n\n    const data = await r.json();\n    if (data.reply) addMsg('a', data.reply);\n    else if (data.error) addMsg('a', `⚠️ ${data.error}`);\n\n    // If Urban recalculated numbers, refresh the underwrite panel so UI reflects changes\n    if (data.updated && curDeal) {\n      // Re-fetch the deal's underwrite and refresh the display\n      try {\n        const r2 = await fetch(`/api/underwrite/${encodeURIComponent(data.uid || uid)}/result`, {\n          headers: { 'x-urban-token': TOKEN }\n        });\n        if (r2.ok) {\n          const fresh = await r2.json();\n          curUW = fresh;\n          renderUW(fresh);\n          // Flash the verdict badge to show it changed\n          const badge = document.querySelector('.verdict-badge');\n          if (badge) {\n            badge.style.transition = 'opacity .3s';\n            badge.style.opacity = '0.3';\n            setTimeout(() => badge.style.opacity = '1', 300);\n          }\n        }\n      } catch {}\n    }\n  } catch(e) {\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n    addMsg('a', '⚠️ Could not reach Urban. Check your connection.');\n    console.error('Chat error:', e.message);\n  }\n}\n\nfunction renderChat(history) {\n  const msgs = $('chat-msgs');\n  msgs.innerHTML = '';\n  if (!history?.length) {\n    msgs.innerHTML = (() => {\n    const d = curDeal;\n    if (!d) return '<div style=\"color:var(--muted);font-size:12px;text-align:center;padding:20px\">Select a deal to start chatting with Urban.</div>';\n    return `<div style=\"color:var(--muted);font-size:11px;padding:14px;line-height:1.7;border-bottom:1px solid var(--border);background:var(--bg2)\">\n      <div style=\"font-weight:700;color:var(--text);margin-bottom:6px\">📋 ${d.address}, ${d.city} FL</div>\n      Ask Urban anything. Give better comps, correct the ARV, update repair costs — Urban recalculates everything and remembers your corrections permanently.\n      <div style=\"margin-top:6px;font-size:10px;opacity:.6\">Try: \"The roof was replaced in 2021\" · \"I have a comp at $285K\" · \"What if ARV is $310K?\"</div>\n    </div>`;\n  })();\n    return;\n  }\n  history.forEach(h => addMsg(h.role==='user'?'u':'a', h.content, h.timestamp));\n}\n\nfunction addMsg(role, content, ts) {\n  const msgs = $('chat-msgs');\n  const d = document.createElement('div');\n  d.className = `cm ${role}`;\n  // Parse \"CALEB: \" or \"GRANT: \" prefix for sender label\n  let displayContent = content.replace(/\\n/g,'<br>');\n  let senderLabel = role === 'a' ? 'URBAN' : '';\n  const prefixMatch = content.match(/^(CALEB|GRANT|USER):\\s*/i);\n  if (prefixMatch) {\n    senderLabel = prefixMatch[1].toUpperCase();\n    displayContent = content.slice(prefixMatch[0].length).replace(/\\n/g,'<br>');\n  }\n  const timeStr = ts ? new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';\n  d.innerHTML = `\n    <div class=\"sender\">${senderLabel}${timeStr ? ' · ' + timeStr : ''}</div>\n    <div class=\"bbl\">${displayContent}</div>`;\n  msgs.appendChild(d);\n  msgs.scrollTop = msgs.scrollHeight;\n}\n\n// ── SHEET LINK ─────────────────────────────────────────────────────────────────\n$('btn-sheet').addEventListener('click', () => {\n  window.open('https://docs.google.com/spreadsheets/d/1las1OYRL2ZgIZjq5_K4bcMM9dAhGxgMOBghfyR29ynU', '_blank');\n});\n\n// ── POSTMESSAGE BRIDGE (for testing) ─────────────────────────────────────────\nwindow.addEventListener('message', e => {\n  if (e.data?.action === 'selectDeal' && e.data.index >= 0 && deals[e.data.index]) selectDeal(deals[e.data.index]);\n  if (e.data?.action === 'underwrite') doUnderwrite(true, false);\n  if (e.data?.action === 'deepUnderwrite') doUnderwrite(true, true);\n  if (e.data?.action === 'switchTab') switchTab(e.data.tab);\n  if (e.data?.action === 'getDeals') e.source?.postMessage({ deals: deals.map(d=>({address:d.address,status:d.underwriteStatus})) }, '*');\n});\n</script>\n</body>\n</html>\n  cls('cc-profit', `mv ${uw.financials?.meetsMinimumProfit ? 'g' : 'r'}`);\n  const inMkt = ['pasco','hillsborough','polk','pinellas','hernando'].some(c => (curDeal?.county||'').toLowerCase().includes(c));\n  set('cc-mkt', inMkt ? '✅ In Market' : '⚠️ Extended');\n  cls('cc-mkt', `mv ${inMkt ? 'g' : 'y'}`);\n  const flood = curDeal?.floodZone;\n  const hasFlood = flood && !['no','n/a','','none','x'].includes((flood||'').toLowerCase());\n  set('cc-flood', hasFlood ? `⚠️ ${flood}` : '✅ None');\n  cls('cc-flood', `mv ${hasFlood ? 'r' : 'g'}`);\n  const highFlags = (uw.riskFlags||[]).filter(f => f.severity==='HIGH').length;\n  set('cc-risk', highFlags > 0 ? `⚠️ ${highFlags} High` : '✅ Low');\n  cls('cc-risk', `mv ${highFlags > 0 ? 'r' : 'g'}`);\n  set('cc-scope', uw.rehab?.scopeLevel || '—');\n  const recEl = $('ov-rec');\n  if (recEl) {\n    recEl.textContent = uw.recommendation || 'No recommendation yet — underwrite this deal to generate one.';\n    recEl.style.color = uw.recommendation ? '' : 'var(--muted)';\n  }\n  const offEl = $('ov-off');\n  if (offEl) {\n    offEl.textContent = uw.offerStrategy || '';\n    const offStr = offEl.closest('.off-str');\n    if (offStr) offStr.style.display = uw.offerStrategy ? '' : 'none';\n  }\n\n  // ARV TAB\n  set('arv-ws', fmt(uw.arv?.wholesalerARV));\n  set('arv-ur', fmt(uw.arv?.urbanARV));\n  const arvDnText = !wsArv\n    ? 'Wholesaler provided no ARV — Urban estimated independently from comps'\n    : diff > 1000 ? `Wholesaler is ${fmt(diff)} (${((diff/(uw.arv?.urbanARV||1))*100).toFixed(1)}%) ABOVE Urban TRUE ARV — INFLATED`\n    : diff < -1000 ? `Wholesaler is ${fmt(Math.abs(diff))} BELOW Urban's ARV — potential upside`\n    : `Wholesaler ARV matches Urban (${fmt(diff)} variance)`;\n  set('arv-dn', arvDnText);\n  set('arv-conf', ac);\n  cls('arv-conf', `conf conf-${ac}`);\n  set('arv-notes', uw.arv?.arvNotes || (uw._isPartial ? '⚡ Hit Underwrite for full ARV analysis with live comps and detailed reasoning.' : ''));\n  const compsTb = $('comps-body');\n  if (compsTb) compsTb.innerHTML = '';\n  // Use structured comps if available, else parse arvCompsUsed strings\n  const allComps = (uw.comps||[]).length > 0 ? (uw.comps||[]) : \n    (uw.arv?.compsUsed||[]).map(s => {\n      // Parse \"6785 21st Way S, Pinellas (1935sf 4bd/2ba, $385K, CCG database)\"\n      const priceMatch = s.match(/\\$([\\d.]+)K/i);\n      const sqftMatch = s.match(/(\\d+)sf/);\n      const bedsBathsMatch = s.match(/(\\d+)bd\\/(\\d+)ba/);\n      const addrMatch = s.match(/^([^(]+)/);\n      return {\n        address: (addrMatch?.[1]||s).trim(),\n        sold_price: priceMatch ? parseInt(priceMatch[1]) * 1000 : 0,\n        sqft: sqftMatch ? parseInt(sqftMatch[1]) : 0,\n        beds: bedsBathsMatch ? parseInt(bedsBathsMatch[1]) : 0,\n        baths: bedsBathsMatch ? parseInt(bedsBathsMatch[2]) : 0,\n        source: s.includes('CCG') ? 'CCG DB' : s.includes('Redfin') ? 'Redfin' : 'Urban'\n      };\n    });\n  if (compsTb) {\n    allComps.forEach(c => {\n      // Handle both Redfin API fields (salePrice/saleDate) and DB fields (sold_price/sold_date)\n      const price = c.salePrice || c.sold_price || 0;\n      const date  = (c.saleDate || c.sold_date || '').slice(0,10);\n      const ppsf  = c.ppsf ? Math.round(parseFloat(c.ppsf)) : (price && c.sqft ? Math.round(price/c.sqft) : null);\n      const pool  = c.pool === true ? '🏊' : '';\n      const yr    = c.year_built || '';\n      const src   = (c.source||'').includes('HCPA') ? '🏛️' : (c.source||'').includes('PCPAO') ? '🏛️' : '🔴';\n      const tr = document.createElement('tr');\n      tr.innerHTML = `\n        <td style=\"font-size:11px\">${pool} ${c.address||'—'}</td>\n        <td>${c.beds||'?'}bd / ${c.baths||'?'}ba</td>\n        <td>${c.sqft ? parseInt(c.sqft).toLocaleString() : '—'}</td>\n        <td>${yr || '—'}</td>\n        <td class=\"p\" style=\"color:var(--gold);font-weight:600\">${fmt(price)}</td>\n        <td style=\"color:var(--muted)\">${ppsf ? '$'+ppsf+'/sf' : '—'}</td>\n        <td style=\"color:var(--muted);font-size:11px\">${date}</td>\n        <td title=\"${c.source||''}\">${src}</td>`;\n      compsTb.appendChild(tr);\n    });\n    if (!uw.comps?.length) compsTb.innerHTML = '<tr><td colspan=\"8\" style=\"color:var(--muted);text-align:center;padding:16px\">No comps — Urban estimated from market knowledge</td></tr>';\n  }\n\n  // REHAB TAB\n  const sl = (uw.rehab?.scopeLevel||'').toUpperCase();\n  const sc = sl.includes('FULL')?'FULL':sl.includes('LIGHT')?'LIGHT':'MEDIUM';\n  const rehabScopeEl = $('rehab-scope');\n  if (rehabScopeEl) rehabScopeEl.innerHTML = `<div class=\"scope-tag sc-${sc}\">${uw.rehab?.scopeLevel||'MEDIUM'} · ${uw.financials?.holdMonths||5} Month Hold</div>`;\n  const liEl = $('rehab-li');\n  if (liEl) liEl.innerHTML = '';\n  const items = uw.rehab?.lineItems || {};\n  let tot = 0;\n  if (liEl) {\n    if (!Object.keys(items).length) {\n      liEl.innerHTML = '<div style=\"color:var(--muted);font-size:12px;padding:12px 0\">⚡ Hit Underwrite for full rehab line items.</div>';\n    }\n    Object.entries(items).forEach(([k, vv]) => {\n      if (!vv) return; tot += vv;\n      liEl.innerHTML += `<div class=\"rr\"><span class=\"rn\">${k.replace(/_/g,' ')}</span><span class=\"rv\">${fmt(vv)}</span></div>`;\n    });\n    liEl.innerHTML += `<div class=\"rt\"><span class=\"rn\">TOTAL</span><span class=\"rv\">${fmt(tot)}</span></div>`;\n  }\n  const rng = uw.rehab?.urbanEstimateRange;\n  set('rehab-rng', rng ? `Range: ${fmt(rng.low)} – ${fmt(rng.high)}` : '');\n  set('rehab-notes', uw.rehab?.notes || '');\n  set('rehab-miss', uw.rehab?.missingInfo ? `⚠️ Missing: ${uw.rehab.missingInfo}` : '');\n  set('rh-ws', uw.rehab?.wholesalerEstimate ? fmt(uw.rehab.wholesalerEstimate) : 'Not provided');\n  set('rh-ur', fmt(uw.rehab?.urbanEstimate));\n  const rc = uw.rehab?.confidence || 'MEDIUM';\n  { const _e_rh_conf = $('rh-conf'); if (_e_rh_conf) _e_rh_conf.innerHTML = `<span class=\"conf conf-${rc}\">${rc}</span>`; }\n\n  // FINANCIALS TAB\n  const f = uw.financials || {};\n  set('fi-ask', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-arv', fmt(uw.arv?.urbanARV));\n  set('fi-reh', fmt(uw.rehab?.urbanEstimate));\n  set('fi-mao', fmt(f.mao));\n  const oum = f.overUnderMAO;\n  set('fi-oum', oum != null ? `${oum>0?'+':''}${fmt(oum)} ${oum>0?'over':'under'} MAO` : '—');\n  cls('fi-oum', `fv ${oum>0?'r':'g'}`);\n  set('fi-loan', fmt(f.hardMoney?.loanAmount));\n  set('fi-mo', fmt(f.hardMoney?.monthlyPayment));\n  set('fi-hold', f.holdMonths ? `${f.holdMonths} months` : '—');\n  set('fi-int', fmt(f.hardMoney?.totalInterest));\n  set('fi-pts', fmt(f.hardMoney?.originationPoints));\n  set('fi-pp', fmt(f.askingPrice || curDeal?.askingPrice));\n  set('fi-rh2', fmt(uw.rehab?.urbanEstimate));\n  set('fi-fin', fmt((f.hardMoney?.totalInterest||0) + (f.hardMoney?.originationPoints||0)));\n  set('fi-hc', fmt(f.holdingCosts?.total));\n  set('fi-sc', fmt(f.sellingCosts?.total));\n  set('fi-tot', fmt(f.totalCost));\n  const pa = f.netProfitAtAsking;\n  set('fi-pa', fmt(pa));\n  cls('fi-pa', `fv ${pa>=40000?'g':pa>=0?'':'r'}`);\n  set('fi-pm', fmt(f.netProfitAtMAO));\n  set('fi-roi', f.roi ? `${parseFloat(f.roi).toFixed(1)}%` : '—');\n  set('fi-min', f.meetsMinimumProfit ? '✅ YES' : '❌ NO');\n  cls('fi-min', `fv ${f.meetsMinimumProfit?'g':'r'}`);\n\n  // RENTAL TAB\n  const rn = uw.rental || {};\n  set('rn-rent', rn.marketRent ? fmt(rn.marketRent)+'/mo' : '—');\n  set('rn-gy', pct(rn.grossYield));\n  set('rn-ny', pct(rn.netYield));\n  const cf = rn.cashFlow;\n  set('rn-cf', cf != null ? fmt(cf)+'/mo' : '—');\n  cls('rn-cf', `mv ${cf>=0?'g':'r'}`);\n  set('rn-cap', pct(rn.capRate));\n  set('rn-notes', rn.notes || '');\n  set('rn-worth', rn.worthConsidering ? '✅ Worth considering as rental' : '❌ Flip is stronger exit');\n  cls('rn-worth', `mv ${rn.worthConsidering?'g':'mu'}`);\n\n  // NEW CONSTRUCTION TAB\n  const nc = uw.newConstruction || {};\n  set('nc-lot', fmt(nc.lotValue));\n  set('nc-build', fmt(nc.estimatedBuildCost));\n  set('nc-arv', fmt(nc.estimatedNewARV));\n  set('nc-notes', nc.notes || '');\n\n  // FLAGS TAB\n  const flagEl = $('flags-list');\n  flagEl.innerHTML = '';\n  const flagsEmpty = $('flags-empty');\n  const sortedFlags = (uw.riskFlags||[]).sort((a,b) => ['HIGH','MEDIUM','LOW'].indexOf(a.severity)-['HIGH','MEDIUM','LOW'].indexOf(b.severity));\n  if (flagsEmpty) flagsEmpty.style.display = sortedFlags.length === 0 ? '' : 'none';\n  sortedFlags.forEach(f => {\n      flagEl.innerHTML += `<div class=\"flag flag-${f.severity}\"><div class=\"fn\">⚑ ${f.flag} · ${f.severity}</div><div class=\"fd\">${f.detail}</div></div>`;\n    });\n  if (!uw.riskFlags?.length) flagEl.innerHTML = '<div style=\"color:var(--muted);font-size:13px;padding:20px;text-align:center\">No risk flags identified</div>';\n\n  // NEGOTIATION LADDER\n  const ladder = uw.negotiationLadder;\n  const ladderEl = $('neg-ladder');\n  if (ladder?.length) {\n    if (ladderEl) ladderEl.style.display = '';\n    const _nr = $('neg-rows');\n    if (_nr) {\n      _nr.innerHTML = ladder.map(r => {\n        const pc = r.meetsMin ? 'neg-ok' : r.profit >= 0 ? 'neg-no' : 'neg-bad';\n        const lc = r.label === 'Asking' ? 'background:rgba(255,160,32,.15);color:var(--review)' :\n                   r.label === 'MAO'    ? 'background:rgba(60,200,130,.15);color:var(--buy)' :\n                   r.label === 'Stretch'? 'background:rgba(60,120,255,.12);color:#7799ff' : '';\n        return `<div class=\"neg-row\">\n          <span class=\"neg-label\" style=\"${lc}\">${r.label}</span>\n          <span class=\"neg-price\">$${r.price.toLocaleString()}</span>\n          <span class=\"neg-profit ${pc}\">${r.profit >= 0 ? '+' : ''}$${r.profit.toLocaleString()}</span>\n          ${r.roi !== undefined ? `<span class=\"neg-roi\">${r.roi}%</span>` : ''}\n        </div>`;\n      }).join('');\n    }\n  } else {\n    if (ladderEl) ladderEl.style.display = 'none';\n  }\n\n  // EXIT ANALYSIS\n  const ex = uw.exitAnalysis;\n  const exEl = $('exit-analysis');\n  if (ex) {\n    if (exEl) exEl.style.display = '';\n    set('ex-dom', ex.estimatedDOM ? ex.estimatedDOM + ' days' : '—');\n    set('ex-lsr', ex.listToSaleRatio ? (ex.listToSaleRatio * 100).toFixed(0) + '% of list' : '—');\n    set('ex-rsp', ex.realisticSalePrice ? fmt(ex.realisticSalePrice) + (ex.realisticSalePriceNote ? ' (' + ex.realisticSalePriceNote + ')' : '') : '—');\n    const adj = ex.adjustedProfit;\n    set('ex-adj', adj != null ? (adj >= 0 ? '+' : '') + fmt(adj) : '—');\n    cls('ex-adj', `fv ${adj >= 40000 ? 'g' : adj >= 0 ? '' : 'r'}`);\n    set('ex-buyer', ex.buyerProfile || '—');\n  } else { if (exEl) exEl.style.display = 'none'; }\n\n  // CHAT HISTORY\n  renderChat(uw.chatHistory || []);\n}\n\n// ── PROPERTY TAB — ALL SHEET DATA ─────────────────────────────────────────────\nfunction fillPropTab(d) {\n  const el = $('deal-full-info');\n  if (!el) return;\n  const vv = x => (x && x !== '' && x !== '0') ? x : null;\n  const money = x => x && parseFloat(x) ? '$' + parseFloat(x).toLocaleString() : null;\n  const lnk = (url, label) => url ? `<a href=\"${url}\" target=\"_blank\">${label} ↗</a>` : null;\n  const hasFlag = x => x && !['no','n/a','none','x',''].includes((x||'').toLowerCase().trim());\n\n  const prow = (label, val, opts={}) => {\n    if (!val) return '';\n    const cls = opts.warn ? 'warn' : opts.big ? 'big' : opts.pos ? 'pos' : '';\n    return `<div class=\"prow ${cls}\"><div class=\"plbl\">${label}</div><div class=\"pval\">${val}</div></div>`;\n  };\n  const sec = (icon, title, rows) => {\n    const content = rows.filter(Boolean).join('');\n    if (!content) return '';\n    return `<div class=\"fsec\"><div class=\"fst\">${icon} ${title}</div>${content}</div>`;\n  };\n  const note = (label, val, color) => val ? `<div class=\"pnote\" ${color?`style=\"color:${color}\"`:''}><div class=\"pnote-lbl\" ${color?`style=\"color:${color}\"`:''}>${label}</div>${val}</div>` : '';\n\n  el.innerHTML = [\n    sec('📋', 'DEAL INFO', [\n      prow('Date Received', vv(d.dateReceived)),\n      prow('Days Active', vv(d.daysActive)),\n      prow('Expires', vv(d.expires), {warn: !!vv(d.expires)}),\n      prow('Email Subject', vv(d.emailSubject)),\n      prow('List / Source', vv(d.listName)),\n      prow('Photos', vv(d.photosIncluded) ? `${d.photosIncluded} · ${vv(d.photoCount)||'?'} photos` : null),\n    ]),\n    sec('🏠', 'PROPERTY', [\n      prow('Address', `${d.address}<br><small style=\"color:var(--muted)\">${d.city}, ${d.state} ${d.zip} — ${d.county} County</small>`),\n      prow('Subdivision', vv(d.subdivision)),\n      prow('School District', vv(d.schoolDistrict)),\n      prow('Type', vv(d.propertyType)),\n      prow('Beds / Baths', `${vv(d.beds)||'?'} bd · ${vv(d.baths)||'?'} ba${vv(d.halfBaths)?' · '+d.halfBaths+' half':''}`),\n      prow('Sqft', vv(d.sqft) ? parseInt(d.sqft).toLocaleString()+' sqft'+(vv(d.lotSqft)?' · Lot: '+parseInt(d.lotSqft).toLocaleString()+' sqft':'')+(vv(d.lotAcres)?' ('+d.lotAcres+' ac)':'') : null),\n      prow('Year Built', vv(d.yearBuilt)),\n      prow('Stories', vv(d.stories)),\n      prow('Construction', vv(d.construction)),\n      prow('Foundation', vv(d.foundation)),\n      prow('Occupancy', vv(d.occupancy)),\n      prow('Pool', vv(d.pool) ? d.pool+(vv(d.poolNotes)?' — '+d.poolNotes:'') : null),\n      prow('Garage', vv(d.garage) ? d.garage+(vv(d.garageSpaces)?' · '+d.garageSpaces+' spaces':'')+(vv(d.carport)?' · Carport':'') : null),\n      prow('Basement / Attic', [vv(d.basement)&&'Basement: '+d.basement, vv(d.attic)&&'Attic: '+d.attic].filter(Boolean).join(' · ')||null),\n      prow('Flood Zone', hasFlag(d.floodZone) ? d.floodZone : null, {warn: hasFlag(d.floodZone)}),\n      prow('HOA', hasFlag(d.hoa) ? d.hoa+(vv(d.hoaFee)?' — $'+parseFloat(d.hoaFee).toLocaleString()+'/mo':'') : null, {warn: true}),\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Open in Maps')}</div></div>` : '',\n    ]),\n    sec('💰', 'WHOLESALER NUMBERS', [\n      prow('Asking Price', money(d.askingPrice), {big: true}),\n      prow('Wholesaler ARV', money(d.wholesalerARV), {big: true}),\n      prow('Repairs Estimate', money(d.repairsEstimate)||'Not provided'),\n      prow('Assignment Fee', money(d.assignmentFee)),\n      prow('Equity', money(d.equity)),\n      prow('Annual Taxes', money(d.annualTaxes)),\n      prow('Rent (Current)', money(d.rentCurrent)),\n      prow('Rent (Market Est)', money(d.rentMarket)),\n      prow('Close Date', vv(d.closeDate)),\n      prow('Inspection Period', vv(d.inspectionPeriod)),\n      prow('Earnest Money', money(d.earnestMoney)),\n      prow('Financing Terms', vv(d.financingTerms)),\n      prow('Cash Only', vv(d.cashOnly), {warn: (d.cashOnly||'').toLowerCase()==='yes'}),\n    ]),\n    sec('🔧', 'SYSTEMS & CONDITION', [\n      prow('Overall Condition', vv(d.overall_condition), {warn: (d.overall_condition||'').toLowerCase().includes('poor')||(d.overall_condition||'').toLowerCase().includes('bad')}),\n      prow('Roof', [vv(d.roofType),vv(d.roofAge)].filter(Boolean).join(' · ')||null),\n      prow('HVAC / AC', vv(d.acYear)),\n      prow('Water Heater', vv(d.waterHeater)),\n      prow('Electrical', vv(d.electrical)),\n      prow('Plumbing', vv(d.plumbing)),\n      prow('Windows', vv(d.windows)),\n      prow('Flooring', vv(d.flooring)),\n    ]),\n    [vv(d.kitchenNotes),vv(d.bathNotes),vv(d.whatIsUpdated),vv(d.whatNeedsWork),vv(d.highlights),vv(d.redFlags),vv(d.additionalNotes)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">📝 CONDITION NOTES</div>\n      ${note('Kitchen', vv(d.kitchenNotes))}\n      ${note('Bathrooms', vv(d.bathNotes))}\n      ${note('✅ What\\'s Updated', vv(d.whatIsUpdated), 'var(--go)')}\n      ${note('🔨 What Needs Work', vv(d.whatNeedsWork), 'var(--hot)')}\n      ${note('⭐ Highlights', vv(d.highlights), 'var(--go)')}\n      ${note('🚩 Red Flags', vv(d.redFlags), 'var(--hot)')}\n      ${note('Additional Notes', vv(d.additionalNotes))}\n    </div>` : '',\n    [vv(d.comp1),vv(d.comp2),vv(d.comp3)].some(Boolean) ? `\n    <div class=\"fsec\"><div class=\"fst\">🏘️ WHOLESALER COMPS</div>\n      ${note('Comp 1', vv(d.comp1))}\n      ${note('Comp 2', vv(d.comp2))}\n      ${note('Comp 3', vv(d.comp3))}\n    </div>` : '',\n    sec('👤', 'SELLER INFO', [\n      prow('Seller Name', vv(d.sellerName)),\n      prow('Seller Phone', vv(d.sellerPhone)),\n      prow('Situation', vv(d.sellerSituation)),\n      prow('Motivation', vv(d.sellerMotivation)),\n    ]),\n    sec('📞', 'WHOLESALER CONTACT', [\n      prow('Company', vv(d.wholesalerCompany||d.contact1Company)),\n      prow('Contact 1', [vv(d.contact1Name),vv(d.contact1Title)].filter(Boolean).join(' · ')),\n      prow('Phone', [vv(d.contact1Phone),vv(d.contact1Phone2)].filter(Boolean).join(' · ')),\n      prow('Email', vv(d.contact1Email)),\n      vv(d.contact1Website) ? `<div class=\"prow\"><div class=\"plbl\">Website</div><div class=\"pval\">${lnk(d.contact1Website.startsWith('http')?d.contact1Website:'https://'+d.contact1Website, d.contact1Website)}</div></div>` : '',\n      vv(d.contact2Name) ? prow('Contact 2', [vv(d.contact2Name),vv(d.contact2Title),vv(d.contact2Company)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact2Phone) ? prow('Phone 2', [vv(d.contact2Phone),vv(d.contact2Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.contact3Name) ? prow('Contact 3', [vv(d.contact3Name),vv(d.contact3Phone),vv(d.contact3Email)].filter(Boolean).join(' · ')) : null,\n      vv(d.allPhones) ? prow('All Phones', d.allPhones) : null,\n      vv(d.allEmails) ? prow('All Emails', d.allEmails) : null,\n      vv(d.allNames) ? prow('All Names', d.allNames) : null,\n    ]),\n    sec('🔗', 'LINKS', [\n      `<div class=\"prow\"><div class=\"plbl\">Zillow</div><div class=\"pval\">${d.zillowLink ? lnk(d.zillowLink,'View on Zillow') : lnk('https://www.zillow.com/homes/'+encodeURIComponent(d.address+' '+d.city+' '+d.state)+'_rb/','Search Zillow')}</div></div>`,\n      vv(d.driveLink) ? `<div class=\"prow\"><div class=\"plbl\">Google Drive</div><div class=\"pval\">${lnk(d.driveLink,'Open Drive Folder')}</div></div>` : '',\n      vv(d.googleMapsLink) ? `<div class=\"prow\"><div class=\"plbl\">Maps</div><div class=\"pval\">${lnk(d.googleMapsLink,'Google Maps')}</div></div>` : '',\n      vv(d.allOtherLinks) ? `<div class=\"prow\"><div class=\"plbl\">Other Links</div><div class=\"pval\" style=\"font-size:11px\">${d.allOtherLinks}</div></div>` : '',\n      vv(d.photoLinks) ? `<div class=\"prow\"><div class=\"plbl\">Photos</div><div class=\"pval\" style=\"font-size:11px\">${d.photoLinks}</div></div>` : '',\n    ]),\n  ].join('');\n}\n\n// ── OVERRIDES ─────────────────────────────────────────────────────────────────\n$('btn-ov-arv').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-arv-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'urbanARV', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n$('btn-ov-rehab').addEventListener('click', async () => {\n  if (!curUW) return;\n  const val = $('ov-rehab-in').value;\n  if (!val) return;\n  const uid = curUW.uid;\n  const r = await fetch(`/api/override/${encodeURIComponent(uid)}`, {\n    method: 'POST', headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n    body: JSON.stringify({ field: 'rehab', value: val, author })\n  });\n  if (r.ok) { curUW = await r.json(); renderUW(curUW); }\n});\n\n// ── CHAT ──────────────────────────────────────────────────────────────────────\n$('btn-chat').addEventListener('click', () => $('chat-panel').classList.add('open'));\n$('chat-x').addEventListener('click', () => $('chat-panel').classList.remove('open'));\nfunction setAuth(a) {\n  author = a;\n  document.querySelectorAll('.auth-btn').forEach(b => b.classList.toggle('on', b.dataset.a === a));\n}\n$('chat-send').addEventListener('click', doChat);\n$('chat-in').addEventListener('keydown', e => { if (e.key==='Enter' && (e.metaKey||e.ctrlKey)) doChat(); });\n\nasync function doChat() {\n  const msg = $('chat-in').value.trim();\n  if (!msg) return;\n  if (!curDeal) {\n    addMsg('a', '⚠️ No deal selected — click a deal in the list first.');\n    return;\n  }\n\n  // Derive uid from the currently selected deal — always fresh, never stale\n  const uid = curDeal.uid || `${curDeal.address}-${curDeal.dateReceived}`;\n  const address = curDeal.address;\n  const tab = (typeof curTab !== 'undefined' ? curTab : null) || 'overview';\n\n  $('chat-in').value = '';\n  addMsg('u', `${author.toUpperCase()}: ${msg}`);\n\n  // Add thinking bubble and keep reference to it\n  const thinkingEl = document.createElement('div');\n  thinkingEl.className = 'cm a';\n  thinkingEl.innerHTML = `<div class=\"bbl\">⏳ Urban is thinking about ${address}...</div>`;\n  const chatMsgs = $('chat-msgs');\n  chatMsgs.appendChild(thinkingEl);\n  chatMsgs.scrollTop = chatMsgs.scrollHeight;\n\n  try {\n    const r = await fetch(`/api/chat/${encodeURIComponent(uid)}`, {\n      method: 'POST',\n      headers: { 'x-urban-token': TOKEN, 'Content-Type': 'application/json' },\n      body: JSON.stringify({ message: msg, author, address, city: curDeal.city, activeTab: tab })\n    });\n\n    // Remove thinking bubble safely\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n\n    if (!r.ok) {\n      const err = await r.json().catch(() => ({ error: `Server error ${r.status}` }));\n      addMsg('a', `⚠️ ${err.error || 'Unknown error'}`);\n      return;\n    }\n\n    const data = await r.json();\n    if (data.reply) addMsg('a', data.reply);\n    else if (data.error) addMsg('a', `⚠️ ${data.error}`);\n\n    // If Urban recalculated numbers, refresh the underwrite panel so UI reflects changes\n    if (data.updated && curDeal) {\n      // Re-fetch the deal's underwrite and refresh the display\n      try {\n        const r2 = await fetch(`/api/underwrite/${encodeURIComponent(data.uid || uid)}/result`, {\n          headers: { 'x-urban-token': TOKEN }\n        });\n        if (r2.ok) {\n          const fresh = await r2.json();\n          curUW = fresh;\n          renderUW(fresh);\n          // Flash the verdict badge to show it changed\n          const badge = document.querySelector('.verdict-badge');\n          if (badge) {\n            badge.style.transition = 'opacity .3s';\n            badge.style.opacity = '0.3';\n            setTimeout(() => badge.style.opacity = '1', 300);\n          }\n        }\n      } catch {}\n    }\n  } catch(e) {\n    if (thinkingEl.parentNode) thinkingEl.parentNode.removeChild(thinkingEl);\n    addMsg('a', '⚠️ Could not reach Urban. Check your connection.');\n    console.error('Chat error:', e.message);\n  }\n}\n\nfunction renderChat(history) {\n  const msgs = $('chat-msgs');\n  msgs.innerHTML = '';\n  if (!history?.length) {\n    msgs.innerHTML = (() => {\n    const d = curDeal;\n    if (!d) return '<div style=\"color:var(--muted);font-size:12px;text-align:center;padding:20px\">Select a deal to start chatting with Urban.</div>';\n    return `<div style=\"color:var(--muted);font-size:11px;padding:14px;line-height:1.7;border-bottom:1px solid var(--border);background:var(--bg2)\">\n      <div style=\"font-weight:700;color:var(--text);margin-bottom:6px\">📋 ${d.address}, ${d.city} FL</div>\n      Ask Urban anything. Give better comps, correct the ARV, update repair costs — Urban recalculates everything and remembers your corrections permanently.\n      <div style=\"margin-top:6px;font-size:10px;opacity:.6\">Try: \"The roof was replaced in 2021\" · \"I have a comp at $285K\" · \"What if ARV is $310K?\"</div>\n    </div>`;\n  })();\n    return;\n  }\n  history.forEach(h => addMsg(h.role==='user'?'u':'a', h.content, h.timestamp));\n}\n\nfunction addMsg(role, content, ts) {\n  const msgs = $('chat-msgs');\n  const d = document.createElement('div');\n  d.className = `cm ${role}`;\n  // Parse \"CALEB: \" or \"GRANT: \" prefix for sender label\n  let displayContent = content.replace(/\\n/g,'<br>');\n  let senderLabel = role === 'a' ? 'URBAN' : '';\n  const prefixMatch = content.match(/^(CALEB|GRANT|USER):\\s*/i);\n  if (prefixMatch) {\n    senderLabel = prefixMatch[1].toUpperCase();\n    displayContent = content.slice(prefixMatch[0].length).replace(/\\n/g,'<br>');\n  }\n  const timeStr = ts ? new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';\n  d.innerHTML = `\n    <div class=\"sender\">${senderLabel}${timeStr ? ' · ' + timeStr : ''}</div>\n    <div class=\"bbl\">${displayContent}</div>`;\n  msgs.appendChild(d);\n  msgs.scrollTop = msgs.scrollHeight;\n}\n\n// ── SHEET LINK ─────────────────────────────────────────────────────────────────\n$('btn-sheet').addEventListener('click', () => {\n  window.open('https://docs.google.com/spreadsheets/d/1las1OYRL2ZgIZjq5_K4bcMM9dAhGxgMOBghfyR29ynU', '_blank');\n});\n\n// ── POSTMESSAGE BRIDGE (for testing) ─────────────────────────────────────────\nwindow.addEventListener('message', e => {\n  if (e.data?.action === 'selectDeal' && e.data.index >= 0 && deals[e.data.index]) selectDeal(deals[e.data.index]);\n  if (e.data?.action === 'underwrite') doUnderwrite(true, false);\n  if (e.data?.action === 'deepUnderwrite') doUnderwrite(true, true);\n  if (e.data?.action === 'switchTab') switchTab(e.data.tab);\n  if (e.data?.action === 'getDeals') e.source?.postMessage({ deals: deals.map(d=>({address:d.address,status:d.underwriteStatus})) }, '*');\n});\n</script>\n</body>\n</html>\n";
const INDEX_PATH = __dirname + '/../public/index.html'; // fallback path
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


async function fetchComps(address, city, state, zip, deal = {}) {
  const _ck = (address + '|' + (zip || city || '')).toLowerCase().trim();
  if (!deal._forceRefreshComps) {
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
      pool:      deal.pool !== undefined ? !!deal.pool             : undefined,
      yearBuilt: deal.year_built ? parseInt(deal.year_built)      : null,
      nbhc:      deal.nbhc       || null,   // Hillsborough neighborhood code
      renovated: deal.renovated  || false,  // true = P60+ comps only (renovated market)
      limit:     20,
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
        console.log('📊 Market data hit for zip', zipKey, '— $' + mktData.median_sold + ' median, $' + mktData.avg_ppsf + '/sqft');
        const synth = [];
        synth._meta = {
          arvEstimate: mktData.median_sold,
          source: 'market_db',
          zip: zipKey,
          city: mktData.city,
          county: mktData.county,
          median_dom: mktData.median_dom,
          avg_ppsf: mktData.avg_ppsf
        };
        DB.saveComps(_ck, { comps: [], _meta: synth._meta }).catch(() => {});
        return synth;
      }
    }
  }

  // ── LIVE COMP FALLBACK CHAIN (free, zero API cost) ─────────────────────────
  // 1. Try Redfin HTML scraper (works unless Redfin blocks datacenter IP)
  let liveComps = await fetchLiveRedfin(zip, deal.beds, deal.sqft, deal.baths);

  // 2. If Redfin failed AND deal is in Hillsborough, try county GIS REST API
  if (liveComps.length < 3 && zip && (deal.county || '').toLowerCase().includes('hillsborough')) {
    console.log('🏛️ Redfin gave 0 comps — trying HCPA GIS REST API...');
    liveComps = await fetchHillsboroughGIS(zip, deal.beds, deal.sqft);
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

  // Rebuild negotiation ladder
  const pts = [asking, Math.round(asking*0.95), Math.round((asking+mao)/2), mao, Math.round(mao*0.9)]
    .filter((p, i, arr) => p > 0 && arr.indexOf(p) === i).sort((a,b) => b-a);
  uw.negotiationLadder = pts.map(price => ({
    price,
    label:    price >= Math.round(asking*0.98) ? 'Asking' : price === mao ? 'MAO' : price < mao ? 'Stretch' : 'Counter',
    profit:   Math.round(arv - price - repairs - costs),
    meetsMin: Math.round(arv - price - repairs - costs) >= 40000,
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
    'Meets $40K min: ' + (profit >= 40000 ? 'YES' : 'NO — ' + (40000 - profit).toLocaleString() + ' short') + '\n' +
    'Prior verdict: ' + (uw.verdict||'?') + ' (' + (uw.score||0) + '/10)\n\n' +
    'Based ONLY on these corrected numbers, give a new verdict, score, reason, and recommendation.\n' +
    'Respond with ONLY valid JSON (no markdown):\n' +
    '{"verdict":"<HOT|BUY|REVIEW|PASS|HARD NO>","score":<1-10>,"verdictReason":"<one sentence>","recommendation":"<2-3 hard sentences with specific numbers>","offerStrategy":"<one sentence on what price to offer>"}';

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
const megamindContext = getMegamindContext(deal, comps);  // All harvested data — hundreds of categories
const relevantLessons = getRelevantLessons(deal);
  const sqft = parseFloat(deal.sqft) || 0;
  const askingPrice = parseFloat(deal.askingPrice) || 0;
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
    arvLine = `WEB COMP DATA: $${meta.arvEstimate.toLocaleString()} (${comps.length} comps found, ${meta.source || 'web'})`;
  }
  // Format comps with full property details so Claude can comp by sqft/beds/baths/pool/ppsf
  const formatComp = (c) => {
    const price = (c.salePrice || c.sold_price || 0).toLocaleString();
    const sqft  = c.sqft  ? `${c.sqft}sf`         : '';
    const beds  = c.beds  ? `${c.beds}bd`          : '';
    const baths = c.baths ? `${c.baths}ba`         : '';
    const yr    = c.year_built ? `${c.year_built}` : '';
    const pool  = c.pool  ? '🏊pool'               : '';
    const ppsf  = c.ppsf  ? `$${Math.round(parseFloat(c.ppsf))}/sf` : '';
    const date  = c.saleDate || c.sold_date || '';
    const addr  = c.address || '(unknown)';
    const src   = c.source ? `[${c.source}]` : '';
    const attrs = [sqft, beds, baths, yr, pool, ppsf].filter(Boolean).join(' · ');
    return `- ${addr}: $${price}${attrs ? ` (${attrs})` : ''} sold ${date} ${src}`.trim();
  };
  const compsText = comps.length > 0
    ? arvLine + '\n' + comps.map(formatComp).join('\n')
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
${_privateComps}

MARKET COMPS (Zillow/web search):
${compsText}

MARKET CONTEXT FOR THIS COUNTY (${deal.county || deal.city}):
${marketContextStr}

Respond ONLY with a JSON object (no markdown, no backticks, just raw JSON).
PUT THESE FIELDS FIRST — they are most important:
{
  "verdict": "<BUY|REVIEW|PASS|HARD NO>",
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

  // STATIC_SYSTEM is cached — reused across all underwrites at 90% off after first call
  const STATIC_SYSTEM = `You are Urban, elite fix-and-flip underwriter for Coralstone Capital Group, Tampa Bay FL.

CRITERIA: Hard money 9.5% IO 90%LTV | MAO=ARV×Repairs | 6% agent+1.5% closing+2pts HML | 4-5mo hold.
PROFIT RULE: askingPrice<$1M → profit must be ≥10% of askingPrice (e.g. $300K ask=$30K min, $400K ask=$40K min, $250K ask=$25K min). askingPrice≥$1M → profit must be ≥$100K. Deals below threshold → HARD NO unless negotiable.

ARV METHODOLOGY — CRITICAL, ALWAYS FOLLOW:
1. urbanARV = P75 of sold comps. ALWAYS commit to a specific dollar amount — never return 0 or null.
2. Florida $/sqft benchmarks (renovated, 2025 — use when limited comps):
   Hillsborough: $165-220/sf | Pasco: $155-210/sf | Pinellas coastal: $180-260/sf, inland: $150-195/sf
   Hernando: $130-175/sf | Polk: $130-165/sf | Orange/Osceola: $155-195/sf | Broward/Dade: $190-285/sf
   Sarasota/Charlotte: $165-235/sf | Lee/Collier: $165-230/sf | Volusia: $145-190/sf | Brevard: $145-185/sf
   Pool premium: +$15-25K | Full rehab: -10-15% from top | Distressed/as-is: -20-25% | New construction area: -5%
3. Always cite your $/sqft reasoning in arvNotes even without direct comps.
4. NEVER anchor to wholesaler ARV. Derive independently from market data.

REPAIR BENCHMARKS (Florida 2025): Roof shingle 1500sf=$8-13K/2000sf=$10-16K | HVAC full=$6-10K/condenser=$3-5K | Kitchen gut=$15-30K/cosmetic=$5-12K | Bath full=$8-18K/half=$5-10K | LVP=$3-6/sf | Repipe=$4-8K | Panel 200A=$2.5-5K | Int paint=$3-6K | Impact windows=$10-25K | Permits=$1.5-4K | Foundation=$8-30K | Septic=$4-10K | Pool resurface=$6-15K. ALWAYS fill lineItems with specific dollar estimates for every applicable category.

HARD NO: profit below threshold, flood zone AE/VE, structural/slab issue, knob-tube wiring, <1000sf, mobile/manufactured, title clouds, condemnation.
BUY CRITERIA: profit ≥10% of askingPrice (if <$1M) OR ≥$100K (if ≥$1M), no hard-no flags, anywhere FL → verdict "BUY".
REVIEW: close but needs negotiation or more info. PASS: technically works but too many issues.
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
    saveJSON(UNDERWRITES_FILE, underwrites);
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
      '- Minimum profit target: $40,000 net after ALL costs (purchase, rehab, holding, financing, selling)',
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
          saveJSON(UNDERWRITES_FILE, underwrites);
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
      model: 'claude-haiku-4-5-20251001', // Switched to Haiku — saves 3x on every chat message
      max_tokens: 1000,
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

      // 5. Regenerate verdict/recommendation/score with updated numbers
      try {
        const updatedUW = await regenerateVerdict(uw);
        if (updatedUW) {
          underwrites[req.params.uid] = updatedUW;
          uw = updatedUW;
          saveJSON(UNDERWRITES_FILE, underwrites);
          DB.saveUnderwrite(req.params.uid, updatedUW).catch(() => {});
          console.log('🔄 Verdict regenerated: ' + updatedUW.verdict + ' (' + updatedUW.score + '/10)');
        }
      } catch(rErr) { console.log('Regen skipped:', rErr.message); }

      // 6. Save to sheet
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
    uw.financials.meetsMinimumProfit = (function(p,a){return a>=1000000?p>=100000:p>=Math.max(a*0.10,20000);})(uw.financials.netProfitAtAsking||0, parseFloat(uw.deal?.askingPrice)||0);
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
        const [uid, verdict, score, address, snapshotJson] = row;
        if (uid && verdict && !underwrites[uid]) {
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
        saveJSON(UNDERWRITES_FILE, underwrites);
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

app.listen(PORT, async () => {
  console.log(`🏙️ Urban on port ${PORT}`);

  // ── DATABASE INIT ──────────────────────────────────────────────────────────
  await DB.initDB().catch(e => console.warn('DB init:', e.message));
  await DB.initCompCache().catch(() => {});
  if (DB.isAvailable()) {
    // Merge Postgres + JSON: JSON already loaded above, DB wins on conflicts
    const fromDB = await DB.getAllUnderwrites().catch(() => ({}));
    const dbCount = Object.keys(fromDB).length;
    if (dbCount > 0) {
      // Merge: DB overwrites JSON for same UIDs, JSON fills gaps DB doesn't have
      const before = Object.keys(underwrites).length;
      Object.assign(underwrites, fromDB); // DB wins on conflict
      console.log('✅ Postgres: ' + dbCount + ' deals | JSON: ' + before + ' | Total: ' + Object.keys(underwrites).length);
      // Migrate JSON-only deals into Postgres
      const jsonOnly = Object.keys(underwrites).filter(uid => !fromDB[uid]);
      if (jsonOnly.length > 0) {
        console.log('📦 Migrating ' + jsonOnly.length + ' JSON-only deals to Postgres...');
        for (const uid of jsonOnly) {
          await DB.saveUnderwrite(uid, underwrites[uid]).catch(() => {});
        }
      }
    } else {
      // Postgres empty or unreachable — migrate JSON → Postgres
      const count = Object.keys(underwrites).length;
      if (count > 0) {
        console.log('📦 Migrating ' + count + ' JSON deals to Postgres...');
        for (const [uid, uw] of Object.entries(underwrites)) {
          await DB.saveUnderwrite(uid, uw).catch(() => {});
        }
        console.log('✅ Migration complete');
      }
    }
  }

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
  }});


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
});

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

    // Find deals without an underwrite
    const pending = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const addr = (row[addrCol] || '').trim();
      if (!addr) continue;
      const uid = uidCol >= 0 ? (row[uidCol] || '').trim() : null;
      const key = uid || addr;
      // Check if already underwritten (has verdict stored)
      const existing = underwrites[key] || Object.values(underwrites).find(u => 
        u.deal?.address?.toLowerCase() === addr.toLowerCase() ||
        (uid && u.deal?.uid === uid)
      );
      if (!existing || !existing.verdict) {
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
        deal.uid = deal.uid || addr;
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
