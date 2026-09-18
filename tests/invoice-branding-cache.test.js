const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "../admin/faktura-detalj.html"), "utf8");

test("invoice detail controller is cache-busted after validation change", () => {
  assert.match(html, /faktura-detalj\.js\?v=20260919-discount1/);
});
