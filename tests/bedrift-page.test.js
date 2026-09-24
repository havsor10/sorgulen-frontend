const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("index.html", "utf8");
const page = fs.readFileSync("bedrift/index.html", "utf8");
const css = fs.readFileSync("bedrift/bedrift.css", "utf8");
const js = fs.readFileSync("bedrift/bedrift.js", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");
const robots = fs.readFileSync("robots.txt", "utf8");

test("business page is connected from the public website", () => {
  assert.match(home, /href="bedrift\/"/);
  assert.match(home, /For bedrifter/);
  assert.match(home, /Industriservice, logistikk og praktiske bedriftsoppdrag/);
});

test("business page is search-ready and included in discovery files", () => {
  assert.match(page, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(page, /rel="canonical" href="https:\/\/sorgulen\.no\/bedrift\/"/);
  assert.match(page, /application\/ld\+json/);
  assert.match(sitemap, /https:\/\/sorgulen\.no\/bedrift\//);
  assert.match(robots, /Sitemap: https:\/\/sorgulen\.no\/sitemap\.xml/);
});

test("competence is visible before experience and business contract information", () => {
  const competence = page.indexOf('id="kompetanse"');
  const experience = page.indexOf('id="erfaring"');
  const work = page.indexOf('id="oppdrag"');
  assert.ok(competence > 0);
  assert.ok(experience > competence);
  assert.ok(work > experience);
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

test("practical experience is separate and relevant to industrial work", () => {
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

test("page uses an accurate independent-contractor model instead of self-hire language", () => {
  assert.match(page, /oppdragsavtale\/tjenestekjøp/i);
  assert.match(page, /Dette er ikkje utleie av innehaveren som arbeidstaker/);
  assert.doesNotMatch(page, />Innleie</i);
});

test("direct telephone contact remains the primary business action", () => {
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
