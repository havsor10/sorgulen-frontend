const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");

test("oppdrag bruker samlet editor i stedet for eget beskrivelseslag", () => {
  assert.match(html, /meta name="sorgulen-build" content="admin-cleanup-[^"]+"/);
  assert.match(html, /work-order-editor\.js\?v=[^"]+/);
  assert.doesNotMatch(html, /work-order-description-edit\.(js|css)/);
});

test("arbeidsøkt åpnes direkte på stabil entryId", () => {
  assert.match(js, /closest\("\[data-field-edit-session\]"\)/);
  assert.match(js, /entryId: sessionButton\.dataset\.fieldEditSession/);
  assert.match(js, /collectionFor\(order, kind\)\.find/);
});

test("beskrivelse lagres gjennom samme trygge tidseditor", () => {
  assert.match(js, /\/admin\/operations\/work-orders/);
  assert.match(js, /description: raw\.description\.trim\(\)/);
  assert.match(js, /method: editing \? "PATCH" : "POST"/);
});
