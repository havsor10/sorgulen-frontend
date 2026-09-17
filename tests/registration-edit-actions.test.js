const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const source = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");

test("registreringskort blir direkte redigerbare av én editor", () => {
  assert.match(html, /work-order-editor\.js/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
  assert.match(source, /data\.fieldRegistrationEdit = "true"/);
  assert.match(source, /openRegistration/);
  assert.match(source, /openManager/);
  assert.match(source, /data-editor-open-kind/);
});

test("samme editor har sikker sletting for tid, utgift, materiale og notat", () => {
  assert.match(source, /endpointFor/);
  assert.match(source, /kind === "time"/);
  assert.match(source, /"expenses"/);
  assert.match(source, /"materials"/);
  assert.match(source, /"notes"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /confirm\("Slette denne registreringen/);
});
