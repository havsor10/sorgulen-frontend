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

test("Oppdrag bruker backend-status, mens registreringskontroller tillater korrigering fram til backend låser faktura", () => {
  assert.match(oppdrag, /workOrder\?\.workflow\?\.status \|\| workOrder\?\.status/);
  assert.match(field, /order\.workflow\?\.status \|\| order\.status/);
  assert.match(field, /const canAdd = order\.status !== "cancelled" && !projectRegistrationsLocked\(order\)/);
  assert.match(field, /const editable = order\.status !== "cancelled" && !projectRegistrationsLocked\(order\)/);
  assert.match(operations, /deleteExistingRegistration/);
  assert.match(operations, /assertRegistrationEditable/);
  assert.match(field, /registrationBillingLock/);
});

test("legacy planlagt med manuell tid kan vises som mellom økter og ferdigstilles", () => {
  assert.match(oppdrag, /effectiveStatus\(workOrder\) === "stopped"/);
  assert.match(oppdrag, /data-work-action="complete"/);
  assert.match(oppdrag, /data-work-action="resume"/);
});

test("workflow-cache er bustet på Oppdrag", () => {
  assert.match(html, /operations-ui\.js\?v=20261004-lock2/);
  assert.match(html, /work-order-field\.js\?v=20261004-lock2/);
  assert.match(html, /field-ui-20261004-lock2/);
});
