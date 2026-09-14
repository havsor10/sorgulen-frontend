const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const oppdragHtml = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const completedFlow = fs.readFileSync(path.join(root, "admin/completed-work-order-flow.js"), "utf8");
const invoiceHtml = fs.readFileSync(path.join(root, "admin/faktura-ny.html"), "utf8");
const invoicePicker = fs.readFileSync(path.join(root, "admin/invoice-work-order-picker.js"), "utf8");
const invoiceJs = fs.readFileSync(path.join(root, "admin/faktura-ny.js"), "utf8");

test("oppdrag cache-buster loads the closed work-order flow", () => {
  assert.match(oppdragHtml, /20260915-flow2/);
  assert.match(oppdragHtml, /completed-work-order-flow\.js\?v=20260915-flow2/);
  assert.doesNotMatch(oppdragHtml, /work-order-field-compat\.js\?v=20260914-ai1/);
});

test("completed uninvoiced work orders stay editable and invoice directly by id", () => {
  assert.match(completedFlow, /\["completed", "cancelled"\]\.includes\(order\.status\)/);
  assert.match(completedFlow, /else if \(order\.invoiceId\)/);
  assert.match(completedFlow, /faktura-ny\.html\?workOrderId=/);
  assert.match(completedFlow, /Opprett faktura fra dette oppdraget/);
  assert.match(completedFlow, /data-completed-add-time/);
  assert.match(completedFlow, /data-entry="expense"/);
  assert.match(completedFlow, /data-entry="material"/);
  assert.match(completedFlow, /data-entry="note"/);
  assert.match(completedFlow, /SorgulenOperations\.openManualTime/);
});

test("new invoice page offers completed work orders instead of requiring a reference", () => {
  assert.match(invoiceHtml, /invoice-work-order-picker\.js\?v=20260915-flow1/);
  assert.match(invoiceHtml, /faktura-ny\.js\?v=20260915-flow1/);
  assert.match(invoicePicker, /\/admin\/work-orders\?limit=200/);
  assert.match(invoicePicker, /order\.status === "completed" && !order\.invoiceId/);
  assert.match(invoicePicker, /faktura-ny\.html\?workOrderId=/);
  assert.match(invoicePicker, /Du trenger ikkje referansenummer/);
});

test("work-order invoice path auto-loads customer and invoice lines from backend", () => {
  assert.match(invoiceJs, /new URLSearchParams\(location\.search\)\.get\("workOrderId"\)/);
  assert.match(invoiceJs, /\/invoices\/work-order\//);
  assert.match(invoiceJs, /fillCustomer\(data\.customer/);
  assert.match(invoiceJs, /\(data\.lines \|\| \[\]\)\.forEach/);
  assert.match(invoiceJs, /sourceType: data\.sourceType/);
});
