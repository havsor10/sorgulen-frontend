(function () {
  "use strict";

  const mount = document.getElementById("adminShell");
  if (!mount) return;

  function ensureAsset(tagName, attrs) {
    const key = attrs.href || attrs.src;
    if (key && document.querySelector(`${tagName}[href="${key}"],${tagName}[src="${key}"]`)) return;
    const node = document.createElement(tagName);
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    document.head.appendChild(node);
  }

  const page = mount.dataset.page || "";
  const modeParams = new URLSearchParams(window.location.search);
  if (modeParams.get("from") === "field") localStorage.setItem("sorgulen_admin_mode", "field");
  if (page === "home" && modeParams.get("from") !== "field") localStorage.setItem("sorgulen_admin_mode", "full");
  const fieldContext = modeParams.get("from") === "field" || localStorage.getItem("sorgulen_admin_mode") === "field";
  const adminHomeHref = fieldContext ? "felt.html" : "hjem.html";
  const modeSwitchHref = fieldContext ? "hjem.html" : "felt.html?from=field";
  const modeSwitchLabel = fieldContext ? "Komplett admin" : "Feltadmin";
  const modeSwitchMode = fieldContext ? "full" : "field";
  ensureAsset("link", { rel: "stylesheet", href: "operations.css?v=20260904-snow1" });
  ensureAsset("link", { rel: "stylesheet", href: "ai-universal.css?v=20261002-u2" });
  if (page === "jobs") ensureAsset("link", { rel: "stylesheet", href: "ai-guide.css?v=20260917-project1" });
  ensureAsset("link", { rel: "manifest", href: "manifest.webmanifest" });
  ensureAsset("link", { rel: "apple-touch-icon", href: "../assets/logo.png" });
  if (!["home", "overview", "inventory", "snow", "jobs", "economy", "incoming", "drift", "system"].includes(page)) ensureAsset("script", { src: "operations-ui.js?v=20260918-workflow1" });
  if (page === "jobs") ensureAsset("script", { src: "inventory-material-edit.js?v=20260904-snow1" });

  const economyPages = new Set(["economy", "invoices", "fiken", "statistics"]);
  const incomingPages = new Set(["incoming", "bookings", "requests", "mailbox"]);
  const driftPages = new Set(["drift", "overview", "inventory", "snow"]);
  const systemPages = new Set(["system", "autopilot", "notifications", "portal", "website"]);

  function pageMatches(key) {
    if (key === "economy") return economyPages.has(page);
    if (key === "incoming") return incomingPages.has(page);
    if (key === "drift") return driftPages.has(page);
    if (key === "system") return systemPages.has(page);
    return key === page;
  }

  const desktopNavItems = [
    { key: "home", href: adminHomeHref, label: "Hjem" },
    { key: "jobs", href: "oppdrag.html", label: "Oppdrag" },
    { key: "customers", href: "kunder.html", label: "Kunder" },
    { key: "economy", href: "okonomi.html", label: "Økonomi" },
    { key: "incoming", href: "innkommende.html", label: "Innkommende" },
  ];
  const mobileItems = desktopNavItems.filter((item) => ["home", "jobs", "customers", "economy"].includes(item.key));
  const activeClass = (key) => pageMatches(key) ? " is-active" : "";
  const activeAttr = (key) => pageMatches(key) ? ' aria-current="page"' : "";
  const badge = (key) => `<span class="admin-nav-badge" data-admin-badge="${key}" hidden></span>`;

  function mobileIcon(key) {
    return ({ home: "⌂", jobs: "◷", customers: "◎", economy: "▤" })[key] || "•";
  }

  document.body.classList.add("admin-app");
  ensureAsset("script", { src: "ai-universal.js?v=20261002-u2" });
  if (page === "jobs") ensureAsset("script", { src: "ai-guide.js?v=20260917-project1" });
  ensureAsset("script", { src: "actionable-warnings.js?v=20260914-a1" });
  mount.innerHTML = `
    <header class="admin-app-header">
      <div class="admin-header-inner">
        <a class="admin-brand" href="${adminHomeHref}" aria-label="Sørgulen admin – hjem">
          <span>Sørgulen Industriservice</span>
          <strong>Admin</strong>
        </a>
        <nav class="admin-desktop-nav" aria-label="Hovednavigasjon">
          ${desktopNavItems.map((item) => `<a class="admin-nav-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}><span>${item.label}</span>${badge(item.key)}</a>`).join("")}
        </nav>
        <div class="admin-header-actions">
          <a class="admin-quiet-action${activeClass("drift")}" href="drift.html"${activeAttr("drift")}><span>Drift</span>${badge("drift")}</a>
          <a class="admin-quiet-action${activeClass("system")}" href="system.html"${activeAttr("system")}><span>System</span>${badge("system")}</a>
          <a class="admin-quiet-action" id="logoutBtn" href="login.html">Logg ut</a>
        </div>
      </div>
    </header>
    <nav class="admin-mobile-nav" aria-label="Mobilnavigasjon">
      ${mobileItems.map((item) => `<a class="admin-mobile-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}><span class="admin-mobile-icon" aria-hidden="true">${mobileIcon(item.key)}</span><span class="admin-mobile-label">${item.label}</span>${badge(item.key)}</a>`).join("")}
      <button class="admin-mobile-link${(incomingPages.has(page) || driftPages.has(page) || systemPages.has(page) || page === "more") ? " is-active" : ""}" id="adminMoreButton" type="button" aria-expanded="false" aria-controls="adminMoreMenu">
        <span class="admin-mobile-icon" aria-hidden="true">•••</span><span class="admin-mobile-label">Mer</span>${badge("more")}
      </button>
    </nav>
    <div class="admin-menu-backdrop" id="adminMenuBackdrop" hidden></div>
    <aside class="admin-more-menu" id="adminMoreMenu" aria-label="Flere adminvalg" aria-hidden="true">
      <div class="admin-more-head"><strong>Mer</strong><button id="adminMoreClose" class="admin-icon-button" type="button" aria-label="Lukk meny">×</button></div>
      <a class="admin-more-link${activeClass("incoming")}" href="innkommende.html"${activeAttr("incoming")}><span>Innkommende</span><span class="admin-more-tail">${badge("incoming")}<span aria-hidden="true">›</span></span></a>
      <a class="admin-more-link${activeClass("drift")}" href="drift.html"${activeAttr("drift")}><span>Drift</span><span class="admin-more-tail">${badge("drift")}<span aria-hidden="true">›</span></span></a>
      <a class="admin-more-link${activeClass("system")}" href="system.html"${activeAttr("system")}><span>System</span><span class="admin-more-tail">${badge("system")}<span aria-hidden="true">›</span></span></a>
      <button class="admin-more-link admin-menu-logout" id="adminMobileLogout" type="button"><span>Logg ut</span><span aria-hidden="true">›</span></button>
    </aside>
  `;

  document.querySelectorAll('[data-admin-mode="field"]').forEach((link) => {
    link.addEventListener("click", () => localStorage.setItem("sorgulen_admin_mode", "field"));
  });
  document.querySelectorAll('[data-admin-mode="full"]').forEach((link) => {
    link.addEventListener("click", () => localStorage.setItem("sorgulen_admin_mode", "full"));
  });

  const moreButton = document.getElementById("adminMoreButton");
  const moreMenu = document.getElementById("adminMoreMenu");
  const backdrop = document.getElementById("adminMenuBackdrop");
  const closeButton = document.getElementById("adminMoreClose");

  function setMenu(open) {
    moreButton.setAttribute("aria-expanded", String(open));
    moreMenu.setAttribute("aria-hidden", String(!open));
    moreMenu.classList.toggle("is-open", open);
    backdrop.hidden = !open;
    document.body.classList.toggle("admin-menu-open", open);
    if (open) closeButton.focus();
  }

  function showBadge(key, value) {
    const count = Math.max(0, Number(value) || 0);
    document.querySelectorAll(`[data-admin-badge="${key}"]`).forEach((node) => {
      node.hidden = count <= 0;
      node.textContent = count > 99 ? "99+" : String(count);
      node.setAttribute("aria-label", `${count} ting krever handling`);
    });
  }

  async function fetchJson(url, adminKey) {
    try {
      const response = await fetch(url, { headers: { "x-admin-key": adminKey } });
      if (!response.ok) return null;
      return response.json();
    } catch (_) { return null; }
  }

  async function loadBadges() {
    const adminKey = (localStorage.getItem("sorgulen_admin_key") || "").trim();
    if (!adminKey) return;
    const apiBase = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
    const [operations, inventory, snow, autopilot, mailbox] = await Promise.all([
      fetchJson(`${apiBase}/admin/operations/notifications`, adminKey),
      fetchJson(`${apiBase}/admin/inventory/summary`, adminKey),
      fetchJson(`${apiBase}/admin/snow/state`, adminKey),
      fetchJson(`${apiBase}/admin/autopilot/inbox/summary`, adminKey),
      fetchJson(`${apiBase}/admin/mailbox/summary`, adminKey),
    ]);
    if (operations) {
      Object.entries(operations.badges || {}).forEach(([key, value]) => showBadge(key, value));
      window.dispatchEvent(new CustomEvent("sorgulen:notifications", { detail: operations }));
    }
    const inventoryCount = Math.max(0, Number(inventory?.lowStockCount) || 0);
    const snowCount = Math.max(0, Number(snow?.summary?.queued) || 0);
    const autopilotCount = Math.max(0, Number(autopilot?.inbox?.counts?.pending) || 0)
      + Math.max(0, Number(autopilot?.inbox?.counts?.revisionRequested) || 0);
    const mailboxCount = Math.max(0, Number(mailbox?.counts?.attention) || 0);
    const bookingCount = Math.max(0, Number(operations?.badges?.bookings) || 0);
    const requestCount = Math.max(0, Number(operations?.badges?.requests) || 0);
    const invoiceCount = Math.max(0, Number(operations?.badges?.invoices) || 0);
    const notificationCount = Math.max(0, Number(operations?.badges?.notifications) || 0);
    const incomingCount = bookingCount + requestCount + mailboxCount;
    const driftCount = inventoryCount + snowCount;
    const systemCount = autopilotCount + notificationCount;

    showBadge("inventory", inventoryCount);
    showBadge("snow", snowCount);
    showBadge("autopilot", autopilotCount);
    showBadge("mailbox", mailboxCount);
    showBadge("incoming", incomingCount);
    showBadge("economy", invoiceCount);
    showBadge("drift", driftCount);
    showBadge("system", systemCount);
    showBadge("more", incomingCount + driftCount + systemCount);
  }

  moreButton.addEventListener("click", () => setMenu(!moreMenu.classList.contains("is-open")));
  closeButton.addEventListener("click", () => setMenu(false));
  backdrop.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && moreMenu.classList.contains("is-open")) setMenu(false);
  });
  document.getElementById("adminMobileLogout").addEventListener("click", () => {
    localStorage.removeItem("sorgulen_admin_key");
    window.location.href = "login.html";
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("sorgulen_admin_key");
  });

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-admin-open]");
    const closer = event.target.closest("[data-admin-close]");
    if (opener) {
      const panel = document.querySelector(opener.dataset.adminOpen);
      if (!panel) return;
      panel.classList.remove("hidden");
      panel.removeAttribute("hidden");
      opener.setAttribute("aria-expanded", "true");
      panel.querySelector("input,select,textarea,button")?.focus();
    }
    if (closer) {
      const panel = closer.closest("[data-admin-panel]");
      if (!panel) return;
      panel.classList.add("hidden");
      document.querySelector(`[data-admin-open="#${panel.id}"]`)?.setAttribute("aria-expanded", "false");
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("push-sw.js", { scope: "./" }).catch(() => {});
  }
  if (typeof navigator.clearAppBadge === "function") {
    navigator.clearAppBadge().catch(() => {});
  }

  window.SorgulenAdminShell = { refreshBadges: loadBadges };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadBadges, { once: true });
  else loadBadges();
}());