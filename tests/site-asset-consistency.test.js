const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ignoredDirs = new Set([".git", "node_modules"]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function localPath(fromHtml, url) {
  const clean = String(url || "").split("#")[0].split("?")[0];
  if (!clean || /^(?:https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(clean)) return null;
  if (clean.startsWith("/")) return path.join(root, clean.replace(/^\/+/, ""));
  return path.resolve(path.dirname(fromHtml), clean);
}

test("alle lokale script og stylesheets som HTML laster finnes", () => {
  const missing = [];
  for (const file of walk(root)) {
    const html = fs.readFileSync(file, "utf8");
    const refs = [
      ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
      ...html.matchAll(/<link\b(?=[^>]*\brel=["'][^"']*stylesheet[^"']*["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
    ].map((match) => match[1]);
    for (const ref of refs) {
      const resolved = localPath(file, ref);
      if (resolved && !fs.existsSync(resolved)) missing.push(`${path.relative(root, file)} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("ingen HTML-side laster samme lokale JavaScript to ganger", () => {
  const duplicates = [];
  for (const file of walk(root)) {
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1].split("?")[0].split("#")[0])
      .filter((src) => src && !/^(?:https?:|\/\/)/i.test(src));
    const seen = new Set();
    for (const src of scripts) {
      if (seen.has(src)) duplicates.push(`${path.relative(root, file)} -> ${src}`);
      seen.add(src);
    }
  }
  assert.deepEqual(duplicates, []);
});

test("kritiske adminflyter har én eier og laster ikkje pensjonerte overlay", () => {
  const oppdrag = fs.readFileSync(path.join(root, "admin/oppdrag.html"), "utf8");
  const invoiceDetail = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
  const invoiceNew = fs.readFileSync(path.join(root, "admin/faktura-ny.html"), "utf8");

  assert.match(oppdrag, /work-order-editor\.js/);
  assert.doesNotMatch(oppdrag, /work-order-field-compat|work-order-description-edit|completed-work-order-flow|operations-ui\.js/);
  assert.doesNotMatch(invoiceDetail, /invoice-delivery-ui\.js/);
  assert.doesNotMatch(invoiceNew, /invoice-work-order-picker\.js/);
});
