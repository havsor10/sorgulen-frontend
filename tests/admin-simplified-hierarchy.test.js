const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const shell = read("admin/admin-shell.js");
const feltHtml = read("admin/felt.html");
const feltJs = read("admin/felt.js");
const homeJs = read("admin/hjem.js");
const jobJs = read("admin/work-order-field.js");
const ordersJs = read("admin/oppdrag.js");
const customerJs = read("admin/kunde-v2.js");

test("adminnavigasjonen viser bare kjerneområdene før Mer", () => {
  assert.match(shell, /primaryNavItems/);
  assert.match(shell, /\["home", "jobs", "customers", "economy"\]/);
  assert.match(shell, /System og sjeldnere valg/);
  assert.match(shell, /admin-more-advanced/);
});

test("Feltadmin prioriterer aktiv jobb før varsler og skjuler registreringsdetaljer", () => {
  assert.ok(feltHtml.indexOf('id="activeJobCard"') < feltHtml.indexOf('id="fieldPulse"'));
  assert.match(feltJs, /tasks\.slice\(0, 2\)/);
  assert.match(feltJs, /\+ Registrer på oppdrag/);
  assert.doesNotMatch(feltJs, /field-quick-row[^;]+\+ Utgift[^;]+\+ Notat[^;]+\+ Tid[^;]+\+ Utstyr[^;]+\+ Materiale/s);
});

test("Komplett adminhjem skjuler registreringsknappene bak ett valg", () => {
  assert.match(homeJs, /quick-actions-menu/);
  assert.match(homeJs, /<summary>Registrer på oppdrag<\/summary>/);
  assert.match(homeJs, /Fortsett arbeid/);
  assert.match(homeJs, /Åpne oppdrag/);
});

test("kundeoppdrag viser kjerneinfo først og sekundærinfo i én Mer-seksjon", () => {
  assert.match(jobJs, /function compactWorkControls/);
  assert.match(jobJs, /field-metrics field-metrics-core/);
  assert.match(jobJs, /Mer om oppdraget/);
  assert.match(jobJs, /function moreProjectMarkup/);
  assert.doesNotMatch(jobJs, /<details id="fieldProjectInfo"/);
});

test("oppdragslisten er en kompakt helkort-handling", () => {
  assert.match(ordersJs, /work-history-card-simple/);
  assert.match(ordersJs, /work-history-open open-job-detail/);
  assert.match(ordersJs, /history-summary/);
});

test("kundesiden viser aktivt arbeid først og samler sekundærinfo", () => {
  assert.match(customerJs, /customer-ops-summary-core/);
  assert.match(customerJs, /Åpne aktivt oppdrag/);
  assert.match(customerJs, /customer-action-more/);
  assert.match(customerJs, /customer-collapse/);
  assert.match(customerJs, /<strong>Historikk<\/strong>/);
  assert.match(customerJs, /<strong>Kundeopplysninger<\/strong>/);
});
