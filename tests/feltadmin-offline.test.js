const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("admin/felt.html", "utf8");
const field = fs.readFileSync("admin/felt.js", "utf8");
const offline = fs.readFileSync("admin/field-offline.js", "utf8");

test("Feltadmin loads persistent offline storage before field runtime", () => {
  const offlineIndex = html.indexOf("field-offline.js");
  const fieldIndex = html.indexOf("felt.js");
  assert.ok(offlineIndex >= 0);
  assert.ok(fieldIndex > offlineIndex);
  assert.match(html, /id="fieldSyncBadge"/);
  assert.match(html, /id="fieldSyncModal"/);
});

test("offline queue persists mutations in IndexedDB", () => {
  assert.match(offline, /indexedDB\.open/);
  assert.match(offline, /MUTATION_STORE = "mutations"/);
  assert.match(offline, /CACHE_STORE = "cache"/);
  assert.match(offline, /async function flush/);
  assert.match(offline, /retryErrors/);
});

test("all important field logs use submitMutation", () => {
  for (const type of ["new-job", "expense", "customer-note", "job-note", "time", "material"]) {
    assert.match(field, new RegExp('type: "' + type + '"'));
  }
  assert.match(field, /submitMutation/);
  assert.match(field, /Lagret på telefonen – venter på synk/);
});

test("queued field work auto-syncs when connection returns", () => {
  assert.match(field, /window\.addEventListener\("online"/);
  assert.match(field, /flushOfflineQueue/);
  assert.match(field, /setInterval\(\(\) => flushOfflineQueue\(\), 30_000\)/);
});

test("last known jobs and customers are cached for poor coverage", () => {
  assert.match(field, /cacheSet\("field-work-orders"/);
  assert.match(field, /cacheSet\("customers"/);
  assert.match(field, /cacheGet\("field-work-orders"/);
  assert.match(field, /cacheGet\("customers"/);
});

test("timer controls do not pretend to work offline", () => {
  assert.match(field, /START\/PAUSE\/FORTSETT krever nett/);
});
