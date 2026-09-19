const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const field = fs.readFileSync(path.join(root, "admin/work-order-field.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/work-order-field.css"), "utf8");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");

test("arbeidsloggen bygges bare av faktiske arbeidsøkter", () => {
  assert.match(field, /for \(const entry of order\.workIntervals \|\| \[\]\)/);
  assert.doesNotMatch(field, /Registreringer uten arbeidsøkt/);
  assert.doesNotMatch(field, /for \(const item of order\.additionalCosts \|\| \[\]\) \{ const key = osloDateKey\(item\.occurredAt\); if \(key && !days\.has\(key\)\) days\.set\(key, \[\]\); \}/);
  assert.doesNotMatch(field, /for \(const item of order\.materials \|\| \[\]\) \{ const key = osloDateKey\(item\.createdAt\); if \(key && !days\.has\(key\)\) days\.set\(key, \[\]\); \}/);
  assert.doesNotMatch(field, /for \(const item of order\.projectNotes \|\| \[\]\) \{ const key = osloDateKey\(item\.createdAt\); if \(key && !days\.has\(key\)\) days\.set\(key, \[\]\); \}/);
});

test("avsluttet 0-min tidsøkt åpnes og kan slettes direkte", () => {
  assert.match(field, /const zeroDuration = !open && seconds === 0/);
  assert.match(field, /zero-duration/);
  assert.match(field, /Slett 0-min økt/);
  assert.match(field, /data-field-delete-registration="time"/);
  assert.match(field, /Denne økten har 0 minutter registrert/);
  assert.match(field, /zeroDuration \? "open" : ""/);
});

test("0-min økter er tydelig markert på mobil", () => {
  assert.match(css, /\.field-session\.zero-duration/);
  assert.match(css, /\.field-delete-entry\.zero-delete/);
});

test("oppdrag henter fersk arbeidsloggkode", () => {
  assert.match(html, /field-ui-20260919-zero1/);
  assert.match(html, /work-order-field\.css\?v=20260919-zero1/);
  assert.match(html, /work-order-field\.js\?v=20260919-zero1/);
});
