const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("alle 18 produktsider har direkte bookinglenke selv uten JavaScript", () => {
  const products = fs.readdirSync(path.join(root, "utleie"))
    .filter(filename => filename.endsWith(".html") && !["index.html", "bestill.html", "produkt.html"].includes(filename));
  assert.equal(products.length, 18);
  for (const filename of products) {
    const slug = filename.slice(0, -5);
    const page = read("utleie/" + filename);
    assert.ok(page.includes('href="/utleie/bestill/' + slug + '" class="btn primary">Velg dato og bestill'), filename);
    assert.doesNotMatch(page, /href="\.\.\/kontakt\.html\?service=Utleie[^"]*" class="btn primary"/);
  }
});

test("fastprisfaktura kobles til eksisterende eller nytt kundekort", () => {
  const html = read("admin/faktura-ny.html");
  const invoice = read("admin/faktura-ny.js");
  const picker = read("admin/invoice-customer-picker.js");
  assert.match(html, /id="invoiceCustomerSearch"/);
  assert.match(html, /id="invoiceCreateCustomer"/);
  assert.match(html, /invoice-customer-picker\.js/);
  assert.match(invoice, /customerId: source\.customerId \|\| window\.invoiceSelectedCustomerId \|\| null/);
  assert.match(invoice, /mode"\) === "fastpris"/);
  assert.match(invoice, /Velg eller opprett kundekort/);
  assert.match(picker, /\/admin\/customers\?q=/);
  assert.match(picker, /api\("\/admin\/customers", \{ method: "POST"/);
  assert.match(picker, /invoice-source-customer/);
  assert.doesNotMatch(picker, /localStorage\.setItem/);
});

test("adminhjem viser handlinger og faktiske tall fra eksisterende oversikts-API", () => {
  const html = read("admin/hjem.html");
  const script = read("admin/hjem.js");
  assert.match(html, /faktura-ny\.html\?mode=fastpris/);
  assert.match(html, /kunder\.html\?new=1/);
  assert.match(html, /utleie-bestillinger\.html/);
  assert.match(html, /id="homePulse"/);
  assert.match(script, /counts\.draftInvoices/);
  assert.match(script, /counts\.pendingRequests/);
  assert.match(script, /counts\.pendingBookings/);
  assert.match(script, /counts\.overdueInvoices/);
  assert.match(script, /renderPulse\(\)/);
  assert.match(read("admin/kunder.js"), /get\("new"\)==="1"/);
});
