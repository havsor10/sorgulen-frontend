"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const e = require("../kalkyle/pricing-engine.js");

const settings = { rateMode: "own", costHourly: 320, travelMinutes: 30, markup: 20, buffer: 8, otherCost: 0, disposalCost: 0, vat: 0 };
function estimate(type, qty, details, opts) {
  const item = e.makeItem(type, { quantity: qty, details: details || {} });
  return e.calculate([item], Object.assign({}, settings, opts));
}

test("satsar samsvarar med backend sine standardtimesatsar", () => {
  assert.equal(e.RATES.own, 850);
  assert.equal(e.RATES.customer, 650);
  const own = estimate("brostein", 130);
  const customer = estimate("brostein", 130, {}, { rateMode: "customer" });
  assert.ok(own.net > customer.net);
  assert.equal(own.rate, 850);
  assert.equal(customer.rate, 650);
});

test("brustein: meir ugras aukar timetal og pris", () => {
  const light = estimate("brostein", 130, { weeds: "none" });
  const heavy = estimate("brostein", 130, { weeds: "heavy" });
  assert.ok(heavy.totalHours > light.totalHours);
  assert.ok(heavy.net > light.net);
});

test("brustein: etterfuging aukar material og timetal", () => {
  const noJoints = estimate("brostein", 130, { joints: "no" });
  const yesJoints = estimate("brostein", 130, { joints: "yes" });
  assert.ok(yesJoints.totalMaterialCost > noJoints.totalMaterialCost);
  assert.ok(yesJoints.totalHours > noJoints.totalHours);
});

test("fritekst: 130 kvm mykje ugras og fugesand", () => {
  const x = e.infer("Rengjøring av 130 kvm brostein med mye ugress og ny fugesand");
  assert.equal(x.items.length, 1);
  assert.equal(x.items[0].type, "brostein");
  assert.equal(x.items[0].quantity, 130);
  assert.equal(x.items[0].details.weeds, "heavy");
  assert.equal(x.items[0].details.joints, "yes");
  assert.ok(e.calculate(x.items, settings).net > 0);
});

test("fritekst: 30 cm snø 450 m² blir brøyting", () => {
  const x = e.infer("Brøyting og snømåking av 450 m2 oppkjørsel, 30 cm snø");
  assert.equal(x.items.length, 1);
  assert.equal(x.items[0].type, "broyting");
  assert.equal(x.items[0].quantity, 450);
  assert.equal(x.items[0].details.snow, "deep");
});

test("fritekst: kapping av 2 trær", () => {
  const x = e.infer("Kapping av 2 trær nær garasjen");
  assert.equal(x.items[0].type, "trefelling");
  assert.equal(x.items[0].quantity, 2);
  assert.equal(x.items[0].details.treeRisk, "obstacles");
});

test("takvask krev befaring og HMS-vurdering", () => {
  const x = e.infer("Vask av tak 150 kvadrat");
  assert.equal(x.items[0].type, "takvask");
  assert.equal(x.items[0].quantity, 150);
  assert.ok(e.calculate(x.items, settings).needsVisit);
  assert.ok(e.issues(x.items, e.calculate(x.items, settings)).some((n) => n.includes("fallrisiko")));
});

test("ukjend oppdrag skal ikkje gi oppdikta mengde eller pris", () => {
  const x = e.infer("Montering av eit ukjent spesialprodukt");
  assert.equal(x.items[0].type, "annet");
  assert.equal(x.items[0].quantity, 0);
  assert.equal(e.calculate(x.items, settings).net, 0);
});

test("når mengd manglar skal det ikkje fakturerast rigg eller transport", () => {
  const x = estimate("takvask", 0);
  assert.equal(x.net, 0);
  assert.equal(x.totalHours, 0);
  assert.equal(x.travelHours, 0);
});

test("kalkyleverdiar vert begrensa og urealistiske input gir ikkje NaN", () => {
  const i = e.makeItem("brostein", { quantity: -100, capacity: 0, material: "abc" });
  const x = e.calculate([i], settings);
  assert.equal(i.quantity, 0);
  assert.ok(i.capacity > 0);
  assert.ok(Number.isFinite(x.net));
  assert.ok(Number.isFinite(x.profit));
});

test("kombinert fritekst får fleire arbeidsoperasjonar, men ingen falsk mengd for den andre", () => {
  const x = e.infer("Vask 130 kvm brostein og klipp hekk");
  assert.equal(x.items.length, 2);
  assert.equal(x.items[0].type, "brostein");
  assert.equal(x.items[1].type, "hekk");
  assert.equal(x.items[1].quantity, 0);
});

test("MVA endrar totalsum men ikkje margin eks mva", () => {
  const a = estimate("brostein", 80, {}, { vat: 0 });
  const b = estimate("brostein", 80, {}, { vat: 25 });
  assert.equal(a.net, b.net);
  assert.equal(a.profit, b.profit);
  assert.equal(b.gross, b.net * 1.25);
});
