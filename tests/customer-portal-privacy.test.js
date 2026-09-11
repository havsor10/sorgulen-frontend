const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("kundeportalen er skjermet mot søkemotorindeksering", () => {
  const robots = read("robots.txt");
  const portal = read("prosjekt.html");
  assert.match(robots, /Disallow:\s*\/prosjekt\.html/);
  assert.match(portal, /name="robots"[^>]+noindex[^>]+nofollow/i);
});

test("personvernsiden beskriver prosjektportal og kundegodkjenning", () => {
  const privacy = read("personvern.html");
  assert.match(privacy, /Kundeportal og prosjektlenker/);
  assert.match(privacy, /unik tilgangsnøkkel/);
  assert.match(privacy, /innkjøp krever kundens godkjenning/);
  assert.match(privacy, /arbeidsdager og arbeidstid/);
});
