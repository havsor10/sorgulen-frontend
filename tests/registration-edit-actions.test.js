const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "admin", "work-order-field-compat.js"), "utf8");

test("registreringskort blir direkte redigerbare", () => {
  assert.match(source, /data-field-registration-edit/);
  assert.match(source, /openExactRegistration/);
  assert.match(source, /openManager\(orderId\)/);
  assert.match(source, /data-op-edit/);
});

test("redigeringsvindu får sikker sletting for tid, utgift, materiale og notat", () => {
  assert.match(source, /operationTimeForm/);
  assert.match(source, /operationEditForm/);
  assert.match(source, /endpoint: "time"/);
  assert.match(source, /endpoint: "expenses"/);
  assert.match(source, /endpoint: "materials"/);
  assert.match(source, /endpoint: "notes"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /confirm\(/);
});
