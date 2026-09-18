const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const operations = fs.readFileSync(path.join(root, "admin/operations-ui.js"), "utf8");
const oppdrag = fs.readFileSync(path.join(root, "admin/oppdrag.js"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");

test("manuell tid har ekte startklokkeslett i Oslo", () => {
  assert.match(operations, /name="startTime" type="time"/);
  assert.match(operations, /timeZone: "Europe\/Oslo"/);
  assert.match(operations, /startTime: form\.elements\.startTime\.value/);
  assert.match(operations, /overlapWarning/);
});

test("Oppdrag bruker workflow-status fra backend i stedet for å gjette raw status", () => {
  assert.match(oppdrag, /workOrder\?\.workflow\?\.status \|\| workOrder\?\.status/);
  assert.match(field, /order\.workflow\?\.status \|\| order\.status/);
  assert.match(field, /order\.workflow\?\.canAddRegistrations/);
  assert.match(field, /order\.workflow\?\.canEditRegistrations/);
});

test("legacy planlagt med manuell tid kan vises som mellom økter og ferdigstilles", () => {
  assert.match(oppdrag, /effectiveStatus\(workOrder\) === "stopped"/);
  assert.match(oppdrag, /data-work-action="complete"/);
  assert.match(oppdrag, /data-work-action="resume"/);
});

test("workflow-cache er bustet på Oppdrag", () => {
  assert.match(html, /operations-ui\.js\?v=20260918-workflow1/);
  assert.match(html, /work-order-field\.js\?v=20260918-workflow1/);
  assert.match(html, /field-ui-20260918-workflow1/);
});
