const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("portal belongs to the lower action group after Kundeinfo, not the header", () => {
  const js = read("admin/work-order-field.js");
  const actions = js.slice(js.indexOf("function addMenuMarkup(order)"), js.indexOf("function workflowMarkup(order)"));
  const hero = js.slice(js.indexOf("detail.innerHTML ="), js.indexOf("financeStatusMarkup(order) +"));
  assert.ok(actions.includes("+ Legg til registrering"));
  assert.ok(actions.includes("Kundeinfo"));
  assert.ok(actions.includes("portalActionMarkup(order)"));
  assert.ok(actions.indexOf("Kundeinfo") < actions.lastIndexOf("portalActionMarkup(order)"));
  assert.ok(actions.lastIndexOf("portalActionMarkup(order)") < actions.indexOf("field-add-backdrop"));
  assert.match(hero, /compactWorkControls\(order\) \+\s+addMenuMarkup\(order\) \+/);
  assert.doesNotMatch(hero, /customer-portal-detail-link|field-minor-link/);
});

test("portal action persists on locked and completed jobs", () => {
  const js = read("admin/work-order-field.js");
  assert.match(js, /if \(!canAdd\) return '<div class="field-action-row">' \+ portalActionMarkup\(order\)/);
  assert.match(js, /function portalActionMarkup\(order\)/);
  assert.ok(js.includes("kundeportal.html?fullscreen=1&amp;workOrderId="));
});

test("portal navigation is large, full-width and visually distinctive on mobile and desktop", () => {
  const css = read("admin/work-order-field.css");
  const html = read("admin/oppdrag.html");
  assert.ok(css.includes(".field-action-row > .field-portal-action {"));
  assert.ok(css.includes("grid-column: 1 / -1"));
  assert.ok(css.includes("min-height: 58px"));
  assert.ok(css.includes("background: #214766"));
  assert.ok(css.includes(".field-portal-action:focus-visible"));
  assert.ok(html.includes("work-order-field.css?v=20261110-portalnav1"));
  assert.ok(html.includes("work-order-field.js?v=20261110-fullscreen2"));
});
