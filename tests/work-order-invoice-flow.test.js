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
  assert.match(oppdragHtml, /field-ui-20261004-lock2/);
  assert.doesNotMatch(oppdragHtml, /completed-work-order-flow\.js/);
});

test("oppdrag kan korrigeres, delfaktureres og sluttfaktureres uten å miste registreringer", () => {
  assert.match(field, /const canAdd = order\.status !== "cancelled" && !projectRegistrationsLocked\(order\)/);
  assert.match(field, /workflow\.canOpenInvoice \|\| order\.invoiceId/);
  assert.match(field, /faktura-ny\.html\?workOrderId=/);
  assert.match(field, /Opprett sluttfaktura/);
  assert.match(field, /Fakturer arbeid hittil/);
  assert.match(field, /\/admin\/operations\/work-orders\/\$\{encodeURIComponent\(currentOrder\._id\)\}\/invoice-draft/);
  assert.match(field, /data-field-add-time/);
  assert.match(field, /data-entry="expense"/);
  assert.match(field, /data-field-add-equipment/);
  assert.match(field, /data-entry="material"/);
  assert.match(field, /data-entry="note"/);\n  assert.match(field, /billingLocks/);\n  assert.match(field, /registrationBillingLock/);
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

test("pågående prosjekt lager ikke parallelle utkast eller tilbyr allerede fakturerte poster på nytt", () => {
  assert.match(field, /const activeDraft = Object\.values\(order\.billingLocks\?\.entries \|\| \{\}\)/);
  assert.match(field, /Åpne fakturautkast/);
  assert.match(field, /const isUnbilled = \(kind, entryId\)/);
  assert.match(field, /registrationBillingLock\(order, kind, entryId\)/);
  assert.match(field, /order\.pricingMode === "fixed"/);
});

