const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("admin/broyting.html", "utf8");
const app = fs.readFileSync("admin/broyting.js", "utf8");
const css = fs.readFileSync("admin/broyting.css", "utf8");

test("standard snow route visibly starts at 350 kr attendance plus hourly rate", () => {
  assert.match(page, /350 kr i oppmøte \+ arbeidstid/);
  assert.match(page, /value="hybrid">350 kr oppmøte \+ timepris/);
  assert.match(app, /value="hybrid"/);
  assert.match(css, /\.snow-billing-warning/);
});

test("completed old snow job cannot show an incorrect no-callout final bill", () => {
  assert.match(app, /job\.pricingMode === "hourly"/);
  assert.match(app, /Oppmøtegebyr manglar/);
  assert.match(app, /data-apply-snow-fee/);
  assert.match(app, /\/apply-callout-fee/);
  assert.match(app, /await openBillingSummary\(updatedJob\)/);
});

test("old invoice draft is recognized and corrected without issuing it", () => {
  assert.match(app, /invoiceData\.invoice\?\.status === "draft"/);
  assert.match(app, /showMissingSnowFee\(job, invoiceId\)/);
  assert.match(app, /correction\.draftInvoiceId/);
  assert.match(app, /Eksisterande fakturautkast er oppdatert/);
});

test("published snow page busts stale JS and CSS caches", () => {
  assert.match(page, /broyting\.css\?v=20261111-callout1/);
  assert.match(page, /broyting\.js\?v=20261111-callout1/);
});
