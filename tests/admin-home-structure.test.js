const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/hjem.css"), "utf8");
const shellCss = fs.readFileSync(path.join(root, "admin/admin-shell.css"), "utf8");

test("home prioritizes current work, actions and latest bookings", () => {
  assert.match(html, /focusContent/);
  assert.match(html, /Må gjøres/);
  assert.match(html, /Siste bookinger/);
  assert.doesNotMatch(html, /Omsetning|Mulig inntekt|canvas|chart/i);
});

test("every project quick action is wired to a protected backend route", () => {
  assert.match(js, /data-quick="expense"/);
  assert.match(js, /data-quick="material"/);
  assert.match(js, /data-quick="note"/);
  assert.match(js, /admin\/work-orders\/\$\{encodeURIComponent\(quickType\.id\)\}/);
  assert.match(js, /x-admin-key/);
});

test("home has responsive touch targets and no horizontal navigation scrolling", () => {
  assert.match(css, /min-height:46px/);
  assert.match(shellCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shellCss, /position:fixed/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(html, /viewport-fit=cover/);
});

test("home renders only server data or honest loading and empty states", () => {
  assert.doesNotMatch(html, /Ola Hansen|Kari Olsen|32 450/);
  assert.match(js, /Ingen ting krever handling akkurat nå/);
  assert.match(js, /admin\/assistant\/home/);
});
