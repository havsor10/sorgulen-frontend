const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "admin", "operations-ui.js"), "utf8");

test("manager supports time, expense, material and note editing", () => {
  for (const kind of ["time", "expense", "material", "note"]) assert.match(code, new RegExp(`data-op-edit=\\"${kind}\\"`));
});
