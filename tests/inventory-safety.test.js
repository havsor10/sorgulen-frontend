const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) { return fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8"); }

test("inventory use is sent as one backend operation rather than client-side stock math", () => {
  const js = read("admin/lager.js");
  assert.match(js, /operationId:\s*uuid\("inventory-use"\)/);
  assert.match(js, /\/admin\/inventory\/\$\{encodeURIComponent\(item\._id\)\}\/use/);
  assert.doesNotMatch(js, /stockQuantity\s*=\s*stockQuantity\s*-/);
});

test("inventory-linked project material is corrected through inventory API", () => {
  const js = read("admin/inventory-material-edit.js");
  assert.match(js, /method:\s*"PATCH"/);
  assert.match(js, /method:\s*"DELETE"/);
  assert.match(js, /returnere.*til lager/i);
});

test("image registration requires user confirmation through the normal product form", () => {
  const js = read("admin/lager.js");
  assert.match(js, /AI-forslag lagt inn/);
  assert.match(js, /Kontroller spesielt varenummer/);
  assert.doesNotMatch(js, /analyzeSelectedImage[\s\S]{0,200}method:\s*"POST"[\s\S]{0,100}admin\/inventory\/"/);
});
