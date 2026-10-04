const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("portal publish enhancement settles instead of triggering itself indefinitely", () => {
  const queue = [];
  let notify = () => {};
  let writes = 0;
  function element() {
    let text = "";
    let html = "";
    return { classList: { add() {}, remove() {} },
      get textContent() { return text; }, set textContent(value) { text = value; writes++; notify(); },
      get innerHTML() { return html; }, set innerHTML(value) { html = value; writes++; notify(); } };
  }
  const title = element(), help = element(), confirmation = element();
  const bar = { classList: { add() {}, remove() {} }, querySelector(selector) {
    return { "[data-publish-title]": title, "[data-publish-help]": help, "#portalPublishConfirmation": confirmation }[selector] || null;
  } };
  const draft = element(), approval = element(), status = element(), upload = element();
  const editor = { addEventListener() {}, querySelector(selector) {
    return { "#portalSettingsForm": {}, "#portalPublishBar": bar, ".portal-state-pill.active": {},
      '[data-save-procurement="researching"]': draft, '[data-save-procurement="awaiting_approval"]': approval,
      "#uploadPortalImage": upload }[selector] || null;
  }, querySelectorAll() { return [status]; } };
  class Observer { constructor(callback) { this.callback = callback; } observe() { notify = () => queue.push(this.callback); } }
  vm.runInNewContext(fs.readFileSync("admin/kundeportal-publish.js", "utf8"), {
    document: { getElementById: id => id === "portalEditor" ? editor : null },
    window: { addEventListener() {} }, MutationObserver: Observer,
    requestAnimationFrame: fn => queue.push(fn), Intl,
  });
  let iterations = 0;
  while (queue.length && iterations++ < 30) queue.shift()();
  assert.equal(queue.length, 0, "unchanged labels must not schedule another observer cycle");
  assert.equal(writes, 6, "each of four buttons and two summary texts is written only once");
});
