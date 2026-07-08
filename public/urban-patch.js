(function(){
var _t=setInterval(function(){
  var ab=document.getElementById("add-deal-btn-sidebar");
  var rb=document.getElementById("ref-btn");
  var rw=document.getElementById("rewrite-all-btn");
  if(!ab||!rb||!rw)return;
  clearInterval(_t);
  var w=ab.parentElement;
  if(w){w.style.gap="6px";w.style.padding="0 10px 10px";}
  ab.textContent="+";ab.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rb.innerHTML="&#8635;";rb.title="Refresh";rb.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rw.innerHTML="&#9889;";rw.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  var neg=document.getElementById("neg-ladder");if(neg)neg.remove();
},300);
var _rt=setInterval(function(){
  var btnHN=document.getElementById("btn-hard-no");
  if(!btnHN||document.getElementById("btn-rm"))return;
  var b=document.createElement("button");b.id="btn-rm";
  b.title="Remove from sheet";b.innerHTML="Remove";
  b.style.cssText="background:rgba(180,0,0,.2);border:1px solid rgba(180,0,0,.5);color:#e44;border-radius:6px;cursor:pointer;font-size:11px;padding:5px 8px;margin-left:4px;";
  b.onclick=function(){
    var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
    var uid=window._currentUID||"";
    if(!uid){var h=document.querySelector("[class*=address],[class*=title]");uid=h?h.textContent.trim():"";}
    if(!uid||!confirm("Remove this deal?"))return;
    fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":tok,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})}).then(r=>r.json()).then(d=>{if(d.ok||d.success)location.reload();else alert("Error: "+(d.error||"failed"));}).catch(e=>alert(e.message));
  };
  btnHN.parentElement&&btnHN.parentElement.appendChild(b);
},600);
var _origFetch=window.fetch;
window.fetch=function(){
  var args=arguments;var url=String(args[0]||"");
  var p=_origFetch.apply(this,args);
  if(url.includes("/api/notes")||url.includes("/api/update")||url.includes("/api/chat")||url.includes("/api/regen")){
    p.then(function(r){if(r&&r.ok){setTimeout(function(){
      var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
      if(tok){fetch("/api/deals",{headers:{"x-urban-token":tok}}).then(function(r2){return r2.json();}).then(function(d){if(Array.isArray(d)){window.deals=d;if(typeof renderList==="function")renderList();}}).catch(function(){});}
    },1500);}}).catch(function(){});
  }
  return p;
};
})();