const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const oppdragHtml = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const invoiceHtml = fs.readFileSync(path.join(root, "admin/faktura-ny.html"), "utf8");
const invoicePicker = fs.readFileSync(path.join(root, "admin/invoice-work-order-picker.js"), "utf8");
const invoiceJs = fs.readFileSync(path.join(root, "admin/faktura-ny.js"), "utf8");

test("oppdrag bruker samlet feltmotor for ferdig oppdrag", () => {
  assert.match(oppdragHtml, /field-ui-20260919-zero1/);
  assert.doesNotMatch(oppdragHtml, /completed-work-order-flow\.js/);
});

test("ferdig ufakturert oppdrag forblir redigerbart og faktureres direkte på id", () => {
  assert.match(field, /order\.workflow\?\.canAddRegistrations/);
  assert.match(field, /workflow\.canOpenInvoice \|\| order\.invoiceId/);
  assert.match(field, /faktura-ny\.html\?workOrderId=/);
  assert.match(field, /Opprett faktura/);
  assert.match(field, /data-field-add-time/);
  assert.match(field, /data-entry="expense"/);
  assert.match(field, /data-entry="material"/);
  assert.match(field, /data-entry="note"/);
});

test("ny faktura tilbyr ferdige oppdrag uten krav om referanse", () => {
  assert.match(invoiceHtml, /invoice-work-order-picker\.js\?v=20260915-flow1/);
  assert.match(invoicePicker, /\/admin\/work-orders\?limit=200/);
  assert.match(invoicePicker, /order\.status === "completed" && !order\.invoiceId/);
  assert.match(invoicePicker, /faktura-ny\.html\?workOrderId=/);
  assert.match(invoicePicker, /Du trenger ikkje referansenummer/);
});

test("work-order fakturaflyt henter kunde og linjer fra backend", () => {
  assert.match(invoiceJs, /new URLSearchParams\(location\.search\)\.get\("workOrderId"\)/);
  assert.match(invoiceJs, /\/invoices\/work-order\//);
  assert.match(invoiceJs, /fillCustomer\(data\.customer/);
  assert.match(invoiceJs, /\(data\.lines \|\| \[\]\)\.forEach/);
  assert.match(invoiceJs, /sourceType: data\.sourceType/);
});
