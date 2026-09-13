const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin shell loads the shared actionable warning layer", () => {
  const shell = read("admin/admin-shell.js");
  assert.match(shell, /actionable-warnings\.js\?v=/);
});

test("missing work-order data has direct repair routes", () => {
  const source = read("admin/actionable-warnings.js");
  assert.match(source, /Legg inn e-post/);
  assert.match(source, /Legg inn kunde/);
  assert.match(source, /Åpne registrering/);
  assert.match(source, /Gå til tidtaking/);
  assert.match(source, /\/admin\/actionable\/work-orders\/\$\{encodeURIComponent\(id\)\}\/customer-contact/);
});

test("portal, customer, invoice and watchdog warnings point at repair UI", () => {
  const source = read("admin/actionable-warnings.js");
  assert.match(source, /Legg inn kontaktinfo/);
  assert.match(source, /Sett ny dato/);
  assert.match(source, /Foreslå neste mulighet/);
  assert.match(source, /Rett i fakturautkast/);
  assert.match(source, /approved_purchase_waiting/);
  assert.match(source, /invoice_missing/);
  assert.match(source, /invoice_not_sent/);
  assert.match(source, /Ordne nå/);
});

test("action layer stays deterministic and does not send or spend automatically", () => {
  const source = read("admin/actionable-warnings.js");
  assert.doesNotMatch(source, /\/send["'`]/);
  assert.doesNotMatch(source, /purchase-execution|approve_purchase_execution/);
});
