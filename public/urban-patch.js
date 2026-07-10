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
  if(typeof renderList==="function"){
    var _rl=renderList;
    window.renderList=function(){
      _rl.apply(this,arguments);
      var rb2=document.getElementById("ref-btn");
      if(rb2&&rb2.textContent.includes("Derek")){rb2.innerHTML="&#8635;";rb2.style.cssText+=";font-size:17px;height:34px;line-height:1;";}
      var neg2=document.getElementById("neg-ladder");if(neg2)neg2.remove();
    };
  }
},300);
var _rt=setInterval(function(){
  var btnHN=document.getElementById("btn-hard-no");
  if(!btnHN||document.getElementById("btn-rm"))return;
  var b=document.createElement("button");b.id="btn-rm";b.title="Remove from sheet";b.innerHTML="Remove";
  b.style.cssText="background:rgba(180,0,0,.2);border:1px solid rgba(180,0,0,.5);color:#e44;border-radius:6px;cursor:pointer;font-size:11px;padding:5px 8px;margin-left:4px;";
  b.onclick=function(){
    var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
    var uid="";
    document.querySelectorAll("[data-uid]").forEach(function(r){if(r.classList.contains("on")||r.classList.contains("active")){uid=r.dataset.uid;}});
    if(!uid){var h=document.querySelector("h2,.deal-address");uid=h?h.textContent.trim():"";}
    if(!uid||!confirm("Remove this deal from the sheet permanently?"))return;
    fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":tok,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})}).then(function(r){return r.json();}).then(function(d){if(d.ok||d.success)location.reload();else alert("Error: "+(d.error||"failed"));}).catch(function(e){alert(e.message);});
  };
  btnHN.parentElement&&btnHN.parentElement.appendChild(b);
},600);
var _of=window.fetch;
window.fetch=function(){
  var args=arguments;var url=String(args[0]||"");
  var p=_of.apply(this,args);
  if(url.includes("/api/notes")||url.includes("/api/update")||url.includes("/api/chat")||url.includes("/api/regen")||url.includes("/api/underwrite")){
    p.then(function(r){if(r&&r.ok){setTimeout(function(){var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";if(!tok)return;fetch("/api/deals",{headers:{"x-urban-token":tok}}).then(function(r2){return r2.json();}).then(function(d){if(Array.isArray(d)){window.deals=d;if(typeof renderList==="function")renderList();}}).catch(function(){});},2000);}}).catch(function(){});
  }
  return p;
};
})();