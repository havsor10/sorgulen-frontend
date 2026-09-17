const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const editor = fs.readFileSync(path.join(root, "admin/work-order-editor.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/work-order-field.css"), "utf8");
const editorCss = fs.readFileSync(path.join(root, "admin/work-order-editor.css"), "utf8");
const inventory = fs.readFileSync(path.join(root, "admin/inventory-project.js"), "utf8");

test("oppdrag har én editor for workflow og registreringer", () => {
  assert.match(html, /operations\.css/);
  assert.match(html, /work-order-field\.css/);
  assert.match(html, /work-order-editor\.css/);
  assert.match(html, /work-order-editor\.js/);
  assert.match(html, /work-order-field\.js/);
  assert.ok(html.indexOf("oppdrag.js") < html.indexOf("work-order-editor.js"));
  assert.ok(html.indexOf("work-order-editor.js") < html.indexOf("work-order-field.js"));
  assert.doesNotMatch(html, /operations-ui\.js/);
  assert.doesNotMatch(html, /work-order-field-compat\.js/);
  assert.doesNotMatch(html, /work-order-description-edit\.js/);
  assert.doesNotMatch(html, /completed-work-order-flow\.js/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(editor, /window\.SorgulenOperations\s*=\s*\{[^}]*openManager[^}]*openRegistration/s);
});

test("field workspace viser kunde, jobb, tid, pris og fakturakontroll", () => {
  assert.match(field, /data-field-workspace/);
  assert.match(field, /Kundeoppdrag/);
  assert.match(field, /Arbeidstid/);
  assert.match(field, /Pris hittil/);
  assert.match(field, /Fakturagrunnlag/);
  assert.match(field, /completion-check/);
  assert.match(field, /missingDescriptions/);
});

test("varsler har konkrete rettehandlinger", () => {
  assert.match(field, /data-field-fix-email/);
  assert.match(field, /data-field-email-form/);
  assert.match(field, /data-field-edit-session/);
  assert.match(field, /data-field-open-manager/);
  assert.match(field, /\/admin\/customers\//);
  assert.match(field, /refreshWorkspace/);
});

test("registreringer går gjennom den samlede editoren", () => {
  assert.match(field, /data-field-add-toggle/);
  assert.match(field, /data-field-add-menu/);
  assert.match(field, /data-entry=\"expense\"/);
  assert.match(field, /data-entry=\"material\"/);
  assert.match(field, /data-entry=\"note\"/);
  assert.match(inventory, /data-entry=material/);
  assert.match(editor, /data\.fieldRegistrationEdit = "true"/);
  assert.match(editor, /openManager/);
  assert.match(editor, /openRegistration/);
  assert.match(editorCss, /field-work-controls\[data-workflow-owned="true"\]/);
});

test("manuell tid vises uten falske klokkeslett", () => {
  assert.match(editor, /decorateManualSessions/);
  assert.match(editor, /time\.textContent = "Manuell"/);
  assert.match(editor, /cells\[0\]\.hidden = true/);
  assert.match(editor, /manuell.*økt/s);
});

test("lukket og aktiv workflow eies av editoren", () => {
  assert.match(editor, /Gjenåpne for korrigering/);
  assert.match(editor, /Opprett faktura/);
  assert.match(editor, /Åpne faktura/);
  assert.match(editor, /Ferdigstill oppdrag/);
  assert.match(editor, /data-editor-workflow-action/);
  assert.match(editor, /data-editor-manage-order/);
});

test("mobil detalj er fullskjerm med store kontroller", () => {
  assert.match(css, /height:100dvh/);
  assert.match(css, /field-add-main/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /safe-area-inset-bottom/);
});
