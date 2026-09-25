const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin/work-order-delete.js"), "utf8");
const overview = fs.readFileSync(path.join(root, "admin/oversikt.js"), "utf8");

test("work order detail uses recoverable trash instead of direct hard delete", () => {
  assert.match(html, /work-order-delete\.js\?v=20260925-trash1/);
  assert.match(html, /openWorkOrderTrash/);
  assert.match(ui, /Flytt til papirkurv/);
  assert.match(ui, /\/trash/);
  assert.match(ui, /Gjenopprett oppdrag/);
  assert.match(ui, /\/restore/);
  assert.match(ui, /Kunden beholdes/);
});

test("test jobs can be marked and are visibly separated", () => {
  assert.match(ui, /Marker som testoppdrag/);
  assert.match(ui, /\/test/);
  assert.match(ui, /ignoreres av varslinger, økonomioversikt, fakturering og AI/);
});

test("permanent delete requires typed SLETT and is only offered for test jobs", () => {
  assert.match(ui, /prompt\("Permanent sletting/);
  assert.match(ui, /toUpperCase\(\) !== "SLETT"/);
  assert.match(ui, /order\.isTest && !order\.invoiceId/);
  assert.match(ui, /\/permanent/);
});

test("business overview excludes test and trashed jobs", () => {
  assert.match(overview, /filter\(\(order\) => !order\.isTest && !order\.trashedAt\)/);
});
