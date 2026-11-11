const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("style.css", "utf8");
const html = fs.readFileSync("index.html", "utf8");

test("premium service badge has strong contrast over service images", () => {
  assert.match(css, /\.card \.media \.premium-badge/);
  assert.match(css, /background:rgba\(7,12,20,\.94\)/);
  assert.match(css, /color:#ffffff/);
  assert.match(css, /border:1px solid rgba\(92,231,180,\.88\)/);
  assert.match(css, /font-weight:900/);
});

test("front page loads cache-busted badge styles", () => {
  assert.match(html, /style\.css\?v=20261111-badge1/);
  assert.match(html, /<span class="badge premium-badge">Populær • Fra [^<]+<\/span>/);
});
