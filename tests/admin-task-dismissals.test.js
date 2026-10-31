const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "admin");
const js = fs.readFileSync(path.join(root, "hjem.js"), "utf8");
const html = fs.readFileSync(path.join(root, "hjem.html"), "utf8");

test("admin shows independent Ordnet and Fjern varsel buttons", () => {
  assert.match(js, /data-resolve-task/);
  assert.match(js, /data-disposition="handled"/);
  assert.match(js, /data-disposition="dismissed"/);
  assert.match(js, /<article class="task-row/);
});

test("resolved notifications use authenticated backend and can be restored", () => {
  assert.match(js, /\/admin\/assistant\/tasks\/resolved/);
  assert.match(js, /method:"DELETE"/);
  assert.match(js, /method:"POST"/);
  assert.match(html, /id="resolvedTaskList"/);
  assert.match(html, /id="resolvedTaskCount"/);
  assert.match(js, /Fakturaen|INGEN faktura/);
});
