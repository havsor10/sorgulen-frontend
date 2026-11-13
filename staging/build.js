/**
 * Build a fail-closed, read-only preview of the whole production frontend.
 * The preview mirrors public pages and /admin, but cannot communicate with
 * production APIs, Firebase, Fiken, or messaging systems.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const destRoot = path.join(repoRoot, "staging-dist");
const excludedDirectories = new Set([".git", ".github", ".netlify", "node_modules", "tests", "staging-dist"]);
const excludedFiles = new Set(["cookie.txt", ".env", ".env.local", ".env.production", ".env.development"]);

if (fs.existsSync(destRoot)) fs.rmSync(destRoot, { recursive: true, force: true });
fs.mkdirSync(destRoot, { recursive: true });

const notice = '<meta name="robots" content="noindex,nofollow,noarchive">' +
  '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'; object-src \'none\'; base-uri \'self\'">' +
  '<script src="/staging/staging-preview.js" defer></script>';

function copyTree(source, target) {
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    if (item.isDirectory() && excludedDirectories.has(item.name)) continue;
    if (excludedFiles.has(item.name) || item.name.startsWith(".env")) continue;
    const input = path.join(source, item.name);
    const output = path.join(target, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(output, { recursive: true });
      copyTree(input, output);
      continue;
    }
    if (!item.isFile()) continue;

    if (/\.(html|js|json|css|xml|txt)$/i.test(item.name)) {
      let text = fs.readFileSync(input, "utf8");
      // The copied website must never invoke production endpoints, including
      // scripts which use a hardcoded URL instead of window.CONFIG.
      text = text.replace(/https:\/\/sorgulen-backend-2\.onrender\.com/g, "https://sorgulen-test-backend.onrender.com");
      text = text.replace(/https:\/\/(?:www\.)?sorgulen\.no/g, "");
      if (/\.html$/i.test(item.name)) {
        if (!/<head(?:\s[^>]*)?>/i.test(text)) {
          console.warn("WARNING: HTML missing head:", path.relative(repoRoot, input));
        } else {
          text = text.replace(/<head(?:\s[^>]*)?>/i, (m) => m + notice);
          text = text.replace(/<body(?:\s[^>]*)?>/i, (m) => m + '<aside role="status" style="position:sticky;top:0;z-index:2147483647;box-sizing:border-box;width:100%;padding:11px 18px;background:#8f2c15;color:#fff;text-align:center;font:700 14px/1.5 system-ui,sans-serif;border-bottom:2px solid #ffc966">TESTMILJØ – FØREBELS BERRE VISNING. Bestilling, admin, betaling og utsending er sperra til eigen testdatabase er klar.</aside>');
        }
      }
      fs.writeFileSync(output, text);
    } else {
      fs.copyFileSync(input, output);
    }
  }
}
copyTree(repoRoot, destRoot);

// Override the production Firebase and API configuration even when a script
// includes config.js directly. No API is active until an isolated backend is
// explicitly deployed and the CSP is opened in a reviewed staging change.
fs.writeFileSync(path.join(destRoot, "config.js"), [
  'window.FB_CONFIG = null;',
  'window.APP_ACCESS_TOKEN = "sorgulen-staging-only";',
  'window.CONFIG = { API_BASE_URL: "https://sorgulen-test-backend.onrender.com/api", STAGING: true };',
  'window.SORGULEN_TEST_MODE = true;',
  "",
].join("\n"));

console.log("Read-only staging snapshot ready:", destRoot);
console.log("Production API and all form/network requests are blocked by CSP.");

/*
 * Retire the old, read-only staging hostname. It blocked API calls through
 * connect-src 'none', causing "could not fetch services" on that address.
 * Preserve path, query and private customer portal fragment on redirect.
 * The new primary test site is isolated and functional.
 */
const canonicalTestSite = "https://sorgulen-testmiljo.onrender.com";
const redirectPage = [
  "<!doctype html><html lang=\"no\"><head><meta charset=\"utf-8\">",
  "<meta name=\"robots\" content=\"noindex,nofollow\">",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
  "<meta http-equiv=\"refresh\" content=\"1;url=" + canonicalTestSite + "\">",
  "<title>Opnar det aktive testmiljøet …</title></head><body>",
  "<p>Dette er ei gamal testadresse. Opnar <a href=\"" + canonicalTestSite + "\">Sørgulen testmiljø</a>.</p>",
  "<script>location.replace(\"" + canonicalTestSite + "\"+location.pathname+location.search+location.hash);</script>",
  "</body></html>"
].join("");
function retireOldPreview(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) retireOldPreview(target);
    else if (entry.isFile() && /\.html$/i.test(entry.name)) fs.writeFileSync(target, redirectPage, "utf8");
  }
}
retireOldPreview(destRoot);
console.log("Old read-only preview now redirects to the live, isolated test environment.");
