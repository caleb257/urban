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
  // Pull button - just the refresh icon, clean look
  rb.innerHTML="&#8635;";
  rb.title="Pull from Derek's Sheet";
  rb.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rw.innerHTML="&#9889;";
  rw.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  var neg=document.getElementById("neg-ladder");
  if(neg)neg.remove();
  // Add remove button to deal detail
  addRemoveButton();
  // Patch real-time deal refresh
  patchRealtimeRefresh();
},300);

function addRemoveButton(){
  var btnRow=document.querySelector(".action-btns,[class*='action']");
  if(!btnRow||document.getElementById("btn-remove-deal"))return;
  var btn=document.createElement("button");
  btn.id="btn-remove-deal";
  btn.textContent="Remove Deal";
  btn.title="Remove this deal from Urban";
  btn.style.cssText="background:rgba(200,50,50,.12);border:1px solid rgba(200,50,50,.4);color:#cc3344;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;padding:6px 10px;white-space:nowrap;";
  btn.onclick=function(){
    var uid=window.currentDeal&&window.currentDeal.uid;
    if(!uid){alert("No deal selected");return;}
    if(!confirm("Remove "+uid+" from Urban? This cannot be undone."))return;
    fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":window.TOKEN,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.ok){
        alert("Deal removed.");
        if(typeof loadDeals==="function")loadDeals();
        else if(typeof renderList==="function")renderList();
      }else{alert("Error: "+(d.error||"Unknown"));}
    }).catch(function(e){alert("Error: "+e.message);});
  };
  btnRow.appendChild(btn);
}

function patchRealtimeRefresh(){
  // When a note is added or deal updated via chat, refresh the deal in the list
  var origFetch=window.fetch;
  window.fetch=function(){
    var args=arguments;
    var url=String(args[0]||"");
    var isUpdate=url.includes("/api/notes")||url.includes("/api/update")||url.includes("/api/verdict")||url.includes("/api/override");
    var promise=origFetch.apply(this,args);
    if(isUpdate){
      promise.then(function(r){
        if(r.ok&&typeof renderList==="function"){
          setTimeout(function(){
            var uid=window.currentDeal&&window.currentDeal.uid;
            if(uid&&typeof loadDeals==="function"){
              loadDeals().then(function(){renderList();});
            }else if(typeof renderList==="function"){
              renderList();
            }
          },500);
        }
        return r;
      });
    }
    return promise;
  };
}

// Re-run addRemoveButton when deal changes
var _lastUid="";
setInterval(function(){
  var uid=window.currentDeal&&window.currentDeal.uid;
  if(uid&&uid!==_lastUid){_lastUid=uid;addRemoveButton();}
},500);
})();