const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const shell = fs.readFileSync("admin/admin-shell.js", "utf8");
const html = fs.readFileSync("admin/innboks.html", "utf8");
const js = fs.readFileSync("admin/innboks.js", "utf8");
const push = fs.readFileSync("admin/varslinger.html", "utf8");

test("firm mailbox is a first-class complete-admin destination", () => {
  assert.match(shell, /key: "mailbox", href: "innboks\.html", label: "Innboks"/);
  assert.match(shell, /admin\/mailbox\/summary/);
  assert.match(shell, /showBadge\("mailbox", mailboxCount\)/);
  assert.match(html, /data-page="mailbox"/);
});

test("mailbox presents action-first filters and direct Gmail handoff", () => {
  assert.match(html, /Krever handling/);
  assert.match(html, /Andre nye/);
  assert.match(html, /Ferdig behandlet/);
  assert.match(js, /\/messages\?scope=/);
  assert.match(js, /Ferdig behandlet/);
  assert.match(js, /Må følges opp/);
  assert.match(js, /Åpne i Gmail/);
});

test("mailbox can manually sync and refresh admin badges", () => {
  assert.match(js, /\/sync/);
  assert.match(js, /Synkroniserer/);
  assert.match(js, /SorgulenAdminShell\?\.refreshBadges/);
});

test("important firm email can be enabled as a push category", () => {
  assert.match(push, /data-push-pref="importantEmail"/);
  assert.match(push, /Viktig firmamail/);
});
