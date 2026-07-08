(function(){
// ── 1. COMPACT BUTTONS + NEG LADDER + DEREK'S SHEET BUTTON ───────────
var _t=setInterval(function(){
  var ab=document.getElementById("add-deal-btn-sidebar");
  var rb=document.getElementById("ref-btn");
  var rw=document.getElementById("rewrite-all-btn");
  if(!ab||!rb||!rw)return;
  clearInterval(_t);
  // Compact wrapper
  var w=ab.parentElement;
  if(w){w.style.gap="6px";w.style.padding="0 10px 10px";}
  // Add Deal icon
  ab.textContent="+";
  ab.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  // Pull button - simple refresh icon, no Derek text
  rb.innerHTML="&#8635;";
  rb.title="Refresh from sheet";
  rb.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  // Rewrite All icon
  rw.innerHTML="&#9889;";
  rw.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  // Remove Negotiation Ladder
  var neg=document.getElementById("neg-ladder");
  if(neg)neg.remove();
  // ── 2. ADD WHOLESALER BUTTON TO SIDEBAR HEADER ───────────────────
  var header=document.querySelector(".sidebar-header,.sh,.logo-area");
  if(!header) header=document.querySelector("h1")&&document.querySelector("h1").closest("div");
  if(header&&!document.getElementById("ws-btn")){
    var wsBtn=document.createElement("button");
    wsBtn.id="ws-btn";
    wsBtn.title="Wholesaler Directory";
    wsBtn.innerHTML="&#128101;";
    wsBtn.style.cssText="background:#111;border:1px solid #333;color:#888;border-radius:6px;cursor:pointer;font-size:16px;height:34px;width:34px;margin-left:4px;";
    wsBtn.onclick=function(){var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"ccg-caleb-K9x4mP2v";window.open("/wholesalers.html?token="+tok,"_blank");};
    header.appendChild(wsBtn);
  }
},300);

// ── 3. REMOVE BUTTON IN DEAL DETAIL ─────────────────────────────────
var _rt=setInterval(function(){
  var btnBar=document.getElementById("btn-hard-no");
  if(!btnBar)return;
  if(document.getElementById("btn-remove-deal"))return;
  var removeBtn=document.createElement("button");
  removeBtn.id="btn-remove-deal";
  removeBtn.title="Remove deal from sheet";
  removeBtn.innerHTML="&#128465;";
  removeBtn.style.cssText="background:rgba(180,0,0,0.2);border:1px solid rgba(180,0,0,0.5);color:#e44;border-radius:6px;cursor:pointer;font-size:14px;padding:6px 10px;";
  removeBtn.onclick=function(){
    var uid=window._currentDealUid||window.currentDealUid;
    if(!uid){var h1=document.querySelector("h2,[class*=\"deal-title\"]");uid=h1&&h1.textContent.trim();}
    if(!uid||!confirm("Remove this deal from the sheet permanently?"))return;
    var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
    fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":tok,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})})
      .then(r=>r.json())
      .then(d=>{if(d.ok||d.success){location.reload();}else{alert("Remove failed: "+(d.error||"unknown"));}})
      .catch(e=>alert("Error: "+e.message));
  };
  btnBar.parentElement&&btnBar.parentElement.appendChild(removeBtn);
},500);

// ── 4. REAL-TIME LIST REFRESH AFTER CHAT ────────────────────────────
var _origFetch=window.fetch;
window.fetch=function(){
  var args=arguments;
  var url=String(args[0]||"");
  var result=_origFetch.apply(this,args);
  if(url.includes("/api/notes")||url.includes("/api/update")||url.includes("/api/chat")||url.includes("/api/regen")){
    result.then(function(resp){
      if(resp.ok){
        setTimeout(function(){
          if(typeof renderList==="function")renderList();
          // Refresh deal data from server
          var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
          if(tok&&typeof loadDeals==="function")loadDeals();
          else if(tok&&window.deals){
            fetch("/api/deals",{headers:{"x-urban-token":tok}}).then(r=>r.json()).then(d=>{
              if(Array.isArray(d)){window.deals=d;if(typeof renderList==="function")renderList();}
            }).catch(function(){});
          }
        },1500);
      }
    }).catch(function(){});
  }
  return result;
};
})();