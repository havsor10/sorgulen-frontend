const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const customer = fs.readFileSync(path.join(__dirname, "..", "admin", "kunde-v2.js"), "utf8");
const operations = fs.readFileSync(path.join(__dirname, "..", "admin", "operations-ui.js"), "utf8");

test("customer page can add work without starting taximeter", () => {
  assert.match(customer, /\+ Legg til arbeid/);
  assert.match(operations, /admin\/operations\/customers/);
});
