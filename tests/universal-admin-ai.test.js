const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "admin/admin-shell.js"), "utf8");
const ai = fs.readFileSync(path.join(root, "admin/ai-universal.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/ai-universal.css"), "utf8");

test("universal AI is loaded on all admin shell pages", () => {
  assert.match(shell, /ai-universal\.css/);
  assert.match(shell, /ai-universal\.js/);
  assert.doesNotMatch(shell, /if \(page === "jobs"\) ensureAsset\("script", \{ src: "ai-universal/);
});

test("universal AI supports multiple images and page context", () => {
  assert.match(ai, /const MAX_IMAGES = 3/);
  assert.match(ai, /multiple hidden/);
  assert.match(ai, /clipboardData/);
  assert.match(ai, /clientSnapshot: pageSnapshot\(\)/);
  assert.match(ai, /\/admin\/assistant\/universal\/chat/);
});

test("launcher stays fixed above mobile navigation", () => {
  assert.match(css, /\.saiu-launcher\{position:fixed/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
