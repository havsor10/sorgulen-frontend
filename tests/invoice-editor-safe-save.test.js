const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const editor = fs.readFileSync("admin/faktura-rediger.js", "utf8");
const html = fs.readFileSync("admin/faktura-rediger.html", "utf8");
const ops = fs.readFileSync("admin/operations-ui.js", "utf8");

test("fakturaen har versjonsvern mot eldre opne faner", () => {
  assert.match(editor, /loadedInvoiceVersion/);
  assert.match(editor, /expectedVersion: loadedInvoiceVersion/);
});

test("nye og endra linjer lesast tilbake frå server etter lagring", () => {
  assert.match(editor, /sameSavedLines\(lines, data\.invoice\?\.lines\)/);
  assert.match(editor, /sameSavedLines\(lines, reloaded\.invoice\?\.lines\)/);
  assert.match(editor, /cache: "no-store"/);
  assert.match(editor, /Lagra og kontrollert/);
});

test("det er ikkje lov å gå bort frå ulagrede endringar utan varsling", () => {
  assert.match(editor, /beforeunload/);
  assert.match(editor, /dirty && !confirm/);
  assert.match(editor, /if \(dirty\) \{/);
});

test("mobilen laster ny trygg fakturaredigering", () => {
  assert.match(html, /faktura-rediger\.js\?v=20261030-amountfix1-saveguard20261120/);
});

test("utkastets synkvarsel kan ikkje køyre ein DELETE-endepunkt", () => {
  assert.match(ops, /"\/sync-basis"/);
  assert.doesNotMatch(ops, /syncInvoiceBasis[\s\S]{0,350}method: "DELETE"/);
});
