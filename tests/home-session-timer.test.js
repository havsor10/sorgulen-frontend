const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const home = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");

test("home live timer uses current session time, not project total", () => {
  assert.match(home, /calculateCurrentSessionSeconds/);
  assert.match(home, /data-live-timer>\$\{fmtDuration\(sessionSeconds\(active\)\)\}/);
  assert.match(home, /timer\.textContent=fmtDuration\(sessionSeconds\(home\.activeWorkOrder\)\)/);
});

test("home session timer assets are cache-busted", () => {
  assert.match(html, /work-order-time\.js\?v=20260918-session1/);
  assert.match(html, /hjem\.js\?v=20260918-session1/);
});
