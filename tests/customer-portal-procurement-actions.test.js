const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "admin/kundeportal.js"), "utf8");
const corrections = fs.readFileSync(path.join(root, "admin/kundeportal-corrections.js"), "utf8");
const html = fs.readFileSync(path.join(root, "admin/kundeportal.html"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/kundeportal.css"), "utf8");

test("alle aktive innkjøpskort har synlig Rediger og Fjern", () => {
  assert.match(portal, /data-edit-procurement=/);
  assert.match(portal, /data-correct-procurement=/);
  assert.match(portal, /data-remove-procurement=/);
  assert.match(portal, /"ordered", "waiting_delivery", "ready_pickup", "purchased"/);
  assert.match(portal, />Rediger<\/button>/);
  assert.match(portal, />Fjern<\/button>/);
});

test("fjernede innkjøp forsvinner fra aktiv kortliste", () => {
  assert.match(portal, /filter\(\(procurement\) => procurement\.status !== "cancelled"\)/);
});

test("låst eller innkjøpt kjøp redigeres med historikk og ny kundegodkjenning", () => {
  assert.match(corrections, /data-correct-procurement/);
  assert.match(corrections, /\/correct/);
  assert.match(corrections, /Rediger innkjøp/);
  assert.match(corrections, /be om ny godkjenning/);
});

test("Fjern bruker arkiveringsruten og ikke fysisk frontend-sletting", () => {
  assert.match(corrections, /data-remove-procurement/);
  assert.match(corrections, /\/remove/);
  assert.match(corrections, /Historikken slettes ikke/);
});

test("mobil/nettleser får fersk innkjøpskode", () => {
  assert.match(html, /kundeportal\.css\?v=20260918-purchase1/);
  assert.match(html, /kundeportal\.js\?v=20260918-purchase1/);
  assert.match(html, /kundeportal-corrections\.js\?v=20260918-purchase1/);
  assert.match(css, /procurement-card-actions/);
  assert.match(css, /procurement-remove-btn/);
});
