"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = filename => fs.readFileSync(path.join(root, filename), "utf8");

function element(initial = {}) {
  const listeners = Object.create(null);
  const classes = new Set(initial.hidden ? ["hidden"] : []);
  let html = "";
  return {
    textContent: "", value: "", disabled: false, children: [], className: "",
    listeners,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : !!force;
        if (enabled) classes.add(name); else classes.delete(name);
      },
    },
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; this.children = []; },
    addEventListener(name, cb) { listeners[name] = cb; },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    ...initial,
  };
}

const nextDay = (days = 10) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function flush() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function makeHarness(mode) {
  const ids = [
    "serviceSelect", "bookingDate", "slotsWrap", "slots", "formWrap",
    "successWrap", "message", "submitBooking", "bookingTitle",
    "bookingModeNotice", "slotHeading", "slotHint", "formTitle",
    "successTitle", "successText", "customerName", "customerPhone",
    "customerEmail", "customerAddress", "comment",
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, element()]));
  for (const id of ["slotsWrap", "formWrap", "successWrap", "bookingModeNotice"]) nodes[id].classList.add("hidden");
  nodes.customerName.value = "Testperson";
  nodes.customerPhone.value = "40000000";
  nodes.customerEmail.value = "test@example.invalid";
  nodes.customerAddress.value = "Testvegen 1";
  nodes.comment.value = "Brøyt heile oppkøyrselen";
  nodes.bookingDate.value = "";
  nodes.submitBooking.textContent = "Send bestilling";

  const service = {
    _id: "507f191e810c19729de860ea", key: "broyting", name: "Brøyting",
    active: true, bookable: true, priceText: "Fra 350 kr",
  };
  const calls = [];
  const window = {
    CONFIG: { API_BASE_URL: "https://test.invalid/api" },
    location: { search: "?service=Br%C3%B8yting", href: "https://test.invalid/booking.html" },
    crypto: { randomUUID: () => "test_snow_operation_12345678" },
  };
  const storageMap = new Map();
  const storage = {
    getItem(key) { return storageMap.get(key) || null; },
    setItem(key, value) { storageMap.set(key, value); },
    removeItem(key) { storageMap.delete(key); },
  };
  const document = {
    getElementById(id) { return nodes[id] || null; },
    createElement() { return element(); },
    querySelectorAll(selector) { return selector === ".slot-btn" ? nodes.slots.children : []; },
  };
  const fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.endsWith("/services")) return { ok: true, json: async () => ({ services: [service] }) };
    if (url.includes("/availability?")) return {
      ok: true, json: async () => ({ allSlots: ["10:00"], bookedTimes: [], ...(mode ? { bookingMode: mode } : {}) }),
    };
    if (url.endsWith("/requests/snow")) return { ok: true, json: async () => ({ ok: true, requestId: "request123", bookingConfirmed: false }) };
    if (url.endsWith("/bookings")) return { ok: true, json: async () => ({ ok: true, bookingId: "booking123" }) };
    throw Error("Unexpected network endpoint " + url);
  };
  vm.runInNewContext(read("booking.js"), { window, document, fetch, URLSearchParams, sessionStorage: storage, localStorage: storage });
  return {
    nodes, calls, window,
    async chooseDate() {
      await flush();
      nodes.bookingDate.value = nextDay();
      await nodes.bookingDate.listeners.change();
      assert.equal(nodes.slots.children.length, 1, "one selectable time rendered");
      nodes.slots.children[0].listeners.click();
      assert.equal(nodes.formWrap.classList.contains("hidden"), false);
    },
    async submit() {
      await nodes.submitBooking.listeners.click();
      await flush();
    },
  };
}

test("on a workday customer sends enquiry; it never confirms a booking", async () => {
  const h = makeHarness("request");
  await h.chooseDate();
  assert.match(h.nodes.bookingModeNotice.textContent, /Arbeidsdag/);
  assert.match(h.nodes.slotHeading.textContent, /Ønskt tidspunkt/);
  assert.equal(h.nodes.submitBooking.textContent, "Send førespurnad");
  await h.submit();
  const creates = h.calls.filter(x => x.opts.method === "POST");
  assert.equal(creates.length, 1);
  assert.ok(creates[0].url.endsWith("/requests/snow"));
  assert.ok(!creates[0].url.endsWith("/bookings"));
  const body = JSON.parse(creates[0].opts.body);
  for (const key of ["customerName", "customerEmail", "customerPhone", "customerAddress", "operationId", "date", "time"]) {
    assert.ok(body[key], key + " required");
  }
  assert.equal(h.nodes.successWrap.classList.contains("hidden"), false);
  assert.match(h.nodes.successText.textContent, /ikkje ei stadfesta bestilling/);
  assert.ok(!h.window.location.href.includes("booking-bekreftelse"));
});

test("on a free day existing direct booking and confirmation are preserved", async () => {
  const h = makeHarness("booking");
  await h.chooseDate();
  assert.match(h.nodes.bookingModeNotice.textContent, /Fridag/);
  assert.equal(h.nodes.submitBooking.textContent, "Send bestilling");
  await h.submit();
  assert.equal(h.calls.filter(x => x.opts.method === "POST").length, 1);
  assert.ok(h.calls.some(x => x.url.endsWith("/bookings") && x.opts.method === "POST"));
  assert.equal(h.window.location.href, "booking-bekreftelse.html");
});

test("old availability API does not falsely claim a date is free", async () => {
  const h = makeHarness(null);
  await h.chooseDate();
  assert.equal(h.nodes.bookingModeNotice.classList.contains("hidden"), true);
});

test("workday enquiries refuse incomplete contact details before POST", async () => {
  const h = makeHarness("request");
  await h.chooseDate();
  h.nodes.customerAddress.value = "";
  await h.submit();
  assert.equal(h.calls.some(x => x.opts.method === "POST"), false);
  assert.match(h.nodes.message.textContent, /adresse/);
});

test("snow admin keeps requests separate from booked jobs, with a direct review link", () => {
  const html = read("admin/broyting.html");
  const script = read("admin/broyting.js");
  assert.match(html, /id="snowRequests"/);
  assert.match(html, /id="snowInbox"/);
  assert.ok(html.indexOf('id="snowRequests"') < html.indexOf('id="snowInbox"'));
  assert.match(script, /unassignedEnquiries/);
  assert.match(script, /foresporsler\.html\?open=/);
  assert.match(script, /renderEnquiries\(data\)/);
  assert.match(script, /renderInbox\(data\)/);
  assert.match(html, /broyting\.js\?v=20261121-shift1/);
  assert.match(read("booking.html"), /booking\.js\?v=20261121-shift1/);
});
