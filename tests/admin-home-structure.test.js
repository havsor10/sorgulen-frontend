const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/hjem.css"), "utf8");
const shellCss = fs.readFileSync(path.join(root, "admin/admin-shell.css"), "utf8");

test("home prioritizes current work and one concrete action queue", () => {
  assert.match(html, /focusContent/);
  assert.match(html, /Hva trenger deg nå\?/);
  assert.match(html, /Bare ting som faktisk krever handling/);
  assert.match(html, /id="handling"/);
  assert.doesNotMatch(html, /home-attention\.js/);
  assert.doesNotMatch(html, /aiSummary/);
  assert.doesNotMatch(html, /latestBookings/);
  assert.doesNotMatch(html, /Omsetning|Mulig inntekt|canvas|chart/i);
});

test("active customers are visible before the action queue", () => {
  assert.match(html, /id="ongoingSection" aria-labelledby="ongoingTitle"/);
  assert.match(html, /Aktive kunder/);
  assert.match(js, /ongoingProjects/);
  assert.ok(html.indexOf('id="ongoingSection"') < html.indexOf('id="handling"'), "aktive kunder skal stå før handlingskøen");
});

test("action queue shows at most three before explicit expansion", () => {
  assert.match(js, /tasks\.slice\(0,3\)/);
  assert.match(js, /data-task-more/);
  assert.match(js, /Vis alle/);
  assert.match(js, /actionLabel/);
  assert.match(js, /taskMarkup/);
});

test("the whole action card is the direct action", () => {
  assert.match(js, /<a class="task-item" href=/);
  assert.match(js, /task-go/);
  assert.match(css, /task-item:active/);
  assert.match(css, /task-more/);
});

test("assistant proposal can still be approved directly from the action queue", () => {
  assert.match(js, /publish_next_work/);
  assert.match(js, /admin\/assistant\/actions\/next-work/);
  assert.match(js, /expectedStart/);
  assert.match(js, /expectedEnd/);
  assert.match(js, /Ingen SMS eller e-post sendes/);
});

test("every project quick action is wired to a protected backend route", () => {
  assert.match(js, /data-quick="expense"/);
  assert.match(js, /data-quick="equipment"/);
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

test("home renders only live server data or honest empty states", () => {
  assert.doesNotMatch(html, /Ola Hansen|Kari Olsen|32 450/);
  assert.match(js, /Ingenting krever handling akkurat nå/);
  assert.match(js, /admin\/assistant\/home/);
});
