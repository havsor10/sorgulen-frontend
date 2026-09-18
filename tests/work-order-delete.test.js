const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "admin/work-order-delete.js"), "utf8");

test("work order detail offers explicit deletion without deleting customer", () => {
  assert.match(html, /work-order-delete\.js\?v=20260918-delete1/);
  assert.match(ui, /data-work-order-delete/);
  assert.match(ui, /method: "DELETE"/);
  assert.match(ui, /Kunden blir beholdt/);
  assert.match(ui, /Dette kan ikke angres/);
});

test("delete action is hidden for invoiced and running work orders", () => {
  assert.match(ui, /order\.invoiceId/);
  assert.match(ui, /\["active", "paused"\]\.includes\(order\.status\)/);
});
