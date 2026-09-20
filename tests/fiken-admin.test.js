const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin", "fiken.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin", "fiken.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "admin", "admin-shell.js"), "utf8");

test("Fiken-oppsett er integrert i admin uten å be nettleseren om API-nøkkelen", () => {
  assert.match(shell, /fiken\.html/);
  assert.match(html, /Fiken-integrasjon aktiv/);
  assert.match(js, /\/admin\/fiken\/status/);
  assert.match(js, /\/admin\/fiken\/test/);
  assert.match(js, /\/admin\/fiken\/settings/);
  assert.doesNotMatch(html, /name=["']apiToken/i);
  assert.doesNotMatch(js, /FIKEN_API_TOKEN\s*=/);
});

test("Fiken-siden har eksplisitt valg av bank- og inntektskonto", () => {
  assert.match(html, /id="bankSelect"/);
  assert.match(html, /id="incomeSelect"/);
  assert.match(html, /Vi gjetter ikke denne automatisk/);
});
