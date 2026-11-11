const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("admin/broyting.html", "utf8");
const js = fs.readFileSync("admin/broyting.js", "utf8");

test("future bookings have an always-visible independent inbox before the active queue", () => {
  const inbox = html.indexOf('id="snowInbox"');
  assert.ok(inbox > 0);
  assert.ok(inbox < html.indexOf('id="activeRound"'));
  assert.match(html, /id="snowInboxCount"/);
  assert.match(html, /id="snowInboxList"/);
  assert.match(html, /id="snowPrepareRoundBtn"/);
  assert.match(js, /function renderInbox\(data\)/);
  assert.match(js, /renderInbox\(data\);/);
  assert.match(js, /data\?\.unassignedBookings\?\.total/);
  assert.match(js, /booking\.date/);
  assert.match(js, /booking\.customerName/);
});

test("operator cannot roll a round over while offline time entries remain", () => {
  assert.match(js, /const offlinePending = readJson\(PENDING_KEY, \[\]\)/);
  assert.match(js, /if \(offlinePending\.length\)/);
  assert.match(js, /\/admin\/snow\/rounds\/rollover/);
  assert.match(js, /confirm\(/);
});

test("CSS and JS URLs change to refresh outdated browser caches", () => {
  assert.match(html, /broyting\.css\?v=20261111-inbox1/);
  assert.match(html, /broyting\.js\?v=20261111-inbox1/);
});
