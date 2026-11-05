"use strict";
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.SorgulenOffer=api;
})(typeof window!=="undefined"?window:globalThis,function(){
 const fmt=(n,d=2)=>Number(n||0).toLocaleString("nb-NO",{minimumFractionDigits:d,maximumFractionDigits:d});
 const money=n=>fmt(n,2)+" kr";
 const safeText=(v,max=5000)=>String(v??"").slice(0,max);
 const escape=v=>safeText(v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
 const labels={
  weeds:{none:"Ingen ugras",light:"Lite ugras",medium:"Moderat ugras",heavy:"Mykje ugras"},
  joints:{yes:"Etterfuging med fugesand",no:"Utan ny fugesand"},
  water:{no:"Vatn/straum må avklarast",yes:"Vatn/straum tilgjengeleg"},
  pitch:{flat:"Lågt takfall",normal:"Normalt takfall",steep:"Bratt tak"},
  treeSize:{small:"Lite tre",medium:"Mellomstort tre",large:"Stort tre",verylarge:"Svært stort tre"},
  treeRisk:{clear:"Frie omgjevnader",obstacles:"Hinder nær treet",lines:"Nær leidningar"},
  removal:{no:"Utan bortkøyring",yes:"Opprydding inkludert",transport:"Bortkøyring inkludert"},
  snow:{light:"Lett snø",medium:"Middels snø",deep:"Djup snø",extreme:"Ekstrem snømengd"},
  incline:{normal:"Normalt terreng",steep:"Bratt/vanskeleg terreng"},
  maintenance:{normal:"Normal tilstand",overgrown:"Kraftig gjengrodd"},
  cleanup:{no:"Utan oppsamling",yes:"Oppsamling inkludert"},
  hardSurface:{normal:"Normal tilsmussing",heavy:"Kraftig tilsmussing"},
  floors:{low:"Lett tilkomst",high:"Høgda krev vurdering"},
  coats:null
 };
 function describe(item){
  const d=item.details||{},details=[];
  for(const [key,value] of Object.entries(d)){
   if(key==="stairs"&&Number(value)>0)details.push(Number(value)+" trappetrinn");
   else if(key==="handArea"&&Number(value)>0)details.push(Number(value)+" m² manuelt snøarbeid");
   else if(key==="coats"&&Number(value)>0)details.push(Number(value)+" strøk");
   else if(labels[key]&&labels[key][value]&&!(key==="joints"&&value==="no"))details.push(labels[key][value]);
  }
  return details.join(" · ").slice(0,350)||"Arbeid som spesifisert i kalkylen";
 }
 function makeRows(calc,items,opts){
  if(!calc||!Array.isArray(calc.ops))return [];
  const rate=Math.max(0,Number(calc.rate||0)),markup=Math.max(0,Number(opts?.markup||0))/100;
  const factor=calc.salesBeforeBuffer>0?(calc.salesBeforeBuffer+calc.contingency)/calc.salesBeforeBuffer:1;
  const rows=calc.ops.filter(op=>op.quantity>0).map(op=>{
   const item=items.find(x=>x.id===op.id)||{};
   const amount=(op.execution*rate+op.material*(1+markup))*factor;
   return {description:op.title,subtitle:describe(item),quantity:op.quantity,unit:op.unit,rate:op.quantity>0?amount/op.quantity:0,amount};
  });
  if(calc.travelHours>0)rows.push({description:"Transport og køyretid",subtitle:"Tur/retur etter berekna reisetid",quantity:1,unit:"post",rate:calc.travelHours*rate*factor,amount:calc.travelHours*rate*factor});
  if(calc.extraCost>0)rows.push({description:"Andre tillegg og levering",subtitle:"Avtalt materiell, avfall og direkte utgifter",quantity:1,unit:"post",rate:calc.extraCost*(1+markup)*factor,amount:calc.extraCost*(1+markup)*factor});
  const rounded=rows.map(r=>({...r,amount:Math.round((r.amount+Number.EPSILON)*100)/100}));
  const sum=rounded.reduce((total,row)=>total+Math.round(row.amount*100),0);
  const delta=(Math.round(calc.net*100)-sum)/100;
  if(Math.abs(delta)>0.004)rounded.push({description:"Prisavrunding",subtitle:"Justering til tilbodssum",quantity:1,unit:"post",rate:delta,amount:delta});
  return rounded;
 }
 function formatDate(value){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return "";
  return new Intl.DateTimeFormat("nb-NO",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Oslo"}).format(d);
 }
 function addDays(date,days){const d=new Date(date);d.setUTCDate(d.getUTCDate()+Math.max(0,Math.min(90,Number(days)||14)));return d;}
 function render(data){
  const c=data.calc,opts=data.opts||{},rows=makeRows(c,data.items,opts);
  const title=escape(data.title||"Oppdrag manglar"),customer=escape(data.customer||"Kunde manglar");
  const address=escape(data.address||"Arbeidsstad ikkje registrert");
  const date=new Date();const expiry=addDays(date,data.validDays||14);
  const amount=money(c.net),vat=money(c.vat),gross=money(c.gross);
  const scope=escape(data.scope||data.notes||"Arbeid i samsvar med spesifikasjonen nedanfor.");
  const exclusions=escape(data.exclusions||"Arbeid utanfor beskrive omfang, skjulte skadar, ekstra material og endra tilkomst er ikkje inkludert.");
  const terms=escape(data.terms||"Betaling skjer etter utført arbeid i tråd med avtale. Endringar må avtalast før dei blir utførte.");
  const number=escape(data.reference||"UTKAST – utan tilbodsnr.");
  const contact=(data.email?'<span>'+escape(data.email)+'</span>':"")+(data.phone?'<span>'+escape(data.phone)+'</span>':"");
  const status=data.reviewed?"Kontrollert utkast – ikkje sendt":"UTKAST – IKKJE SENDT";
  const rowsHtml=rows.map((r,i)=>'<tr class="'+(i%2?'alt':'')+'"><td><strong>'+escape(r.description)+'</strong><small>'+escape(r.subtitle)+'</small></td><td class="num">'+fmt(r.quantity,r.quantity%1?1:0)+' '+escape(r.unit)+'</td><td class="num">'+money(r.rate)+'</td><td class="num"><b>'+money(r.amount)+'</b></td></tr>').join("");
  return '<article class="official-quote" aria-label="Pristilbod til kunde">'+
    '<header class="quote-doc-header"><div class="quote-firm"><img src="../assets/logo-google-512.png" alt="" class="quote-firm-logo"><div><strong>SØRGULEN</strong><span>INDUSTRISERVICE</span><small>Org.nr. 935 179 580</small></div></div>'+
    '<div class="quote-doc-title"><h2>PRISTILBOD</h2><span>Tilbodsdato: '+formatDate(date)+'</span><span>Gyldig til: '+formatDate(expiry)+'</span><small>'+status+'</small></div></header>'+
    '<div class="quote-client"><div><small>PRISTILBOD TIL</small><h3>'+customer+'</h3><span>'+address+'</span>'+contact+'</div><div><small>REFERANSE</small><strong>'+number+'</strong><small class="quote-small">Gjeld: '+title+'</small></div></div>'+
    '<section class="quote-subject"><small>GJELDER</small><h3>'+title+'</h3><p>'+scope+'</p></section>'+
    '<table class="quote-table"><thead><tr><th>Beskriving</th><th>Mengd</th><th>Sats</th><th>Beløp</th></tr></thead><tbody>'+rowsHtml+'</tbody></table>'+
    '<div class="quote-totals"><div class="quote-total-notes">'+(Number(opts.vat)>0?'Beløp ekskl. mva.':'Ikkje mva-registrert – meirverdiavgift blir ikkje berekna')+'</div><div class="quote-total-values"><span>Sum arbeid <strong>'+amount+'</strong></span>'+(Number(opts.vat)>0?'<span>MVA '+escape(opts.vat)+' % <strong>'+vat+'</strong></span>':'')+'<div class="quote-grand"><b>'+escape(data.priceMode==="estimate"?"Prisoverslag":"Førebels fastpris")+'</b><strong>'+gross+'</strong></div></div></div>'+
    '<section class="quote-conditions"><h4>Omfang og avgrensingar</h4><p>'+exclusions+'</p><h4>Vilkår</h4><p>'+terms+'</p>'+(c.needsVisit?'<h4>Føresetnad for fastpris</h4><p>Pris krev befaring, risikovurdering og avklaring av trygg arbeidsmetode før bindande avtale.</p>':'')+'</section>'+
    '<div class="quote-accept">Aksept: Tilbodet kan stadfestast skriftleg etter endeleg gjennomgang. Dette dokumentet er ikkje ei faktura.</div>'+
    '<footer class="quote-doc-footer">Sørgulen Industriservice · Org.nr. 935 179 580<br>Kleiva 91B, 6906 Florø · sor.industri@gmail.com · sorgulen.no</footer>'+
    '</article>';
 }
 return {makeRows,render,formatDate,money,escape,describe};
});
