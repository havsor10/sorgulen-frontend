const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin/faktura-detalj.js"), "utf8");

test("invoice detail owns delivery without a second overlay controller", () => {
  assert.match(html, /faktura-detalj\.js\?v=20260915-audit1/);
  assert.doesNotMatch(html, /invoice-delivery-ui\.js/);
});

test("issued invoice exposes the final PDF and native share sheet", () => {
  assert.match(ui, /Åpne ferdig faktura \(PDF\)/);
  assert.match(ui, /navigator\.share/);
  assert.match(ui, /new File\(\[blob\]/);
  assert.match(ui, /Del \/ send på melding/);
  assert.match(ui, /\/preview/);
});

test("manual delivery stays explicit", () => {
  assert.match(ui, /Ble fakturaen sendt\/levert til kunden\?/);
  assert.match(ui, /markDelivered\(invoice, "message"\)/);
  assert.match(ui, /markDelivered\(invoice, "shown"\)/);
  assert.match(ui, /Marker levert på melding/);
});
