"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "../admin/hjem.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../admin/hjem.html"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function createFakeDocument() {
  const nodes = new Map();
  function element(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    const handlers = {};
    const item = {
      id, innerHTML: "", textContent: "", className: "", disabled: false,
      classList: {
        add(v) { classes.add(v); }, remove(v) { classes.delete(v); },
        toggle(v, forced) { if (forced === undefined ? !classes.has(v) : forced) classes.add(v); else classes.delete(v); },
        contains(v) { return classes.has(v); },
      },
      addEventListener(type, fn) { handlers[type] = fn; },
      handlers,
      dataset: {},
    };
    nodes.set(id, item);
    return item;
  }
  return {
    nodes, element,
    document: {
      getElementById: element,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
  };
}

function startHome(fetch) {
  const dom = createFakeDocument();
  const win = {
    CONFIG: { API_BASE_URL: "https://api.example.test/api" },
    SorgulenWorkOrderTime: { calculateWorkSeconds: () => 3600, calculateCurrentSessionSeconds: () => 120 },
  };
  vm.runInNewContext(code, {
    document: dom.document, window: win, fetch,
    localStorage: { getItem: () => "test-key", removeItem: () => {} },
    location: { href: "" }, console,
    Intl, Date, Math, Number, String, Map, Set, Promise, encodeURIComponent,
    setInterval: () => 1, confirm: () => false,
  }, { filename: "hjem.js" });
  return dom;
}

const activeData = {
  ok: true,
  activeWorkOrder: null,
  ongoingProjects: [],
  workingOrdersTruncated: false,
  workingOrders: [{
    _id: "test-order-1", status: "stopped", serviceName: "Reparasjon",
    customerSnapshot: { name: "Arbeidskunde" }, workIntervals: [], updatedAt: new Date().toISOString(),
  }],
};

test("open customer projects render immediately even while slow optional alert API is still pending", async () => {
  let answerOverview;
  const dom = startHome((url) => {
    if (url.endsWith("/admin/assistant/home?fast=1")) return Promise.resolve(response(activeData));
    if (url.endsWith("/admin/assistant/overview")) return new Promise((resolve) => { answerOverview = resolve; });
    if (url.endsWith("/admin/assistant/tasks/resolved")) return Promise.resolve(response({ ok: true, tasks: [] }));
    throw new Error("Unexpected request " + url);
  });
  await flush(); await flush();
  assert.match(dom.element("ongoingProjects").innerHTML, /Arbeidskunde/);
  assert.match(dom.element("ongoingProjects").innerHTML, /Mellom økter/);
  assert.match(dom.element("taskList").innerHTML, /Hentar oppfølgingssaker/);
  assert.doesNotMatch(dom.element("tasksTitle").textContent, /Alt er under kontroll/);

  answerOverview(response({ ok: true, overview: { tasks: [{
    id: "alert-1", priority: "high", type: "invoice", title: "Betaling må følgjast opp",
    href: "faktura-detalj.html?id=1", actionLabel: "Opne faktura",
  }] } }));
  await flush(); await flush();
  assert.match(dom.element("tasksTitle").textContent, /1 ting å ordne/);
  assert.match(dom.element("taskList").innerHTML, /Betaling må følgjast opp/);
});

test("optional invoice/alert API errors never produce false 'Alt er under kontroll' or remove work cards", async () => {
  const dom = startHome((url) => {
    if (url.endsWith("/admin/assistant/home?fast=1")) return Promise.resolve(response(activeData));
    if (url.endsWith("/admin/assistant/overview")) return Promise.reject(new Error("Mailbox unavailable"));
    if (url.endsWith("/admin/assistant/tasks/resolved")) return Promise.resolve(response({ ok: true, tasks: [] }));
    throw new Error("Unexpected request " + url);
  });
  await flush(); await flush();
  assert.match(dom.element("ongoingProjects").innerHTML, /Arbeidskunde/);
  assert.match(dom.element("tasksTitle").textContent, /Varslingar ikkje tilgjengelege/);
  assert.match(dom.element("taskList").innerHTML, /Varslingssystemet kunne ikkje kontrollerast/);
  assert.match(dom.element("homeStatus").textContent, /Varslingane er ikkje tilgjengelege/);
  assert.equal(dom.element("followupPanel").classList.contains("has-urgent"), true);
});

test("new home scripts are cache-busted and legacy full overview remains available", () => {
  assert.match(html, /hjem\.js\?v=20261117-fast1/);
  assert.match(code, /\/admin\/assistant\/home\?fast=1/);
  assert.match(code, /\/admin\/assistant\/overview/);
  assert.match(code, /homeLoadSequence/);
  assert.match(code, /renderWorking\(\)/);
});
