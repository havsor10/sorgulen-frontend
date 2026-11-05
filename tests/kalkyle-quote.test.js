"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const engine=require("../kalkyle/pricing-engine");
const quote=require("../kalkyle/offer-studio");
function calc(type,quantity){
  const item={...engine.makeItem(type,{quantity}),id:"abc"};
  const opts={rateMode:"own",costHourly:320,travelMinutes:30,markup:20,buffer:8,otherCost:300,disposalCost:0,vat:0};
  return {item,opts,c:engine.calculate([item],opts)};
}
test("offer rows reconcile with total to the krone and øre",()=>{
 for(const [type,qty] of [["brostein",130],["trefelling",1],["takvask",75],["broyting",450],["annet",4]]){
  const {item,opts,c}=calc(type,qty);
  const rows=quote.makeRows(c,[item],opts);
  const sum=Math.round(rows.reduce((s,r)=>s+r.amount,0)*100);
  assert.equal(sum,Math.round(c.net*100),"quote mismatch for "+type);
 }
});
test("professional quote includes A4-style sections and sanitized user content",()=>{
 const {item,opts,c}=calc("brostein",130);
 const html=quote.render({calc:c,items:[item],opts,title:"<script>alert(1)</script>",customer:"Testkunde & Co",address:"Testvegen 1",scope:"Vask med fugesand",validDays:14,reviewed:false});
 assert.match(html,/PRISTILBOD/);
 assert.match(html,/Org.nr. 935 179 580/);
 assert.match(html,/Mengd/);
 assert.match(html,/Sats/);
 assert.match(html,/Omfang og avgrensingar/);
 assert.match(html,/UTKAST – IKKJE SENDT/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/Testkunde &amp; Co/);
 assert.doesNotMatch(html,/Intern timekostnad/);
 assert.doesNotMatch(html,/bruttomargin/i);
});
test("date format valid and price rows preserve amounts",()=>{
 const {item,opts,c}=calc("trefelling",2);
 const rows=quote.makeRows(c,[item],opts);
 assert.ok(rows.length>=2);
 assert.equal(quote.formatDate("2026-11-05T12:00:00Z"),"05.11.2026");
 assert.equal(Math.round(rows.reduce((s,r)=>s+r.amount,0)*100),Math.round(c.net*100));
});
test("quote no active job has no paid rows",()=>{
 const {item,opts,c}=calc("brostein",0);
 assert.equal(c.net,0);
 assert.equal(quote.makeRows(c,[item],opts).length,0);
});
