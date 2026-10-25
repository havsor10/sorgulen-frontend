const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const snow = fs.readFileSync("admin/broyting.js", "utf8");
const snowCss = fs.readFileSync("admin/broyting.css", "utf8");
const invoice = fs.readFileSync("admin/faktura-ny.js", "utf8");

test("ferdig brøyting viser serverberegnet sluttpris", () => {
  assert.match(snow, /openBillingSummary/);
  assert.match(snow, /\/invoices\/work-order\//);
  assert.match(snow, /preview\.totals\?\.amount/);
  assert.match(snow, /KUNDEN SKAL BETALE/);
  assert.match(snow, /Øreavrunding|avrunding/);
});

test("ferdig kunde kan faktureres direkte eller senere", () => {
  assert.match(snow, /Pris \/ faktura/);
  assert.match(snow, /OPPRETT FAKTURA/);
  assert.match(snow, /Fakturer senere/);
  assert.match(snow, /faktura-ny\.html\?workOrderId=/);
  assert.match(snowCss, /snow-billing-total/);
});

test("offline ferdigregistrering lover ikke pris før synkronisering", () => {
  assert.match(snow, /Pris og faktura blir tilgjengelig når registreringen er synkronisert/);
});

test("fakturaflyt kan returnere til Brøytemodus", () => {
  assert.match(invoice, /pageParams\.get\("from"\) === "snow"/);
  assert.match(invoice, /returnToSnow \? "broyting\.html" : "fakturaer\.html"/);
});
