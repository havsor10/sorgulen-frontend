const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'admin', 'admin-shell.js'), 'utf8');

function html(name) {
  return fs.readFileSync(path.join(root, 'admin', name), 'utf8');
}

test('mobilmenyen har fire hovedvalg pluss Mer', () => {
  assert.match(shell, /label: "Hjem"/);
  assert.match(shell, /label: "Oppdrag"/);
  assert.match(shell, /label: "Kunder"/);
  assert.match(shell, /label: "Økonomi"/);
  assert.match(shell, /adminMoreButton/);
  assert.doesNotMatch(shell, /mobileItems.*overview/);
});

test('Mer-menyen er redusert til samleområder', () => {
  assert.match(shell, /href="innkommende\.html"/);
  assert.match(shell, /href="drift\.html"/);
  assert.match(shell, /href="system\.html"/);
  assert.doesNotMatch(shell, /admin-more-link[^\n]+href="foresporsler\.html"/);
  assert.doesNotMatch(shell, /admin-more-link[^\n]+href="autopilot\.html"/);
});

test('samlesidene peker videre til eksisterende funksjoner', () => {
  const incoming = html('innkommende.html');
  const economy = html('okonomi.html');
  const drift = html('drift.html');
  const system = html('system.html');

  assert.match(incoming, /admin-dashboard\.html/);
  assert.match(incoming, /foresporsler\.html/);
  assert.match(incoming, /innboks\.html/);
  assert.match(economy, /fakturaer\.html/);
  assert.match(economy, /fiken\.html/);
  assert.match(economy, /statistikk\.html/);
  assert.match(drift, /oversikt\.html/);
  assert.match(drift, /broyting\.html/);
  assert.match(drift, /lager\.html/);
  assert.match(system, /felt\.html\?from=field/);
  assert.match(system, /nettside\.html/);
  assert.match(system, /kundeportal\.html/);
  assert.match(system, /autopilot\.html/);
  assert.match(system, /varslinger\.html/);
});