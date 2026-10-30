const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const work = fs.readFileSync(path.join(root, "admin/oppdrag.js"), "utf8");
const invoice = fs.readFileSync(path.join(root, "admin/faktura-ny.js"), "utf8");
const editInvoice = fs.readFileSync(path.join(root, "admin/faktura-rediger.js"), "utf8");

test("både mobil- og fulladmin tilbyr ferdigstilling av fastpris uten timer", () => {
  assert.match(field, /order\.workflow\?\.canComplete === true/);
  assert.match(work, /workOrder\.workflow\?\.canComplete === true/);
  assert.match(field, /FERDIGSTILL FASTPRIS/);
  assert.match(work, /FERDIGSTILL FASTPRIS/);
});
test("manuell faktura summerer antall ganger sats, uten udefinert linjebeløp", () => {
  assert.match(invoice, /line\.quantity \* line\.unitPrice/);
  assert.doesNotMatch(invoice, /sum \+ line\.amount, 0/);
  assert.match(editInvoice, /line\.quantity \* line\.unitPrice/);
  assert.doesNotMatch(editInvoice, /sum \+ line\.amount, 0/);
});
