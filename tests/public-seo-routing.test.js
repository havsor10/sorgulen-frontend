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


test('AI-søk kan lese offentlig innhold og private flater er blokkert', () => {
  const robots = read('robots.txt');

  assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(robots, /User-agent: ChatGPT-User\nAllow: \//);
  assert.match(robots, /Disallow: \/admin\//);
  const oaiGroup = robots.match(/User-agent: OAI-SearchBot\n([\s\S]*?)(?=\nUser-agent:|\nSitemap:|$)/)?.[1] || '';
  const chatgptGroup = robots.match(/User-agent: ChatGPT-User\n([\s\S]*?)(?=\nUser-agent:|\nSitemap:|$)/)?.[1] || '';
  assert.match(oaiGroup, /Disallow: \/admin\//);
  assert.match(oaiGroup, /Disallow: \/login\.html/);
  assert.match(oaiGroup, /Disallow: \/prosjekt\.html/);
  assert.match(chatgptGroup, /Disallow: \/admin\//);
  assert.match(robots, /Sitemap: https:\/\/sorgulen\.no\/sitemap\.xml/);
});

test('offentlig bedriftsinfo bruker offisiell identitet og gjeldende priser', () => {
  const index = read('index.html');

  assert.match(index, /935179580/);
  assert.match(index, /Kleiva 91B/);
  assert.match(index, /6906/);
  assert.match(index, /\+4740730187/);
  assert.match(index, /Brøyting fra 1 200 kr/);
  assert.doesNotMatch(index, /Brøyting fra 350 kr/);
  assert.doesNotMatch(index, /Dekkskift 450 kr/);
});

test('småjobber i Florø har egen søkeside og finnes i sitemap', () => {
  const sitemap = read('sitemap.xml');
  const page = read('tjenester/smajobber-floro.html');

  assert.match(sitemap, /https:\/\/sorgulen\.no\/tjenester\/smajobber-floro\.html/);
  assert.match(page, /<h1>Småjobber og praktisk hjelp i Florø<\/h1>/);
  assert.match(page, /"@type": "Service"/);
  assert.match(page, /"@type": "FAQPage"/);
});

test('midlertidig inaktivt dekkskift markedsføres ikke i søk', () => {
  const sitemap = read('sitemap.xml');
  const deck = read('tjenester/dekkskift-pris-info.html');

  assert.doesNotMatch(sitemap, /tjenester\/dekkskift-pris-info\.html/);
  assert.match(deck, /<meta name="robots" content="noindex,follow"/);
  assert.match(deck, /Dekkskift er midlertidig ikke tilgjengelig/);
  assert.doesNotMatch(deck, /fast pris på 450 kr/i);
});
