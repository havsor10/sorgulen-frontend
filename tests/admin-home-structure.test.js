const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const attentionJs = fs.readFileSync(path.join(root, "admin/home-attention.js"), "utf8");
const systemStatusJs = fs.readFileSync(path.join(root, "admin/home-system-status.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/hjem.css"), "utf8");
const attentionCss = fs.readFileSync(path.join(root, "admin/home-attention.css"), "utf8");
const systemStatusCss = fs.readFileSync(path.join(root, "admin/home-system-status.css"), "utf8");
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

test("home gives an explicit whole-system confirmation instead of silence", () => {
  assert.match(html, /id="systemStatusCard"/);
  assert.match(html, /id="systemStatusChecks"/);
  assert.match(html, /home-system-status\.js/);
  assert.match(html, /home-system-status\.css/);
  assert.match(systemStatusJs, /Alt er kontrollert – alt er i orden/);
  assert.match(systemStatusJs, /Kan ikke bekrefte at alt er i orden/);
  assert.match(systemStatusJs, /Noe er ikke i orden/);
  assert.match(systemStatusJs, /\/admin\/assistant\/home/);
  assert.match(systemStatusJs, /\/admin\/autopilot\/status/);
  assert.match(systemStatusJs, /\/admin\/autopilot\/watchdog/);
  assert.match(systemStatusJs, /\/admin\/autopilot\/inbox\/summary/);
  assert.match(systemStatusJs, /6\/6 områder kontrollert/);
  assert.match(systemStatusCss, /system-status-card\.is-good/);
  assert.match(systemStatusCss, /system-status-card\.is-problem/);
  assert.match(systemStatusCss, /system-status-card\.is-unknown/);
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

test("assistant shows the customer draft before approving a proposed next day", () => {
  assert.match(attentionJs, /publish_next_work/);
  assert.match(attentionJs, /admin\/assistant\/actions\/next-work/);
  assert.match(attentionJs, /expectedStart/);
  assert.match(attentionJs, /expectedEnd/);
  assert.match(attentionJs, /data-message/);
  assert.match(attentionJs, /Kundemelding:/);
  assert.match(attentionJs, /Ingen SMS eller e-post sendes/);
  assert.match(attentionCss, /assistant-ready/);
  assert.match(attentionCss, /attention-action--assistant/);
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
  assert.match(systemStatusCss, /min-height:44px/);
  assert.match(shellCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shellCss, /position:fixed/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(attentionCss, /@media \(max-width: 430px\)/);
  assert.match(systemStatusCss, /@media\(max-width:520px\)/);
  assert.match(html, /viewport-fit=cover/);
});

test("home renders only server data or honest loading and empty states", () => {
  assert.doesNotMatch(html, /Ola Hansen|Kari Olsen|32 450/);
  assert.match(js, /Ingen ting krever handling akkurat nå/);
  assert.match(js, /admin\/assistant\/home/);
  assert.match(attentionJs, /admin\/assistant\/home/);
  assert.match(systemStatusJs, /Promise\.allSettled/);
  assert.match(systemStatusJs, /Systemet viser derfor ikke falskt grønt lys/);
});
