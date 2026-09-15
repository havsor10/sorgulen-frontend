const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin/invoice-delivery-ui.js"), "utf8");

test("invoice detail loads dedicated delivery UI", () => {
  assert.match(html, /invoice-delivery-ui\.js\?v=20260915-delivery1/);
});

test("issued invoice can be shared as PDF through the native share sheet", () => {
  assert.match(ui, /navigator\.share/);
  assert.match(ui, /new File\(\[blob\]/);
  assert.match(ui, /\/preview/);
  assert.match(ui, /Del \/ send på melding/);
});

test("manual delivery is explicit and never silently marks a share as sent", () => {
  assert.match(ui, /Ble fakturaen sendt\/levert til kunden\?/);
  assert.match(ui, /method: "message"/);
  assert.match(ui, /method: "shown"/);
  assert.match(ui, /Marker levert på melding/);
});
