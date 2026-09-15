const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const oppdragHtml = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const completedFlow = fs.readFileSync(path.join(root, "admin/completed-work-order-flow.js"), "utf8");
const invoiceHtml = fs.readFileSync(path.join(root, "admin/faktura-ny.html"), "utf8");
const invoiceJs = fs.readFileSync(path.join(root, "admin/faktura-ny.js"), "utf8");

test("oppdrag cache-buster loads the closed work-order flow", () => {
  assert.match(oppdragHtml, /20260915-flow2/);
  assert.match(oppdragHtml, /completed-work-order-flow\.js\?v=20260915-flow2/);
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

test("new invoice page owns work-order selection without a second overlay", () => {
  assert.match(invoiceHtml, /faktura-ny\.js\?v=20260915-audit1/);
  assert.doesNotMatch(invoiceHtml, /invoice-work-order-picker\.js/);
  assert.match(invoiceHtml, /Fakturer ferdigstilt oppdrag/);
  assert.match(invoiceHtml, /Du trenger ikkje referansenummer/);
  assert.match(invoiceJs, /\/admin\/work-orders\?limit=200/);
  assert.match(invoiceJs, /order\.status === "completed" && !order\.invoiceId/);
  assert.match(invoiceJs, /faktura-ny\.html\?workOrderId=/);
});

test("work-order invoice path auto-loads customer and invoice lines from backend", () => {
  assert.match(invoiceJs, /params\.get\("workOrderId"\)/);
  assert.match(invoiceJs, /\/invoices\/work-order\//);
  assert.match(invoiceJs, /fillCustomer\(data\.customer/);
  assert.match(invoiceJs, /\(data\.lines \|\| \[\]\)\.forEach/);
  assert.match(invoiceJs, /sourceType: data\.sourceType/);
});
