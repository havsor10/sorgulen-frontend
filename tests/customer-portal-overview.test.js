const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "prosjekt.html"), "utf8");
const js = fs.readFileSync(path.join(root, "prosjekt.js"), "utf8");

test("aktivt oppdrag er hovedinnholdet øverst", () => {
  assert.match(html, /sorgulen-logo-white-wordmark\.png/);
  assert.match(html, /class="portal-card welcome-card"/);
  assert.match(html, /id="nextWorkCard"/);
  assert.match(html, /class="portal-card status-card"/);
  assert.match(html, /id="workFactsCard"/);
  assert.match(html, /id="workDaysCard"/);
  assert.match(html, /id="photosCard"/);
  assert.match(html, /href="tel:\+4740730187"/);
});

test("historikk ligger etter dagens prosjektinformasjon", () => {
  const currentIndex = html.indexOf('id="photosCard"');
  const historyIndex = html.indexOf('id="historySection"');
  assert.ok(currentIndex >= 0);
  assert.ok(historyIndex > currentIndex);
  assert.match(html, /Tidligere arbeid og fakturaer/);
});

test("bare faktura som krever handling vises i dagens del", () => {
  assert.match(html, /id="currentInvoiceCard"/);
  assert.match(js, /invoice\.status === "overdue"/);
  assert.match(js, /invoice\.status === "unpaid"/);
  assert.doesNotMatch(html, /id="overviewStateCard"/);
  assert.doesNotMatch(html, />\s*60\s*%\s*</);
});

test("faktura åpnes med portalnøkkel i POST og ikke i URL", () => {
  assert.match(js, /access\/invoices\/\$\{encodeURIComponent\(invoiceId\)\}\/pdf/);
  assert.match(js, /body: JSON\.stringify\(\{ token: accessToken \}\)/);
});
