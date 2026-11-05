(function(){
"use strict";
const Engine=window.SorgulenPricing, Offer=window.SorgulenOffer;
if(!Engine||!Offer){alert("Kalkylemotoren vart ikkje lasta. Oppdater sida.");return;}
const $=id=>document.getElementById(id);
const escape=Offer.escape;
const fmt=(n,d=0)=>Number(n||0).toLocaleString("nb-NO",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=n=>fmt(n,0)+" kr";
const MAX_ITEMS=8;
const API=(window.CONFIG&&window.CONFIG.API_BASE_URL)||"https://sorgulen-backend-2.onrender.com/api";
const SESSION_KEY="sorgulen_kalkyle_admin_session";
const state={items:[],source:"local",ai:null,summary:"",answered:new Set(),manualAnswers:{},lastDesc:"",calc:null,busy:false};
let opSeq=0;
function keyFor(index,key){return index+":"+key;}
function getKey(){
  try{return sessionStorage.getItem(SESSION_KEY)||localStorage.getItem("sorgulen_admin_key")||"";}catch{return "";}
}
function showMessage(msg,kind){
  const box=$("message");if(!msg){box.hidden=true;box.textContent="";return;}
  box.hidden=false;box.className="feedback"+(kind?" "+kind:"");box.textContent=msg;
}
function setConnection(){
  const yes=Boolean(getKey());
  $("aiPill").classList.toggle("connected",yes);
  $("aiLabel").textContent=yes?"AI tilkopla":"AI krev admin";
  $("accessBtn").textContent=yes?"AI tilkopla ✓":"AI-tilgang";
  $("analysisHint").textContent=yes?"AI stiller relevante oppfølgingsspørsmål. Utrekninga blir kontrollert av kalkylemotoren.":"Logg inn for ekte AI-spørsmål. Du kan også prøve lokal analyse utan innlogging.";
}
function authOpen(){ $("authModal").hidden=false; $("authError").hidden=true; $("authKey").value="";$("authKey").focus(); }
function authClose(){ $("authModal").hidden=true; $("authKey").value=""; }
async function tryAuth(event){
  event.preventDefault();
  const key=$("authKey").value.trim();
  if(!key)return;
  $("authSubmit").disabled=true;
  $("authError").hidden=true;
  try{
    const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),12000);
    let res;try{res=await fetch(API+"/admin/ping",{headers:{"x-admin-key":key},signal:ctrl.signal,cache:"no-store"});}finally{clearTimeout(timeout);}
    if(!res.ok)throw new Error(res.status===401||res.status===403?"Admin-nøkkelen vart ikkje godkjend.":"Kunne ikkje verifisere tilgangen.");
    sessionStorage.setItem(SESSION_KEY,key);
    setConnection();authClose();
    showMessage("AI er tilkopla for denne økta. Beskriv jobben og trykk «Analyser oppdraget».","success");
    if($("jobDescription").value.trim().length>=8)await analyzeDescription();
  }catch(err){$("authError").hidden=false;$("authError").textContent=err.name==="AbortError"?"Tilkoplinga tok for lang tid. Prøv igjen.":(err.message||"Innlogging feila.");}
  finally{$("authSubmit").disabled=false;}
}
function describeFromLocal(text){
  const parsed=Engine.infer(text);
  const items=parsed.items.map(x=>({...Engine.makeItem(x.type,x),id:"op-"+(++opSeq)}));
  return {items,source:"local",summary:text.trim().slice(0,450),ai:null};
}
function createAnswersFromDescription(text,items){
  const raw=text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ø/g,"o").replace(/å/g,"a").replace(/æ/g,"ae");
  const found=new Set();
  for(let index=0;index<items.length;index++){
    const op=items[index];
    if(op.quantity>0)found.add(keyFor(index,"quantity"));
    if(op.type==="brostein"){
      if(/ugras|ugress/.test(raw))found.add(keyFor(index,"weeds"));
      if(/fugesand|etterfug|fuging/.test(raw))found.add(keyFor(index,"joints"));
      if(/trappetrinn|\d+ trinn/.test(raw))found.add(keyFor(index,"stairs"));
    }
    if(op.type==="broyting"&&/\d+\s*cm/.test(raw))found.add(keyFor(index,"snow"));
    if(op.type==="trefelling"){
      if(/straumlin|kraftlin|hus|garasje|gjerde|bygning/.test(raw))found.add(keyFor(index,"treeRisk"));
      if(/rydd|kvist|bortkjor/.test(raw))found.add(keyFor(index,"removal"));
    }
  }
  return found;
}
function startWork(data){
  state.items=data.items;
  state.source=data.source;
  state.ai=data.ai;
  state.summary=data.summary;
  state.manualAnswers={};
  state.answered=createAnswersFromDescription(state.lastDesc,state.items);
  if(state.ai && state.items.length){
    const a=state.ai;
    for(const field of Object.keys(a.details||{}))state.answered.add(keyFor(0,field));
    if(a.quantity>0)state.answered.add(keyFor(0,"quantity"));
  }
  $("workArea").hidden=false;
  $("sourceBadge").textContent=state.source==="ai"?"AI har tolka oppdraget":"Lokal tolking";
  $("sourceBadge").classList.toggle("ai",state.source==="ai");
  $("jobSummary").textContent=state.summary||state.lastDesc;
  renderOperations();renderQuestions();updatePrice();
  if(!state.offered){$("offerArea").hidden=true;}
}
function newItem(type,values){
  return {...Engine.makeItem(type,values),id:"op-"+(++opSeq)};
}
function mergeAiWithLocal(local,analysis){
  const a=analysis||{};
  const type=Engine.CATALOG[a.category]?a.category:(local.items[0]?.type||"annet");
  const baseline=local.items.find(x=>x.type===type)||Engine.makeItem(type);
  const aiValues={quantity:a.quantity>0?a.quantity:baseline.quantity,details:{...baseline.details,...a.details}};
  const main=newItem(type,aiValues);
  const rest=local.items.filter(x=>x.type!==type).map(x=>newItem(x.type,x));
  return {items:[main,...rest].slice(0,MAX_ITEMS),source:"ai",summary:a.summary||local.summary,ai:{...a,category:type}};
}
async function askAI(text,local){
  const key=getKey();if(!key)return null;
  const res=await fetch(API+"/admin/kalkyle/analyze",{
    method:"POST",headers:{"Content-Type":"application/json","x-admin-key":key},
    body:JSON.stringify({description:text,category:local.items[0]?.type||"annet"}),
    cache:"no-store"
  });
  let payload={};
  try{payload=await res.json();}catch{}
  if(res.status===401||res.status===403){
    try{sessionStorage.removeItem(SESSION_KEY);}catch{}
    setConnection();
    throw new Error("Admin-tilgangen må fornyast. Trykk «AI-tilgang».");
  }
  if(!res.ok||!payload.ok||!payload.analysis)throw new Error(payload.error||"AI svara ikkje. Lokal analyse er brukt.");
  return mergeAiWithLocal(local,payload.analysis);
}
async function analyzeDescription(){
  const text=$("jobDescription").value.trim();
  if(text.length<8){showMessage("Skriv litt meir om oppdraget først – gjerne kva som skal gjerast og omtrent kor mykje.","error");$("jobDescription").focus();return;}
  if(state.busy)return;
  state.busy=true;state.lastDesc=text;
  const button=$("analyzeBtn");button.disabled=true;$("analyzeButtonLabel").textContent="Analyserer …";
  const local=describeFromLocal(text);
  startWork(local);
  showMessage(getKey()?"Første kalkyle er sett opp. AI finn relevante spørsmål …":"Lokal tolking er klar. For ekte AI-spørsmål kan du velje «AI-tilgang».",getKey()?"loading":"");
  if(getKey()){
    try{
      const enriched=await askAI(text,local);
      if(enriched){startWork(enriched);showMessage("AI har analysert oppdraget. Svar på spørsmåla nedanfor for å finjustere prisen.");}
    }catch(e){showMessage((e.message||"AI er utilgjengeleg.")+" Du kan arbeide vidare med lokal kalkyle.","error");}
  }
  state.busy=false;button.disabled=false;$("analyzeButtonLabel").textContent="Analyser oppdraget";
  $("workArea").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderOperations(){
  const wrap=$("operationList");
  wrap.innerHTML=state.items.map((it,i)=>{
    const cat=Engine.CATALOG[it.type]||Engine.CATALOG.annet;
    return '<div class="operation-chip" data-index="'+i+'"><label>Arbeidstype<select data-op-type="'+i+'">'+Object.entries(Engine.CATALOG).map(([k,v])=>'<option value="'+escape(k)+'"'+(it.type===k?" selected":"")+'>'+escape(v.name)+'</option>').join("")+'</select></label>'+
    '<label>'+(it.type==="annet"?"Timeanslag":"Mengde ("+escape(cat.unit)+")")+'<input data-op-quantity="'+i+'" type="number" min="0" max="100000" step="any" inputmode="decimal" value="'+escape(it.quantity||"")+'" placeholder="Fyll inn"></label>'+
    '<button class="remove-op" data-remove-op="'+i+'" type="button" aria-label="Fjern arbeidsoperasjon">×</button></div>';
  }).join("");
}
function questionRows(){
  const list=[];
  state.items.forEach((item,index)=>{
    const type=Engine.CATALOG[item.type]||Engine.CATALOG.annet;
    const aiQuestions=state.ai && index===0 && state.ai.category===item.type ? state.ai.questions||[] : [];
    const preferred=Object.fromEntries(aiQuestions.map(q=>[q.key,q]));
    const fields=type.fields.slice().sort((a,b)=>Number(Boolean(preferred[b.id]))-Number(Boolean(preferred[a.id])));
    const labelFor=(f)=>preferred[f.id]?.label || humanQuestion(item.type,f.id,f.label);
    list.push({index,key:"quantity",label:item.type==="annet"?"Kor mange timar reknar du med at jobben tek?":"Kor mykje arbeid skal utførast?",why:item.type==="annet"?"Manuelt timeanslag – grunnlaget for prisen":"Oppgi areal, lengd eller tal på einingar",type:"number",unit:type.unit,value:item.quantity});
    fields.forEach(f=>list.push({index,key:f.id,label:labelFor(f),why:preferred[f.id]?.why || questionWhy(f.id),type:f.type,options:f.options,unit:f.unit,value:item.details[f.id]}));
  });
  return list;
}
function humanQuestion(category,key,fallback){
  const answers={
    weeds:"Kor mykje ugras er det i fugene?",joints:"Skal det leggast ny fugesand?",
    stairs:"Kor mange trappetrinn er med?",water:"Er vatn og straum tilgjengeleg?",
    pitch:"Kor bratt er taket?",roofHeight:"Korleis er tilkomsten og høgda?",roofSurface:"Kva type taktekking er det?",
    snow:"Kor djup er snøen?",incline:"Kor bratt er området?",handArea:"Kor stort areal må måkast for hand?",
    treeSize:"Kor store er trea?",treeRisk:"Er det bygningar eller leidningar nær trea?",removal:"Skal kvist og avfall ryddast bort?",
    maintenance:"Kor kraftig er vegetasjonen?",cleanup:"Skal avklipp samlast opp?",
    floors:"Kor høgt oppe skal arbeidet gjerast?",hardSurface:"Kor skittent er området?",coats:"Kor mange strøk skal leggast?"
  };
  return answers[key]||fallback;
}
function questionWhy(key){
  const m={quantity:"Grunnlag for arbeidstid og mengde",weeds:"Ugras påverkar arbeidskapasiteten",joints:"Påverkar timar og fugesand",stairs:"Trappetrinn tek ekstra tid",water:"Kan krevje ekstra rigg og utstyr",pitch:"Påverkar tidsbruk og HMS",roofHeight:"Krev kontroll av sikring og tilkomst",roofSurface:"Må vurderast før metode blir vald",snow:"Påverkar arbeidstida",incline:"Påverkar arbeidskapasitet",handArea:"Meir manuelt arbeid",treeSize:"Påverkar arbeidstida",treeRisk:"Krev HMS-vurdering og rett metode",removal:"Påverkar rydde- og transporttid",maintenance:"Påverkar arbeidskapasiteten",cleanup:"Påverkar tidsbruk",floors:"Påverkar tilkomst og HMS",hardSurface:"Påverkar arbeidskapasitet",coats:"Påverkar mengde og tidsbruk"};
  return m[key]||"Viktig for kalkylegrunnlaget";
}
function renderQuestions(){
  const list=questionRows();
  $("questionList").innerHTML=list.map((q,i)=>{
    const answered=state.answered.has(keyFor(q.index,q.key));
    let input;
    if(q.type==="select"){
      input='<div class="answer-grid" role="group" aria-label="'+escape(q.label)+'">'+q.options.map(opt=>
        '<button class="answer-choice'+(answered&&q.value===opt[0]?" selected":"")+'" data-answer-index="'+q.index+'" data-answer-key="'+escape(q.key)+'" data-answer-value="'+escape(opt[0])+'" type="button" aria-pressed="'+String(answered&&q.value===opt[0])+'">'+escape(opt[1])+'</button>'
      ).join("")+'</div>';
    }else{
      input='<div class="answer-number"><input type="number" min="0" max="100000" step="any" inputmode="decimal" data-answer-index="'+q.index+'" data-answer-key="'+escape(q.key)+'" value="'+escape(q.value||"")+'" placeholder="Skriv tal"><span>'+escape(q.unit||"")+'</span></div>';
    }
    return '<article class="question-card'+(answered?" is-answered":"")+'" data-question="'+escape(keyFor(q.index,q.key))+'">'+
      '<span class="question-number">'+(String(i+1).padStart(2,"0"))+' / '+escape(Engine.CATALOG[state.items[q.index].type].name)+'</span>'+
      '<h3>'+escape(q.label)+'</h3><p>'+escape(q.why)+'</p>'+input+'</article>';
  }).join("");
  const extras=state.ai?.otherQuestions||[];
  const manual=$("manualQuestions");
  manual.hidden=!extras.length;
  if(extras.length){
    manual.innerHTML='<h3>Andre opplysningar AI meiner er viktige</h3>'+
      extras.slice(0,4).map((q,i)=>'<div class="manual-item"><label for="other-'+i+'">'+escape(q)+'</label><textarea id="other-'+i+'" data-other-index="'+i+'" rows="2" maxlength="450" placeholder="Skriv svaret her">'+escape(state.manualAnswers[i]||"")+'</textarea><small>Dette svaret er ein del av vurderinga, men gir ikkje automatisk eit prispåslag.</small></div>').join("")+
      '<button type="button" class="subtle-button" id="reanalyzeBtn">↻ La AI vurdere svara på nytt</button>';
  }
  updateProgress(list);
}
function updateProgress(list){
  const questions=list||questionRows();
  const confirmed=questions.filter(q=>state.answered.has(keyFor(q.index,q.key)) && (q.key!=="quantity"||state.items[q.index]?.quantity>0)).length;
  const count=questions.length;
  $("questionCount").textContent=confirmed+" / "+count+" avklart";
  $("questionProgress").style.width=(count?Math.round(confirmed*100/count):0)+"%";
}
function setAnswer(index,key,value){
  const item=state.items[index];if(!item)return;
  if(key==="quantity"){item.quantity=Engine.safe(value,100000);}
  else{
    const field=(Engine.CATALOG[item.type].fields||[]).find(f=>f.id===key);
    if(!field)return;
    if(field.type==="select"){if(!field.options.some(o=>o[0]===value))return;item.details[key]=value;}
    else item.details[key]=Engine.safe(value,1000);
  }
  const k=keyFor(index,key);
  if(key!=="quantity"||item.quantity>0)state.answered.add(k);
  else state.answered.delete(k);
  updatePrice();updateProgress();
}
function updatePrice(){
  const items=state.items;
  const c=Engine.calculate(items,{
    rateMode:$("rateMode").value,costHourly:num("costHourly"),travelMinutes:num("travelMinutes"),
    otherCost:num("otherCost"),disposalCost:num("disposalCost"),markup:num("markup"),
    buffer:num("buffer"),vat:num("vat")
  });
  state.calc=c;
  const active=c.active, unanswered=questionRows().filter(q=>!state.answered.has(keyFor(q.index,q.key))).length;
  $("priceValue").textContent=active?money(c.net):"Treng mengde";
  $("hoursValue").textContent=active?fmt(c.totalHours,1)+" timar":"—";
  $("materialsValue").textContent=active?money(c.totalMaterialCost+c.extraCost):"—";
  $("rangeValue").textContent=active?money(c.rangeLow)+" – "+money(c.rangeHigh):"—";
  $("priceVat").textContent=num("vat")>0?"Eks. mva. · "+money(c.gross)+" inkl.":"Eks. mva. · "+(num("vat")===0?"0 % valgt":"");
  $("estimateTag").textContent=unanswered?"FØREBELS":"BEREKNA";
  const notes=Engine.issues(items,c).filter(x=>!/standardsats|grunnlag|ufakturerte/i.test(x));
  const risks=state.ai?.safetyWarnings||[];
  let advice="";
  if(!active)advice="Oppgi mengde eller timeanslag for å få eit prisforslag.";
  else if(c.needsVisit||state.ai?.needsBefaring)advice="Krev befaring og HMS-vurdering før bindande tilbod. Berre indikativ pris.";
  else if(unanswered)advice="Svar på "+unanswered+" spørsmål til for å gjere estimatet meir relevant.";
  else advice="Førebels berekna frå svara dine. Kontroller arbeidskapasitet, kostnader og vilkår.";
  if(risks.length)advice+=" "+risks.slice(0,1).join(" ");
  $("priceAdvice").textContent=advice;
  $("goOfferBtn").disabled=!active;
  if(!$("offerArea").hidden)renderOffer();
}
function num(id){const n=Number($(id)?.value);return Number.isFinite(n)?Math.max(0,n):0;}
function renderOffer(){
  const c=state.calc;if(!c)return;
  $("offerSheet").innerHTML=Offer.render({
    calc:c,items:state.items,
    opts:{markup:num("markup"),vat:num("vat")},
    title:$("projectName").value.trim()||Engine.CATALOG[state.items[0]?.type]?.name||"Oppdrag",
    customer:$("customerName").value.trim(),address:$("address").value.trim(),
    email:$("customerEmail").value.trim(),phone:$("customerPhone").value.trim(),
    scope:$("offerScope").value.trim()||state.lastDesc,
    exclusions:$("offerExclusions").value.trim(),terms:$("offerTerms").value.trim(),
    reference:$("offerReference").value.trim(),validDays:num("validDays"),
    priceMode:$("priceMode").value,reviewed:$("reviewCheck").checked
  });
  const ready=$("reviewCheck").checked&&$("customerName").value.trim()&&$("address").value.trim()&&c.active;
  $("printBtn").disabled=!ready;
  $("offerNotice").textContent=ready?"Kontrollert utkast. Du kan no skrive ut eller lagre som PDF.":"Fyll inn kundenamn og adresse og kryss av for gjennomgang før du lagar PDF.";
}
function showOffer(){
  if(!state.calc?.active){showMessage("Legg inn ei mengde eller eit timeanslag før du lagar tilbod.","error");return;}
  const first=state.items[0];
  if(!$("projectName").value.trim())$("projectName").value=Engine.CATALOG[first.type].name;
  if(!$("offerScope").value.trim())$("offerScope").value=state.lastDesc.slice(0,2400);
  const risk=state.calc.needsVisit||state.ai?.needsBefaring;
  if(risk){$("priceMode").value="estimate";$("offerExclusions").value=$("offerExclusions").value||"Førebels prisoverslag. Arbeidsmetode, sikring, omfang og tilkomst må avklarast ved befaring før endeleg pris.";}
  $("offerArea").hidden=false;state.offered=true;renderOffer();
  $("offerArea").scrollIntoView({behavior:"smooth",block:"start"});
}
function resetForJobChange(){
  state.ai=null;state.source="local";state.answered=new Set();state.manualAnswers={};
  state.offered=false;$("offerArea").hidden=true;$("reviewCheck").checked=false;
}
function addOperation(type){
  if(state.items.length>=MAX_ITEMS){showMessage("Maksimalt "+MAX_ITEMS+" arbeidsoperasjonar per kalkyle.","error");return;}
  state.items.push(newItem(type));
  state.ai=null;state.answered=new Set([...state.answered]);
  renderOperations();renderQuestions();updatePrice();
}
function updateOp(index,key,value){
  const it=state.items[index];if(!it)return;
  if(key==="type"){
    const next=newItem(value);
    next.quantity=it.quantity;
    state.items[index]=next;
    for(const k of [...state.answered])if(k.startsWith(index+":")&&k!==keyFor(index,"quantity"))state.answered.delete(k);
    state.ai=null;
  } else if(key==="quantity"){
    it.quantity=Engine.safe(value,100000);
    if(it.quantity)state.answered.add(keyFor(index,"quantity"));else state.answered.delete(keyFor(index,"quantity"));
  }
  renderQuestions();updatePrice();
}
async function reAnalyzeWithAnswers(){
  if(!getKey()){authOpen();return;}
  const notes=Object.entries(state.manualAnswers).map(([i,t])=>state.ai?.otherQuestions?.[i]+": "+t).filter(Boolean).join("\n");
  if(!notes.trim())return showMessage("Skriv svar på tilleggsopplysningane først.","error");
  const appended=(state.lastDesc+"\nSupplerande befaringssvar:\n"+notes).slice(0,2500);
  showMessage("AI vurderer dei nye opplysningane …","loading");
  const local=describeFromLocal(appended);
  try{
    const next=await askAI(appended,local);
    if(next){state.lastDesc=appended;startWork(next);showMessage("AI har vurdert dei nye svara. Kontroller spørsmåla og prisen.");}
  }catch(e){showMessage("AI kunne ikkje fullføre: "+e.message,"error");}
}
function setup(){
  $("charCount").textContent="0 / 2500";
  $("jobDescription").addEventListener("input",()=>{
    $("charCount").textContent=$("jobDescription").value.length+" / 2500";
    if(!$("message").hidden)showMessage("");
  });
  $("descriptionForm").addEventListener("submit",e=>{e.preventDefault();resetForJobChange();analyzeDescription();});
  document.querySelectorAll("[data-example]").forEach(button=>button.addEventListener("click",()=>{
    $("jobDescription").value=button.dataset.example;$("jobDescription").dispatchEvent(new Event("input"));
    $("jobDescription").focus();
  }));
  $("accessBtn").addEventListener("click",()=>getKey()?showMessage("AI-tilgang er allereie aktiv. Beskriv jobben og trykk «Analyser oppdraget»."):authOpen());
  $("authForm").addEventListener("submit",tryAuth);
  document.querySelectorAll("[data-close-auth]").forEach(el=>el.addEventListener("click",authClose));
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("authModal").hidden)authClose();});
  $("operationList").addEventListener("change",e=>{
    if(e.target.dataset.opType!==undefined){updateOp(Number(e.target.dataset.opType),"type",e.target.value);renderOperations();}
    if(e.target.dataset.opQuantity!==undefined){updateOp(Number(e.target.dataset.opQuantity),"quantity",e.target.value);}
  });
  $("operationList").addEventListener("input",e=>{if(e.target.dataset.opQuantity!==undefined)updateOp(Number(e.target.dataset.opQuantity),"quantity",e.target.value);});
  $("operationList").addEventListener("click",e=>{
    const button=e.target.closest("[data-remove-op]");if(!button)return;
    if(state.items.length===1)return showMessage("Kalkylen må innehalde minst éin arbeidsoperasjon.","error");
    const index=Number(button.dataset.removeOp);
    state.items.splice(index,1);state.answered=new Set();state.ai=null;
    renderOperations();renderQuestions();updatePrice();
  });
  $("addOperationBtn").addEventListener("click",()=>{$("addOperationRow").hidden=!$("addOperationRow").hidden;});
  $("operationType").innerHTML=Object.entries(Engine.CATALOG).map(([key,c])=>'<option value="'+escape(key)+'">'+escape(c.name)+'</option>').join("");
  $("addOperationConfirm").addEventListener("click",()=>{addOperation($("operationType").value);$("addOperationRow").hidden=true;});
  $("questionList").addEventListener("click",e=>{
    const button=e.target.closest("[data-answer-index]");if(!button)return;
    const idx=Number(button.dataset.answerIndex);
    setAnswer(idx,button.dataset.answerKey,button.dataset.answerValue);
    renderQuestions(); // update the selected state without losing any numeric input focus
  });
  $("questionList").addEventListener("input",e=>{
    const input=e.target.closest('input[data-answer-index]');if(!input)return;
    setAnswer(Number(input.dataset.answerIndex),input.dataset.answerKey,input.value);
    input.closest(".question-card")?.classList.toggle("is-answered",!!input.value&&Number(input.value)>0);
  });
  $("manualQuestions").addEventListener("input",e=>{
    const item=e.target.closest("[data-other-index]");if(item)state.manualAnswers[item.dataset.otherIndex]=item.value.slice(0,450);
  });
  $("manualQuestions").addEventListener("click",e=>{if(e.target.closest("#reanalyzeBtn"))reAnalyzeWithAnswers();});
  ["travelMinutes","rateMode","costHourly","otherCost","disposalCost","markup","buffer","vat"].forEach(id=>{
    $(id).addEventListener("input",updatePrice);$(id).addEventListener("change",updatePrice);
  });
  $("goOfferBtn").addEventListener("click",showOffer);
  $("offerArea").querySelectorAll("input,textarea,select").forEach(el=>{
    el.addEventListener("input",renderOffer);el.addEventListener("change",renderOffer);
  });
  $("printBtn").addEventListener("click",()=>{
    if($("printBtn").disabled)return;
    if(state.calc?.needsVisit && $("priceMode").value!=="estimate")return showMessage("HMS-krevjande arbeid må først prisast som prisoverslag.","error");
    window.print();
  });
  setConnection();
}
setup();
})();