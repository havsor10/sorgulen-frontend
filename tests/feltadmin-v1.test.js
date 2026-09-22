const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("admin/felt.html", "utf8");
const js = fs.readFileSync("admin/felt.js", "utf8");
const shell = fs.readFileSync("admin/admin-shell.js", "utf8");

test("Feltadmin is a separate admin surface with a return to full admin", () => {
  assert.match(html, /Feltadmin/);
  assert.match(html, /href="hjem\.html"/);
  assert.match(shell, /modeSwitchHref = fieldContext \? "hjem\.html" : "felt\.html"/);
  assert.match(shell, /fieldContext \? "Komplett admin" : "Feltadmin"/);
});

test("full admin navigation is still present", () => {
  for (const label of ["Hjem", "Oversikt", "Oppdrag", "Bookinger", "Forespørsler", "Kunder", "Fakturaer", "Nettside", "Kundeportal", "Fiken", "Brøyting", "Lager"]) {
    assert.match(shell, new RegExp(label));
  }
});

test("Feltadmin provides fast field logging workflows", () => {
  for (const action of ["new-job", "expense", "customer-note", "time", "material"]) {
    assert.match(html, new RegExp('data-open="' + action + '"'));
  }
  assert.match(js, /\/admin\/work-orders/);
  assert.match(js, /\/expenses/);
  assert.match(js, /\/time-entries/);
  assert.match(js, /\/materials/);
  assert.match(js, /\/admin\/customers/);
});

test("quick field job only requires a customer name and does not auto-start", () => {
  assert.match(html, /Kun navn er nødvendig/);
  assert.match(js, /Bare kundenavn er nødvendig/);
  assert.match(js, /jobDate: osloToday\(\)/);
  assert.doesNotMatch(js, /await api\([^\n]+\/action[^\n]+new-job/);
});

test("Feltadmin has dedicated snow entry ready for Stormmodus", () => {
  assert.match(html, /data-nav="snow"/);
  assert.match(html, /Stormmodus bygges her/);
  assert.match(html, /href="broyting\.html\?from=field"/);
});
