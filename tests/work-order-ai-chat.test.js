const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AI-chatten er avgrenset til Oppdrag-siden og ikke en global launcher", () => {
  const ai = read("admin/ai-guide.js");
  assert.match(ai, /dataset\.page !== "jobs"/);
  assert.match(ai, /location\.pathname\.endsWith\("\/oppdrag\.html"\)/);
  assert.doesNotMatch(ai, /sorgulenAiLauncher|sai-launcher|position:fixed/);
});

test("admin-shell laster ikkje AI på oppdrags- og kundesidene", () => {
  const shell = read("admin/admin-shell.js");
  assert.doesNotMatch(shell, /ai-guide\.css/);
  assert.doesNotMatch(shell, /ai-guide\.js/);
  assert.doesNotMatch(shell, /ai-advisor-wow\.js/);
  assert.doesNotMatch(shell, /ai-advisor-wow\.css/);
});

test("hvert oppdrag får separat AI-historikk og eksplisitt workOrderId-kontekst", () => {
  const ai = read("admin/ai-guide.js");
  assert.match(ai, /sorgulen_work_order_ai_chat_v1:/);
  assert.match(ai, /params:\s*\{\s*workOrderId:\s*orderId\s*\}/);
  assert.match(ai, /data-work-order-chat/);
  assert.match(ai, /AI · dette oppdraget/);
  assert.match(ai, /\.field-hero/);
});

test("gamle globale AI-filer er fjernet og bildeimporten på oppdrag beholdes", () => {
  assert.equal(fs.existsSync(path.join(root, "admin/ai-advisor-wow.js")), false);
  assert.equal(fs.existsSync(path.join(root, "admin/ai-advisor-wow.css")), false);
  assert.equal(fs.existsSync(path.join(root, "admin/ai-guide-image.css")), false);
  const projectAi = read("admin/ai-guide.js");
  assert.match(projectAi, /data-work-ai-open/);
  assert.match(projectAi, /Bilde \/ skjermbilde/);
});
