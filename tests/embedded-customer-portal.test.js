const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("work-order modal has only one compact portal action and keeps all financial panels", () => {
  const source = read("admin/work-order-field.js");
  assert.match(source, /class="field-minor-link customer-portal-detail-link" href="kundeportal\.html\?fullscreen=1&amp;workOrderId=/);
  assert.doesNotMatch(source, /portalMarkup\(|fieldCustomerPortal|ensurePortalLoaded|data-field-portal-frame/);
  assert.match(source, /financeStatusMarkup\(order\)/);
  assert.match(source, /ledgerBreakdownMarkup\(order/);
  assert.match(source, /moreProjectMarkup\(order/);
});

test("job card shortcuts open fullscreen portal directly without extra modal or duplicate storage", () => {
  const source = read("admin/customer-portal-links.js");
  assert.match(source, /kundeportal\.html\?fullscreen=1&workOrderId=/);
  assert.doesNotMatch(source, /data\.openPortalOrder|link\.type = "button"/);
  assert.match(source, /link\.href = portalHref\(openButton\.dataset\.id\)/);
});

test("fullscreen supports return to exact job and renders a single save dock", () => {
  const html = read("admin/kundeportal.html");
  const js = read("admin/kundeportal-fullscreen.js");
  assert.match(html, /portalFullscreenHeader/);
  assert.match(html, /portalReturnOrder/);
  assert.match(html, /portalFullscreenSave/);
  assert.match(html, /kundeportal-fullscreen\.css/);
  assert.match(js, /oppdrag\.html\?open=/);
  assert.match(js, /saveButton\.addEventListener\("click", saveAll\)/);
  assert.match(js, /window\.addEventListener\("beforeunload"/);
  assert.match(js, /Tu har ulagrede|Du har ulagrede/);
});

test("save dock detects all three editable areas, stages image and saves procurement internally", () => {
  const js = read("admin/kundeportal-fullscreen.js");
  const admin = read("admin/kundeportal.js");
  assert.match(js, /settings: false, procurement: false, image: false/);
  assert.match(js, /editingPublicProcurement\(\)/);
  assert.match(js, /api\(\)\.save\(changes\)/);
  assert.match(admin, /async function saveFullscreenChanges\(/);
  assert.match(admin, /"PATCH"/);
  assert.match(admin, /status: "researching"/);
  assert.match(admin, /SorgulenPortalImageUpload\.prepare\(file\)/);
  assert.match(admin, /partialSaved/);
});

test("public changes are explicitly confirmed, while SMS and email are never triggered", () => {
  const js = read("admin/kundeportal-fullscreen.js");
  const admin = read("admin/kundeportal.js");
  assert.match(js, /window\.confirm/);
  assert.match(js, /linkIsActive\(\)/);
  assert.match(js, /Ingen SMS eller e-post blir sendt/);
  assert.match(js, /data-save-procurement="awaiting_approval"/);
  assert.match(admin, /\/admin\/customer-portal\//);
  assert.doesNotMatch(js, /send-sms|send-email|\/messages\/send/);
});

test("old embed and frame override are removed; other portal admin flows survive", () => {
  const headers = read("_headers");
  const portal = read("admin/kundeportal.html");
  const job = read("admin/oppdrag.html");
  assert.match(headers, /\/\*\n  X-Frame-Options: DENY/);
  assert.doesNotMatch(headers, /X-Frame-Options: SAMEORIGIN/);
  assert.ok(!fs.existsSync(path.join(root, "admin/kundeportal-embedded.css")));
  assert.ok(!fs.existsSync(path.join(root, "admin/work-order-portal.css")));
  assert.match(portal, /kundeportal-mobile\.js/);
  assert.match(portal, /kundeportal-corrections\.js/);
  assert.match(job, /work-order-field\.js\?v=20261110-fullscreen1/);
});
