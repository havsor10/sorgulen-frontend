const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const js = fs.readFileSync("admin/felt.js", "utf8");
const css = fs.readFileSync("admin/felt.css", "utf8");

test("Feltadmin viser bare handlingsbare varsler", () => {
  assert.match(js, /task\?\.href/);
  assert.match(js, /task\?\.actionLabel/);
  assert.match(js, /actionableTasks/);
  assert.match(js, /fieldTaskHref/);
});

test("Feltadmin viser tre handlinger før Vis alle", () => {
  assert.match(js, /tasks\.slice\(0, 3\)/);
  assert.match(js, /Vis alle/);
  assert.match(js, /data-toggle-field-actions/);
});

test("hele Feltadmin-varselet går direkte til reparasjonsstedet", () => {
  assert.match(js, /<a class="field-action-card/);
  assert.match(js, /task\.actionLabel/);
  assert.match(css, /field-action-card:active/);
  assert.match(css, /field-action-go/);
});
