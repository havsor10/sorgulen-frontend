const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("AI Studio finnes i nettside-admin og krever eksplisitt publisering", () => {
  const nettside = read("admin/nettside.html");
  const studio = read("admin/ai-studio.html");
  const js = read("admin/ai-studio.js");

  assert.match(nettside, /ai-studio\.html/);
  assert.match(studio, /id="previewCanvas"/);
  assert.match(studio, /id="publishBtn"/);
  assert.match(js, /\/publish/);
  assert.match(js, /AI-en mener viktig informasjon fortsatt mangler/);
});

test("AI Studio støtter tjeneste, utleie, kampanje og reklame", () => {
  const studio = read("admin/ai-studio.html");
  for (const type of ["service", "rental", "campaign", "social", "section"]) {
    assert.match(studio, new RegExp('value="' + type + '"'));
  }
});

test("publisert AI-innhold kobles til offentlige nettsider", () => {
  const app = read("app.js");
  assert.match(app, /\/website-content/);
  assert.match(app, /renderDynamicRentals/);
  assert.match(app, /renderDynamicServices/);
  assert.match(app, /renderCampaigns/);
  assert.match(app, /renderDynamicSections/);
  assert.match(app, /aiRentalDetail/);
  assert.match(app, /aiServiceDetail/);
  assert.ok(fs.existsSync("utleie/produkt.html"));
  assert.ok(fs.existsSync("tjenester/tjeneste.html"));
});


test("reklameinnlegg skilles fra innhold som faktisk går live på nettsida", () => {
  const studio = read("admin/ai-studio.js");
  assert.match(studio, /GODKJENT/);
  assert.match(studio, /Godkjenn innlegg/);
  assert.match(studio, /isWebsiteType/);
});
