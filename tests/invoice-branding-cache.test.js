const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "../admin/faktura-detalj.html"), "utf8");

test("invoice detail controller is cache-busted after workflow cleanup", () => {
  assert.match(html, /faktura-detalj\.js\?v=20260915-audit1/);
  assert.match(html, /invoice-flow-20260915-audit1/);
});
