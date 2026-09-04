const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pages = [
  ["admin/hjem.html", "home"],
  ["admin/oppdrag.html", "jobs"],
  ["admin/admin-dashboard.html", "bookings"],
  ["admin/foresporsler.html", "requests"],
  ["admin/kunder.html", "customers"],
  ["admin/kunde.html", "customers"],
  ["admin/fakturaer.html", "invoices"],
  ["admin/faktura-ny.html", "invoices"],
  ["admin/faktura-rediger.html", "invoices"],
  ["admin/faktura-detalj.html", "invoices"],
  ["admin/order-detail.html", "bookings"],
];

test("every primary and related admin page mounts the same shell", () => {
  for (const [file, page] of pages) {
    const html = read(file);
    assert.match(html, new RegExp(`id="adminShell" data-page="${page}"`), file);
    assert.match(html, /<script src="admin-shell\.js(?:\?[^\"]*)?"><\/script>/, file);
    assert.match(html, /admin-shell\.css/, file);
    assert.doesNotMatch(html, /admin-section-links|class="logout"|<header>\s*<h1>Admin\s*[–-]/, file);
  }
});

test("shared navigation contains the six primary destinations and secondary logout", () => {
  const shell = read("admin/admin-shell.js");
  for (const label of ["Hjem", "Oppdrag", "Bookinger", "Forespørsler", "Kunder", "Fakturaer"]) assert.match(shell, new RegExp(`label: "${label}"`));
  assert.match(shell, /id="logoutBtn"/);
  assert.match(shell, /adminMobileLogout/);
});

test("mobile navigation is fixed, safe-area aware and horizontally bounded", () => {
  const css = read("admin/admin-shell.css");
  assert.match(css, /\.admin-mobile-nav\{position:fixed/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:hidden/);
});

test("legacy colored module navigation and page-specific inline styles are gone", () => {
  for (const [file] of pages) {
    const html = read(file);
    assert.doesNotMatch(html, /style=/, file);
    assert.doesNotMatch(html, /background:#(?:007acc|2e8b57|c79a3a|15c987)/i, file);
  }
  assert.doesNotMatch(read("admin/admin.css"), /\.admin-section-links/);
});

test("large creation forms are secondary panels opened by explicit actions", () => {
  const jobs = read("admin/oppdrag.html");
  const bookings = read("admin/admin-dashboard.html");
  assert.match(jobs, /data-admin-open="#createWorkOrderSection"/);
  assert.match(jobs, /id="createWorkOrderSection"[^>]*hidden/);
  assert.match(bookings, /data-admin-open="#createBookingSection"/);
  assert.match(bookings, /id="createBookingSection"[^>]*hidden/);
});

test("the retired root booking URL redirects into the canonical admin shell", () => {
  const legacyEntry = read("admin-dashboard.html");
  assert.match(legacyEntry, /url=\/admin\/admin-dashboard\.html/);
  assert.doesNotMatch(legacyEntry, /createBookingForm|admin-section-links|class="logout"/);
});
