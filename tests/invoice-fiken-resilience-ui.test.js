const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(path.join(__dirname, "..", "admin", "faktura-detalj.js"), "utf8");

test("fakturasiden forklarer midlertidig Fiken-feil uten rå fetch-melding", () => {
  assert.match(code, /function isTransientFikenMessage/);
  assert.match(code, /function friendlyFikenError/);
  assert.match(code, /Fiken er midlertidig utilgjengelig/);
  assert.match(code, /systemet prøver automatisk/);
});

test("vellykket e-postsending kan bekreftes selv om Fiken retryes senere", () => {
  assert.match(code, /data\.fikenDeferred/);
  assert.match(code, /Dokumentet er sendt\. Fiken var midlertidig utilgjengelig/);
});
