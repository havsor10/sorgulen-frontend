const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");

test("oppdrag bruker den samlede feltvisningen for lukkede oppdrag", () => {
  assert.match(html, /field-ui-20260918-workflow1/);
  assert.match(html, /work-order-field\.js\?v=20260918-workflow1/);
  assert.doesNotMatch(html, /completed-work-order-flow\.js/);
});

test("cancelled history cards beholder oppdrags-ID uten eget kompatibilitetslag", () => {
  assert.match(field, /\.open-job-detail\[data-id\]/);
  assert.match(field, /lastOpenedOrderId/);
  assert.match(field, /detail\.querySelector\("\[data-entry\]\[data-id\]"\)/);
});

test("avbrutte oppdrag kan gjenåpnes før redigering og fakturering", () => {
  assert.match(field, /Oppdraget er avbrutt/);
  assert.match(field, /Gjenåpne for korrigering/);
  assert.match(field, /\/admin\/work-orders\/\$\{encodeURIComponent\(currentOrder\._id\)\}\/recover/);
  assert.match(field, /method: "POST"/);
  assert.match(field, /refreshWorkspace\(currentOrder\._id\)/);
});

test("gjenåpning sletter ikke registreringer automatisk", () => {
  const recoverBlock = field.slice(field.indexOf("data-field-recover-order"), field.indexOf("data-field-registration-edit"));
  assert.doesNotMatch(recoverBlock, /DELETE/);
  assert.doesNotMatch(recoverBlock, /auto.*delete/i);
});
