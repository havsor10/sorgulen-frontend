const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
}

test("inventory admin page is integrated in the shared shell", () => {
  const html = read("admin/lager.html");
  const shell = read("admin/admin-shell.js");
  assert.match(html, /id="adminShell" data-page="inventory"/);
  assert.match(html, /lager\.js/);
  assert.match(shell, /href="lager\.html"/);
  assert.match(shell, /data-admin-badge=\\?"\$\{key\}\\?"/);
  assert.match(shell, /admin\/inventory\/summary/);
});

test("inventory UI supports image-assisted registration and project use", () => {
  const js = read("admin/lager.js");
  assert.match(js, /\/admin\/inventory\/analyze-image/);
  assert.match(js, /\/admin\/inventory\/\$\{encodeURIComponent\(item\._id\)\}\/use/);
  assert.match(js, /Ta bilde/);
  assert.match(js, /Legg til beholdning/);
  assert.match(js, /Juster lager/);
});

test("work-order UI exposes inventory material use", () => {
  const html = read("admin/oppdrag.html");
  const projectJs = read("admin/inventory-project.js");
  const editJs = read("admin/inventory-material-edit.js");
  assert.match(html, /inventory-project\.js/);
  assert.match(projectJs, /\+ Fra lager/);
  assert.match(projectJs, /\/admin\/inventory\/\$\{encodeURIComponent\(item\._id\)\}\/use/);
  assert.match(editJs, /\/admin\/inventory\/usage\//);
});
