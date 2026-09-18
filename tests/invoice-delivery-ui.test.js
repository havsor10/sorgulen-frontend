const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
const detail = fs.readFileSync(path.join(root, "admin/faktura-detalj.js"), "utf8");
const listHtml = fs.readFileSync(path.join(root, "admin/fakturaer.html"), "utf8");
const listJs = fs.readFileSync(path.join(root, "admin/fakturaer.js"), "utf8");

test("fakturadetalj bruker én samlet motor uten delivery-overlay", () => {
  assert.match(html, /faktura-detalj\.js\?v=20260919-discount1/);
  assert.doesNotMatch(html, /invoice-delivery-ui\.js/);
  assert.equal(fs.existsSync(path.join(root, "admin/invoice-delivery-ui.js")), false);
});

test("utstedt faktura kan vises og deles som PDF direkte fra hovedmotoren", () => {
  assert.match(detail, /Vis ferdig faktura/);
  assert.match(detail, /Del \/ send på melding/);
  assert.match(detail, /navigator\.share/);
  assert.match(detail, /new File\(\[blob\]/);
  assert.match(detail, /data-action="show"/);
  assert.match(detail, /data-action="share"/);
  assert.match(detail, /data-action="send"/);
});

test("levering markeres bare etter eksplisitt bekreftelse", () => {
  assert.match(detail, /Ble fakturaen sendt\/levert til kunden\?/);
  assert.match(detail, /Har kunden fått se eller fått overlevert fakturaen\?/);
  assert.match(detail, /data-action="mark-message"/);
  assert.match(detail, /markDelivered\(inv, "message"\)/);
  assert.match(detail, /markDelivered\(inv, "shown"\)/);
});

test("utstedelse laster fakturaen på nytt slik at nummer dato og forfall vises automatisk", () => {
  assert.match(detail, /data\.invoice\.invoiceNumber/);
  assert.match(detail, /return load\(\)/);
  assert.match(detail, /Fakturanr\.:/);
  assert.match(detail, /Fakturadato:/);
  assert.match(detail, /Forfall:/);
});

test("gammelt refnummer-vedlikehold er fjernet fra fakturalista", () => {
  assert.doesNotMatch(listHtml, /backfillBtn|Tildel ref\.nr/);
  assert.doesNotMatch(listJs, /backfillBtn|backfill-refs/);
});
