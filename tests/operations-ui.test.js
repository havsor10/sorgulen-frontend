const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin shell renders deterministic notification badges", () => {
  const shell = read("admin/admin-shell.js");
  assert.match(shell, /admin\/operations\/notifications/);
  assert.match(shell, /data-admin-badge/);
  assert.match(shell, /badges/);
});

test("manual time form uses date plus duration instead of start/end clock", () => {
  const operations = read("admin/operations-ui.js");
  assert.match(operations, /Hva gjorde du\?/);
  assert.match(operations, /durationMinutes/);
  assert.match(operations, /name="hours"/);
  assert.match(operations, /name="minutes"/);
  assert.doesNotMatch(operations, /datetime-local/);
});

test("customer page supports direct work and aggregate invoice drafts", () => {
  const customer = read("admin/kunde-v2.js");
  assert.match(customer, /data-customer-time/);
  assert.match(customer, /billing-summary/);
  assert.match(customer, /invoice-draft/);
  assert.match(customer, /billing-settings/);
});

test("operation manager exposes edit and delete actions", () => {
  const operations = read("admin/operations-ui.js");
  assert.match(operations, /data-op-edit/);
  assert.match(operations, /data-op-delete/);
  assert.match(operations, /sync-basis/);
});

test("invoice warnings distinguish added removed and modified entries", () => {
  const operations = read("admin/operations-ui.js");
  const customer = read("admin/kunde-v2.js");
  assert.match(operations, /data\.modified\?\.length/);
  assert.match(customer, /draft\.modified\?\.length/);
});
