const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const flow = fs.readFileSync(path.join(root, "admin/completed-work-order-flow.js"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");

 test("oppdrag loads fresh closed-work-order recovery assets", () => {
  assert.match(html, /field-ui-20260915-flow2/);
  assert.match(html, /completed-work-order-flow\.js\?v=20260915-flow2/);
});

test("cancelled history cards preserve their work-order id for the field workspace", () => {
  assert.match(flow, /\.open-job-detail\[data-id\]/);
  assert.match(flow, /lastOpenedOrderId/);
  assert.match(flow, /data-field-closed-order-id/);
  assert.match(flow, /marker\.dataset\.entry = "closed-work-order"/);
  assert.match(field, /\[data-entry\]\[data-id\]/);
});

test("cancelled jobs can be explicitly recovered before editing and invoicing", () => {
  assert.match(flow, /Oppdraget er avbrutt/);
  assert.match(flow, /Gjenåpne for korrigering/);
  assert.match(flow, /\/admin\/work-orders\/\$\{encodeURIComponent\(lastOrderId\)\}\/recover/);
  assert.match(flow, /method: "POST"/);
  assert.match(flow, /oppdrag\.html\?open=\$\{encodeURIComponent\(lastOrderId\)\}&recovered=1/);
});

test("recovery does not silently delete the suspicious time entry", () => {
  assert.doesNotMatch(flow, /\/time\/.*DELETE/);
  assert.doesNotMatch(flow, /auto.*delete/i);
});
