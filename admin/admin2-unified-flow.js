(() => {
  "use strict";

  const shell = document.getElementById("adminShell");
  if (!shell) return;

  const page = shell.dataset.page || "";
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";

  function ensureCss() {
    if (document.querySelector('link[href*="admin2-unified-flow.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "admin2-unified-flow.css?v=20260917-a1";
    document.head.appendChild(link);
  }

  async function api(path) {
    const response = await fetch(`${API}${path}`, {
      cache: "no-store",
      headers: { "x-admin-key": (localStorage.getItem(KEY) || "").trim() },
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  function simplifyNavigation() {
    document.body.classList.add("admin2-simple-nav");

    const autopilotMobile = document.querySelector('.admin-mobile-nav a[href="autopilot.html"]');
    autopilotMobile?.remove();

    const moreMenu = document.getElementById("adminMoreMenu");
    if (moreMenu && !moreMenu.querySelector('a[href="autopilot.html"]')) {
      const notifications = moreMenu.querySelector('a[href="varslinger.html"]');
      const link = document.createElement("a");
      link.className = `admin-more-link${page === "autopilot" ? " is-active" : ""}`;
      link.href = "autopilot.html";
      link.innerHTML = '<span>Autopilot</span><span aria-hidden="true">›</span>';
      moreMenu.insertBefore(link, notifications || moreMenu.querySelector(".admin-menu-logout"));
    }

    document.querySelectorAll('.admin-more-link[href="kundeportal.html"] span:first-child').forEach((node) => {
      node.textContent = "Kundesider";
    });
    document.querySelectorAll('.admin-more-link[href="admin-dashboard.html"] span:first-child').forEach((node) => {
      node.textContent = "Nye bestillinger";
    });
  }

  const statusText = {
    planned: "Planlagt",
    active: "Arbeid pågår",
    paused: "Pauset",
    stopped: "Mellom økter",
    completed: "Ferdig",
    cancelled: "Avbrutt",
  };

  function addBookingContext(container, { title, text, tone = "info" }) {
    const old = container.querySelector("[data-admin2-booking-context]");
    if (old) old.remove();
    const box = document.createElement("section");
    box.className = `admin2-booking-context is-${tone}`;
    box.dataset.admin2BookingContext = "";
    box.innerHTML = `<strong>${title}</strong><p>${text}</p>`;
    const heading = container.querySelector("h2");
    if (heading) heading.insertAdjacentElement("afterend", box);
    else container.prepend(box);
  }

  function replacePrimaryBookingAction(container, href, label) {
    const actions = container.querySelector(".contact-actions");
    if (!actions) return;
    let primary = actions.querySelector("a.tab");
    if (!primary) {
      primary = document.createElement("a");
      primary.className = "tab";
      actions.prepend(primary);
    }
    primary.href = href;
    primary.textContent = label;
    primary.classList.add("admin2-primary-link");
  }

  async function enhanceBookingDetail() {
    if (!location.pathname.endsWith("/order-detail.html")) return;
    const container = document.getElementById("orderInfo");
    const bookingId = new URL(location.href).searchParams.get("id");
    if (!container || !bookingId || container.dataset.admin2Resolved === "1") return;

    try {
      const [bookingData, workData] = await Promise.all([
        api(`/admin/bookings/${encodeURIComponent(bookingId)}`),
        api("/admin/work-orders?limit=300"),
      ]);
      const booking = bookingData.booking || {};
      const linked = (workData.workOrders || []).find((order) => String(order.bookingId || "") === String(bookingId));
      const snow = /brøy/i.test(String(booking.serviceName || ""));

      container.dataset.admin2Resolved = "1";

      if (linked) {
        container.querySelector(".edit-grid")?.remove();
        replacePrimaryBookingAction(container, `oppdrag.html?open=${encodeURIComponent(linked._id)}`, "Åpne oppdrag");
        addBookingContext(container, {
          title: "Denne bestillingen er allerede et oppdrag",
          text: `Status: ${statusText[linked.status] || linked.status || "Opprettet"}. Videre arbeid, tid, kundeinfo og fakturagrunnlag håndteres på oppdraget.`,
          tone: linked.status === "completed" ? "success" : "info",
        });
        return;
      }

      if (snow) {
        container.querySelector(".edit-grid")?.remove();
        replacePrimaryBookingAction(container, "broyting.html", "Åpne brøyting");
        addBookingContext(container, {
          title: "Brøytebestillingen er klar",
          text: "Du trenger ikkje opprette prosjekt her. Bestillingen går til brøytekøen, og ett oppdrag opprettes automatisk når du starter brøytingen.",
          tone: "success",
        });
        return;
      }

      const oldCreate = container.querySelector('.contact-actions a[href*="oppdrag.html?bookingId="]');
      if (oldCreate) {
        oldCreate.textContent = "Gjør til oppdrag";
        oldCreate.classList.add("admin2-primary-link");
      }
      addBookingContext(container, {
        title: "Bestilling mottatt",
        text: "Når jobben skal utføres, gjør du bestillingen til ett oppdrag. Etterpå håndteres alt videre på Oppdrag.",
      });
    } catch (error) {
      console.warn("Admin 2.0 kunne ikke koble bestillingen til oppdrag:", error.message);
    }
  }

  function workspaceStatus(workspace) {
    const pill = workspace.querySelector(".field-status");
    if (!pill) return "";
    return ["planned", "active", "paused", "stopped", "completed", "cancelled"].find((name) => pill.classList.contains(name)) || "";
  }

  function nextStepText(status) {
    return ({
      planned: "Klar til arbeid. Start når du faktisk begynner jobben.",
      active: "Arbeid pågår. Tid registreres på dette oppdraget.",
      paused: "Arbeidet er pauset. Fortsett når du er i gang igjen.",
      stopped: "Arbeidet er stoppet. Velg om du skal fortsette eller ferdigstille.",
      completed: "Jobben er ferdig. Neste relevante steg er faktura.",
      cancelled: "Oppdraget er avsluttet.",
    })[status] || "";
  }

  function enhanceWorkspace(workspace) {
    if (!workspace || workspace.dataset.admin2Enhanced === "1") return;
    const status = workspaceStatus(workspace);
    if (!status) return;
    workspace.dataset.admin2Enhanced = "1";
    workspace.classList.add(`admin2-status-${status}`);

    const hero = workspace.querySelector(".field-hero");
    const metrics = hero?.querySelector(".field-metrics");
    const controls = workspace.querySelector(".field-work-controls");
    if (hero && controls && metrics) {
      controls.classList.add("admin2-primary-controls");
      metrics.insertAdjacentElement("beforebegin", controls);
      const hint = document.createElement("p");
      hint.className = "admin2-next-step";
      hint.textContent = nextStepText(status);
      controls.insertAdjacentElement("beforebegin", hint);
    }

    const readinessButton = hero?.querySelector(".field-readiness");
    const readinessSection = workspace.querySelector("#fieldReadiness");
    const invoiceLater = ["planned", "active", "paused"].includes(status);
    if (invoiceLater) {
      readinessButton?.classList.add("admin2-later");
      readinessSection?.classList.add("admin2-later");
    }

    if (metrics && status === "planned") metrics.classList.add("admin2-planned-metrics");
    if (metrics && ["active", "paused"].includes(status)) metrics.classList.add("admin2-working-metrics");

    const projectInfo = workspace.querySelector("#fieldProjectInfo");
    const firstSection = workspace.querySelector(".field-section");
    if (projectInfo && firstSection) {
      const summary = projectInfo.querySelector("summary");
      if (summary?.firstChild) summary.firstChild.textContent = "Kunde og jobb ";
      firstSection.insertAdjacentElement("beforebegin", projectInfo);
      if (["planned", "active"].includes(status)) projectInfo.open = true;
    }

    workspace.querySelectorAll(".field-collapse.field-notes > summary").forEach((summary) => {
      if (summary.firstChild) summary.firstChild.textContent = "Jobbeskrivelse ";
    });
  }

  function observeWorkspaces() {
    if (page !== "jobs") return;
    const run = () => document.querySelectorAll("[data-field-workspace]").forEach(enhanceWorkspace);
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function enhanceSnow() {
    if (page !== "snow") return;
    try {
      const data = await api("/admin/snow/state");
      const active = data.activeJob;
      if (!active?.workOrderId) return;
      const actions = document.querySelector("#activeJobCard .snow-focus-actions");
      if (!actions || actions.querySelector("[data-admin2-open-work-order]")) return;
      const link = document.createElement("a");
      link.className = "snow-secondary admin2-open-work-order";
      link.dataset.admin2OpenWorkOrder = "";
      link.href = `oppdrag.html?open=${encodeURIComponent(active.workOrderId)}`;
      link.textContent = "ÅPNE OPPDRAG";
      actions.prepend(link);
    } catch (error) {
      console.warn("Admin 2.0 kunne ikke koble brøytekø til oppdrag:", error.message);
    }
  }

  function start() {
    ensureCss();
    simplifyNavigation();
    observeWorkspaces();

    if (location.pathname.endsWith("/order-detail.html")) {
      const target = document.getElementById("orderInfo");
      if (target) {
        const observer = new MutationObserver(() => {
          if (target.querySelector(".contact-actions")) enhanceBookingDetail();
        });
        observer.observe(target, { childList: true, subtree: true });
        window.setTimeout(enhanceBookingDetail, 250);
      }
    }

    if (page === "snow") {
      window.setTimeout(enhanceSnow, 500);
      window.setInterval(enhanceSnow, 15000);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
