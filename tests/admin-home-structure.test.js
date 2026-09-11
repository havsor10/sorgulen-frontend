const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const attentionJs = fs.readFileSync(path.join(root, "admin/home-attention.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/hjem.css"), "utf8");
const attentionCss = fs.readFileSync(path.join(root, "admin/home-attention.css"), "utf8");
const shellCss = fs.readFileSync(path.join(root, "admin/admin-shell.css"), "utf8");

test("home prioritizes current work and concrete actions instead of dashboard noise", () => {
  assert.match(html, /focusContent/);
  assert.match(html, /Hva trenger deg nå\?/);
  assert.match(html, /Bare ting som faktisk krever handling/);
  assert.match(html, /home-attention\.js/);
  assert.match(html, /home-attention\.css/);
  assert.match(attentionCss, /#latestBookings/);
  assert.match(attentionCss, /#ongoingSection/);
  assert.doesNotMatch(html, /Omsetning|Mulig inntekt|canvas|chart/i);
});

test("attention engine uses visual priority, direct actions and a calm all-clear state", () => {
  assert.match(attentionJs, /attention-card/);
  assert.match(attentionJs, /actionLabel/);
  assert.match(attentionJs, /statusLabel/);
  assert.match(attentionJs, /Alt er under kontroll/);
  assert.match(attentionJs, /Ingenting krever deg nå/);
  assert.match(attentionCss, /attentionPulse/);
  assert.match(attentionCss, /attention-card\.critical/);
  assert.match(attentionCss, /attention-card\.high/);
  assert.match(attentionCss, /attention-card\.medium/);
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
  assert.match(attentionCss, /min-height: 50px/);
  assert.match(shellCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shellCss, /position:fixed/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(attentionCss, /@media \(max-width: 430px\)/);
  assert.match(html, /viewport-fit=cover/);
});

test("home renders only server data or honest loading and empty states", () => {
  assert.doesNotMatch(html, /Ola Hansen|Kari Olsen|32 450/);
  assert.match(js, /Ingen ting krever handling akkurat nå/);
  assert.match(js, /admin\/assistant\/home/);
  assert.match(attentionJs, /admin\/assistant\/home/);
});
