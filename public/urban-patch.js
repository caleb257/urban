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
      var r2=document.getElementById("ref-btn");
      if(r2&&r2.textContent.includes("Derek")){r2.innerHTML="&#8635;";r2.style.cssText+=";font-size:17px;height:34px;line-height:1;";}
      var n2=document.getElementById("neg-ladder");if(n2)n2.remove();
    };
  }
},300);
var _bt=setInterval(function(){
  var sh=document.getElementById("btn-sheet");
  if(!sh)return;
  if(!document.getElementById("btn-share")){
    var sb=document.createElement("button");
    sb.id="btn-share";sb.innerHTML="Share";
    sb.style.cssText=sh.style.cssText||"";sb.className=sh.className||"";
    sb.onclick=async function(){
      var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
      var uid=window._currentUID||"";
      if(!uid)return alert("Select a deal first");
      var d=window.deals&&window.deals.find(function(x){return x.uid===uid;});
      if(!d)return alert("Deal not found");
      var uw={arv:{},financials:{},rehab:{}};
      try{uw=await fetch("/api/underwrite/"+encodeURIComponent(uid),{headers:{"x-urban-token":tok}}).then(function(r){return r.json();});}catch(e){}
      var f=function(n){return n!=null&&!isNaN(n)?"$"+Math.abs(Math.round(n)).toLocaleString("en-US"):"-";};
      var addr=d.address+(d.city?", "+d.city:"")+(d.state?", "+d.state:"")+(d.zip?" "+d.zip:"");
      var pt=(d.propertyType==="Single Family"?"Single Family Residence":d.propertyType||"SFR");
      var bds=d.beds||"";var bth=d.baths||"";
      var sf=d.sqft?Number(d.sqft).toLocaleString("en-US"):"";
      var ask=f(parseFloat(d.askingPrice));
      var reno=f((uw.financials&&uw.financials.rehabBudget)||(uw.rehab&&(uw.rehab.urbanEstimate||uw.rehab.total))||0);
      var arv=f(uw.arv&&uw.arv.urbanARV);
      var pr=uw.financials&&uw.financials.netProfitAtAsking;
      var prStr=pr!=null?(pr<0?"-"+f(Math.abs(pr))+" (LOSS)":"+"+f(pr)):"";
      var url="https://www.zillow.com/homes/"+encodeURIComponent(addr)+"_rb/";
      var txt=[addr,url,pt,(bds&&bth?bds+" Bed / "+bth+" Bath":""),(sf?"Living Space: "+sf+" SqFt":""),"Asking: "+ask,"Reno: "+reno,"ARV: "+arv,"Estimated Profit: "+prStr].filter(Boolean).join("\n");
      try{
        await navigator.clipboard.writeText(txt);
      }catch(e){
        var ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);
      }
      var og=sb.innerHTML;sb.innerHTML="Copied!";sb.style.background="rgba(0,180,0,.25)";
      setTimeout(function(){sb.innerHTML=og;sb.style.background="";},2000);
    };
    sh.parentNode.insertBefore(sb,sh);sh.style.display="none";
  }
  if(!document.getElementById("btn-rm")){
    var hn=document.getElementById("btn-hard-no");
    if(hn){
      var rm=document.createElement("button");rm.id="btn-rm";rm.innerHTML="Remove";
      rm.style.cssText="background:rgba(180,0,0,.2);border:1px solid rgba(180,0,0,.5);color:#e44;border-radius:6px;cursor:pointer;font-size:11px;padding:5px 8px;margin-left:4px;";
      rm.onclick=function(){
        var tok=(location.search.match(/token=([^&]+)/)||[])[1]||"";
        var uid=window._currentUID||"";
        if(!uid||!confirm("Remove this deal from the sheet permanently?"))return;
        fetch("/api/remove-deal",{method:"POST",headers:{"x-urban-token":tok,"Content-Type":"application/json"},body:JSON.stringify({uid:uid})}).then(function(r){return r.json();}).then(function(d){if(d.ok||d.success)location.reload();else alert("Error: "+(d.error||"failed"));}).catch(function(e){alert(e.message);});
      };
      hn.parentElement&&hn.parentElement.appendChild(rm);
    }
  }
},600);
var _sd=null;
function _patchSelect(){
  if(typeof selectDeal==="function"&&selectDeal!==_sd){
    _sd=selectDeal;var _o=selectDeal;
    window.selectDeal=function(uid){window._currentUID=uid;return _o.apply(this,arguments);};
  }
}
setInterval(_patchSelect,400);_patchSelect();
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