const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const editor = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");

test("oppdrag bruker samlet editor i stedet for egen beskrivelseseditor", () => {
  assert.match(html, /work-order-editor\.css\?v=20260917-audit2/);
  assert.match(html, /work-order-editor\.js\?v=20260917-audit2/);
  assert.doesNotMatch(html, /work-order-description-edit\.css/);
  assert.doesNotMatch(html, /work-order-description-edit\.js/);
});

test("beskrivelsesknappen åpner den samme tidseditoren i capture phase", () => {
  assert.match(editor, /closest\("\[data-field-edit-session\]"\)/);
  assert.match(editor, /event\.preventDefault\(\)/);
  assert.match(editor, /event\.stopImmediatePropagation\(\)/);
  assert.match(editor, /openRegistration\(\{ orderId: workspace\?\.dataset\.orderId \|\| "", kind: "time"/);
  assert.match(editor, /}, true\);/);
});

test("tidseditor lagrer bare valgt registrering gjennom operations-api", () => {
  assert.match(editor, /\/admin\/operations\/work-orders\/\$\{encodeURIComponent\(orderId\)\}\/\$\{part\}\/\$\{encodeURIComponent\(entryId\)\}/);
  assert.match(editor, /description: raw\.description\.trim\(\)/);
  assert.match(editor, /location\.href = `oppdrag\.html\?open=/);
});
