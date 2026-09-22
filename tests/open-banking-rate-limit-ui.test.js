const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const js = fs.readFileSync("admin/fiken.js", "utf8");
const css = fs.readFileSync("admin/fiken.css", "utf8");
const html = fs.readFileSync("admin/fiken.html", "utf8");

test("bankfeed recognizes legacy and structured rate-limit warnings", () => {
  assert.match(js, /lastErrorCode === "rate_limited"/);
  assert.match(js, /429\|too many requests\|rate\.\?limit/i);
  assert.match(js, /Banken begrenser synk midlertidig/);
});

test("manual bank sync is disabled while backend cooldown is active", () => {
  assert.match(js, /nextSyncAllowedAt/);
  assert.match(js, /Kan synkes om/);
  assert.match(js, /syncInProgress/);
  assert.match(js, /Synk pågår/);
  assert.match(html, /id="bankSyncBtn"/);
});

test("normal recent-sync cooldown and provider throttling are shown differently", () => {
  assert.match(js, /recently_synced/);
  assert.match(js, /Banken blei nettopp synkronisert/);
  assert.match(js, /rateLimitActive/);
  assert.match(css, /fiken-badge\.waiting/);
  assert.match(css, /bank-warning\.is-rate-limit/);
});
