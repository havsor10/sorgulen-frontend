"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ledger = require("../admin/customer-ledger.js");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("totaltid og utgifter blir viste også når det ikkje finst arbeidsøkter", () => {
  const value = ledger.summarizeOrder({ pricingMode: "hourly", additionalCosts: [
    { amount: 922.97, item: "Kjøp", billable: true },
  ], workIntervals: [], equipment: [], materials: [], projectNotes: [] });
  assert.equal(value.totalSeconds, 0);
  assert.equal(value.estimate, 922.97);
  assert.equal(value.expensesTotal, 922.97);
  assert.equal(value.count, 1);
});

test("fastpris tel ikkje timekostnad dobbelt og intern utgift er ikkje kundepris", () => {
  const value = ledger.summarizeOrder({ status: "completed", pricingMode: "fixed", fixedPrice: 1800, hourlyRate: 850,
    workIntervals: [{ source: "manual", durationSeconds: 3600, billable: true, hourlyRateSnapshot: 850 }],
    additionalCosts: [{ amount: 120, billable: false }, { amount: 200, billable: true }],
    equipment: [], materials: [], projectNotes: [] });
  assert.equal(value.totalSeconds, 3600);
  assert.equal(value.workAmount, 0);
  assert.equal(value.expensesTotal, 320);
  assert.equal(value.expensesBillable, 200);
  assert.equal(value.estimate, 2000);
});

test("kundeoversikt summerer registreringar frå fleire oppdrag utan å skjule ikkje-fakturerbare utgifter", () => {
  const orders = [{ workIntervals: [], additionalCosts: [{ amount: 100, billable: true }] },
    { workIntervals: [], additionalCosts: [{ amount: 50, billable: false }],
      materials: [{ quantity: 2, purchaseUnitPrice: 40, unitPrice: 65, billable: true }] }];
  const value = ledger.summarizeCustomer(orders);
  assert.equal(value.orders, 2);
  assert.equal(value.expensesTotal, 150);
  assert.equal(value.expensesBillable, 100);
  assert.equal(value.materialsCost, 80);
  assert.equal(value.materialsBillable, 130);
  assert.equal(value.estimate, 230);
});

test("kunden og oppdraget lastar same summeringsmotor", () => {
  const jobs = read("admin/oppdrag.html");
  const customer = read("admin/kunde.html");
  assert.match(jobs, /customer-ledger\.js/);
  assert.match(customer, /customer-ledger\.js/);
  assert.match(read("admin/work-order-field.js"), /SorgulenCustomerLedger/);
  assert.match(read("admin/kunde-v2.js"), /SorgulenCustomerLedger/);
});

test("utstyr med eldre manglande amount blir likevel rekna riktig frå varigheit og sats", () => {
  const order = { equipment: [{ item: "Lift", durationMinutes: 90, hourlyRateSnapshot: 200, billable: true }] };
  const result = ledger.summarizeOrder(order);
  assert.equal(result.equipmentTotal, 300);
  assert.equal(result.equipmentBillable, 300);
  assert.equal(result.estimate, 300);
});

test("testoppdrag blir haldne utanfor kundesummer", () => {
  const customer = read("admin/kunde-v2.js");
  assert.match(customer, /workOrders\.filter\(\(order\) => !order\.isTest\)/);
  assert.match(customer, /TESTOPPDRAG/);
});
