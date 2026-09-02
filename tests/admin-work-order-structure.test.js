const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const script = fs.readFileSync(path.join(root, "admin/oppdrag.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/admin.css"), "utf8");

test("all JavaScript element references exist exactly once in the page", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicateIds, []);

  const dynamicIds = [...script.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const referencedIds = [...script.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
  for (const id of referencedIds) {
    assert.ok(ids.includes(id) || dynamicIds.includes(id), `Missing HTML element #${id}`);
  }
});

test("loads production configuration and timestamp logic before the page controller", () => {
  const configIndex = html.indexOf('<script src="../config.js"></script>');
  const timeIndex = html.indexOf('<script src="work-order-time.js"></script>');
  const controllerIndex = html.indexOf('<script src="oppdrag.js"></script>');
  assert.ok(configIndex >= 0 && configIndex < timeIndex);
  assert.ok(timeIndex < controllerIndex);
});

test("keeps the integration inside admin and free from local-only or iframe fallbacks", () => {
  const combined = `${html}\n${script}`;
  assert.doesNotMatch(combined, /<iframe\b/i);
  assert.doesNotMatch(combined, /localhost|127\.0\.0\.1/i);
  assert.match(html, /href="admin-dashboard\.html"/);
  assert.match(script, /\/admin\/work-orders\/active/);
});

test("contains explicit mobile layouts and full-width critical controls", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.meter-controls \{ display: grid; grid-template-columns: 1fr; \}/);
  assert.match(css, /\.meter-controls \.work-btn \{ width: 100%; \}/);
  assert.match(css, /\.work-order-detail-grid \{ grid-template-columns: 1fr; \}/);
});
