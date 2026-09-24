const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const home = fs.readFileSync("index.html", "utf8");
const hub = fs.readFileSync("bedrift/index.html", "utf8");
const industrial = fs.readFileSync("bedrift/industriservice-floro.html", "utf8");
const logistics = fs.readFileSync("bedrift/logistikk-truck-floro.html", "utf8");
const sitemap = fs.readFileSync("sitemap.xml", "utf8");

test("homepage search snippet includes industriservice and business work", () => {
  assert.match(home, /<title>Sørgulen Industriservice \| Industriservice, brøyting og praktiske oppdrag i Florø<\/title>/);
  assert.match(home, /bedriftsoppdrag innen logistikk, mekanisk service og vedlikehold/);
});

test("business hub links to focused search pages", () => {
  assert.match(hub, /href="industriservice-floro\.html"/);
  assert.match(hub, /href="logistikk-truck-floro\.html"/);
});

test("industriservice page has unique search metadata and structured data", () => {
  assert.match(industrial, /<title>Industriservice i Florø \| Sørgulen Industriservice<\/title>/);
  assert.match(industrial, /rel="canonical" href="https:\/\/sorgulen\.no\/bedrift\/industriservice-floro\.html"/);
  assert.match(industrial, /"@type":"Service"/);
  assert.match(industrial, /Mekanisk service/);
  assert.match(industrial, /Oppdrag avtales som konkrete og avgrensede tjenestekjøp/);
});

test("truck and logistics page targets precise competencies without labour-hire claims", () => {
  assert.match(logistics, /<title>Truckarbeid og logistikk i Florø \| T1 T2 T4 G4 G11<\/title>/);
  assert.match(logistics, /T1 · T2 · T4/);
  assert.match(logistics, /G4 · G11/);
  assert.match(logistics, /materialhåndtering/i);
  assert.match(logistics, /Oppdrag, ikkje bemanningsutleie/);
});

test("sitemap exposes all three business pages", () => {
  for (const url of [
    "https://sorgulen.no/bedrift/",
    "https://sorgulen.no/bedrift/industriservice-floro.html",
    "https://sorgulen.no/bedrift/logistikk-truck-floro.html",
  ]) {
    assert.ok(sitemap.includes(url), "Missing sitemap URL: " + url);
  }
});
