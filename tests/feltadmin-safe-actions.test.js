const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const js = fs.readFileSync("admin/felt.js", "utf8");
const css = fs.readFileSync("admin/felt.css", "utf8");

test("start og fortsett krever eksplisitt popup-bekreftelse", () => {
  assert.match(js, /requestSafeJobAction/);
  assert.match(js, /window\.confirm\("Ønsker du å starte en ny arbeidsøkt\?"\)/);
  assert.match(js, /\["start", "resume"\]\.includes\(action\)/);
  assert.match(js, /if \(!confirmed\) return/);
  assert.doesNotMatch(js, /TRYKK IGJEN FOR Å/);
  assert.doesNotMatch(css, /is-confirming/);
});

test("bookinger og prisforespørsler blir direkte handlingskort i Feltadmin", () => {
  assert.match(js, /fieldTaskHref/);
  assert.match(js, /from=field/);
  assert.match(js, /field-action-card/);
  assert.match(js, /task\.href/);
  assert.match(css, /\.field-action-card/);
});
