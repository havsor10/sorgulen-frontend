const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(path.join(__dirname, "..", "admin", "faktura-detalj.js"), "utf8");

test("fakturatid vises som faktisk varighet, ikke lange desimaltimer", () => {
  assert.match(code, /function lineQuantityText/);
  assert.match(code, /line\?\.unit === "hour"/);
  assert.match(code, /Math\.round\(value \* 3600\)/);
  assert.match(code, /sek/);
  assert.match(code, /lineQuantityText\(line\)/);
});
