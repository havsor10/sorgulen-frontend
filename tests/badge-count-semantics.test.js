const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "admin", "admin-shell.js"), "utf8");

test("navigation shows counts only when positive", () => {
  assert.match(code, /count <= 0/);
  assert.match(code, /99\+/);
});
