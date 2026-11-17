"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const files = new Set();
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".netlify"].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile()) files.add(path.relative(root, file).split(path.sep).join("/"));
  }
}
visit(root);

const redirects = fs.readFileSync(path.join(root, "_redirects"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts.length >= 3 && parts[0].startsWith("/"));

function resolvesRedirect(route) {
  if (route.startsWith("/utleie/bestill/") && route !== "/utleie/bestill/" && files.has("utleie/bestill.html"))
    return true;
  return redirects.some(([from, to]) => from === route && (
    files.has(to.replace(/^\//, "")) || to === "/" || to.startsWith("/#")
  ));
}
function publicPage(pathname) {
  return pathname.endsWith(".html") &&
    !pathname.startsWith("admin/") &&
    !pathname.startsWith("assets/"); // Archived, non-deployed design reference
}
function linkTarget(from, value) {
  if (!value || /^(?:#|mailto:|tel:|https?:|data:|blob:|javascript:|\/\/|about:|sms:)/i.test(value)) return null;
  if (value.includes(String.fromCharCode(36) + "{") || value.startsWith("{{") || value.startsWith("/api/")) return null;
  const withoutQuery = value.split(/[?#]/)[0];
  if (!withoutQuery) return null;
  let target = withoutQuery.startsWith("/")
    ? withoutQuery.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(from), withoutQuery));
  if (!target || target.endsWith("/")) target = target + "index.html";
  return target;
}

test("all ordinary public pages have resolvable internal links and assets", () => {
  const missing = [];
  for (const page of [...files].filter(publicPage)) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    for (const match of html.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi)) {
      const value = match[1].trim();
      const target = linkTarget(page, value);
      if (!target || files.has(target) || resolvesRedirect("/" + target)) continue;
      missing.push(page + " → " + value + " (expected " + target + ")");
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("public root icon and archived test page do not produce accidental 404 / duplicate SEO pages", () => {
  assert.ok(files.has("assets/logo-google-512.png"), "must keep the real brand icon");
  assert.match(fs.readFileSync(path.join(root, "_redirects"), "utf8"),
    /^\/favicon\.ico\s+\/assets\/logo-google-512\.png\s+30[12]\s*$/m);
  assert.match(fs.readFileSync(path.join(root, "_redirects"), "utf8"),
    /^\/assets\/tjenester\/tjenestekort-endringer\/index\.html\s+\/\s+301!?\s*$/m);
});
