const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "prosjekt.html"), "utf8");
const js = fs.readFileSync(path.join(root, "prosjekt.js"), "utf8");

test("kundeportalen har enkel hovedoversikt og tydelig ringeknapp", () => {
  assert.match(html, /sorgulen-logo-white-wordmark\.png/);
  assert.match(html, /id="overviewStateCard"/);
  assert.match(html, /id="nextWorkCard"/);
  assert.match(html, /id="overviewInvoiceCard"/);
  assert.match(html, /href="tel:\+4740730187"/);
});

test("oversikten bruker ekte statusdata og viser ikke oppdiktet prosentfremdrift", () => {
  assert.match(js, /project\.customerOverview/);
  assert.match(js, /overdueInvoiceCount/);
  assert.match(js, /unpaidInvoiceCount/);
  assert.doesNotMatch(html, />\s*60\s*%\s*</);
});

test("faktura åpnes med portalnøkkel i POST og ikke i URL", () => {
  assert.match(js, /access\/invoices\/\$\{encodeURIComponent\(invoiceId\)\}\/pdf/);
  assert.match(js, /body: JSON\.stringify\(\{ token: accessToken \}\)/);
});
