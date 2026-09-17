const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("invoice detail covers issue, final PDF and delivery in one controller", () => {
  const detail = read("admin/faktura-detalj.js");
  const html = read("admin/faktura-detalj.html");
  assert.match(detail, /\/issue-validation/);
  assert.match(detail, /\/issue`/);
  assert.match(detail, /status === "issued"/);
  assert.match(detail, /\/send`/);
  assert.match(detail, /Åpne ferdig faktura \(PDF\)/);
  assert.match(detail, /Fakturanummer, fakturadato og forfall blir satt automatisk/);
  assert.match(detail, /økonomiske opplysningene låses/);
  assert.doesNotMatch(html, /invoice-delivery-ui\.js/);
});

test("draft explains that invoice number, date and due date are automatic", () => {
  const detail = read("admin/faktura-detalj.js");
  assert.match(detail, /Dette fylles automatisk/);
  assert.match(detail, /Fakturanummer · fakturadato · forfallsdato/);
  assert.match(detail, /Settes automatisk ved utstedelse/);
});

test("invoice draft captures optional service facts but leaves document dates to backend issue", () => {
  const html = read("admin/faktura-ny.html");
  const script = read("admin/faktura-ny.js");
  assert.match(html, /id="serviceDateFrom"/);
  assert.match(html, /id="serviceDateTo"/);
  assert.match(html, /id="serviceLocation"/);
  assert.match(html, /id="custAddress"/);
  assert.doesNotMatch(html, /id="dueDate"/);
  assert.match(html, /Fakturanummer, fakturadato og forfallsdato tildeles automatisk/);
  assert.match(script, /serviceDateFrom/);
  assert.match(script, /serviceLocation/);
});

test("request invoice action routes into central invoice detail", () => {
  const html = read("admin/foresporsler.html");
  const bridge = read("admin/foresporsler-invoice-bridge.js");
  assert.match(html, /foresporsler-invoice-bridge\.js/);
  assert.match(bridge, /\/requests\/\$\{encodeURIComponent\(requestId\)\}\/invoice/);
  assert.match(bridge, /faktura-detalj\.html\?id=/);
  assert.match(bridge, /stopImmediatePropagation/);
});

test("invoice overview treats issued documents as a first-class state and has no migration control", () => {
  const overview = read("admin/fakturaer.js");
  const html = read("admin/fakturaer.html");
  assert.match(overview, /issued: "Utstedt"/);
  assert.match(overview, /Ferdig, ikke levert/);
  assert.match(overview, /\["issued", "sent"\]/);
  assert.doesNotMatch(html, /backfillBtn/);
  assert.doesNotMatch(overview, /backfill-refs/);
});
