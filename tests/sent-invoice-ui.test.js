const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const code = fs.readFileSync(path.join(__dirname, "..", "admin", "operations-ui.js"), "utf8");

test("invoice basis sync is explicit and only presented for draft changes", () => {
  assert.match(code, /data\.status !== "draft"/);
  assert.match(code, /Fakturagrunnlaget er endret/);
  assert.match(code, /sync-basis/);
});
