const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('brøyting har én offentlig URL uten redirect-loop', () => {
  const redirects = read('_redirects');
  const oldPublicFile = path.join(ROOT, 'tjenester', 'broyting-pris-info.html');

  assert.equal(
    fs.existsSync(oldPublicFile),
    false,
    'Den gamle HTML-meta-redirecten på ren URL må ikke finnes; den kan lage loop mot Netlify-regelen.'
  );

  assert.match(
    redirects,
    /^\/tjenester\/broyting-pris-info\.html \/tjenester\/broyting\/tjenester_broyting-pris-info\.html 200$/m
  );
  assert.match(
    redirects,
    /^\/tjenester\/broyting-pris-info \/tjenester\/broyting\/tjenester_broyting-pris-info\.html 200$/m
  );
  assert.match(
    redirects,
    /^\/tjenester\/broyting\/tjenester_broyting-pris-info\.html \/tjenester\/broyting-pris-info\.html 301!$/m
  );
});

test('sitemap bruker bare den rene brøyting-URL-en', () => {
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /https:\/\/sorgulen\.no\/tjenester\/broyting-pris-info\.html/);
  assert.doesNotMatch(sitemap, /tjenester\/broyting\/tjenester_broyting-pris-info/);
});

test('forsiden inneholder ikke gammel kundeomtale-placeholder', () => {
  const index = read('index.html');
  assert.doesNotMatch(index, /Kundeomtaler oppdateres fortløpende/i);
  assert.doesNotMatch(index, /Vi jobber med å publisere kundeomtaler direkte på nettsiden/i);
});

test('tilgjengelighetssiden skiller bookingvindu fra åpningstider', () => {
  const opening = read('apningstider.html');
  assert.match(opening, /ikke en butikk med faste åpningstider/i);
  assert.match(opening, /09:00 og 20:00/);
  assert.match(opening, /Bookingvinduet er ikke det samme som faste åpningstider/i);
});
