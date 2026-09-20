const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "admin/admin-shell.js"), "utf8");
const html = fs.readFileSync(path.join(root, "admin/oversikt.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/oversikt.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/oversikt.css"), "utf8");

test("Oversikt erstatter Autopilot i hovednavigasjonen", () => {
  assert.match(shell, /key: "overview", href: "oversikt\.html", label: "Oversikt"/);
  assert.match(shell, /\["home", "overview", "jobs", "invoices"\]/);
  assert.doesNotMatch(shell, /\["home", "autopilot", "jobs", "invoices"\]/);
});

test("Autopilot er fortsatt tilgjengelig i Mer-menyen", () => {
  assert.match(shell, /admin-more-link\$\{activeClass\("autopilot"\)\}/);
  assert.match(shell, /href="autopilot\.html"/);
  assert.match(shell, /showBadge\("autopilot", autopilotCount\)/);
});

test("Oversikt er koblet til live admin-data", () => {
  assert.match(html, /data-page="overview"/);
  assert.match(js, /\/admin\/assistant\/home/);
  assert.match(js, /\/admin\/work-orders\?limit=200/);
  assert.match(js, /\/invoices/);
  assert.match(js, /\/admin\/bookings\?limit=300/);
  assert.match(js, /\/requests/);
  assert.match(js, /\/admin\/customers\?q=/);
  assert.match(js, /\/admin\/autopilot\/inbox\/summary/);
  assert.match(js, /Promise\.allSettled/);
});

test("Oversikt har live timer, periodegraf og redusert bevegelse", () => {
  assert.match(html, /data-period="7d"/);
  assert.match(html, /data-period="12m"/);
  assert.match(js, /setInterval\(updateLiveElements, 1000\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@keyframes barRise/);
});
