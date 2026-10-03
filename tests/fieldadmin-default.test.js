const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Feltadmin er standard inngang til admin", () => {
  const index = read("admin/index.html");
  const login = read("admin/login.html");
  assert.match(index, /url=felt\.html/);
  assert.match(index, /href="felt\.html"/);
  assert.match(login, /window\.location\.href = "felt\.html"/);
});

test("Komplett admin er en eksplisitt sekundær modus", () => {
  const field = read("admin/felt.html");
  const shell = read("admin/admin-shell.js");
  assert.match(field, /id="fullAdminLink">Komplett admin</);
  assert.match(field, /href="hjem\.html"/);
  assert.match(shell, /Komplett admin/);
  assert.match(shell, /Feltadmin/);
});
