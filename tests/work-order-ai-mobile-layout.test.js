const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "admin", "work-order-ai.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "admin", "oppdrag.html"), "utf8");

test("AI image modal cannot overflow horizontally on mobile", () => {
  assert.match(css, /\.work-ai-sheet\{[^}]*max-width:100%/s);
  assert.match(css, /\.work-ai-sheet\{[^}]*overflow-x:hidden/s);
  assert.match(css, /\.work-ai-action\{[^}]*min-width:0/s);
  assert.match(css, /\.work-ai-billable\{[^}]*width:100%/s);
  assert.match(css, /\.work-ai-billable\{[^}]*overflow-wrap:anywhere/s);
});

test("oppdrag busts the AI stylesheet cache after mobile layout fix", () => {
  assert.match(html, /work-order-ai\.css\?v=20260917-mobile1/);
});
