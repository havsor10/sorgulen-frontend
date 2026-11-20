const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const load = (file) => fs.readFileSync(file, "utf8");

const field = load("admin/work-order-field.js");
const operations = load("admin/operations-ui.js");
const detail = load("admin/faktura-detalj.js");
const invoicePage = load("admin/faktura-detalj.html");
const orderPage = load("admin/oppdrag.html");

test("hvert innkjøp får egen kvitteringsknapp uavhengig av fakturalås", () => {
  assert.match(field, /data-field-receipt=/);
  assert.match(field, /window\.SorgulenOperations\.openReceipt/);
  assert.match(field, /\+ Legg til kvittering/);
  assert.match(field, /Se \/ endre kvittering/);
});

test("bilagseditor støtter bilde, bytte og fjerning uten økonomiendring", () => {
  assert.match(operations, /async function openReceipt/);
  assert.match(operations, /removeReceipt: true/);
  assert.match(operations, /receiptImage: image/);
  assert.match(operations, /expenses\/.*\/receipt/);
  assert.match(operations, /openReceipt, refreshBadges/);
  assert.match(operations, /Bilag som er overført til Fiken kan ikke endres/);
});

test("fakturalinje har direkte kontroll for relevante kildeutgifter", () => {
  assert.match(detail, /function expenseSource\(line\)/);
  assert.match(detail, /sourceEntryKey/);
  assert.match(detail, /data-receipt-order=/);
  assert.match(detail, /data-receipt-entry=/);
  assert.match(detail, /SorgulenOperations\.openReceipt/);
  assert.match(invoicePage, /operations-ui\.js\?v=20261120-receipts1/);
});

test("oppdragsvisning laster nye filer og unngår gammel cache", () => {
  assert.match(orderPage, /work-order-field\.js\?v=20261110-fullscreen2-receipts20261120/);
  assert.match(orderPage, /operations-ui\.js\?v=20261004-lock2-receipts20261120/);
  assert.match(orderPage, /work-order-field\.css\?v=20261110-portalnav1-receipts20261120/);
});

test("fakturalinje får nøyaktig én kvitteringsknapp og én klikkbehandler", () => {
  assert.equal((detail.match(/function expenseSource\(line\)/g) || []).length, 1);
  assert.equal((detail.match(/data-receipt-order=/g) || []).length, 1);
  assert.equal((detail.match(/querySelectorAll\("\[data-receipt-order\]/g) || []).length, 1);
});
