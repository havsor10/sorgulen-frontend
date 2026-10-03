const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const field = fs.readFileSync("admin/felt.js", "utf8");
const fieldHtml = fs.readFileSync("admin/felt.html", "utf8");
const fieldCss = fs.readFileSync("admin/felt.css", "utf8");
const jobs = fs.readFileSync("admin/oppdrag.js", "utf8");

test("Feltadmin kan registrere utstyr med fast sats og minutter", () => {
  assert.match(fieldHtml, /data-open="equipment"/);
  assert.match(field, /Registrer utstyrsbruk/);
  assert.match(field, /durationMinutes/);
  assert.match(field, /equipmentHourlyRate/);
  assert.match(field, /equipmentAmountPreview/);
  assert.match(field, /minutes \* Number\(rate\.defaultRate\)\) \/ 60/);
  assert.match(field, /\/admin\/work-orders\/.*\/equipment/);
});

test("utstyrssatser hentes og nye satser kan lagres globalt", () => {
  assert.match(field, /\/admin\/rates/);
  assert.match(field, /category === "Utstyr"/);
  assert.match(field, /\/admin\/rates\/equipment/);
  assert.match(field, /equipment-rates/);
});

test("utstyrsbeløp vises både i felt og komplett oppdragsadmin", () => {
  assert.match(field, /utstyr<\/span>/);
  assert.match(fieldCss, /field-equipment-preview/);
  assert.match(jobs, /Utstyr registrert/);
  assert.match(jobs, /equipmentTotal/);
  assert.match(jobs, /Ingen utstyrsbruk registrert/);
});
