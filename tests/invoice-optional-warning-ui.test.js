const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin/faktura-detalj.js"), "utf8");

test("invoice detail loads fresh override-aware controller", () => {
  assert.match(html, /faktura-detalj\.js\?v=20260918-unified1/);
});

test("warnings can be explicitly overridden but blockers cannot", () => {
  assert.match(ui, /validationParts/);
  assert.match(ui, /const \{ blockers, warnings \} = validationParts/);
  assert.match(ui, /Utsted likevel/);
  assert.match(ui, /issueBtn\.disabled = true/);
  assert.match(ui, /issueBtn\.disabled = false/);
});

test("issue request carries explicit allowWarnings confirmation", () => {
  assert.match(ui, /allowWarnings: warnings\.length > 0/);
  assert.match(ui, /Dette er valgfritt\. Vil du utstede/);
});
