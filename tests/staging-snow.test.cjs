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
  assert.match(html,/id="snowTimeKind"/);
  assert.match(html,/id="snowTimeClock"/);
  assert.match(html,/ikkje ein stadfesta avtale/);
  assert.match(js,/snowTimePreference:/);
  assert.match(js,/timeKind.value !== "none"/);
  assert.match(admin,/TIDSØNSKE/);
  assert.match(conf,/Ønskt tidspunkt/);
  assert.match(jobHtml,/id="snowTimeWishRow"/);
  assert.match(job,/snowTimePreference/);
});

test("One-tap preferred clock values fill the native time input without affecting the address",()=>{
  assert.match(html,/data-snow-time="08:00"/);
  assert.match(html,/id="snowTimeClock" type="time"/);
  assert.match(js,/timeClock\.value = button\.dataset\.snowTime/);
  assert.match(js,/updateQuickTimeButtons\(\)/);
  assert.equal((html.match(/id="snowTimeClock"/g)||[]).length,1);
  assert.equal((html.match(/id="customerAddress"/g)||[]).length,1);
});
