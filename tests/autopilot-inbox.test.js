const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "autopilot.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin", "autopilot.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "admin", "admin-shell.js"), "utf8");

test("Autopilot has a dedicated mobile-first guarded admin page", () => {
  assert.match(html, /data-page="autopilot"/);
  assert.match(html, /id="approvalList"/);
  assert.match(html, /id="revisionList"/);
  assert.match(html, /id="executionList"/);
  assert.match(html, /Sørgulen er under kontroll/);
  assert.match(html, /Guarded Autopilot/);
  assert.match(html, /AI kan fortsatt ikke kjøpe noe/);
});

test("Autopilot presents approve, change and reject controls", () => {
  assert.match(js, /data-choice="approve"/);
  assert.match(js, /data-open-change/);
  assert.match(js, /data-choice="reject"/);
  assert.match(js, /data-choice="change"/);
  assert.match(js, /\/inbox\/\$\{encodeURIComponent\(id\)\}\/decision/);
});

test("Autopilot shows real executions with guarded undo and retry", () => {
  assert.match(js, /\/executions\?limit=12/);
  assert.match(js, /data-execution-action="undo"/);
  assert.match(js, /data-execution-action="retry"/);
  assert.match(js, /\/executions\/\$\{encodeURIComponent\(id\)\}\/\$\{action\}/);
  assert.match(js, /Fakturautkast er opprettet/);
});

test("Autopilot refresh can run a controlled guarded scan", () => {
  assert.match(js, /api\("\/scan"/);
  assert.match(js, /load\(\{ scan: true, sync: false \}\)/);
  assert.match(js, /load\(\{ sync: false \}\)/);
});

test("admin shell makes Autopilot a primary destination without running full inbox sync", () => {
  assert.match(shell, /href: "autopilot\.html"/);
  assert.match(shell, /\["home", "autopilot", "jobs", "invoices"\]/);
  assert.match(shell, /\/admin\/autopilot\/inbox\/summary/);
  assert.doesNotMatch(shell, /\/admin\/autopilot\/inbox\?state=all&limit=1/);
});