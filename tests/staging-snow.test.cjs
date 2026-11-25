const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const html=fs.readFileSync("booking.html","utf8");
const js=fs.readFileSync("booking.js","utf8");
const job=fs.readFileSync("min-jobb.js","utf8");
const jobHtml=fs.readFileSync("min-jobb.html","utf8");
const conf=fs.readFileSync("booking-bekreftelse.html","utf8");
test("Snow accepts date only and preserves scheduled services",()=>{
  assert.match(html,/id="dayBookingInfo"/);
  assert.match(js,/time:snow\?"":selectedTime/);
  assert.match(js,/renderSlots\(data\)/);
  assert.match(js,/data\.mode!=="day"/);
  assert.match(conf,/I løpet av vald dag/);
});
test("Kartverket suggestions include building letter fallback and driveway map",()=>{
  assert.match(html,/id="addressSuggestions"/);
  assert.match(html,/Kleiva 91B/);
  assert.match(html,/id="drivewayMap"/);
  assert.match(js,/\/addresses\?q=/);
  assert.match(js,/addressGeo:pin/);
  assert.match(js,/map\.on\("click"/);
});
test("Customer status shows private live queue",()=>{
  assert.match(jobHtml,/id="snowQueueCard"/);
  assert.match(job,/kundar framfor deg/);
  assert.match(job,/Du er neste i brøytekøen/);
});

test("Optional requested snow time is separate from reserved time slots",()=>{
  const admin=fs.readFileSync("admin/broyting.js","utf8");
  assert.doesNotMatch(html,/id="snowTimeKind"|data-snow-time=/);
  assert.match(html,/id="snowTimeClock"/);
  assert.match(html,/kan ikkje love eit bestemt klokkeslett/);
  assert.match(js,/snowTimePreference:/);
  assert.match(js,/timeClock.value \? "around" : "none"/);
  assert.match(admin,/TIDSØNSKE/);
  assert.match(conf,/Ønskt tidspunkt/);
  assert.match(jobHtml,/id="snowTimeWishRow"/);
  assert.match(job,/snowTimePreference/);
});

test("Staging shows the known service catalogue immediately while API sleeps",()=>{
  const build=fs.readFileSync("tools/build-staging.cjs","utf8");
  assert.match(build,/stagingServiceCatalog/);
  assert.match(build,/stagingServiceId/);
  assert.match(build,/STAGING_SERVICE_CATALOG/);
  assert.match(js,/presentServices\(window\.STAGING_SERVICE_CATALOG\)/);
  assert.match(js,/loadServices\(\{ silent:true \}\)/);
  assert.match(js,/Date availability and submission never proceed without the backend/);
});

