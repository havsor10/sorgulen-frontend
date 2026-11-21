'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const price = '350 kr oppmøte + 650 kr/time';

test('public homepage and info page show accurate brøyting rate', () => {
  const homepage = read('index.html');
  const info = read('tjenester/broyting-pris-info.html');
  assert.match(homepage, /Brøyting – 350 kr oppmøte \+ 650 kr\/time/);
  assert.match(homepage, /Populær • 350 kr oppmøte \+ 650 kr\/time/);
  assert.match(info, /350 kr oppmøte \+ 650 kr\/time/);
  assert.match(homepage, /href="tjenester\/broyting-pris-info\.html"/);
  assert.match(info, /href="\.\.\/booking\.html\?service=Brøyting"/);
});

test('FAQ text and structured FAQ agree, with no recurring contracts', () => {
  const html = read('sporsmal.html');
  assert.match(html, /Brøyting koster 350 kr i oppmøte og 650 kr per time etter faktisk tidsbruk/);
  assert.match(html, /Nei, vi tilbyr ikke faste avtaler\./);
  assert.doesNotMatch(html, /Ja, vi tilbyr både enkeltoppdrag og faste avtaler/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const faq = blocks.find(block => block['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage structured metadata must exist');
  const entry = faq.mainEntity.find(item => item.name === 'Hva koster tjenestene deres?');
  assert.ok(entry);
  assert.match(entry.acceptedAnswer.text, /350 kr i oppmøte og 650 kr per time/);
});

test('legacy 1200 kr snow rate is absent from the public price sources', () => {
  for (const name of ['index.html', 'sporsmal.html', 'tjenester/broyting-pris-info.html', 'site-consistency.js']) {
    assert.doesNotMatch(read(name), /(?:1[\s\u00a0]?200|1200)\s*kr/i, name);
  }
});

async function renderWithService(service) {
  const badge = { textContent: '' };
  const heading = { textContent: 'Brøyting' };
  const hero = { textContent: 'Brøyting fra 1 200 kr' };
  const card = {
    style: {},
    setAttribute() {},
    querySelector(sel) {
      if (sel === '.badge') return badge;
      if (sel === 'h3') return heading;
      return null;
    }
  };
  const document = {
    body: {},
    readyState: 'complete',
    querySelector(sel) {
      if (sel === '#servicesGrid .card[data-service-key="broyting"]') return card;
      if (sel === '.hero-panel h2') return hero;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const window = { dispatchEvent() {}, CONFIG: { API_BASE_URL: 'https://invalid.example/api' } };
  vm.runInNewContext(read('site-consistency.js'), {
    document, window,
    location: { hostname: 'localhost', pathname: '/' },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ services: [service] }) }),
    CustomEvent: class { constructor(name, opts) { this.type = name; this.detail = opts.detail; } }
  });
  await new Promise(resolve => setImmediate(resolve));
  return { badge: badge.textContent, hero: hero.textContent };
}

test('outdated API priceText cannot override correct visible brøyting price', async () => {
  const display = await renderWithService({
    key: 'broyting', name: 'Brøyting', badgeLabel: 'Populær',
    active: true, price: 350, priceFrom: true, priceUnit: 'fixed', priceText: 'Fra 350 kr'
  });
  assert.equal(display.badge, 'Populær • ' + price);
  assert.equal(display.hero, 'Brøyting ' + price);
});
