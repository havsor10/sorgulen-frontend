const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
}

test("snow mode is a dedicated mobile admin page in the shared shell", () => {
  const html = read("admin/broyting.html");
  const shell = read("admin/admin-shell.js");
  assert.match(html, /data-page="snow"/);
  assert.match(html, /START BRØYTERUNDE/);
  assert.match(html, /\+ Legg til kunde/);
  assert.match(shell, /href="broyting\.html"/);
  assert.match(shell, /data-admin-badge="\$\{key\}"/);
  assert.match(shell, /admin\/snow\/state/);
});

test("snow mode uses one backend queue and critical offline start-finish synchronization", () => {
  const js = read("admin/broyting.js");
  assert.match(js, /\/admin\/snow\/state/);
  assert.match(js, /\/admin\/snow\/jobs\/\$\{encodeURIComponent\(id\)\}\/start/);
  assert.match(js, /\/admin\/snow\/jobs\/\$\{encodeURIComponent\(id\)\}\/finish/);
  assert.match(js, /PENDING_KEY/);
  assert.match(js, /clientStartedAt/);
  assert.match(js, /clientFinishedAt/);
  assert.match(js, /window\.addEventListener\("online"/);
});

test("snow mode supports route optimization, navigation, customer lookup and agreements", () => {
  const js = read("admin/broyting.js");
  assert.match(js, /\/optimize/);
  assert.match(js, /navigator\.geolocation/);
  assert.match(js, /maps\.apple\.com/);
  assert.match(js, /google\.com\/maps\/dir/);
  assert.match(js, /\/admin\/customers\?q=/);
  assert.match(js, /\/admin\/snow\/agreements/);
});

test("admin headers allow same-origin geolocation for snow route assistance", () => {
  const headers = read("_headers");
  assert.match(headers, /Permissions-Policy: geolocation=\(self\)/);
  assert.match(headers, /\/admin\/\*/);
  assert.match(headers, /Cache-Control: no-store/);
});


test("snow main screen avoids duplicate next-customer cards and hides admin tools behind one section", () => {
  const html = read("admin/broyting.html");
  const js = read("admin/broyting.js");
  assert.match(html, /Administrer brøyterunden/);
  assert.match(html, /Resten av køen/);
  assert.match(js, /const laterQueue = \(data\.queue \|\| \[\]\)\.filter/);
  assert.match(js, /String\(job\._id\) !== nextId/);
  assert.match(js, /queueSection\.classList\.toggle\("hidden", laterQueue\.length === 0\)/);
});

test("snow queue uses understandable labelled management instead of unexplained icon buttons", () => {
  const js = read("admin/broyting.js");
  assert.match(js, /data-manage-job/);
  assert.match(js, /Flytt én plass opp/);
  assert.match(js, /Flytt én plass ned/);
  assert.match(js, /Merk HASTER/);
  assert.match(js, /Utsett til senere/);
  assert.doesNotMatch(js, />↑<\/button>/);
  assert.doesNotMatch(js, />!<\/button>/);
});

test("starting snow work requires explicit confirmation", () => {
  const js = read("admin/broyting.js");
  assert.match(js, /Ønsker du å starte en ny arbeidsøkt hos/);
  assert.match(js, /if \(!confirm/);
});
