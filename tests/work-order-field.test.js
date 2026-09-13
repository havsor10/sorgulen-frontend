const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const compat = fs.readFileSync(path.join(root, "admin/work-order-field-compat.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/work-order-field.css"), "utf8");
const inventory = fs.readFileSync(path.join(root, "admin/inventory-project.js"), "utf8");

test("oppdrag loads the dedicated field workspace after the legacy detail engine", () => {
  assert.match(html, /work-order-field\.css/);
  assert.match(html, /work-order-field\.js/);
  assert.match(html, /work-order-field-compat\.js/);
  assert.ok(html.indexOf("oppdrag.js") < html.indexOf("work-order-field.js"));
  assert.ok(html.indexOf("work-order-field.js") < html.indexOf("work-order-field-compat.js"));
  assert.match(html, /viewport-fit=cover/);
});

test("field workspace starts with customer, job, total time, price and invoice readiness", () => {
  assert.match(js, /data-field-workspace/);
  assert.match(js, /Kundeoppdrag/);
  assert.match(js, /Arbeidstid/);
  assert.match(js, /Pris hittil/);
  assert.match(js, /Fakturagrunnlag/);
  assert.match(js, /completion-check/);
  assert.match(js, /missingDescriptions/);
  assert.match(js, /mangler beskrivelse av hva som ble gjort/);
});

test("old exposed entry buttons are replaced by one add menu while inventory remains compatible", () => {
  assert.match(js, /data-field-add-toggle/);
  assert.match(js, /data-field-add-menu/);
  assert.match(js, /data-entry=\"time\"/);
  assert.match(js, /data-entry=\"expense\"/);
  assert.match(js, /data-entry=\"material\"/);
  assert.match(js, /data-entry=\"note\"/);
  assert.match(inventory, /data-entry=material/);
  assert.match(css, /operations-edit-button\{display:none!important\}/);
  assert.match(compat, /data-field-workspace/);
  assert.match(compat, /operationsManager/);
  assert.match(compat, /fieldManagerSentinel/);
});

test("daily log groups sessions, pauses, descriptions and reusable session editing", () => {
  assert.match(js, /dailyLogMarkup/);
  assert.match(js, /pausePairs/);
  assert.match(js, /field-day/);
  assert.match(js, /field-session/);
  assert.match(js, /Mangler beskrivelse/);
  assert.match(js, /SorgulenOperations\?\.openManualTime/);
  assert.match(js, /Rediger denne økten/);
});

test("secondary information is collapsed instead of occupying the field view", () => {
  assert.match(js, /Kunde og prosjektinfo/);
  assert.match(js, /Utgifter, materialer og notater/);
  assert.match(js, /Prosjektbeskrivelse/);
  assert.match(js, /field-collapse/);
  assert.doesNotMatch(js, /<section class=\"detail-section\"><h3>Tidslogg/);
});

test("mobile detail is a full-screen field workspace with large controls", () => {
  assert.match(css, /height:100dvh/);
  assert.match(css, /field-add-main/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /safe-area-inset-bottom/);
});
