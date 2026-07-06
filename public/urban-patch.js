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
  rb.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  rw.innerHTML="&#9889;";
  rw.style.cssText+=";font-size:17px;height:34px;line-height:1;";
  var neg=document.getElementById("neg-ladder");
  if(neg)neg.remove();
},300);
})();