const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const js = fs.readFileSync("admin/felt.js", "utf8");
const html = fs.readFileSync("admin/felt.html", "utf8");

test("kvittering kan velges fra eksisterende bilder på mobil", () => {
  assert.match(js, /name="receipt" type="file" accept="image\/\*"/);
  assert.doesNotMatch(js, /name="receipt"[^>]*capture=/);
  assert.match(js, /Velg et eksisterende bilde fra mobilen eller ta et nytt bilde/);
});

test("Feltadmin laster ny kvitteringsversjon uten gammel cache", () => {
  assert.match(html, /felt\\.js\\?v=20261028-override1/);
  assert.match(html, /felt\\.css\\?v=20261028-override1/);
});
