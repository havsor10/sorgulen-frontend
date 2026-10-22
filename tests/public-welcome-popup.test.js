const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const maintenance = fs.readFileSync("maintenance.js", "utf8");
const headers = fs.readFileSync("_headers", "utf8");

test("offentlig nettside åpner uten velkomstpopup", () => {
  assert.doesNotMatch(maintenance, /maint-overlay/);
  assert.doesNotMatch(maintenance, /welcomeContinue/);
  assert.doesNotMatch(maintenance, /sorgulen_welcome_shown/);
  assert.doesNotMatch(maintenance, /Velkommen til Sørgulen Industriservice/);
});

test("maintenance bootstrap beholdes uten gammel popup-cache", () => {
  assert.match(maintenance, /site-consistency\.js/);
  assert.match(maintenance, /registerVisit/);
  assert.match(headers, /\/maintenance\.js\s+Cache-Control: no-store, max-age=0/);
});
