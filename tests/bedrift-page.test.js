const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Bedrift-prototype ikke publisert som produksjonsfiler", () => {
  for (const file of [
    "bedrift/index.html",
    "bedrift/industriservice-floro.html",
    "bedrift/logistikk-truck-floro.html",
    "bedrift/bedrift.css",
    "bedrift/bedrift.js"
  ]) {
    assert.equal(fs.existsSync(file), false, file + " skal ikke ligge i produksjon");
  }
});

test("Bedrift-prototype er ikke lenket fra offentlig forside", () => {
  const home = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(home, /href=["']bedrift\//);
  assert.doesNotMatch(home, /id=["']for-bedrifter["']/);
});
