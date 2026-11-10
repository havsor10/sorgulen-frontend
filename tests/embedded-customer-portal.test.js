const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("every work-order workspace contains an integrated customer portal, without a second backend", () => {
  const source = read("admin/work-order-field.js");
  assert.match(source, /portalMarkup\(order\) \+/);
  assert.match(source, /data-field-open-portal/);
  assert.match(source, /id="fieldCustomerPortal"/);
  assert.match(source, /kundeportal\.html\?workOrderId=/);
  assert.match(source, /&embed=1/);
  assert.doesNotMatch(source, /data-field-open-portal[^\n]*href=/);
  assert.match(source, /event\.source !== frame\.contentWindow/);
  assert.match(source, /event\.origin !== location\.origin/);
});

test("embedded portal reuses exact work-order selection and existing save, link, images and procurement flows", () => {
  const portal = read("admin/kundeportal.js");
  const html = read("admin/kundeportal.html");
  assert.match(portal, /new URLSearchParams\(window\.location\.search\)\.get\("workOrderId"\)/);
  assert.match(portal, /workOrders\.push\(result\.workOrder\)/);
  assert.match(portal, /await selectProject\(requestedId\)/);
  assert.match(portal, /generatePortalLink/);
  assert.match(portal, /revokePortalLink/);
  assert.match(portal, /savePortalSettings/);
  assert.match(portal, /saveProcurement\(/);
  assert.match(portal, /uploadPortalImage/);
  assert.match(html, /kundeportal-embedded\.css/);
  assert.match(html, /portal-embed/);
  assert.match(html, /kundeportal-publish\.js/);
});

test("embedded portal hides the other customers and admin shell without changing normal portal admin", () => {
  const css = read("admin/kundeportal-embedded.css");
  const html = read("admin/oppdrag.html");
  assert.match(css, /html\.portal-embed \.portal-project-picker/);
  assert.match(css, /html\.portal-embed #adminShell/);
  assert.match(css, /html\.portal-embed #portalEditor/);
  assert.match(html, /work-order-portal\.css/);
  assert.match(html, /work-order-field\.js\?v=20261110-portal1/);
});

test("portal actions on active and planned cards open the existing job modal, not another page", () => {
  const cards = read("admin/customer-portal-links.js");
  const work = read("admin/work-order-field.js");
  assert.match(cards, /link\.dataset\.openPortalOrder = openButton\.dataset\.id/);
  assert.match(cards, /open-job-detail/);
  assert.match(work, /pendingPortalOrderId === order\._id/);
  assert.match(work, /pendingPortalOrderId = opener\.dataset\.openPortalOrder/);
});

test("Netlify only allows the portal editor to be framed by the same site", () => {
  const headers = read("_headers");
  assert.match(headers, /\/admin\/kundeportal\.html\n  X-Frame-Options: SAMEORIGIN/);
  assert.match(headers, /Content-Security-Policy: frame-ancestors 'self'/);
  assert.match(headers, /\/\*\n  X-Frame-Options: DENY/);
});
