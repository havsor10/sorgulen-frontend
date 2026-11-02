const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin home no longer loads the old giant project card helper", () => {
  const html = read("admin/hjem.html");
  assert.doesNotMatch(html, /home-project-link\.css/);
  assert.doesNotMatch(html, /home-project-link\.js/);
  assert.match(html, /home-working-cards\.css/);
});

test("customer card expands for work and Mer links to full editing", () => {
  const js = read("admin/hjem.js");
  assert.match(js, /data-select-work/);
  assert.match(js, /selectedWorkId/);
  assert.match(js, /workActionMarkup/);
  assert.match(js, /oppdrag\.html\?open=/);
  assert.match(js, /Mer – full oversikt, redigering og utgifter/);
});
