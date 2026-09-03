const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("customer register and unified customer page are real admin routes", () => {
  for (const file of ["admin/kunder.html", "admin/kunder.js", "admin/kunde.html", "admin/kunde-v2.js"]) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.match(read("admin/kunder.js"), /\/admin\/customers/);
  assert.match(read("admin/kunde-v2.js"), /workOrders/);
  assert.match(read("admin/kunde-v2.js"), /invoices/);
  assert.match(read("admin/kunde-v2.js"), /customerNoteForm/);
});

test("project UI exposes manual time and billing controls backed by API", () => {
  const html = read("admin/oppdrag.html"), js = read("admin/oppdrag.js");
  assert.match(html, /pricingMode/);
  assert.match(html, /entryModal/);
  assert.match(js, /time-entries/);
  assert.match(js, /confirmWarnings/);
  assert.match(js, /purchase/);
  assert.match(js, /transport/);
  assert.match(js, /entryOperationId/);
});

test("invoice preview no longer leaks admin key in query and sending is explicit", () => {
  const js = read("admin/faktura-detalj.js");
  assert.doesNotMatch(js, /preview\?key=/);
  assert.match(js, /email-suggestion/);
  assert.match(js, /operationId/);
  assert.match(js, /confirm\(/);
});

test("legacy request previews also keep the admin key out of URLs", () => {
  const js = read("admin/foresporsler.js");
  assert.doesNotMatch(js, /preview\?key=/);
  assert.match(js, /openProtectedPdf/);
  assert.match(js, /URL\.createObjectURL/);
});

test("home lists several ongoing projects and mobile quick time registration", () => {
  assert.match(read("admin/hjem.html"), /ongoingProjects/);
  const js = read("admin/hjem.js");
  assert.match(js, /data-quick="time"/);
  assert.match(js, /time-entries/);
  assert.match(read("admin/hjem.html"), /name="operationId"/);
});
