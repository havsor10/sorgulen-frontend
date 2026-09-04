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
});

test("customer invoice form defaults to all unbilled entries with optional date range", () => {
  const code = read("admin/kunde-v2.js");
  assert.match(code, /alle ikke-fakturerte poster/i);
  assert.match(code, /name="from"/);
  assert.match(code, /name="to"/);
});
