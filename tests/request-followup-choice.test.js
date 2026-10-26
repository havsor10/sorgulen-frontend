const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("prisestimat.html", "utf8");
const js = fs.readFileSync("prisestimat.js", "utf8");
const admin = fs.readFileSync("admin/foresporsler.js", "utf8");

test("kunden kan velge spørsmål eller oppringing/befaring", () => {
  assert.match(html, /Svar på noen spørsmål/);
  assert.match(html, /Ring meg \/ avtal befaring/);
  assert.match(html, /data-followup="questions"/);
  assert.match(html, /data-followup="call_visit"/);
  assert.match(js, /followUpMode/);
  assert.match(js, /intakeMethod: followUpMode/);
});

test("oppringing/befaring sendes uten AI-spørsmålsrunde", () => {
  assert.match(js, /if \(followUpMode === "call_visit"\)/);
  assert.match(js, /await sendRequest\(\)/);
});

test("admin viser direkte ringehandling i stedet for falsk AI-pris", () => {
  assert.match(admin, /Kunden ønsker kontakt/);
  assert.match(admin, /Ikke AI-priset/);
  assert.match(admin, /href="tel:/);
  assert.match(admin, /Ring kunden/);
});


test("spørsmålsløpet har én runde og maks tre spørsmål", () => {
  assert.match(js, /const MAX_ROUNDS = 1/);
  assert.match(js, /const MAX_FOLLOW_UP_QUESTIONS = 3/);
  assert.match(js, /slice\(0, MAX_FOLLOW_UP_QUESTIONS\)/);
  assert.match(html, /maks 3/i);
});
