const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("admin/broyting.js", "utf8");

test("failed offline operations are retained and block following operations", () => {
  const start = source.indexOf("async function flushPending()");
  const end = source.indexOf("async function startJob", start);
  assert.ok(start > -1 && end > start);
  const replay = source.slice(start, end);
  assert.match(replay, /while .*readJson\(PENDING_KEY/);
  assert.ok(replay.indexOf("await api(") < replay.indexOf("savePending("));
  assert.match(replay, /entry.body.operationId !== item.body.operationId/);
  assert.match(replay, /Ingenting er sletta/);
  const critical = source.slice(source.indexOf("async function criticalMutation"), start);
  assert.ok(critical.indexOf("savePending(") < critical.indexOf("optimistic()"));
});

test("server-rejected start or finish refreshes controls for a safe retry", () => {
  assert.match(source, /if \(result\?\.error\) await refresh\(\{ quiet: true \}\)/);
});

