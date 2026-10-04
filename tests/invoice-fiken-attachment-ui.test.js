const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(path.join(__dirname, "..", "admin", "faktura-detalj.js"), "utf8");

test("synket Fiken-salg skjuler ikke feil på PDF-vedlegget", () => {
  assert.match(code, /const syncNote = String\(fiken\.lastError \|\| ""\)\.trim\(\)/);
  assert.match(code, /Registrert i Fiken – vedlegg trenger oppmerksomhet/);
  assert.match(code, /friendlyFikenError\(syncNote\)/);
});
