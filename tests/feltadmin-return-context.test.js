const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const field = fs.readFileSync("admin/felt.js", "utf8");
const fieldHtml = fs.readFileSync("admin/felt.html", "utf8");
const shell = fs.readFileSync("admin/admin-shell.js", "utf8");
const customerHtml = fs.readFileSync("admin/kunde.html", "utf8");
const customerJs = fs.readFileSync("admin/kunde-v2.js", "utf8");

test("field detail links explicitly carry field context", () => {
  assert.match(field, /oppdrag\.html\?open=.*&from=field/);
  assert.match(field, /kunde\.html\?id=.*&from=field/);
  assert.match(fieldHtml, /broyting\.html\?from=field/);
});

test("shared admin shell routes Home and logo back to Feltadmin in field context", () => {
  assert.match(shell, /modeParams\.get\("from"\) === "field"/);
  assert.match(shell, /adminHomeHref = fieldContext \? "felt\.html" : "hjem\.html"/);
  assert.match(shell, /href="\$\{adminHomeHref\}"/);
  assert.match(shell, /modeSwitchLabel = fieldContext \? "Komplett" : "Felt"/);
});

test("opening the real full-admin home resets full mode", () => {
  assert.match(shell, /page === "home".*sorgulen_admin_mode", "full"/);
});

test("customer detail has a direct return to Feltadmin when opened from field", () => {
  assert.match(customerHtml, /id="customerBackLink"/);
  assert.match(customerJs, /Tilbake til Feltadmin/);
  assert.match(customerJs, /fieldQuerySuffix/);
});
