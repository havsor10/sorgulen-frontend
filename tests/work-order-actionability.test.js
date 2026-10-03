const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("work-order missing-description warnings are directly actionable", () => {
  const html = read("admin/oppdrag.html");
  const source = read("admin/work-order-actionability.js");

  assert.match(html, /work-order-actionability\.js\?v=/);
  assert.match(source, /\.field-session\.missing-description/);
  assert.match(source, /\[data-field-edit-session\]/);
  assert.match(source, /\.field-issue/);
  assert.match(source, /action\.click\(\)/);
  assert.match(source, /keydown/);
  assert.match(source, /Enter/);
});
