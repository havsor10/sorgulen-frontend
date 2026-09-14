const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AI-laget lastes før eksisterende oppdragslagring", () => {
  const html = read("admin/oppdrag.html");
  const ai = html.indexOf('work-order-ai.js?v=');
  const jobs = html.indexOf('<script src="oppdrag.js"></script>');
  const operations = html.indexOf('operations-ui.js?v=');
  assert.ok(ai > 0 && ai < jobs && ai < operations);
  assert.match(html, /work-order-ai\.css\?v=[^"']+/);
});

test("automatisk korrektur går bare på fritekst, ikke priser eller produktnavn", () => {
  const source = read("admin/work-order-ai.js");
  for (const field of ["project.notes", "time.comment", "expense.description", "material.comment", "note.text"]) assert.match(source, new RegExp(field.replace(".", "\\.")));
  assert.doesNotMatch(source, /field:\s*"material\.item"/);
  assert.doesNotMatch(source, /field:\s*"hourlyRate"/);
  assert.doesNotMatch(source, /field:\s*"fixedPrice"/);
  assert.match(source, /if \(!info\) return nativeFetch/);
  assert.match(source, /catch \(_\) \{ return null; \}/);
});

test("ulogiske opplysninger blir spørsmål med Ordne nå eller Ignorer", () => {
  const source = read("admin/work-order-ai.js");
  assert.match(source, /AI-kontroll/);
  assert.match(source, /Ordne nå/);
  assert.match(source, /Ignorer/);
  assert.match(source, /sorgulen_ai_questions_v1/);
});

test("bildeimport krever eksplisitt godkjenning før økonomi skrives", () => {
  const source = read("admin/work-order-ai.js");
  assert.match(source, /AI: bilde \/ skjermbilde/);
  assert.match(source, /Analyser bilde/);
  assert.match(source, /Godkjenn valgte/);
  assert.match(source, /set_project_pricing/);
  assert.match(source, /add_expense/);
  assert.match(source, /add_material/);
  assert.match(source, /data-ai-billable/);
  assert.match(source, /customerUnitPrice == null \? null/);
});

test("AI-bildeimport bruker eksisterende oppdrags-API og sender aldri faktura automatisk", () => {
  const source = read("admin/work-order-ai.js");
  assert.match(source, /\/admin\/work-orders\/\$\{encodeURIComponent\(state\.orderId\)\}\/expenses/);
  assert.match(source, /\/admin\/work-orders\/\$\{encodeURIComponent\(state\.orderId\)\}\/materials/);
  assert.match(source, /normalPatch\(`\/admin\/work-orders/);
  assert.doesNotMatch(source, /\/invoices\/.*\/send/);
  assert.doesNotMatch(source, /Opprett faktura|create-invoice|invoice-draft/);
});
