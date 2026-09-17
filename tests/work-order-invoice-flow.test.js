const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const oppdragHtml = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const editor = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");
const invoiceHtml = fs.readFileSync(path.join(root, "admin/faktura-ny.html"), "utf8");
const invoiceJs = fs.readFileSync(path.join(root, "admin/faktura-ny.js"), "utf8");

test("oppdrag bruker én lukket workflow uten gammelt overlay", () => {
  assert.match(oppdragHtml, /field-ui-20260917-audit2/);
  assert.match(oppdragHtml, /work-order-editor\.js\?v=20260917-audit2/);
  assert.doesNotMatch(oppdragHtml, /completed-work-order-flow\.js/);
});

test("ferdigstilt ufakturert oppdrag kan korrigeres og faktureres direkte med id", () => {
  assert.match(editor, /displayStatus === "completed" && !order\.invoiceId/);
  assert.match(editor, /faktura-ny\.html\?workOrderId=/);
  assert.match(editor, /Opprett faktura/);
  assert.match(editor, /Registreringer \/ korriger/);
  assert.match(editor, /data-editor-manage-order/);
  assert.match(editor, /openManager/);
});

test("ny faktura eier oppdragsvalg uten eget overlay", () => {
  assert.match(invoiceHtml, /faktura-ny\.js\?v=20260915-audit1/);
  assert.doesNotMatch(invoiceHtml, /invoice-work-order-picker\.js/);
  assert.match(invoiceHtml, /Fakturer ferdigstilt oppdrag/);
  assert.match(invoiceHtml, /Du trenger ikkje referansenummer/);
  assert.match(invoiceJs, /\/admin\/work-orders\?limit=200/);
  assert.match(invoiceJs, /order\.status === "completed" && !order\.invoiceId/);
  assert.match(invoiceJs, /faktura-ny\.html\?workOrderId=/);
});

test("work-order invoice henter kunde og fakturalinjer automatisk", () => {
  assert.match(invoiceJs, /params\.get\("workOrderId"\)/);
  assert.match(invoiceJs, /\/invoices\/work-order\//);
  assert.match(invoiceJs, /fillCustomer\(data\.customer/);
  assert.match(invoiceJs, /\(data\.lines \|\| \[\]\)\.forEach/);
  assert.match(invoiceJs, /sourceType: data\.sourceType/);
});
