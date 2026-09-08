const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("admin-manifest er installérbart og avgrenset til admin", () => {
  const manifest = JSON.parse(read("admin/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/admin/hjem.html");
  assert.equal(manifest.scope, "/admin/");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 1);
});

test("service worker viser push og åpner bare admin-lenker", () => {
  const sw = read("admin/push-sw.js");
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.match(sw, /pathname\.startsWith\("\/admin\/"\)/);
  assert.match(sw, /setAppBadge/);
});

test("varslingssiden krever brukertrykk før Notification.requestPermission", () => {
  const html = read("admin/varslinger.html");
  const js = read("admin/varslinger.js");
  assert.match(html, /id="enablePushBtn"/);
  assert.match(html, /Legg til på Hjem-skjermen/);
  assert.match(js, /enableBtn\.addEventListener\("click", enablePush\)/);
  assert.match(js, /Notification\.requestPermission\(\)/);
  assert.match(js, /pushManager\.subscribe/);
});

test("adminskallet tilbyr Varslinger og registrerer service worker uten permission-prompt", () => {
  const shell = read("admin/admin-shell.js");
  assert.match(shell, /href="varslinger\.html"/);
  assert.match(shell, /serviceWorker\.register\("push-sw\.js"/);
  assert.doesNotMatch(shell, /Notification\.requestPermission/);
});
