const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/work-order-field.css"), "utf8");
const inventory = fs.readFileSync(path.join(root, "admin/inventory-project.js"), "utf8");
const operations = fs.readFileSync(path.join(root, "admin/operations-ui.js"), "utf8");

test("oppdrag laster én operations-motor før den dedikerte feltvisningen", () => {
  assert.match(html, /operations\.css/);
  assert.match(html, /operations-ui\.js\?v=20260918-workflow1/);
  assert.match(html, /work-order-field\.css\?v=20260918-unified1/);
  assert.match(html, /work-order-field\.js\?v=20260918-workflow1/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
  assert.doesNotMatch(html, /work-order-description-edit\.js/);
  assert.doesNotMatch(html, /completed-work-order-flow\.js/);
  assert.ok(html.indexOf("oppdrag.js") < html.indexOf("operations-ui.js"));
  assert.ok(html.indexOf("operations-ui.js") < html.indexOf("work-order-field.js"));
  assert.match(html, /viewport-fit=cover/);
  assert.match(operations, /window\.SorgulenOperations\s*=\s*\{[^}]*openManualTime[^}]*openManager[^}]*openRegistration/s);
});

test("feltvisning starter med kunde, jobb, tid, pris og fakturakontroll", () => {
  assert.match(js, /data-field-workspace/);
  assert.match(js, /Kundeoppdrag/);
  assert.match(js, /Arbeidstid/);
  assert.match(js, /Pris hittil/);
  assert.match(js, /Fakturagrunnlag/);
  assert.match(js, /completion-check/);
  assert.match(js, /missingDescriptions/);
});

test("fakturavarsler har direkte rettehandlinger", () => {
  assert.match(js, /data-field-fix-email/);
  assert.match(js, /data-field-email-form/);
  assert.match(js, /data-field-edit-session/);
  assert.match(js, /data-field-open-manager/);
  assert.match(js, /\/admin\/customers\//);
  assert.match(js, /refreshWorkspace/);
});

test("legg til-meny fungerer også etter ferdigstilling fram til faktura finnes", () => {
  assert.match(js, /order\.status === "cancelled" \|\| order\.invoiceId/);
  assert.match(js, /data-field-add-toggle/);
  assert.match(js, /data-field-add-time/);
  assert.match(js, /data-entry="expense"/);
  assert.match(js, /data-entry="material"/);
  assert.match(js, /data-entry="note"/);
  assert.match(inventory, /data-entry=material/);
  assert.match(css, /field-add-grid/);
});

test("arbeidslogg åpner den reelle operations-editoren og kan slette økter", () => {
  assert.match(js, /dailyLogMarkup/);
  assert.match(js, /pausePairs/);
  assert.match(js, /field-session/);
  assert.match(js, /openSessionEditor/);
  assert.match(js, /SorgulenOperations\?\.openManualTime/);
  assert.match(js, /data-field-delete-registration="time"/);
  assert.match(css, /field-entry-actions/);
});

test("statusflyt for ferdig, fakturert og avbrutt er eid av feltmotoren", () => {
  assert.match(js, /function workflowMarkup/);
  assert.match(js, /Opprett faktura/);
  assert.match(js, /Åpne faktura/);
  assert.match(js, /Gjenåpne for korrigering/);
  assert.match(css, /field-status-workflow/);
});

test("mobil detalj er fullskjerm med store kontroller", () => {
  assert.match(css, /height:100dvh/);
  assert.match(css, /field-add-main/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(css, /sai-launcher/);
});
