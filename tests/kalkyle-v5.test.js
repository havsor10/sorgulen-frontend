"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../kalkyle/index.html"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"../kalkyle/studio-v5.css"),"utf8");
const script=fs.readFileSync(path.join(__dirname,"../kalkyle/studio-v5.js"),"utf8");
const engine=require("../kalkyle/pricing-engine.js");
test("first primary form is a large free-text description, not manual price fields",()=>{
  assert.ok(html.indexOf('id="jobDescription"')>0);
  assert.ok(html.indexOf('id="jobDescription"')<html.indexOf('id="workArea"'));
  assert.ok(html.indexOf('id="descriptionForm"')<html.indexOf('id="rateMode"'));
  assert.match(html,/Analyser oppdraget/);
  assert.match(html,/rows="7"/);
});
test("questions and price stay hidden until description is analyzed",()=>{
  assert.match(html,/id="workArea"[^>]* hidden/);
  assert.match(html,/id="offerArea"[^>]* hidden/);
  assert.match(script,/startWork\(local\)/);
  assert.match(script,/renderQuestions\(\);updatePrice\(\)/);
});
test("AI endpoint is admin-only and local calculation always available",()=>{
  assert.match(script,/api\+"\/admin\/kalkyle\/analyze"/);
  assert.match(script,/x-admin-key/);
  assert.match(script,/Engine\.infer\(text\)/);
  assert.match(script,/Engine\.calculate\(items/);
  assert.doesNotMatch(script,/fetch\(\s*["']https:\/\/api\.anthropic\.com/);
});
test("offer preview still uses existing PDF-compatible generator",()=>{
  assert.match(html,/offer-studio\.js/);
  assert.match(script,/Offer\.render/);
  assert.match(html,/id="printBtn"/);
  assert.match(script,/window\.print\(\)/);
  assert.match(css,/@media print/);
});
test("brostein pricing calculation remains driven by measurement and conditions",()=>{
  const basic=engine.makeItem("brostein",{quantity:130,details:{weeds:"none",joints:"no"}});
  const harder=engine.makeItem("brostein",{quantity:130,details:{weeds:"heavy",joints:"yes"}});
  const settings={rateMode:"own",costHourly:320,travelMinutes:30,otherCost:0,disposalCost:0,markup:20,buffer:8,vat:0};
  const a=engine.calculate([basic],settings),b=engine.calculate([harder],settings);
  assert.ok(b.net>a.net);
  assert.ok(b.totalHours>a.totalHours);
});
