const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "admin");
const field = fs.readFileSync(path.join(root, "work-order-field.js"), "utf8");
const html = fs.readFileSync(path.join(root, "oppdrag.html"), "utf8");
const css = fs.readFileSync(path.join(root, "work-order-field.css"), "utf8");
const operations = fs.readFileSync(path.join(root, "operations-ui.js"), "utf8");

test("arbeidstidskortet viser en tydelig knapp for korrigering", () => {
  assert.match(field, /Registrert totalt<\/small>' \+ timeCorrectionMarkup\(order\)/);
  assert.match(field, /data-field-correct-time/);
  assert.match(css, /\.field-correct-time/);
  assert.match(html, /work-order-field\.js\?v=20261031-editclock1/);
});

test("korrigering åpner rett økt eller lar brukeren velge mellom flere", () => {
  assert.match(field, /candidates\.length === 1/);
  assert.match(field, /openSessionEditor\(candidates\[0\]\.entryId\)/);
  assert.match(field, /SorgulenOperations\.openManager\(currentOrder\._id\)/);
  assert.match(field, /registrationBillingLock\(currentOrder, "time", entry\.entryId\)/);
  assert.match(field, /projectRegistrationsLocked\(currentOrder\)/);
});

test("eksisterende editor bruker PATCH for valgt økt med ny varighet", () => {
  assert.match(operations, /\/admin\/operations\/work-orders\/\$\{encodeURIComponent\(orderId\)\}\/time\/\$\{encodeURIComponent\(entry\.entryId\)\}/);
  assert.match(operations, /durationMinutes/);
  assert.match(operations, /method: "PATCH"/);
});
