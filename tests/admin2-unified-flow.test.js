const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin shell loads the unified Admin 2.0 layer", () => {
  const shell = read("admin/admin-shell.js");
  assert.match(shell, /admin2-unified-flow\.js/);
  assert.match(read("admin/admin2-unified-flow.js"), /admin2-unified-flow\.css/);
});

test("mobile navigation is reduced to four primary choices", () => {
  const css = read("admin/admin2-unified-flow.css");
  const flow = read("admin/admin2-unified-flow.js");
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(flow, /autopilotMobile\?\.remove\(\)/);
  assert.match(flow, /href = "autopilot\.html"/);
});

test("booking detail routes brøyting into the snow queue instead of creating a duplicate project", () => {
  const flow = read("admin/admin2-unified-flow.js");
  assert.match(flow, /\/brøy\/i/);
  assert.match(flow, /replacePrimaryBookingAction\(container, "broyting\.html", "Åpne brøyting"\)/);
  assert.match(flow, /Du trenger ikkje opprette prosjekt her/);
});

test("linked bookings always open the canonical WorkOrder", () => {
  const flow = read("admin/admin2-unified-flow.js");
  assert.match(flow, /String\(order\.bookingId \|\| ""\)/);
  assert.match(flow, /oppdrag\.html\?open=/);
  assert.match(flow, /Denne bestillingen er allerede et oppdrag/);
});

test("field workspace promotes the current work controls and hides invoice noise while work is active", () => {
  const flow = read("admin/admin2-unified-flow.js");
  assert.match(flow, /admin2-primary-controls/);
  assert.match(flow, /\["planned", "active", "paused"\]\.includes\(status\)/);
  assert.match(flow, /Kunde og jobb/);
  assert.match(flow, /Jobbeskrivelse/);
});

test("active snow work can jump directly to the same WorkOrder", () => {
  const flow = read("admin/admin2-unified-flow.js");
  assert.match(flow, /active\?\.workOrderId/);
  assert.match(flow, /ÅPNE OPPDRAG/);
});
