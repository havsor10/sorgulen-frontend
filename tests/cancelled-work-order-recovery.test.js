const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const editor = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");

test("oppdrag bruker én fersk kontroller for lukket workflow", () => {
  assert.match(html, /field-ui-20260917-audit2/);
  assert.match(html, /work-order-editor\.js\?v=20260917-audit2/);
  assert.doesNotMatch(html, /completed-work-order-flow\.js/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
  assert.doesNotMatch(html, /work-order-description-edit\.js/);
});

test("alle historikk-kort kan gi lukket oppdrag en stabil id", () => {
  assert.match(editor, /\.open-job-detail\[data-id\]/);
  assert.match(editor, /lastOpenedOrderId/);
  assert.match(editor, /data\.entry = "work-order-context"|dataset\.entry = "work-order-context"/);
  assert.match(editor, /ensureContextMarker/);
});

test("avbrutte oppdrag kan gjenåpnes før korrigering og fakturering", () => {
  assert.match(editor, /Gjenåpne for korrigering/);
  assert.match(editor, /action === "recover"/);
  assert.match(editor, /\/admin\/work-orders\/\$\{encodeURIComponent\(orderId\)\}\/recover/);
  assert.match(editor, /method: "POST"/);
  assert.match(editor, /recovered=1/);
});

test("gjenåpning sletter aldri registreringer automatisk", () => {
  const recoverBlock = editor.slice(editor.indexOf('action === "recover"'), editor.indexOf('action === "complete"'));
  assert.doesNotMatch(recoverBlock, /method:\s*"DELETE"/);
  assert.doesNotMatch(recoverBlock, /auto.*delete/i);
});
