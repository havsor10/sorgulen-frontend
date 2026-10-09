const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Ingen uautorisert bedrift-URL i sitemap", () => {
  const sitemap = fs.readFileSync("sitemap.xml", "utf8");
  assert.doesNotMatch(sitemap, /https:\/\/sorgulen\.no\/bedrift\//);
});

test("Ingen offentlig kobling til bedrift-prototypen", () => {
  const home = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(home, /<a[^>]+href=["']bedrift\//);
  const workflow = fs.readFileSync(".github/workflows/admin-tests.yml", "utf8");
  assert.doesNotMatch(workflow, /node --check bedrift\/bedrift\.js/);
});
