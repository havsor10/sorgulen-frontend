const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const create = fs.readFileSync("admin/faktura-ny.js", "utf8");
const edit = fs.readFileSync("admin/faktura-rediger.js", "utf8");
const detail = fs.readFileSync("admin/faktura-detalj.js", "utf8");

test("fakturaflyt viser at totalen alltid rundes ned til hele kroner", () => {
  assert.match(create, /Math\.floor\(beforeRounding\)/);
  assert.match(create, /Øreavrunding/);
  assert.match(create, /Å betale/);
  assert.match(edit, /Math\.floor\(beforeRounding\)/);
  assert.match(edit, /Øreavrunding/);
  assert.match(detail, /roundingAdjustment/);
});

test("kvitteringsmetadata overlever redigering av fakturautkast", () => {
  for (const source of [create, edit]) {
    assert.match(source, /dataset\.receiptUrl/);
    assert.match(source, /receiptUrl: tr\.dataset\.receiptUrl/);
    assert.match(source, /sourceEntryKey/);
    assert.match(source, /serviceDate/);
  }
});

test("fakturadetalj lar admin kontrollere innkjøpskvitteringen før sending", () => {
  assert.match(detail, /Se innkjøpskvittering/);
  assert.match(detail, /line\.receiptUrl/);
  assert.match(detail, /target="_blank"/);
});
