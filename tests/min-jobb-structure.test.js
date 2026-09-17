const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("direct customer page is private and uses the direct-job API", () => {
  const html = read("min-jobb.html");
  const js = read("min-jobb.js");
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(js, /\/customer-job\/access/);
  assert.match(js, /15000/);
  assert.match(html, /Arbeidstid så langt/);
  assert.doesNotMatch(html, /Innkjøp \/ materialer|Godkjenn innkjøp/);
});

test("snow admin can send on-the-way status before start", () => {
  const html = read("admin/broyting.html");
  const js = read("admin/broyting-portal.js");
  assert.match(html, /broyting-portal\.js/);
  assert.match(js, /data-start-job/);
  assert.match(js, /\/admin\/direct-job\/snow-jobs\//);
  assert.match(js, /on-the-way/);
  assert.match(js, /PÅ VEI/);
});

test("locked purchases get correction and removal controls", () => {
  const html = read("admin/kundeportal.html");
  const js = read("admin/kundeportal-corrections.js");
  assert.match(html, /kundeportal-corrections\.js/);
  assert.match(js, /Korriger \/ erstatt/);
  assert.match(js, /\/correct/);
  assert.match(js, /\/remove/);
  assert.match(js, /krever ny godkjenning|krev ny godkjenning/i);
  assert.match(js, /Historikken slettes ikke/);
});
