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


test("handlingskort for oppdrag har direkte admin-overstyring", () => {
  assert.match(js, /data-override-task/);
  assert.match(js, /override-work-order/);
  assert.match(js, /Marker ferdig · skal faktureres/);
  assert.match(js, /Marker ferdig · ingen faktura/);
  assert.match(js, /Marker som test · fjern varsler/);
  assert.match(js, /Flytt til papirkurv/);
  assert.match(js, /Slett testoppdrag permanent/);
});

test("admin-overstyring bruker sikre backend-handlinger og laster handlingslisten på nytt", () => {
  assert.match(js, /\/admin\/work-orders\/.*\/admin-override/);
  assert.match(js, /action: "no_invoice"/);
  assert.match(js, /\/test"/);
  assert.match(js, /\/trash"/);
  assert.match(js, /\/permanent"/);
  assert.match(js, /await loadField\(false\)/);
});
