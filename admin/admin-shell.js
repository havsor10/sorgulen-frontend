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
  ensureAsset("link", { rel: "stylesheet", href: "operations.css?v=20260904-clickfix1" });
  ensureAsset("script", { src: "operations-ui.js?v=20260904-clickfix1" });

  const page = mount.dataset.page || "";
  const navItems = [
    { key: "home", href: "hjem.html", label: "Hjem" },
    { key: "jobs", href: "oppdrag.html", label: "Oppdrag" },
    { key: "bookings", href: "admin-dashboard.html", label: "Bookinger" },
    { key: "requests", href: "foresporsler.html", label: "Forespørsler" },
    { key: "customers", href: "kunder.html", label: "Kunder" },
    { key: "invoices", href: "fakturaer.html", label: "Fakturaer" },
  ];
  const mobileItems = navItems.filter((item) => ["home", "jobs", "customers", "invoices"].includes(item.key));
  const activeClass = (key) => key === page ? " is-active" : "";
  const activeAttr = (key) => key === page ? ' aria-current="page"' : "";
  const badge = (key) => `<span class="admin-nav-badge" data-admin-badge="${key}" hidden></span>`;

  function mobileIcon(key) {
    return ({ home: "⌂", jobs: "◷", customers: "◎", invoices: "▤" })[key] || "•";
  }

  document.body.classList.add("admin-app");
  mount.innerHTML = `
    <header class="admin-app-header">
      <div class="admin-header-inner">
        <a class="admin-brand" href="hjem.html" aria-label="Sørgulen admin – hjem">
          <span>Sørgulen Industriservice</span>
          <strong>Admin</strong>
        </a>
        <nav class="admin-desktop-nav" aria-label="Hovednavigasjon">
          ${navItems.map((item) => `<a class="admin-nav-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}><span>${item.label}</span>${badge(item.key)}</a>`).join("")}
        </nav>
        <div class="admin-header-actions">
          <a class="admin-quiet-action" href="statistikk.html">Statistikk</a>
          <a class="admin-quiet-action" id="logoutBtn" href="login.html">Logg ut</a>
        </div>
      </div>
    </header>
    <nav class="admin-mobile-nav" aria-label="Mobilnavigasjon">
      ${mobileItems.map((item) => `<a class="admin-mobile-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}><span class="admin-mobile-icon" aria-hidden="true">${mobileIcon(item.key)}</span><span class="admin-mobile-label">${item.label}</span>${badge(item.key)}</a>`).join("")}
      <button class="admin-mobile-link${["bookings", "requests", "more"].includes(page) ? " is-active" : ""}" id="adminMoreButton" type="button" aria-expanded="false" aria-controls="adminMoreMenu">
        <span class="admin-mobile-icon" aria-hidden="true">•••</span><span class="admin-mobile-label">Mer</span>${badge("more")}
      </button>
    </nav>
    <div class="admin-menu-backdrop" id="adminMenuBackdrop" hidden></div>
    <aside class="admin-more-menu" id="adminMoreMenu" aria-label="Flere adminvalg" aria-hidden="true">
      <div class="admin-more-head"><strong>Mer</strong><button id="adminMoreClose" class="admin-icon-button" type="button" aria-label="Lukk meny">×</button></div>
      <a class="admin-more-link${activeClass("bookings")}" href="admin-dashboard.html"${activeAttr("bookings")}><span>Bookinger</span><span class="admin-more-tail">${badge("bookings")}<span aria-hidden="true">›</span></span></a>
      <a class="admin-more-link${activeClass("requests")}" href="foresporsler.html"${activeAttr("requests")}><span>Forespørsler</span><span class="admin-more-tail">${badge("requests")}<span aria-hidden="true">›</span></span></a>
      <a class="admin-more-link${activeClass("more")}" href="statistikk.html"${activeAttr("more")}><span>Statistikk</span><span aria-hidden="true">›</span></a>
      <button class="admin-more-link admin-menu-logout" id="adminMobileLogout" type="button"><span>Logg ut</span><span aria-hidden="true">›</span></button>
    </aside>
  `;

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

  async function loadBadges() {
    const adminKey = (localStorage.getItem("sorgulen_admin_key") || "").trim();
    if (!adminKey) return;
    const apiBase = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
    try {
      const response = await fetch(`${apiBase}/admin/operations/notifications`, { headers: { "x-admin-key": adminKey } });
      if (!response.ok) return;
      const data = await response.json();
      Object.entries(data.badges || {}).forEach(([key, value]) => showBadge(key, value));
      window.dispatchEvent(new CustomEvent("sorgulen:notifications", { detail: data }));
    } catch (_) {
      // Navigasjonen skal fungere selv om varslingsendepunktet er midlertidig utilgjengelig.
    }
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

  window.SorgulenAdminShell = { refreshBadges: loadBadges };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadBadges, { once: true });
  else loadBadges();
}());
