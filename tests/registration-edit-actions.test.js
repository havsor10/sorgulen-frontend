const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "admin");
const field = fs.readFileSync(path.join(root, "work-order-field.js"), "utf8");
const operations = fs.readFileSync(path.join(root, "operations-ui.js"), "utf8");
const html = fs.readFileSync(path.join(root, "oppdrag.html"), "utf8");

test("registreringskort har direkte rediger og slett uten kompatibilitetsfil", () => {
  assert.match(field, /data-field-registration-edit/);
  assert.match(field, /data-field-delete-registration/);
  assert.match(field, /openRegistration/);
  assert.match(field, /deleteRegistration/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
});

test("operations-motoren kan åpne eksakt tid, utgift, materiale og notat", () => {
  assert.match(operations, /async function openRegistration/);
  for (const kind of ["time", "expense", "material", "note"]) {
    assert.match(operations, new RegExp(`kind === "${kind}"`));
  }
  assert.match(operations, /window\.SorgulenOperations\s*=\s*\{[^}]*openRegistration/s);
});

test("sletting bruker korrekte API-endepunkter og bekreftelse", () => {
  assert.match(field, /time: "time"/);
  assert.match(field, /expense: "expenses"/);
  assert.match(field, /material: "materials"/);
  assert.match(field, /note: "notes"/);
  assert.match(field, /method: "DELETE"/);
  assert.match(field, /confirm\(/);
});
