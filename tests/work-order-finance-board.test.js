"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const finance = require("../admin/work-order-finance.js");
const today = new Date("2026-11-02T11:00:00Z");
const makeOrder = (id, status = "completed", customerId = "c1") => ({
  _id: id, status, customerId, customerSnapshot: { name: "Testkunde" }, serviceName: "Oppdrag", jobDate: "2026-10-30",
});
const invoice = (id, status, sourceOrderId, other = {}) => ({
  _id: id, status, isCreditNote: false, sourceType: "workOrder", sourceId: sourceOrderId,
  customerId: "c1", amount: 5500, ...other,
});
const model = (orders, invoices, options = {}) => finance.buildBoard(orders, invoices, { now: today, ...options });

test("Kjartan: ferdigstilt arbeid med utkast er ikkje sett som ferdig fakturert", () => {
  const board = model([makeOrder("kjartan")], [invoice("inv1", "draft", "kjartan")]);
  const item = board.records[0].finance;
  assert.equal(item.group, "attention");
  assert.equal(item.source, "draft");
  assert.equal(item.action, "Kontroller fakturautkast");
  assert.equal(item.href, "faktura-detalj.html?id=inv1");
  assert.deepEqual(item.labels.map((x) => x.key), ["draft"]);
});

test("Benjamin: sendt faktura med uteståande beløp er ikkje betalt", () => {
  const board = model([makeOrder("benjamin")], [invoice("inv2", "sent", "benjamin", {
    amount: 5500, dueDate: "2026-11-15",
  })]);
  assert.equal(board.records[0].finance.group, "waiting");
  assert.equal(board.records[0].finance.source, "unpaid");
  assert.equal(board.summary.outstanding, 5500);
});

test("forfallen faktura løftast til må følgjast opp", () => {
  const board = model([makeOrder("benjamin")], [invoice("inv2", "sent", "benjamin", { dueDate: "2026-10-25" })]);
  assert.equal(board.records[0].finance.source, "overdue");
  assert.equal(board.summary.overdueInvoices, 1);
});

test("fakturautkast og ubetalt delfaktura kan eksistere på same prosjekt", () => {
  const board = model([makeOrder("a")], [
    invoice("paid?", "sent", "a", { amount: 3000 }),
    invoice("draft2", "draft", null, { sourceType: "customer", sourceEntryKeys: ["a:time:e-1"], amount: 2000 }),
  ]);
  assert.equal(board.records[0].finance.group, "attention");
  assert.deepEqual(board.records[0].finance.labels.map((item) => item.key), ["draft", "unpaid"]);
  assert.equal(board.summary.outstanding, 3000);
});

test("same samlefaktura kan visast på to oppdrag, men uteståande blir berre telt éin gong", () => {
  const board = model([makeOrder("a"), makeOrder("b")], [
    invoice("shared", "sent", null, { sourceType: "customer", sourceEntryKeys: ["a:time:1", "b:expense:2"], amount: 900 }),
  ]);
  assert.equal(board.records[0].finance.source, "unpaid");
  assert.equal(board.records[1].finance.source, "unpaid");
  assert.equal(board.summary.outstanding, 900);
  assert.equal(board.summary.unpaidInvoices, 1);
  assert.equal(board.unmatchedInvoices.length, 0);
});

test("betaling er ein separat tilstand: fullbetalt oppdrag er ferdig og betalt", () => {
  const board = model([makeOrder("a")], [invoice("pa1", "paid", "a")]);
  assert.equal(board.records[0].finance.group, "done");
  assert.equal(board.summary.outstanding, 0);
  assert.deepEqual(board.records[0].finance.labels.map((item) => item.key), ["paid"]);
});

test("utstedt faktura utan sendt-stempel blir ikkje rekna som levert", () => {
  const board = model([makeOrder("a")], [invoice("issue1", "issued", "a")]);
  assert.equal(board.records[0].finance.source, "issued");
  assert.equal(board.records[0].finance.group, "attention");
});

test("gamle fakturaer kan knytast via arbeidspostar, prosjektutkast og final invoice source", () => {
  const board = model([makeOrder("a"), makeOrder("b")], [
    invoice("via-snapshot", "draft", null, { sourceType: "customer", sourceId: "c1", basisSnapshot: { workOrderId: "a" } }),
    invoice("via-proj-key", "paid", null, { sourceType: "manual", projectInvoiceKey: "workorder-b-abc" }),
  ]);
  assert.equal(board.records[0].finance.source, "draft");
  assert.equal(board.records[1].finance.source, "paid");
});

test("ikkje trekk konklusjon om faktura dersom ein berre veit kundenamnet", () => {
  const board = model([makeOrder("a")], [
    invoice("manual-unlinked", "sent", null, { sourceType: "manual", sourceId: null, customerId: "c1" }),
  ]);
  assert.equal(board.records[0].finance.source, "ambiguous");
  assert.equal(board.records[0].finance.hasMissingLink, true);
  assert.equal(board.unmatchedInvoices.length, 1);
});

test("Fiken-avvik: innbetalt i Fiken, men ikkje lokalt bekrefta, er ikkje automatisk betalt", () => {
  const board = model([makeOrder("a")], [invoice("fk", "sent", "a", {
    fiken: { syncStatus: "synced", settled: true, outstandingBalanceOre: 0 },
  })]);
  assert.equal(board.records[0].finance.source, "mismatch");
  assert.equal(board.records[0].finance.group, "attention");
  assert.equal(board.summary.outstanding, 0);
});

test("delvis betalt i Fiken viser restsaldo, ikkje heile fakturabeløpet", () => {
  const board = model([makeOrder("a")], [invoice("fk", "sent", "a", {
    fiken: { syncStatus: "synced", settled: false, outstandingBalanceOre: 210000 },
  })]);
  assert.equal(board.summary.outstanding, 2100);
});

test("testoppdrag og avbrotne oppdrag går ikkje i ordinær oppfølgingsliste", () => {
  const board = model([{ ...makeOrder("a"), isTest: true }, makeOrder("b", "cancelled")], []);
  assert.equal(board.summary.attention, 0);
  assert.equal(board.groups.test.length, 1);
  assert.equal(board.groups.cancelled.length, 1);
});

test("oppdrag i arbeid med delfaktura beheld begge opplysningane", () => {
  const board = model([makeOrder("a", "active")], [invoice("inv", "sent", "a")]);
  assert.equal(board.records[0].finance.workStage, "active");
  assert.equal(board.records[0].finance.source, "unpaid");
  assert.equal(board.records[0].finance.group, "waiting");
});

test("fakturafetch-feil må aldri sjå ut som null uteståande eller manglande faktura", () => {
  const board = model([makeOrder("a")], [], { financeAvailable: false });
  assert.equal(board.records[0].finance.group, "unknown");
  assert.equal(board.records[0].finance.action, "Fakturastatus ikkje henta");
  assert.equal(board.financeAvailable, false);
});

test("forfall blir samanlikna i Oslo-tid og ikkje markert forfalle på sjølve forfallsdagen", () => {
  assert.equal(finance.osloDate(today), "2026-11-02");
  assert.equal(finance.isOverdue({ status: "sent", dueDate: "2026-11-02" }, "2026-11-02"), false);
  assert.equal(finance.isOverdue({ status: "sent", dueDate: "2026-11-01" }, "2026-11-02"), true);
});

test("UI lastar finansstatus før oppdragsliste og har synleg kontrollfeil", () => {
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
  const page = fs.readFileSync(path.join(root, "admin/oppdrag.js"), "utf8");
  assert.match(html, /work-order-finance\.js/);
  assert.match(html, /orderBoardSummary/);
  assert.match(page, /apiFetch\("\/invoices"\)/);
  assert.match(page, /orderBoard\.financeAvailable/);
  assert.match(page, /Fakturastatus kunne ikkje hentast/);
});
