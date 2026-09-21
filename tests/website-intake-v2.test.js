const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("admin har egen side for sentral nettsidestyring", () => {
  const html = read("admin/nettside.html");
  const js = read("admin/nettside.js");
  const shell = read("admin/admin-shell.js");
  assert.match(html, /Én sannhet for sorgulen\.no/);
  assert.match(js, /\/services\/admin/);
  assert.match(js, /method:\s*"PATCH"/);
  assert.match(js, /shortDescription/);
  assert.match(shell, /nettside\.html/);
});

test("offentlig nettside henter hele tjenestekatalogen dynamisk", () => {
  const site = read("site-consistency.js");
  const booking = read("booking.js");
  assert.match(site, /services\?includeInactive=1/);
  assert.match(site, /shortDescription/);
  assert.match(site, /dunkvask/);
  assert.match(booking, /bookable/);
  assert.match(booking, /requestedServiceKey/);
});

test("prisestimat samler adresse og kjører inntil to spørsmålsrunder", () => {
  const html = read("prisestimat.html");
  const js = read("prisestimat.js");
  assert.match(html, /id="peAddress"/);
  assert.match(html, /id="peTiming"/);
  assert.match(js, /MAX_ROUNDS\s*=\s*2/);
  assert.match(js, /customerAddress/);
  assert.match(js, /serviceCategory/);
  assert.match(js, /validateQuestions/);
});
