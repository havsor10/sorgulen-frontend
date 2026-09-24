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

test("business draft stays hidden from search engines until launch", () => {
  assert.match(page, /name="robots" content="noindex,nofollow"/);
});

test("competence is visible before detailed experience and hire information", () => {
  const competence = page.indexOf('id="kompetanse"');
  const experience = page.indexOf('id="erfaring"');
  const hire = page.indexOf('id="innleie"');
  assert.ok(competence > 0);
  assert.ok(experience > competence);
  assert.ok(hire > experience);
});

test("business page lists supplied licence and competence classes precisely", () => {
  for (const text of [
    "T1 · T2 · T4",
    "Lavtløftende palletruck",
    "Skyvemasttruck / støttebenstruck",
    "Motvektstruck",
    "G4 · G11",
    "Bro- og traverskran",
    "Løfteredskap",
    "B · BE · T",
    "Personbil med tilhenger",
    "Traktor",
  ]) {
    assert.ok(page.includes(text), "Missing competence label: " + text);
  }
});

test("hot work is clearly not presented as a valid certificate yet", () => {
  assert.match(page, /Praktisk slokkeøvelse gjenstår/);
  assert.match(page, /Ikke markert som gyldig ennå/);
});

test("practical experience is separate and relevant to industrial hire", () => {
  for (const text of [
    "Logistikk og lager",
    "Truckarbeid",
    "Lasting og lossing",
    "Industri og drift",
    "Praktisk mekanisk arbeid",
    "Service, enklere reparasjoner og vedlikehold",
    "Montering og demontering",
    "Brøyting og vinterarbeid",
  ]) {
    assert.ok(page.includes(text), "Missing experience item: " + text);
  }
});

test("employer names are not used as marketing claims", () => {
  assert.doesNotMatch(page, /EWOS/i);
  assert.doesNotMatch(page, /Cargill/i);
});

test("direct telephone contact is the primary business action", () => {
  const telephoneLinks = page.match(/href="tel:\+4740730187"/g) || [];
  assert.ok(telephoneLinks.length >= 4);
  assert.match(page, /Ring direkte/);
  assert.match(page, /407 30 187/);
  assert.match(page, /class="mobile-call-bar"/);
});

test("mobile layout keeps a persistent call action", () => {
  assert.match(css, /\.mobile-call-bar/);
  assert.match(css, /position:fixed/);
  assert.match(css, /@media\(max-width:720px\)/);
});

test("business page keeps its own responsive navigation", () => {
  assert.match(js, /menuButton/);
  assert.match(js, /IntersectionObserver/);
});
