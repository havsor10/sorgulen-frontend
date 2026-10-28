const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const read = function (filename) { return fs.readFileSync(path.join(ROOT, filename), "utf8"); };

test("produktsider har faste individuelle utleie-URL-er", () => {
  const app = read("app.js");
  const redirects = read("_redirects");
  const productPages = fs.readdirSync(path.join(ROOT, "utleie")).filter(function (filename) {
    return filename.endsWith(".html") && !["index.html", "produkt.html", "bestill.html"].includes(filename);
  });
  assert.equal(productPages.length, 18);
  for (const filename of productPages) {
    assert.ok(app.includes('"' + filename.slice(0, -5) + '"'), filename);
  }
  assert.match(redirects, /^\/utleie\/bestill\/:slug \/utleie\/bestill\.html 200$/m);
  assert.match(app, /Velg dato og bestill/);
});

test("ny leiebestilling er en egen flyt, uavhengig av vanlig tjenestebooking", () => {
  const page = read("utleie/bestill.html");
  const script = read("utleie/bestill.js");
  assert.match(page, /rentalStart/);
  assert.match(page, /rentalEnd/);
  assert.match(page, /rentalConsent/);
  assert.match(page, /rentalQuantity/);
  assert.match(script, /\/rentals\/bookings/);
  assert.match(script, /\/availability/);
  assert.doesNotMatch(script, /\/api\/bookings/);
  assert.doesNotMatch(script, /localStorage\.setItem/);
});

test("admin viser utleiebestillinger i eksisterende navigasjon", () => {
  const shell = read("admin/admin-shell.js");
  const adminPage = read("admin/utleie-bestillinger.html");
  const adminJs = read("admin/utleie-bestillinger.js");
  assert.match(shell, /utleie-bestillinger\.html/);
  assert.match(adminPage, /data-page="rental-bookings"/);
  assert.match(adminJs, /\/admin\/rentals\/bookings/);
  assert.match(adminJs, /window\.confirm/);
});
