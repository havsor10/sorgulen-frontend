(function () {
  "use strict";

  const mount = document.getElementById("adminShell");
  if (!mount) return;

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
          ${navItems.map((item) => `<a class="admin-nav-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}>${item.label}</a>`).join("")}
        </nav>
        <div class="admin-header-actions">
          <a class="admin-quiet-action" href="statistikk.html">Mer</a>
          <a class="admin-quiet-action" id="logoutBtn" href="login.html">Logg ut</a>
        </div>
      </div>
    </header>
    <nav class="admin-mobile-nav" aria-label="Mobilnavigasjon">
      ${mobileItems.map((item) => `<a class="admin-mobile-link${activeClass(item.key)}" href="${item.href}"${activeAttr(item.key)}><span class="admin-mobile-icon" aria-hidden="true">${mobileIcon(item.key)}</span><span>${item.label}</span></a>`).join("")}
      <button class="admin-mobile-link${["bookings", "requests", "more"].includes(page) ? " is-active" : ""}" id="adminMoreButton" type="button" aria-expanded="false" aria-controls="adminMoreMenu">
        <span class="admin-mobile-icon" aria-hidden="true">•••</span><span>Mer</span>
      </button>
    </nav>
    <div class="admin-menu-backdrop" id="adminMenuBackdrop" hidden></div>
    <aside class="admin-more-menu" id="adminMoreMenu" aria-label="Flere adminvalg" aria-hidden="true">
      <div class="admin-more-head"><strong>Mer</strong><button id="adminMoreClose" class="admin-icon-button" type="button" aria-label="Lukk meny">×</button></div>
      <a class="admin-more-link${activeClass("bookings")}" href="admin-dashboard.html"${activeAttr("bookings")}><span>Bookinger</span><span aria-hidden="true">›</span></a>
      <a class="admin-more-link${activeClass("requests")}" href="foresporsler.html"${activeAttr("requests")}><span>Forespørsler</span><span aria-hidden="true">›</span></a>
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
}());
