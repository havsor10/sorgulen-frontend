const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "admin", "operations-ui.js"), "utf8");

test("manager supports time, expense, equipment, material and note editing", () => {
  assert.match(code, /function managerMarkup/);
  assert.match(code, /const editActions = \(kind, entryId, label\)/);
  for (const kind of ["time", "expense", "equipment", "material", "note"]) {
    assert.match(code, new RegExp(`editActions\\("${kind}"`));
  }
  assert.match(code, /assertRegistrationEditable/);
});
