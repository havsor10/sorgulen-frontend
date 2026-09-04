const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "admin/admin-shell.js"), "utf8");

test("admin shell loads shared operational assets", () => {
  assert.match(code, /operations\.css/);
  assert.match(code, /operations-ui\.js/);
});
