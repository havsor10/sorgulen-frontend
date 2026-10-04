const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function setup(fetch) {
  const timers = new Map(); let timerId = 0;
  const context = { window: {}, AbortController, fetch,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync("admin/invoice-financial-preview.js", "utf8"), context);
  return { create: context.window.createInvoiceFinancialPreview,
    run(delay) { const [id, timer] = [...timers].find(([, value]) => value.delay === delay); timers.delete(id); return timer.fn(); } };
}

test("financial preview uses server totals and ignores an older response after the user edits", async () => {
  const requests = []; const results = []; let value = 16170.16;
  const env = setup((_url, options) => new Promise(resolve => requests.push({ options, resolve })));
  const update = env.create({ endpoint: "/financial-preview", headers: () => ({ authorization: "test" }),
    payload: () => ({ lines: [{ amount: value }] }), pending() {}, error(message) { assert.fail(message); }, render: totals => results.push(totals.amount) });
  update(); const first = env.run(200);
  assert.equal(JSON.parse(requests[0].options.body).lines[0].amount, 16170.16);
  value = 100.99; update(); const second = env.run(200);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve({ ok: true, json: async () => ({ financials: { amount: 100 } }) }); await second;
  requests[0].resolve({ ok: true, json: async () => ({ financials: { amount: 16170 } }) }); await first;
  assert.deepEqual(results, [100]);
});

test("financial preview displays backend validation errors and a bounded timeout", async () => {
  const errors = []; const env = setup(async () => ({ ok: false, json: async () => ({ error: "Ugyldig rabatt" }) }));
  const update = env.create({ endpoint: "/financial-preview", headers: () => ({}), payload: () => ({}),
    pending() {}, render() { assert.fail("must not display invalid totals"); }, error: message => errors.push(message) });
  update(); await env.run(200); assert.deepEqual(errors, ["Ugyldig rabatt"]);
  const stalled = setup((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError" })));
  }));
  const slow = stalled.create({ endpoint: "/financial-preview", headers: () => ({}), payload: () => ({}),
    pending() {}, render() { assert.fail("timeout must not show a guessed total"); }, error: message => errors.push(message) });
  slow(); const running = stalled.run(200); stalled.run(15000); await running;
  assert.match(errors[1], /tok for lang tid/);
});
