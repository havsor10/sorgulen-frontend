const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("economy cockpit is part of the shared admin shell", () => {
  const shell = read("admin/admin-shell.js");
  const html = read("admin/okonomi.html");
  assert.match(shell, /href=\"okonomi\.html\"/);
  assert.match(html, /data-page=\"economy\"/);
  assert.match(html, /MVA-vakt/);
  assert.match(html, /Skattereserve/);
  assert.match(html, /Synk betalingsstatus/);
});

test("economy page clearly separates accounting facts from estimates", () => {
  const html = read("admin/okonomi.html");
  assert.match(html, /styringstall, ikke skattemelding/);
  assert.match(html, /MVA-vakten er et varsel/);
  assert.match(html, /Registrerte salg, kjøp og betalingsstatus hentes fra Fiken/);
});

test("new invoice mutations are guarded by the Fiken bridge", () => {
  const bridge = read("admin/fiken-invoice-bridge.js");
  assert.match(bridge, /data-action=\\?\"issue\\?\"/);
  assert.match(bridge, /data-action=\\?\"send\\?\"/);
  assert.match(bridge, /data-action=\\?\"paid\\?\"/);
  assert.match(bridge, /data-action=\\?\"credit\\?\"/);
  assert.match(bridge, /Opprett utkast i Fiken/);
  assert.match(bridge, /Utsted i Fiken/);
  assert.match(bridge, /Send via Fiken/);
  assert.match(bridge, /Krediter i Fiken/);
});

test("AI economy buttons ask through the existing global Sørgulen AI", () => {
  const js = read("admin/okonomi.js");
  assert.match(js, /sorgulenAiLauncher/);
  assert.match(js, /saiInput/);
  assert.match(js, /saiForm/);
  assert.match(js, /data-eco-ai/);
});

test("Fiken invoice number takes precedence in the invoice list", () => {
  const js = read("admin/fakturaer.js");
  assert.match(js, /inv\.fiken\?\.invoiceNumber/);
  assert.match(js, /data-fiken/);
});
