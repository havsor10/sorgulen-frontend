const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("admin home loads the project-card navigation helper", () => {
  const html = read("admin/hjem.html");
  assert.match(html, /home-project-link\.css/);
  assert.match(html, /home-project-link\.js/);
});

test("project card opens the full work order without hijacking action buttons", () => {
  const js = read("admin/home-project-link.js");
  assert.match(js, /oppdrag\.html\?open=/);
  assert.match(js, /interactiveSelector/);
  assert.match(js, /event\.target\.closest\(interactiveSelector\)/);
  assert.match(js, /data-open-work-order|openWorkOrder/);
});
