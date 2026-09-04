const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home operational CSS hides competing live categories and promotes stop", () => {
  const css = read("admin/operations.css");
  assert.match(css, /data-session=\\?"purchase\\?"/);
  assert.match(css, /data-session=\\?"transport\\?"/);
  assert.match(css, /data-confirm=\\?"stop\\?"/);
});

test("home enhancer renames primary work actions clearly", () => {
  const code = read("admin/operations-ui.js");
  assert.match(code, /STOPP ARBEID/);
  assert.match(code, /START ARBEID/);
  assert.match(code, /FORTSETT ARBEID/);
});
