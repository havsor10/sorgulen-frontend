const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "admin/work-order-ai.js"), "utf8");

test("AI-tekstkontroll lager ikke en ekstra vedvarende varselkø", () => {
  assert.match(source, /localStorage\.removeItem\(QUESTION_KEY\)/);
  assert.doesNotMatch(source, /addQuestions\(info\.orderId/);
  assert.match(source, /data-work-ai-questions/);
  assert.match(source, /Fakturakontrollen/);
});
