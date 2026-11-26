"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const js = fs.readFileSync(path.join(__dirname, "../admin/faktura-detalj.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../admin/faktura-detalj.html"), "utf8");

function makeHarness({ sendOk = true, confirmSend = true, draft } = {}) {
  const invoice = {
    _id: "507f191e810c19729de860ea",
    invoiceNumber: 1009,
    customerName: "Eksempelkunde",
    customerEmail: "test@example.invalid",
    status: "issued",
    description: "Utført testarbeid",
    lines: [{ item: "Arbeid", quantity: 1, unitPrice: 834, amount: 834 }],
    amount: 834,
    emailDraft: draft,
    fiken: { syncStatus: "synced", saleId: "example-123" },
  };
  let markup = "";
  let subjectInput = { value: "" };
  let bodyInput = { value: "" };
  const statusMessage = { textContent: "", style: {} };
  const emailFeedback = { textContent: "", style: {} };
  const calls = [];
  const prompts = [];
  const sendButton = {
    disabled: false, isConnected: true, listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    getAttribute(name) { return name === "data-action" ? "send" : null; },
  };
  const contentNode = {
    set innerHTML(value) {
      markup = value;
      const subject = /<textarea id="emailSubject"[^>]*>([\s\S]*?)<\/textarea>/.exec(value);
      const body = /<textarea id="emailBody"[^>]*>([\s\S]*?)<\/textarea>/.exec(value);
      if (subject) subjectInput = { value: subject[1] };
      if (body) bodyInput = { value: body[1] };
    },
    get innerHTML() { return markup; },
    querySelectorAll(selector) {
      if (selector === "[data-action]") return [sendButton];
      return [];
    },
  };
  const document = {
    getElementById(id) {
      return {
        fdContent: contentNode, statusMessage,
        emailSendFeedback: emailFeedback,
        emailSubject: subjectInput, emailBody: bodyInput,
      }[id] || null;
    },
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/invoices/" + invoice._id) && !options.method) {
      return { ok: true, json: async () => ({ ok: true, invoice }) };
    }
    if (url.endsWith("/invoices/" + invoice._id + "/send") && options.method === "POST") {
      if (!sendOk) return { ok: false, status: 503, json: async () => ({ error: "E-posttenesta er utilgjengeleg" }) };
      invoice.status = "sent";
      return { ok: true, json: async () => ({ ok: true, invoice }) };
    }
    throw new Error("Unexpected endpoint in offline-only test: " + url);
  };
  vm.runInNewContext(js, {
    window: { CONFIG: { API_BASE_URL: "https://invalid.example/api" }, location: { search: "?id=" + invoice._id } },
    document, fetch, URLSearchParams, Intl, Date,
    crypto: { randomUUID: () => "test-operation-id" },
    localStorage: { getItem: () => "test-admin-key", removeItem() {} },
    setTimeout: () => {},
    confirm(message) { prompts.push(message); return confirmSend; },
    prompt() { throw Error("No prompts allowed"); },
    console,
  }, { filename: "faktura-detalj.js" });
  return {
    invoice, calls, prompts, sendButton,
    subject: () => subjectInput, body: () => bodyInput,
    feedback: () => emailFeedback,
    markup: () => markup,
    async loaded() {
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      assert.match(markup, /data-action="send"/);
    },
    async clickSend() {
      await sendButton.listeners.click();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test("issued invoices prefill editable email subject/body without invoking API or sending", async () => {
  const h = makeHarness();
  await h.loaded();
  assert.equal(h.calls.filter(call => call.options.method).length, 0);
  assert.match(h.subject().value, /Faktura 1009 – Utført testarbeid/);
  assert.match(h.body().value, /Hei Eksempelkunde/);
  assert.match(h.body().value, /Vedlagt følger faktura/);
  assert.match(h.markup(), /PDF-fakturaen legges ved automatisk/);
  assert.match(h.markup(), /id="emailSendFeedback" role="status"/);
});

test("blank editable fields use standard text but still need explicit confirmation before POST", async () => {
  const h = makeHarness();
  await h.loaded();
  h.subject().value = "";
  h.body().value = "";
  await h.clickSend();
  const sendCalls = h.calls.filter(call => call.options.method === "POST");
  assert.equal(sendCalls.length, 1);
  assert.ok(sendCalls[0].url.endsWith("/send"));
  const payload = JSON.parse(sendCalls[0].options.body);
  assert.match(payload.subject, /Faktura 1009/);
  assert.match(payload.body, /Eksempelkunde/);
  assert.equal(h.prompts.length, 1);
  assert.match(h.prompts[0], /PDF vedlagt/);
  assert.equal(h.invoice.status, "sent");
});

test("a cancelled confirmation never sends a customer email", async () => {
  const h = makeHarness({ confirmSend: false });
  await h.loaded();
  await h.clickSend();
  assert.equal(h.calls.filter(call => call.options.method === "POST").length, 0);
  assert.equal(h.invoice.status, "issued");
  assert.match(h.feedback().textContent, /Ingen e-post er sendt/);
});

test("customized drafts remain untouched and get sent only after confirmation", async () => {
  const h = makeHarness({ draft: { subject: "Personlig tittel", body: "Tilpasset e-post" } });
  await h.loaded();
  assert.equal(h.subject().value, "Personlig tittel");
  assert.equal(h.body().value, "Tilpasset e-post");
  await h.clickSend();
  const body = JSON.parse(h.calls.find(x => x.options.method === "POST").options.body);
  assert.equal(body.subject, "Personlig tittel");
  assert.equal(body.body, "Tilpasset e-post");
});

test("SMTP/API rejection is visibly shown beside the button and re-enables retry", async () => {
  const h = makeHarness({ sendOk: false });
  await h.loaded();
  await h.clickSend();
  assert.equal(h.invoice.status, "issued");
  assert.equal(h.sendButton.disabled, false);
  assert.equal(h.feedback().style.display, "block");
  assert.match(h.feedback().textContent, /E-posttenesta er utilgjengeleg/);
  assert.match(h.feedback().textContent, /kontroller fakturastatus/i);
});

test("mobile loads a new script version to avoid stale Safari cached send handling", () => {
  assert.match(html, /faktura-detalj\.js\?v=20261126-email-send1/);
});
