"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const script = fs.readFileSync(path.join(__dirname, "../admin/foresporsler.js"), "utf8");

const flush = async () => {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
};

function boot({ delivery = "sent" } = {}) {
  let entry = {
    _id: "507f191e810c19729de860ea",
    status: "new",
    snowShiftRequest: true, customerName: "Testkunde",
    customerEmail: "test@example.invalid", customerPhone: "40000000",
    customerAddress: "Testvegen 1", snowRequestedDate: "2026-12-31",
    snowRequestedTime: "19:00", snowReceiptEmailStatus: "sent",
    snowDecisionEmailStatus: "none",
  };
  const messages = [];
  const calls = [];
  const handlers = {};
  let html = "";
  const reqList = {
    addEventListener(event, listener) { handlers[event] = listener; },
    set innerHTML(value) { html = value; },
    get innerHTML() { return html; },
    querySelectorAll() { return []; },
  };
  const statusMessage = {
    textContent: "", className: "status-message",
  };
  const fakeCard = {
    getAttribute(name) { if (name === "data-id") return entry._id; return ""; },
    querySelector(sel) {
      if (sel === ".snowDecisionNote") return { value: "Vi tar kontakt." };
      return null;
    },
  };
  const document = {
    getElementById(id) { return ({ reqList, statusMessage })[id] || null; },
    querySelectorAll() { return []; },
  };
  const storage = { getItem(key) { return key === "sorgulen_admin_key" ? "test-admin-key" : ""; } };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/requests") && !options.method) {
      return { ok: true, json: async () => ({ requests: [{ ...entry }] }) };
    }
    if (url.endsWith("/decision") && options.method === "POST") {
      const body = JSON.parse(options.body);
      entry.status = body.decision === "approve" ? "accepted" : "declined";
      entry.snowDecisionNote = body.note;
      entry.snowDecisionEmailStatus = delivery;
      return { ok: true, status: delivery === "sent" ? 200 : 202, json: async () => ({ ok: true, emailStatus: delivery }) };
    }
    if (url.endsWith("/email/retry") && options.method === "POST") {
      entry.snowDecisionEmailStatus = "sent";
      return { ok: true, status: 200, json: async () => ({ ok: true, emailStatus: "sent" }) };
    }
    throw new Error("Unexpected mocked request: " + url);
  };
  vm.runInNewContext(script, {
    window: { CONFIG: { API_BASE_URL: "https://test.invalid/api" } },
    document, location: { search: "" }, fetch,
    localStorage: storage, URLSearchParams,
    confirm(message) { messages.push(message); return true; },
    prompt() { throw Error("Unexpected login prompt"); },
    console,
  }, { filename: "foresporsler.js" });
  async function click(action) {
    const button = {
      disabled: false,
      getAttribute(name) { return name === "data-action" ? action : ""; },
      closest(sel) { return sel === ".req-card" ? fakeCard : button; },
    };
    await handlers.click({ target: button });
  }
  return { get html() { return html; }, entry: () => entry, calls, messages, statusMessage, click };
}

test("workday snow requests show explicit approve/decline buttons instead of generic offer/invoice", async () => {
  const h = boot();
  await flush();
  assert.match(h.html, /Godkjenn og send e-post/);
  assert.match(h.html, /Avslå og send e-post/);
  assert.match(h.html, /BRØYTEFORESPØRSEL – IKKE AUTOMATISK BESTILLING/);
  assert.doesNotMatch(h.html, /data-action="accept"/);
  assert.doesNotMatch(h.html, /data-action="invoice"/);
  assert.match(h.html, /Mottaksmelding til kunde/);
});

for (const [action, decision, expectedStatus] of [
  ["snow-approve", "approve", "accepted"],
  ["snow-decline", "decline", "declined"],
]) {
  test(action + " calls protected decision API and never generic PATCH", async () => {
    const h = boot();
    await flush();
    await h.click(action);
    assert.equal(h.entry().status, expectedStatus);
    assert.match(h.statusMessage.textContent, /e-posten er sendt/);
    const writes = h.calls.filter(call => call.options.method);
    assert.equal(writes.length, 1);
    assert.ok(writes[0].url.endsWith("/api/admin/snow/enquiries/507f191e810c19729de860ea/decision"));
    assert.equal(writes[0].options.headers["x-admin-key"], "test-admin-key");
    const body = JSON.parse(writes[0].options.body);
    assert.equal(body.decision, decision);
    assert.equal(body.note, "Vi tar kontakt.");
    assert.equal(h.messages.length, 1);
    assert.doesNotMatch(writes[0].url, /\/requests\/507/);
  });
}

test("SMTP failure does not show false success; retry uses dedicated endpoint once", async () => {
  const h = boot({ delivery: "failed" });
  await flush();
  await h.click("snow-approve");
  assert.equal(h.entry().status, "accepted");
  assert.equal(h.entry().snowDecisionEmailStatus, "failed");
  assert.match(h.statusMessage.textContent, /IKKE bekreftet sendt/);
  assert.match(h.html, /Prøv å sende svarmail igjen/);
  await h.click("snow-retry-decision");
  assert.equal(h.entry().snowDecisionEmailStatus, "sent");
  assert.match(h.statusMessage.textContent, /nå sendt/);
  const writes = h.calls.filter(call => call.options.method);
  assert.equal(writes.length, 2);
  assert.ok(writes[1].url.endsWith("/email/retry"));
  assert.deepEqual(JSON.parse(writes[1].options.body), { type: "decision" });
});

test("booking page requires unconfirmed-acknowledgment before workday request", () => {
  const html = fs.readFileSync(path.join(__dirname, "../booking.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../booking.js"), "utf8");
  assert.match(html, /VIKTIG: Brøyting kan ikke garanteres denne dagen/);
  assert.match(html, /Dette er ikke en bestilling/);
  assert.match(html, /id="requestAcknowledged" type="checkbox"/);
  assert.match(js, /acknowledgedNonBinding = true/);
  assert.match(js, /Forespørselen er mottatt – IKKE bestilt/);
  assert.match(html, /booking\.js\?v=20261122-notice1/);
  assert.match(fs.readFileSync(path.join(__dirname, "../admin/foresporsler.html"), "utf8"),
    /foresporsler\.js\?v=20261122-snowmail1/);
});
