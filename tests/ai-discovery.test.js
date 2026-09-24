const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const llms = fs.readFileSync("llms.txt", "utf8");
const robots = fs.readFileSync("robots.txt", "utf8");

test("AI-readable profile exposes the public business hub and focused pages", () => {
  for (const url of [
    "https://sorgulen.no/bedrift/",
    "https://sorgulen.no/bedrift/industriservice-floro.html",
    "https://sorgulen.no/bedrift/logistikk-truck-floro.html",
  ]) {
    assert.ok(llms.includes(url), "Missing AI discovery URL: " + url);
  }
});

test("AI-readable profile keeps competence and contract status precise", () => {
  assert.match(llms, /Truck: T1, T2, T4/);
  assert.match(llms, /Kran og løft: G4, G11/);
  assert.match(llms, /Førerkort: B, BE, T/);
  assert.match(llms, /praktisk slokkeøvelse gjenstår/);
  assert.match(llms, /skal ikke omtales som et bemanningsbyrå/);
});

test("public crawlers can discover public content while admin stays excluded", () => {
  assert.match(robots, /User-agent: OAI-SearchBot/);
  assert.match(robots, /User-agent: ChatGPT-User/);
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/sorgulen\.no\/sitemap\.xml/);
});
