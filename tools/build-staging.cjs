// Isolated staging copy: do not connect to production resources.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "staging-dist");
const TEST_ORIGIN = "https://sorgulen-test.onrender.com";
const TEST_API = "https://sorgulen-test-api.onrender.com";
const excluded = new Set([".git", ".github", "node_modules", "staging-dist", "tests"]);
const networkCsp = "connect-src 'self' " + TEST_API + "; form-action 'self'; base-uri 'self';";
const meta = '<meta name="robots" content="noindex,nofollow,noarchive">\n<meta http-equiv="Content-Security-Policy" content="' + networkCsp + '">';
const warning = '<div role="status" style="position:sticky;top:0;z-index:2147483647;background:#9a2d11;color:white;padding:11px;text-align:center;font:700 15px/1.4 system-ui,sans-serif">TESTMILJØ – berre testdata. Ikkje bruk ekte kundeopplysningar. <a href="/admin/login.html" style="color:white;text-decoration:underline">Testadmin</a></div>';
const config = '// Separate staging: no real Firebase, tokens or production API.\n' +
'window.FB_CONFIG={apiKey:"",authDomain:"test.invalid",projectId:"sorgulen-staging-disabled"};\n' +
'window.APP_ACCESS_TOKEN="sorgulen-staging-only";\n' +
'window.CONFIG={API_BASE_URL:"' + TEST_API + '/api"};\n';
if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let count = 0;
function copy(from, rel = "") {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith(".env") || entry.name === "credentials.json") continue;
    const next = path.join(rel, entry.name);
    const dest = path.join(out, next);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, {recursive: true});
      copy(path.join(from, entry.name), next);
    } else if (entry.isFile()) {
      const src = path.join(from, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      if (entry.name === "config.js" && rel === "") {
        fs.writeFileSync(dest, config, "utf8");
      } else if ([".html",".js",".css",".json",".txt"].includes(ext)) {
        let code = fs.readFileSync(src, "utf8");
        // Several files bypass config.js and hardcode the live API.
        code = code.replaceAll("https://sorgulen-backend-2.onrender.com", TEST_API);
        code = code.replaceAll("https://www.sorgulen.no", TEST_ORIGIN)
                   .replaceAll("https://sorgulen.no", TEST_ORIGIN);
        if (ext === ".html") {
          if (!/<head[\s>]/i.test(code) || !/<body[\s>]/i.test(code)) {
            throw new Error("Cannot isolate HTML: " + next);
          }
          code = code.replace(/<head([^>]*)>/i, "<head$1>\n" + meta);
          code = code.replace(/<body([^>]*)>/i, "<body$1>\n" + warning);
        }
        fs.writeFileSync(dest, code, "utf8");
      } else {
        fs.copyFileSync(src, dest);
      }
      count++;
    }
  }
}
copy(root);
for (const rel of ["index.html","booking.html","admin/login.html","admin/broyting.html"]) {
  if (!fs.existsSync(path.join(out,rel))) throw new Error("Missing " + rel);
}
const settings = fs.readFileSync(path.join(out,"config.js"),"utf8");
if (settings.includes("sorgulen-backend-2") || settings.includes("sorgulen-industriservice.firebaseapp.com"))
  throw new Error("Live config accidentally copied");
console.log("Staging site built:", count, "files; no production API.");
