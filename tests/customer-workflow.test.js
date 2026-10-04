const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("customer workflow labels unbilled, draft and invoiced registrations", () => {
  const code = read("admin/kunde-v2.js");
  assert.match(code, /Ikke fakturert/);
  assert.match(code, /I utkast/);
  assert.match(code, /Fakturert/);
  assert.match(code, /issued: "Utstedt"/);
});

test("customer invoice form defaults to all unbilled entries with optional date range", () => {
  const code = read("admin/kunde-v2.js");
  assert.match(code, /alle ikke-fakturerte poster/i);
  assert.match(code, /name="from"/);
  assert.match(code, /name="to"/);
});

test("customer editor exposes the complete structured invoice address", () => {
  const code = read("admin/kunde-v2.js");
  assert.match(code, /name="address"/);
  assert.match(code, /name="postalCode"/);
  assert.match(code, /name="city"/);
  assert.match(code, /name="organizationNumber"/);
  assert.match(code, /Gateadresse/);
});

