"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../booking.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../booking.html"), "utf8");

const mockResponse = (json, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => json,
});
const nextDate = (start, days) =>
  new Date(Date.parse(start + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createElement(id = "") {
  const listeners = new Map();
  const classes = new Set(["hidden"]);
  const result = {
    id, value: "", textContent: "", innerHTML: "", children: [],
    disabled: false,
    className: "",
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    emit(type) { return (listeners.get(type) || []).map((fn) => fn({ target: result })); },
    appendChild(child) { result.children.push(child); },
    replaceChildren(...children) { result.children = [...children]; },
  };
  return result;
}

function boot(fetch) {
  const ids = [
    "serviceSelect", "bookingDate", "slotsWrap", "slots", "formWrap", "successWrap", "message",
    "submitBooking", "bookingTitle", "customerName", "customerPhone", "customerEmail",
    "customerAddress", "comment",
  ];
  const el = Object.fromEntries(ids.map((id) => [id, createElement(id)]));
  el.submitBooking.textContent = "Send bestilling";
  const storageMap = new Map();
  const storage = {
    getItem(key) { return storageMap.get(key) || null; },
    setItem(key, value) { storageMap.set(key, value); },
    removeItem(key) { storageMap.delete(key); },
  };
  let seed = 0;
  const win = {
    CONFIG: { API_BASE_URL: "https://api.example.test/api" },
    location: { search: "", href: "" },
    crypto: { randomUUID: () => "550e8400-e29b-41d4-a716-" + String(++seed).padStart(12, "0") },
  };
  const doc = {
    getElementById(id) { return el[id]; },
    createElement() { return createElement(); },
    querySelectorAll(selector) { return selector === ".slot-btn" ? el.slots.children : []; },
  };
  vm.runInNewContext(source, {
    window: win, document: doc, fetch, sessionStorage: storage, localStorage: storage,
    URLSearchParams, Intl, Date, JSON, Number, String, Array, Set, Math, console,
    encodeURIComponent,
  }, { filename: "booking.js" });
  return { el, window: win, storage };
}

const services = [{
  _id: "s1", key: "broyting", name: "Brøyting", active: true,
  bookable: true, priceText: "350 kr",
}];

test("utdatert svar frå første dato skal ikkje erstatte nyaste ledige tider", async () => {
  const availability = new Map();
  const { el } = boot((url) => {
    if (url.endsWith("/services")) return Promise.resolve(mockResponse({ services }));
    const day = new URL(url).searchParams.get("date");
    return new Promise((resolve) => availability.set(day, resolve));
  });
  await flush();
  const first = nextDate(el.bookingDate.min, 3);
  const second = nextDate(el.bookingDate.min, 4);
  el.bookingDate.value = first; el.bookingDate.emit("change");
  el.bookingDate.value = second; el.bookingDate.emit("change");
  assert.equal(availability.size, 2);
  availability.get(second)(mockResponse({ allSlots: ["14:00"], bookedTimes: [] }));
  await flush();
  availability.get(first)(mockResponse({ allSlots: ["09:00"], bookedTimes: [] }));
  await flush();
  assert.deepEqual(el.slots.children.map((item) => item.textContent), ["14:00"]);
  assert.equal(el.formWrap.classList.contains("hidden"), true);
});

test("to raske trykk på Send bestilling gir berre éin POST", async () => {
  let sendCount = 0;
  let finishPost;
  const { el, window } = boot((url, options) => {
    if (url.endsWith("/services")) return Promise.resolve(mockResponse({ services }));
    if (url.includes("/availability?")) return Promise.resolve(mockResponse({ allSlots: ["15:00"], bookedTimes: [] }));
    if (url.endsWith("/bookings") && options.method === "POST") {
      sendCount++;
      return new Promise((resolve) => { finishPost = resolve; });
    }
    throw Error("Unexpected URL " + url);
  });
  await flush();
  el.bookingDate.value = nextDate(el.bookingDate.min, 3);
  el.bookingDate.emit("change"); await flush();
  el.slots.children[0].emit("click");
  el.customerName.value = "Test Kunde"; el.customerPhone.value = "90000000";
  el.customerEmail.value = "kunden@example.no"; el.customerAddress.value = "Testvegen 1";
  el.submitBooking.emit("click");
  el.submitBooking.emit("click");
  assert.equal(sendCount, 1);
  assert.equal(el.submitBooking.disabled, true);
  finishPost(mockResponse({ ok: true, bookingId: "booking-1" }, 201));
  await flush(); await flush();
  assert.equal(window.location.href, "booking-bekreftelse.html");
});

test("ein uavklart nettverksfeil kan prøvast att med nøyaktig same operationId", async () => {
  let sendCount = 0;
  const ids = [];
  const { el, window, storage } = boot((url, options) => {
    if (url.endsWith("/services")) return Promise.resolve(mockResponse({ services }));
    if (url.includes("/availability?")) return Promise.resolve(mockResponse({ allSlots: ["16:00"], bookedTimes: [] }));
    if (url.endsWith("/bookings")) {
      const payload = JSON.parse(options.body);
      ids.push(payload.operationId);
      sendCount++;
      if (sendCount === 1) return Promise.reject(new Error("network lost"));
      return Promise.resolve(mockResponse({ ok: true, duplicate: true, bookingId: "booking-1" }));
    }
    throw Error("Unexpected URL " + url);
  });
  await flush();
  el.bookingDate.value = nextDate(el.bookingDate.min, 3);
  el.bookingDate.emit("change"); await flush();
  el.slots.children[0].emit("click");
  el.customerName.value = "Test Kunde"; el.customerPhone.value = "90000000";
  el.customerEmail.value = "kunden@example.no"; el.customerAddress.value = "Testvegen 1";
  el.submitBooking.emit("click"); await flush();
  assert.equal(el.submitBooking.disabled, false);
  assert.equal(window.location.href, "");
  assert.match(el.message.textContent, /Nettverksfeil/);
  el.submitBooking.emit("click"); await flush(); await flush();
  assert.equal(sendCount, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(window.location.href, "booking-bekreftelse.html");
  assert.equal(storage.getItem("sorgulen_booking_retry"), null);
});

test("tenestenamn blir viste som trygg tekst, ikkje injisert HTML", async () => {
  const name = '<img src=x onerror=alert(1)>';
  const { el } = boot((url) => Promise.resolve(mockResponse({ services: [{ ...services[0], name }] })));
  await flush();
  assert.equal(el.serviceSelect.children[0].textContent.startsWith(name), true);
  assert.equal(el.serviceSelect.children[0].innerHTML, "");
});

test("bookable=false skal ikkje gi direkte booking på nettsida", async () => {
  const { el } = boot(() => Promise.resolve(mockResponse({ services: [
    { ...services[0], bookable: false },
  ] })));
  await flush();
  assert.equal(el.serviceSelect.disabled, true);
  assert.match(el.message.textContent, /Ingen tenester/);
});

test("publisert HTML lastar nye booking-scriptet", () => {
  assert.match(html, /booking\.js\?v=20261117-safe1/);
  assert.doesNotMatch(html, /height="34" \/ decoding="async"/);
});
