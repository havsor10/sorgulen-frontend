const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("every admin JavaScript file parses, including legacy assets outside the CI checklist", () => {
  const admin = path.join(__dirname, "..", "admin");
  const failures = [];
  for (const name of fs.readdirSync(admin).filter(name => name.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", path.join(admin, name)], { encoding: "utf8" });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr || result.error}`);
  }
  assert.deepEqual(failures, []);
});
