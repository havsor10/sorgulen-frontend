const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "admin", "kunde-v2.js"), "utf8");

test("customer page exposes manual, interval and monthly billing", () => {
  assert.match(code, /Manuell/);
  assert.match(code, /Hver X dag/);
  assert.match(code, /Månedlig/);
});
