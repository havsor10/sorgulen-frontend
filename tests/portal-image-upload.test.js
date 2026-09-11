const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const imageUpload = require("../admin/portal-image-upload.js");

test("store mobilbilder skaleres proporsjonalt ned til 1600 piksler", () => {
  assert.deepEqual(imageUpload.fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(imageUpload.fitWithin(3000, 4000), { width: 1200, height: 1600 });
});

test("små bilder oppskaleres aldri", () => {
  assert.deepEqual(imageUpload.fitWithin(1200, 800), { width: 1200, height: 800 });
});

test("kildegrensen er større enn direkte backend-fallback slik at store telefonbilder kan komprimeres først", () => {
  assert.ok(imageUpload.MAX_SOURCE_BYTES > imageUpload.FALLBACK_UPLOAD_MAX_BYTES);
  assert.equal(imageUpload.MAX_DIMENSION, 1600);
});

test("kundeportaladmin laster bildeklargjøring før hovedscriptet", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin", "kundeportal.html"), "utf8");
  const helperIndex = html.indexOf('src="portal-image-upload.js"');
  const portalIndex = html.indexOf('src="kundeportal.js"');
  assert.ok(helperIndex >= 0);
  assert.ok(portalIndex > helperIndex);
});

test("kundeportal bruker komprimert bildepayload før opplasting", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "admin", "kundeportal.js"), "utf8");
  assert.match(source, /SorgulenPortalImageUpload\.prepare\(file\)/);
  assert.match(source, /imageData:\s*prepared\.imageData/);
});
