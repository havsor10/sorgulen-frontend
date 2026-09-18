const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const operations = fs.readFileSync(path.join(root, "admin/operations-ui.js"), "utf8");

test("separat beskrivelseseditor og kompatibilitetslag er borte fra sida", () => {
  assert.doesNotMatch(html, /work-order-description-edit/);
  assert.doesNotMatch(html, /work-order-field-compat/);
  assert.doesNotMatch(html, /completed-work-order-flow/);
});

test("tidsbeskrivelse redigeres gjennom samme operations-editor som annen tid", () => {
  assert.match(field, /openSessionEditor/);
  assert.match(field, /openManualTime/);
  assert.match(operations, /function timeFormMarkup/);
  assert.match(operations, /name="description"/);
  assert.match(operations, /PATCH/);
});

test("feltvisningen kan åpne eksakt registrering via operations-motoren", () => {
  assert.match(field, /SorgulenOperations\.openRegistration/);
  assert.match(operations, /async function openRegistration/);
  assert.match(operations, /expenseFormMarkup/);
  assert.match(operations, /materialFormMarkup/);
  assert.match(operations, /noteFormMarkup/);
});
