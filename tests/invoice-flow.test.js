const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("invoice detail separates issue from email sending", () => {
  const detail = read("admin/faktura-detalj.js");
  assert.match(detail, /\/issue-validation/);
  assert.match(detail, /\/issue`/);
  assert.match(detail, /status === "issued"/);
  assert.match(detail, /\/send`/);
  assert.match(detail, /Fakturanummer vil bli tildelt/);
  assert.match(detail, /økonomiske opplysninger låses/);
});

test("invoice draft captures delivery facts but leaves invoice date and due date to backend issue", () => {
  const html = read("admin/faktura-ny.html");
  const script = read("admin/faktura-ny.js");
  assert.match(html, /id="serviceDateFrom"/);
  assert.match(html, /id="serviceDateTo"/);
  assert.match(html, /id="serviceLocation"/);
  assert.match(html, /id="custAddress"/);
  assert.match(html, /id="custPostal"/);
  assert.match(html, /id="custCity"/);
  assert.doesNotMatch(html, /id="dueDate"/);
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

test("invoice overview treats issued documents as a first-class state", () => {
  const overview = read("admin/fakturaer.js");
  assert.match(overview, /issued: "Utstedt"/);
  assert.match(overview, /Utstedt, ikke sendt/);
  assert.match(overview, /\["issued", "sent"\]/);
});
