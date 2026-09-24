const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("index.html", "utf8");
const page = fs.readFileSync("bedrift/index.html", "utf8");
const css = fs.readFileSync("bedrift/bedrift.css", "utf8");
const js = fs.readFileSync("bedrift/bedrift.js", "utf8");

test("business page stays separate from the main website navigation", () => {
  assert.doesNotMatch(home, /href=["'](?:\/)?bedrift(?:\/|["'])/i);
  assert.match(page, /Arbeidsversjon/);
});

test("business draft is hidden from search engines until launch", () => {
  assert.match(page, /name="robots" content="noindex,nofollow"/);
});

test("business page covers the intended business-use areas", () => {
  for (const text of [
    "Praktisk industribistand",
    "Lager og internflyt",
    "Vedlikehold og praktiske oppgaver",
    "Uteområder og sesong",
    "HMS og krav",
    "Fra behov til utført jobb",
  ]) {
    assert.match(page, new RegExp(text));
  }
});

test("business page has direct contact paths without depending on site navigation", () => {
  assert.match(page, /tel:\+4740730187/);
  assert.match(page, /mailto:sor\.industri@gmail\.com/);
});

test("business page has its own responsive presentation and navigation", () => {
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(js, /menuButton/);
  assert.match(js, /IntersectionObserver/);
});
