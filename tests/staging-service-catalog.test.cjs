const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const dist = path.join(__dirname,"..","staging-dist");

test("staging config contains the live API and an immediately usable catalogue", () => {
  const config = fs.readFileSync(path.join(dist,"config.js"),"utf8");
  assert.match(config,/STAGING_SERVICE_CATALOG=/);
  assert.match(config,/https:\/\/sorgulen-test-api\.onrender\.com\/api/);
  assert.doesNotMatch(config,/https:\/\/sorgulen-backend-2\.onrender\.com/);
  const match = config.match(/window\.STAGING_SERVICE_CATALOG=([^\n]+);/);
  assert.ok(match,"expected a serialized service catalogue");
  const services = JSON.parse(match[1]);
  for (const key of ["broyting","dekkskift"]) {
    const item = services.find(service => service.key === key);
    assert.ok(item,"missing "+key);
    const id = crypto.createHash("sha256")
      .update("sorgulen-staging-default-service:" + key).digest("hex").slice(0,24);
    assert.equal(item._id,id);
    assert.equal(item.bookable,true);
    assert.equal(item.active,true);
  }
});

test("deployed staging booking code uses local services before any slow API call", () => {
  const js = fs.readFileSync(path.join(dist,"booking.js"),"utf8");
  assert.match(js,/presentServices\(window\.STAGING_SERVICE_CATALOG\)/);
  assert.match(js,/loadServices\(\{ silent:true \}\)/);
  assert.match(js,/const response = await fetch\(API\+"\/availability/);
  const html = fs.readFileSync(path.join(dist,"booking.html"),"utf8");
  assert.match(html,/<select id="serviceSelect"><\/select>/);
  assert.match(html,/<script src="config\.js\?v=[a-f0-9]{12}"><\/script>/);
  assert.match(html,/<script src="booking\.js\?v=[a-f0-9]{12}"><\/script>/);
});
