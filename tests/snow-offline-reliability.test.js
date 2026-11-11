const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("admin/broyting.js", "utf8");

test("failed offline operations are retained and block following operations", () => {
  const start = source.indexOf("async function flushPending()");
  const end = source.indexOf("async function startJob", start);
  assert.ok(start > -1 && end > start);
  const replay = source.slice(start, end);
  assert.match(replay, /remaining\.push\(\.\.\.items\.slice\(index\)\)/);
  assert.match(replay, /blocked = error/);
  assert.match(replay, /break;/);
  assert.doesNotMatch(replay, /!\[400,\s*409\]\.includes/);
  assert.match(replay, /Ingenting er sletta/);
  assert.match(replay, /writeJson\(PENDING_KEY, remaining\)/);
});

test("server-rejected start or finish refreshes controls for a safe retry", () => {
  assert.match(source, /if \(result\?\.error\) await refresh\(\{ quiet: true \}\)/);
});
