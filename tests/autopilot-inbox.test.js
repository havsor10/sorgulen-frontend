const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "autopilot.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin", "autopilot.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "admin", "admin-shell.js"), "utf8");

test("Autopilot has a dedicated mobile-first admin page", () => {
  assert.match(html, /data-page="autopilot"/);
  assert.match(html, /id="approvalList"/);
  assert.match(html, /id="revisionList"/);
  assert.match(html, /Sørgulen er under kontroll/);
  assert.match(html, /V0\.2 er fortsatt Shadow Mode/);
});

test("Autopilot presents approve, change and reject controls", () => {
  assert.match(js, /data-choice="approve"/);
  assert.match(js, /data-open-change/);
  assert.match(js, /data-choice="reject"/);
  assert.match(js, /data-choice="change"/);
  assert.match(js, /\/inbox\/\$\{encodeURIComponent\(id\)\}\/decision/);
});

test("Autopilot refresh can run a controlled shadow scan", () => {
  assert.match(js, /api\("\/scan"/);
  assert.match(js, /load\(\{ scan: true, sync: false \}\)/);
  assert.match(js, /load\(\{ sync: false \}\)/);
});

test("Autopilot remains available internally but is hidden from shared admin navigation", () => {
  assert.doesNotMatch(shell, /href="autopilot\.html"/);
  assert.doesNotMatch(shell, /pageClass\("autopilot"\)/);
  assert.match(shell, /\["home", "jobs", "customers", "economy"\]/);
  assert.doesNotMatch(shell, /\/admin\/autopilot\/inbox\/summary/);
  assert.doesNotMatch(shell, /\/admin\/autopilot\/inbox\?state=all&limit=1/);
});
