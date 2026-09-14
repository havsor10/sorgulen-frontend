const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "admin", "work-order-editor.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "admin", "oppdrag.html"), "utf8");

test("oppdrag bruker én samlet editor for registreringer", () => {
  assert.match(html, /work-order-editor\.js/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
  assert.doesNotMatch(html, /work-order-description-edit\.js/);
  assert.match(source, /openRegistration/);
  assert.match(source, /data-field-edit-session/);
  assert.match(source, /data-field-registration-edit/);
});

test("editor støtter legg til, rediger og slett for alle registreringstyper", () => {
  assert.match(source, /function timeForm/);
  assert.match(source, /function expenseForm/);
  assert.match(source, /function materialForm/);
  assert.match(source, /function noteForm/);
  assert.match(source, /method: editing \? "PATCH" : "POST"/);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /confirm\(/);
});

test("workflow-kontrolleren gir ferdigstilling og faktura som del av samme flyt", () => {
  assert.match(source, /Ferdigstill oppdrag/);
  assert.match(source, /completion-check/);
  assert.match(source, /faktura-ny\.html\?workOrderId/);
  assert.match(source, /data-editor-workflow-action/);
});
