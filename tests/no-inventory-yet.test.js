const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("this phase does not introduce inventory admin pages", () => {
  const adminDir = path.resolve(__dirname, "..", "admin");
  const files = fs.readdirSync(adminDir);
  assert.ok(!files.some((name) => /lager|inventory/i.test(name)));
});
