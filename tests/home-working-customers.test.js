"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin/hjem.html"), "utf8");
const js = fs.readFileSync(path.join(root, "admin/hjem.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/home-working-cards.css"), "utf8");
const shell = fs.readFileSync(path.join(root, "admin/admin-shell.js"), "utf8");

test("framsida prioriterer berre opne kundearbeid og ikkje planlagde / ferdige", () => {
  assert.match(js, /WORKING_STATUSES\s*=\s*new Set\(\["active", "paused", "stopped"\]\)/);
  assert.match(js, /!WORKING_STATUSES\.has\(order\.status\)/);
  assert.match(js, /order\.isTest \|\| order\.trashedAt/);
  assert.match(js, /Array\.isArray\(home\.workingOrders\)/);
  assert.doesNotMatch(html, /id="focusSection"/);
  assert.doesNotMatch(html, /id="focusContent"/);
  assert.doesNotMatch(html, /home-project-link\.js/);
  assert.match(html, /id="ongoingSection"/);
});

test("alle kundekort er kollapsa til brukaren vel ein kunde", () => {
  assert.match(js, /let home=null, selectedWorkId=null/);
  assert.match(js, /data-select-work/);
  assert.match(js, /selectedWorkId===id\?null:id/);
  assert.match(js, /selected \? workActionMarkup\(order, lockedBy\) : ""/);
  assert.match(js, /aria-expanded/);
});

test("arbeidsøkter kan startast, pausast, fortsetjast og stoppast gjennom eksisterande sikre backendruter", () => {
  assert.match(js, /isActive \? "pause" : "resume"/);
  assert.match(js, /Start ny arbeidsøkt/);
  assert.match(js, /Fortsett arbeidsøkta/);
  assert.match(js, /Pause arbeidsøkta/);
  assert.match(js, /data-confirm="stop"/);
  assert.match(js, /\/admin\/work-orders\/\$\{encodeURIComponent\(id\)\}\/action/);
  assert.match(js, /blocked = !isActive && conflictingOpen/);
  assert.match(js, /disabled title="Avslutt anna økt først"/);
});

test("andre handlingar er under Mer, ikkje som store knappar på framsida", () => {
  assert.match(js, /Mer – full oversikt, redigering og utgifter/);
  assert.match(js, /oppdrag\.html\?open=/);
  assert.doesNotMatch(html, /quick-actions-menu/);
  assert.doesNotMatch(html, /id="quickMenu"/);
  assert.match(html, /id="followupPanel"/);
  assert.match(html, /<details id="followupPanel"/);
});

test("fargekodar formidlar også status som ord og fungerer på mobil", () => {
  for (const state of ["active", "paused", "stopped"]) {
    assert.match(js, new RegExp("state-" + state));
    assert.match(css, new RegExp("\\.home-working-card\\.state-" + state));
  }
  assert.match(js, /Arbeid pågår/);
  assert.match(js, /Pausa/);
  assert.match(js, /Mellom økter/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /min-height:44px/);
});

test("home har ingen påtrengande AI-boble over arbeidslista", () => {
  assert.match(shell, /!\["jobs", "customers", "home"\]\.includes\(page\)/);
  assert.doesNotMatch(html, /work-order-ai\.js|ai-universal\.js/);
});

test("API-trunkering, manglande oversikt og klokke visast eksplisitt", () => {
  assert.match(js, /home\.workingOrdersTruncated/);
  assert.match(js, /Fleire oppdrag kan mangle/);
  assert.match(js, /Hentar aktive oppdrag/);
  assert.match(js, /data-live-timer data-order-id/);
  assert.match(js, /timer\.textContent=fmtDuration\(sessionSeconds\(order\)\)/);
});
