(function(){
var _t=setInterval(function(){
  var ab=document.getElementById("add-deal-btn-sidebar");
  var rb=document.getElementById("ref-btn");
  var rw=document.getElementById("rewrite-all-btn");
  if(!ab||!rb||!rw)return;
  clearInterval(_t);
  var w=ab.parentElement;
  if(w){w.style.gap="6px";w.style.padding="0 10px 10px";}
  ab.textContent="+";
  ab.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rb.innerHTML="&#8635;";
  rb.title="Pull from Derek's Sheet";
  rb.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rw.innerHTML="&#9889;";
  rw.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  var neg=document.getElementById("neg-ladder");
  if(neg)neg.remove();
  patchRealtimeRefresh();
},300);

var _lastUid="";
setInterval(function(){
  var uid=window.currentDeal&&window.currentDeal.uid;
  if(uid&&uid!==_lastUid){
    _lastUid=uid;
    var existing=document.getElementById("btn-remove-deal");
    if(existing)existing.remove();
    var btnRow=document.querySelector(".action-btns");
    if(!btnRow)return;
    var btn=document.createElement("button");
    btn.id="btn-remove-deal";
    btn.textContent="Remove";
    btn.title="Remove this deal from Urban";
    btn.style.cssText="background:rgba(200,50,50,.1);border:1px solid rgba(200,50,50,.35);color:#cc3344;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;padding:6px 12px;white-space:nowrap;margin-left:6px;";
    btn.onclick=function(){
      if(!confirm("Remove "+uid+" from Urban?"))return;
      fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":window.TOKEN,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok){if(typeof loadDeals==="function")loadDeals();else if(typeof renderList==="function")renderList();}else{alert(d.error||"Error");}})
      .catch(function(e){alert(e.message);});
    };
    btnRow.appendChild(btn);
  }
},600);

function patchRealtimeRefresh(){
  var origFetch=window.fetch;
  window.fetch=function(){
    var args=arguments;
    var url=String(args[0]||"");
    var isUpdate=url.includes("/api/notes")||url.includes("/api/update")||url.includes("/api/verdict")||url.includes("/api/override");
    var p=origFetch.apply(this,args);
    if(isUpdate){p.then(function(r){if(r&&r.ok){setTimeout(function(){if(typeof renderList==="function")renderList();},600);}return r;});}
    return p;
  };
}
})();