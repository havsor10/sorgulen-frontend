const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/work-order-description-edit.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/work-order-description-edit.css"), "utf8");

test("oppdrag loads the direct description editor after field workspace", () => {
  assert.match(html, /meta name="sorgulen-build" content="field-ui-[^"]+"/);
  assert.match(html, /work-order-description-edit\.css\?v=[^"]+/);
  assert.match(html, /work-order-description-edit\.js\?v=[^"]+/);
  assert.ok(html.indexOf("work-order-field.js") < html.indexOf("work-order-description-edit.js"));
});

test("both description buttons are intercepted directly in capture phase", () => {
  assert.match(js, /closest\("\[data-field-edit-session\]"\)/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /event\.stopImmediatePropagation\(\)/);
  assert.match(js, /}, true\);/);
});

test("description save patches only the selected time entry and reopens the order", () => {
  assert.match(js, /\/admin\/operations\/work-orders\/\$\{encodeURIComponent\(activeOrderId\)\}\/time\/\$\{encodeURIComponent\(activeEntryId\)\}/);
  assert.match(js, /body: JSON\.stringify\(\{ description \}\)/);
  assert.match(js, /oppdrag\.html\?open=/);
  assert.doesNotMatch(js, /durationMinutes/);
  assert.doesNotMatch(js, /hourlyRate:/);
});

test("direct editor is guaranteed above the existing modal stack", () => {
  assert.match(css, /z-index:30000/);
  assert.match(css, /direct-description-modal\[hidden\]/);
});
