const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "admin/kundeportal-fullscreen.js"), "utf8");
const id = "0123456789abcdef01234567";
function setup(options = {}) {
  const editorHandlers = {};
  const buttonHandlers = {};
  const backHandlers = {};
  const windowHandlers = {};
  const documentHandlers = {};
  const savedCalls = [];
  const confirmations = [];
  const alerts = [];
  const header = { hidden: true };
  const dock = { hidden: true };
  const back = { href: "", addEventListener: (type, cb) => { backHandlers[type] = cb; } };
  const saveButton = {
    disabled: true, textContent: "",
    addEventListener(type, cb) { buttonHandlers[type] = cb; },
  };
  const saveStatus = { textContent: "" };
  const statusBox = { textContent: "", classList: { contains: () => false } };
  const editor = {
    children: [],
    addEventListener(type, cb) { editorHandlers[type] = cb; },
    querySelector() { return null; },
  };
  const elements = {
    portalFullscreenHeader: header,
    portalReturnOrder: back,
    portalFullscreenDock: dock,
    portalFullscreenSave: saveButton,
    portalFullscreenSaveStatus: saveStatus,
    portalStatus: statusBox,
    portalEditor: editor,
  };
  const admin = {
    isReady: () => true,
    linkIsActive: () => options.active === true,
    editingPublicProcurement: () => options.editingPublic === true,
    save: async (changes) => {
      savedCalls.push(changes);
      if (options.fail) throw new Error("Skriv feila");
      return { saved: Object.keys(changes).filter((key) => changes[key]), publicUpdated: options.active === true };
    },
  };
  const ctx = {
    URLSearchParams,
    alert: (message) => alerts.push(message),
    MutationObserver: class { observe() {} },
    document: {
      documentElement: { classList: { contains: (x) => x === "portal-fullscreen" } },
      getElementById: (name) => elements[name],
      querySelectorAll: () => [],
      addEventListener: (type, cb) => { documentHandlers[type] = cb; },
    },
    window: {
      location: { search: "?fullscreen=1&workOrderId=" + id },
      SorgulenPortalFullscreenAdmin: admin,
      confirm: (message) => {
        confirmations.push(message);
        return options.confirm !== false;
      },
      requestAnimationFrame: () => {},
      addEventListener: (type, cb) => { windowHandlers[type] = cb; },
    },
  };
  vm.runInNewContext(source, ctx);
  function input(area) {
    const selectors = {
      settings: "#portalSettingsForm",
      procurement: ".procurement-builder",
      image: "#portalImage, #portalImageCaption",
    };
    editorHandlers.input({
      target: { closest: (selector) => selector === selectors[area] ? {} : null },
    });
  }
  return {
    input, savedCalls, confirmations, alerts, saveButton, buttonHandlers,
    back, backHandlers, documentHandlers, windowHandlers, editorHandlers, header, dock,
    saveStatus, statusBox,
  };
}

test("fullscreen starts empty with safe back link to exact work order", () => {
  const s = setup();
  assert.equal(s.header.hidden, false);
  assert.equal(s.dock.hidden, false);
  assert.equal(s.back.href, "oppdrag.html?open=" + id);
  assert.equal(s.saveButton.disabled, true);
});

test("no save or public change happens on input; cancellation keeps draft", async () => {
  const s = setup({ active: true, confirm: false });
  s.input("settings");
  assert.equal(s.saveButton.disabled, false);
  assert.equal(s.savedCalls.length, 0);
  await s.buttonHandlers.click();
  assert.equal(s.savedCalls.length, 0);
  assert.equal(s.confirmations.length, 1);
  assert.equal(s.saveButton.disabled, false);
  let prevented = false;
  s.backHandlers.click({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(s.back.href, "oppdrag.html?open=" + id);
});

test("one save batches settings, internal procurement and image after approval", async () => {
  const s = setup({ active: true });
  s.input("settings");
  s.input("procurement");
  s.input("image");
  await s.buttonHandlers.click();
  assert.equal(s.savedCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.savedCalls[0])), {
    settings: true, procurement: true, image: true,
  });
  assert.equal(s.confirmations.length, 1);
  assert.equal(s.saveButton.disabled, true);
  assert.match(s.saveStatus.textContent, /lagra/i);
});

test("public procurement approval requires explicit confirmation and blocks unsaved settings", () => {
  const s = setup({ confirm: false });
  let stopped = false;
  const approval = {
    target: { closest: (selector) => selector.includes("awaiting_approval") ? {} : null },
    preventDefault() { stopped = true; },
    stopImmediatePropagation() { stopped = true; },
  };
  s.editorHandlers.click(approval);
  assert.equal(stopped, true);
  assert.equal(s.confirmations.length, 1);
  assert.equal(s.savedCalls.length, 0);

  // A public approval must not accidentally discard another unsaved section.
  stopped = false;
  s.input("settings");
  s.editorHandlers.click(approval);
  assert.equal(stopped, true);
  assert.equal(s.alerts.length, 1);
  assert.equal(s.savedCalls.length, 0);
});

test("save failure leaves unsaved content editable for another attempt", async () => {
  const s = setup({ fail: true });
  s.input("procurement");
  await s.buttonHandlers.click();
  assert.equal(s.savedCalls.length, 1);
  assert.equal(s.saveButton.disabled, false);
  assert.match(s.saveStatus.textContent, /Skriv feila/);
});

test("browser back warns while edits are unsaved and does not warn after save", async () => {
  const s = setup();
  s.input("image");
  let prevented = false;
  s.windowHandlers.beforeunload({
    preventDefault() { prevented = true; },
    returnValue: null,
  });
  assert.equal(prevented, true);
  await s.buttonHandlers.click();
  prevented = false;
  s.windowHandlers.beforeunload({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
});
