(() => {
  "use strict";

  const KEY = "sorgulen_admin_key";
  const shell = document.getElementById("adminShell");
  const page = shell?.dataset.page || "";
  let scheduled = false;
  let watchdogLoading = false;
  let watchdogStamp = "";

  function apiBase() {
    return (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  }

  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "x-admin-key": localStorage.getItem(KEY) || "",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
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

  function ensureStyle() {
    if (document.getElementById("actionableWarningsStyle")) return;
    const style = document.createElement("style");
    style.id = "actionableWarningsStyle";
    style.textContent = `
      .actionable-warning-action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:10px;padding:10px 15px;border:1px solid rgba(148,163,184,.38);border-radius:12px;background:#1d2b40;color:#fff!important;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}
      .actionable-warning-action:active{transform:translateY(1px)}
      .actionable-warning-form{display:grid;gap:10px;margin-top:12px;padding:12px;border:1px solid rgba(245,185,66,.35);border-radius:12px;background:rgba(15,23,42,.72)}
      .actionable-warning-form label{display:grid;gap:6px;font-weight:700}
      .actionable-warning-form input{width:100%;min-height:46px;border:1px solid #40516a;border-radius:10px;background:#0d1725;color:#fff;padding:10px 12px;font:inherit}
      .actionable-warning-form .actionable-actions{display:flex;gap:8px;flex-wrap:wrap}
      .actionable-warning-error{min-height:0;margin:0;color:#ffb0a8;font-size:.9rem}
      .autopilot-watchdog-item .actionable-warning-action{margin-left:auto;margin-top:0}
      .fd-validation-list li .actionable-warning-action{display:flex;width:max-content}
      @media(max-width:720px){.actionable-warning-action{width:100%}.autopilot-watchdog-item .actionable-warning-action{width:100%;margin-top:9px}}
    `;
    document.head.appendChild(style);
  }

  function scrollToField(element) {
    if (!element) return false;
    const details = element.closest("details");
    if (details) details.open = true;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => element.focus?.({ preventScroll: true }), 250);
    return true;
  }

  function addButton(container, label, handler, key) {
    if (!container || container.querySelector(`[data-actionable-key="${key}"]`)) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "actionable-warning-action";
    button.dataset.actionableKey = key;
    button.textContent = label;
    button.addEventListener("click", handler);
    container.appendChild(button);
    return button;
  }

  function addLink(container, label, href, key) {
    if (!container || container.querySelector(`[data-actionable-key="${key}"]`)) return null;
    const link = document.createElement("a");
    link.className = "actionable-warning-action";
    link.dataset.actionableKey = key;
    link.href = href;
    link.textContent = label;
    container.appendChild(link);
    return link;
  }

  function orderId() {
    return document.querySelector("[data-field-workspace][data-order-id]")?.dataset.orderId || "";
  }

  function openRegistrationManager() {
    const id = orderId();
    if (!id) return;
    if (window.SorgulenOperations?.openManager) return window.SorgulenOperations.openManager(id);
    const target = [...document.querySelectorAll("details.field-collapse")].find((node) => /Utgifter, materialer og notater/i.test(node.textContent || ""));
    if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }

  function buildContactForm(issue, fields = ["email"]) {
    if (!issue || issue.querySelector("[data-actionable-contact-form]")) return;
    const id = orderId();
    if (!id) return;
    const form = document.createElement("form");
    form.className = "actionable-warning-form";
    form.dataset.actionableContactForm = "true";
    const inputs = [];
    if (fields.includes("name")) inputs.push('<label>Kundenavn<input name="name" autocomplete="name" required placeholder="Navn"></label>');
    if (fields.includes("email")) inputs.push('<label>E-postadresse<input name="email" type="email" autocomplete="email" required placeholder="kunde@epost.no"></label>');
    if (fields.includes("phone")) inputs.push('<label>Telefon<input name="phone" type="tel" autocomplete="tel" placeholder="Telefonnummer"></label>');
    form.innerHTML = `${inputs.join("")}<p class="actionable-warning-error" data-actionable-error></p><div class="actionable-actions"><button type="button" class="secondary-btn" data-actionable-cancel>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div>`;
    issue.appendChild(form);
    form.querySelector("input")?.focus();
    form.querySelector("[data-actionable-cancel]")?.addEventListener("click", () => form.remove());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = form.querySelector("[data-actionable-error]");
      const save = form.querySelector('button[type="submit"]');
      error.textContent = "";
      save.disabled = true;
      try {
        const payload = Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => String(value).trim()));
        await api(`/admin/actionable/work-orders/${encodeURIComponent(id)}/customer-contact`, { method: "PATCH", body: JSON.stringify(payload) });
        location.href = `oppdrag.html?open=${encodeURIComponent(id)}`;
      } catch (err) {
        error.textContent = err.message;
      } finally {
        save.disabled = false;
      }
    });
  }

  function enhanceWorkOrderWarnings() {
    const workspace = document.querySelector("[data-field-workspace]");
    if (!workspace) return;
    document.querySelectorAll(".field-issue").forEach((issue, index) => {
      const text = (issue.textContent || "").toLowerCase();
      const row = issue.querySelector(".field-issue-row") || issue;
      if (row.querySelector(".field-issue-action, .actionable-warning-action")) return;

      if (text.includes("e-postadresse") || text.includes("e-post")) {
        addButton(row, "Legg inn e-post", () => buildContactForm(issue, ["email"]), `job-email-${index}`);
        return;
      }
      if (text.includes("kundenavn")) {
        addButton(row, "Legg inn kunde", () => buildContactForm(issue, ["name", "email", "phone"]), `job-customer-${index}`);
        return;
      }
      if (text.includes("utgift") || text.includes("material") || text.includes("timesats") || text.includes("fastpris") || text.includes("pris")) {
        addButton(row, "Åpne registrering", openRegistrationManager, `job-register-${index}`);
        return;
      }
      if (text.includes("tidsregistrering") || text.includes("fortsatt åpen")) {
        addButton(row, "Gå til tidtaking", () => scrollToField(document.querySelector(".field-work-controls button, .field-work-controls")), `job-timer-${index}`);
        return;
      }
      addButton(row, "Åpne prosjektinfo", () => {
        const target = document.getElementById("fieldProjectInfo");
        if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }, `job-generic-${index}`);
    });
  }

  function enhanceCustomerWarnings() {
    const hero = document.querySelector(".customer-ops-hero");
    const form = document.getElementById("customerEditForm");
    if (!hero || !form || hero.querySelector('[data-actionable-key="customer-contact"]')) return;
    if (!(hero.textContent || "").includes("Ingen kontaktinformasjon")) return;
    const actions = hero.querySelector(".customer-ops-actions") || hero;
    addButton(actions, "Legg inn kontaktinfo", () => scrollToField(form.elements.email || form), "customer-contact");
  }

  function enhancePortalWarnings() {
    document.querySelectorAll(".portal-warning").forEach((warning, index) => {
      const text = (warning.textContent || "").toLowerCase();
      if (text.includes("arbeidsperiode") && text.includes("passert")) {
        addButton(warning, "Sett ny dato", () => scrollToField(document.getElementById("nextWorkStart")), `portal-date-${index}`);
        addButton(warning, "Foreslå neste mulighet", () => document.getElementById("suggestNextWork")?.click(), `portal-suggest-${index}`);
      }
    });

    const focus = new URLSearchParams(location.search).get("focus");
    if (!focus) return;
    let target = null;
    if (focus === "link") target = document.getElementById("generatePortalLink");
    if (focus === "schedule") target = document.getElementById("nextWorkStart");
    if (focus === "procurement") target = document.querySelector(".procurement-builder");
    if (target && !target.dataset.actionableFocused) {
      target.dataset.actionableFocused = "true";
      scrollToField(target);
    }
  }

  function watchdogHref(item) {
    const id = encodeURIComponent(item.entityId || "");
    if (!id) return "";
    if (["portal_missing", "portal_inactive"].includes(item.code)) return `kundeportal.html?workOrderId=${id}&focus=link`;
    if (item.code === "approved_purchase_waiting") return `kundeportal.html?workOrderId=${id}&focus=procurement`;
    if (["next_work_ready", "next_work_missing"].includes(item.code)) return `kundeportal.html?workOrderId=${id}&focus=schedule`;
    if (item.code === "invoice_missing") return `faktura-ny.html?workOrderId=${id}`;
    if (["invoice_not_sent", "invoice_overdue"].includes(item.code)) return `faktura-detalj.html?id=${id}`;
    if (item.entityType === "workOrder") return `oppdrag.html?open=${id}`;
    if (item.entityType === "invoice") return `faktura-detalj.html?id=${id}`;
    return "";
  }

  async function enhanceAutopilotWarnings() {
    const nodes = [...document.querySelectorAll(".autopilot-watchdog-item")];
    if (!nodes.length || watchdogLoading) return;
    const stamp = nodes.map((node) => node.textContent.trim()).join("|");
    if (stamp === watchdogStamp && nodes.every((node) => node.querySelector(".actionable-warning-action"))) return;
    watchdogLoading = true;
    try {
      const data = await api("/admin/autopilot/watchdog");
      const findings = data.findings || [];
      nodes.forEach((node, index) => {
        const item = findings[index];
        if (!item) return;
        const href = watchdogHref(item);
        if (href) addLink(node, "Ordne nå", href, `watchdog-${item.code}-${item.entityId}`);
      });
      watchdogStamp = stamp;
    } catch (_) {
      // Autopilot-siden skal fortsatt fungere selv om denne ekstra direktekoblingen feiler.
    } finally {
      watchdogLoading = false;
    }
  }

  function enhanceInvoiceWarnings() {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return;
    document.querySelectorAll(".fd-validation-list li").forEach((item, index) => {
      if (item.querySelector(".actionable-warning-action")) return;
      addLink(item, "Rett i fakturautkast", `faktura-rediger.html?id=${encodeURIComponent(id)}&focus=problem`, `invoice-problem-${index}`);
    });
    document.querySelectorAll(".fd-warn").forEach((warning, index) => {
      const text = (warning.textContent || "").toLowerCase();
      if (warning.querySelector(".actionable-warning-action")) return;
      if (text.includes("e-post")) {
        addLink(warning, "Åpne kundeinfo", `faktura-rediger.html?id=${encodeURIComponent(id)}&focus=customer`, `invoice-email-${index}`);
      }
    });
  }

  function enhanceNewInvoiceValidation() {
    const params = new URLSearchParams(location.search);
    if (!params.get("focus")) return;
    const focus = params.get("focus");
    const form = document.querySelector("form");
    if (!form || form.dataset.actionableFocused) return;
    form.dataset.actionableFocused = "true";
    const target = focus === "customer"
      ? form.querySelector('input[name="customerName"], input[name="name"], input[type="email"]')
      : form.querySelector("input,textarea,select");
    scrollToField(target || form);
  }

  function enhance() {
    scheduled = false;
    ensureStyle();
    if (page === "jobs") enhanceWorkOrderWarnings();
    if (page === "customers") enhanceCustomerWarnings();
    if (page === "portal") enhancePortalWarnings();
    if (page === "autopilot") enhanceAutopilotWarnings();
    if (page === "invoices" && location.pathname.endsWith("faktura-detalj.html")) enhanceInvoiceWarnings();
    if (page === "invoices" && /faktura-(ny|rediger)\.html$/.test(location.pathname)) enhanceNewInvoiceValidation();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(enhance, 40);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("sorgulen:notifications", schedule);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();
})();
