const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Oversikt er slått sammen med Hjem og finnes ikke lenger i hovednavigasjonen", () => {
  const shell = read("admin/admin-shell.js");
  const html = read("admin/oversikt.html");
  assert.doesNotMatch(shell, /label: "Oversikt"/);
  assert.match(html, /url=hjem\.html/);
  assert.match(html, /Denne siden er slått sammen med Hjem/);
});

test("push-varslinger er kun en System-innstilling, ikke en egen varselkø", () => {
  const shell = read("admin/admin-shell.js");
  const html = read("admin/varslinger.html");
  assert.match(shell, /Varslingsinnstillinger/);
  assert.match(shell, /href="varslinger\.html"/);
  assert.match(html, /id="enablePushBtn"/);
});
