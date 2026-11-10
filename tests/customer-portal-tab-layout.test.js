const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("four visible tabs replace the old scrolling anchors", () => {
  const html = read("admin/kundeportal.html");
  const nav = html.slice(html.indexOf('class="portal-fullscreen-nav"'), html.indexOf("</nav>"));
  assert.match(nav, /role="tablist"/);
  for (const tab of ["update", "procurement", "images", "settings"]) {
    assert.ok(nav.includes('data-portal-tab="' + tab + '"'));
    assert.ok(nav.includes('aria-selected="'));
  }
  assert.doesNotMatch(nav, /data-portal-jump|href="#portalFullscreen/);
  assert.match(html, /id="portalFullscreenLinkState"/);
  assert.match(html, /id="portalFullscreenCopyLink"/);
});

test("customer information and visibility controls are in different sections, with purchases and images isolated", () => {
  const js = read("admin/kundeportal.js");
  const area = js.slice(js.indexOf("function renderEditor()"), js.indexOf("async function loadProjects()"));
  assert.match(area, /id="portalUpdateFields" data-portal-tab-section="update"/);
  assert.match(area, /id="portalVisibilitySettings" data-portal-tab-section="settings"/);
  assert.match(area, /id="portalLinkSettings" data-portal-tab-section="settings"/);
  assert.match(area, /id="portalPurchasesPanel" data-portal-tab-section="procurement"/);
  assert.match(area, /id="portalImagesPanel" data-portal-tab-section="images"/);
  const update = area.slice(area.indexOf('id="portalUpdateFields"'), area.indexOf('id="portalVisibilitySettings"'));
  const settings = area.slice(area.indexOf('id="portalVisibilitySettings"'), area.indexOf("</form>"));
  assert.match(update, /id="nextWorkStart"/);
  assert.match(update, /id="nextWorkEnd"/);
  assert.match(update, /id="customerMessage"/);
  assert.doesNotMatch(update, /id="showHours"|id="showImages"/);
  assert.match(settings, /id="showHours"|id="showImages"/);
  assert.doesNotMatch(settings, /id="customerMessage"/);
});

test("tab styles only show active pane, including mobile, while save button stays fixed", () => {
  const css = read("admin/kundeportal-fullscreen.css");
  assert.ok(css.includes("#portalEditor [data-portal-tab-section][hidden]"));
  assert.ok(css.includes("#portalSettingsForm[hidden]"));
  assert.ok(css.includes('.portal-fullscreen-nav [role="tab"][aria-selected="true"]'));
  assert.ok(css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))"));
  assert.ok(css.includes(".portal-fullscreen-dock {"));
  assert.ok(css.includes("position: fixed"));
});

test("fullscreen tab scripts are cache-busted together without changing normal admin", () => {
  const html = read("admin/kundeportal.html");
  assert.ok(html.includes("kundeportal.js?v=20261110-tabs1"));
  assert.ok(html.includes("kundeportal-fullscreen.js?v=20261110-tabs1"));
  assert.ok(html.includes("kundeportal-fullscreen.css?v=20261110-tabs1"));
  const js = read("admin/kundeportal-fullscreen.js");
  assert.ok(js.includes('if (!document.documentElement.classList.contains("portal-fullscreen")) return;'));
  assert.ok(js.includes("showTab(activeTab)"));
});

test("job status is read-only in updates and the fullscreen title shows the actual service", () => {
  const portal = read("admin/kundeportal.js");
  const js = read("admin/kundeportal-fullscreen.js");
  assert.ok(portal.includes("const workStatus = selectedWorkOrder.workflow?.status || selectedWorkOrder.status"));
  assert.ok(portal.includes('class="portal-work-status"'));
  assert.ok(portal.includes("Status blir endra på sjølve oppdraget."));
  assert.ok(js.includes('.portal-editor-head p:not(.section-kicker)'));
});
