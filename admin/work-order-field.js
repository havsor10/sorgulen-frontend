(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  const title = document.getElementById("detailModalTitle");
  if (!detail) return;

  let enhancing = false;
  let currentOrder = null;
  let currentControls = "";
  let currentInvoiceAction = "";

  const statusNames = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdigstilt", cancelled: "Avbrutt" };
  const categoryNames = { work: "Arbeid", purchase: "Innkjøp", transport: "Transport" };
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);

  async function api(path) {
    const response = await fetch(`${API}${path}`, { cache: "no-store", headers: { "x-admin-key": localStorage.getItem(KEY) || "" } });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  function osloDateKey(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function dayLabel(key) {
    if (!key) return "Ukjent dato";
    return new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${key}T12:00:00Z`));
  }

  function clock(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function dateTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function intervalSeconds(entry, now = Date.now()) {
    const explicit = Number(entry?.durationSeconds);
    if (entry?.source === "manual" && explicit > 0) return explicit;
    const start = new Date(entry?.startedAt).getTime();
    const end = entry?.endedAt ? new Date(entry.endedAt).getTime() : now;
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : 0;
  }

  function durationText(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours && minutes) return `${hours} t ${minutes} min`;
    if (hours) return `${hours} t`;
    return `${minutes} min`;
  }

  function totalSeconds(order) {
    return (order.workIntervals || []).reduce((sum, item) => sum + intervalSeconds(item), 0);
  }

  function projectedTotal(order) {
    const seconds = totalSeconds(order);
    const labor = (seconds / 3600) * Number(order.hourlyRate || 0);
    let base = order.status === "completed" && order.calculatedAmount != null
      ? Number(order.calculatedAmount)
      : order.pricingMode === "fixed"
        ? Number(order.fixedPrice || 0)
        : order.pricingMode === "hybrid"
          ? Number(order.fixedPrice || 0) + labor
          : labor;
    base += (order.additionalCosts || []).filter((x) => x.billable !== false).reduce((sum, x) => sum + Number(x.amount || 0), 0);
    base += (order.materials || []).filter((x) => x.billable !== false && x.unitPrice != null).reduce((sum, x) => sum + Number(x.quantity || 0) * Number(x.unitPrice || 0), 0);
    return Math.round((base + Number.EPSILON) * 100) / 100;
  }

  function missingDescriptions(order) {
    return (order.workIntervals || []).filter((entry) => entry.endedAt && intervalSeconds(entry) > 0 && !String(entry.comment || "").trim());
  }

  function invoiceIssues(order, completionCheck) {
    const ignored = ["En tidsregistrering er fortsatt åpen.", "Prosjektet er allerede koblet til en faktura."];
    const blocking = (completionCheck?.blocking || []).filter((x) => !ignored.includes(x));
    const warnings = [...(completionCheck?.warnings || [])];
    const missing = missingDescriptions(order);
    if (missing.length) warnings.push(`${missing.length} arbeidsøkt${missing.length === 1 ? "" : "er"} mangler beskrivelse av hva som ble gjort.`);
    return { blocking, warnings, count: blocking.length + warnings.length };
  }

  function pausePairs(order) {
    const events = [...(order.events || [])].filter((event) => event?.at).sort((a, b) => new Date(a.at) - new Date(b.at));
    const pauses = [];
    let pausedAt = null;
    for (const event of events) {
      if (event.type === "paused") pausedAt = event.at;
      if (pausedAt && ["resumed", "stopped", "completed", "cancelled"].includes(event.type)) {
        const start = new Date(pausedAt).getTime();
        const end = new Date(event.at).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) pauses.push({ startedAt: pausedAt, endedAt: event.at, seconds: Math.floor((end - start) / 1000) });
        pausedAt = null;
      }
    }
    return pauses;
  }

  function relatedByDay(order, key) {
    const rows = [];
    (order.additionalCosts || []).filter((item) => osloDateKey(item.occurredAt) === key).forEach((item) => rows.push({ type: "Utgift", title: item.item, tail: money(item.amount) }));
    (order.materials || []).filter((item) => osloDateKey(item.createdAt) === key).forEach((item) => rows.push({ type: "Materiale", title: `${item.item} · ${item.quantity} ${item.unit || "stk"}`, tail: item.unitPrice == null ? "Pris mangler" : money(Number(item.quantity) * Number(item.unitPrice)) }));
    (order.projectNotes || []).filter((item) => osloDateKey(item.createdAt) === key).forEach((item) => rows.push({ type: "Notat", title: item.text, tail: "" }));
    return rows;
  }

  function sessionMarkup(order, entry) {
    const seconds = intervalSeconds(entry);
    const missing = !String(entry.comment || "").trim();
    const open = !entry.endedAt;
    const rate = Number(entry.hourlyRateSnapshot ?? order.hourlyRate ?? 0);
    const titleText = missing ? "Mangler beskrivelse – hva gjorde du?" : entry.comment;
    return `<details class="field-session${missing ? " missing-description" : ""}">
      <summary>
        <span class="field-session-time">${esc(clock(entry.startedAt))}–${open ? "pågår" : esc(clock(entry.endedAt))}</span>
        <span class="field-session-main"><strong>${esc(titleText)}</strong><span>${esc(categoryNames[entry.category] || "Arbeid")} · ${entry.source === "manual" ? "Manuell" : "Takstameter"}</span></span>
        <span class="field-session-duration">${esc(durationText(seconds))}</span>
      </summary>
      <div class="field-session-detail">
        <div class="field-session-detail-grid">
          <div><span>Start</span><strong>${esc(dateTime(entry.startedAt))}</strong></div>
          <div><span>Stopp</span><strong>${open ? "Pågår nå" : esc(dateTime(entry.endedAt))}</strong></div>
          <div><span>Varighet</span><strong>${esc(durationText(seconds))}</strong></div>
          <div><span>Timesats</span><strong>${esc(money(rate))} / t</strong></div>
          <div><span>Type</span><strong>${esc(categoryNames[entry.category] || "Arbeid")}</strong></div>
          <div><span>Faktura</span><strong>${entry.billable === false ? "Intern / ikke fakturerbar" : "Fakturerbar"}</strong></div>
        </div>
        <div class="field-description${missing ? " warn" : ""}">${missing ? "Denne økten mangler en beskrivelse. Legg inn hva du gjorde mens du fortsatt husker det." : esc(entry.comment)}</div>
        ${open ? '<button class="field-edit-session" type="button" disabled>Pause eller stopp økten før du redigerer</button>' : `<button class="field-edit-session" type="button" data-field-edit-session="${esc(entry.entryId)}">${missing ? "Legg inn hva eg gjorde" : "Rediger denne økten"}</button>`}
      </div>
    </details>`;
  }

  function dailyLogMarkup(order) {
    const days = new Map();
    for (const entry of order.workIntervals || []) {
      const key = entry.workDate || osloDateKey(entry.startedAt) || order.jobDate;
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(entry);
    }
    const pauses = pausePairs(order);
    for (const pause of pauses) {
      const key = osloDateKey(pause.startedAt);
      if (!days.has(key)) days.set(key, []);
    }
    for (const item of order.additionalCosts || []) { const key = osloDateKey(item.occurredAt); if (key && !days.has(key)) days.set(key, []); }
    for (const item of order.materials || []) { const key = osloDateKey(item.createdAt); if (key && !days.has(key)) days.set(key, []); }
    for (const item of order.projectNotes || []) { const key = osloDateKey(item.createdAt); if (key && !days.has(key)) days.set(key, []); }

    const keys = [...days.keys()].filter(Boolean).sort().reverse();
    if (!keys.length) return '<div class="empty-state">Ingen arbeid eller registreringer på oppdraget ennå.</div>';
    return keys.map((key, index) => {
      const entries = days.get(key).sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
      const daySeconds = entries.reduce((sum, entry) => sum + intervalSeconds(entry), 0);
      const first = entries[0]?.startedAt;
      const last = entries.at(-1)?.endedAt;
      const dayPauses = pauses.filter((pause) => osloDateKey(pause.startedAt) === key);
      const related = relatedByDay(order, key);
      return `<details class="field-day" ${index === 0 ? "open" : ""}>
        <summary>
          <span class="field-day-title"><strong>${esc(dayLabel(key))}</strong><span>${entries.length ? `${esc(clock(first))}–${last ? esc(clock(last)) : "pågår"} · ${entries.length} økt${entries.length === 1 ? "" : "er"}` : "Registreringer uten arbeidsøkt"}</span></span>
          <span class="field-day-total"><strong>${esc(durationText(daySeconds))}</strong><span>registrert tid</span></span>
        </summary>
        <div class="field-day-body">
          ${entries.map((entry) => sessionMarkup(order, entry)).join("")}
          ${dayPauses.map((pause) => `<div class="field-pause"><span><strong>Pause</strong> ${esc(clock(pause.startedAt))}–${esc(clock(pause.endedAt))}</span><span>${esc(durationText(pause.seconds))}</span></div>`).join("")}
          ${related.map((row) => `<div class="field-related-line"><span>${esc(row.type)}</span><strong>${esc(row.title)}</strong><span>${esc(row.tail)}</span></div>`).join("")}
        </div>
      </details>`;
    }).join("");
  }

  function registrationsMarkup(order) {
    const expenses = order.additionalCosts || [];
    const materials = order.materials || [];
    const notes = order.projectNotes || [];
    const rows = (items, mapper, empty) => items.length ? `<div class="field-register-list">${items.map(mapper).join("")}</div>` : `<p class="muted">${esc(empty)}</p>`;
    return `<div class="field-registration-groups">
      <section class="field-register-group"><h4>Utgifter · ${expenses.length}</h4>${rows(expenses, (x) => `<div class="field-register-row"><div><strong>${esc(x.item)}</strong><span>${esc(dateTime(x.occurredAt))}${x.supplier ? ` · ${esc(x.supplier)}` : ""}</span></div><span>${esc(money(x.amount))}</span></div>`, "Ingen utgifter")}</section>
      <section class="field-register-group"><h4>Materialer · ${materials.length}</h4>${rows(materials, (x) => `<div class="field-register-row"><div><strong>${esc(x.item)}</strong><span>${esc(x.quantity)} ${esc(x.unit || "stk")}${x.comment ? ` · ${esc(x.comment)}` : ""}</span></div><span>${x.unitPrice == null ? "Pris mangler" : esc(money(Number(x.quantity) * Number(x.unitPrice)))}</span></div>`, "Ingen materialer")}</section>
      <section class="field-register-group"><h4>Notater · ${notes.length}</h4>${rows(notes, (x) => `<div class="field-register-row"><div><strong>${esc(x.text)}</strong><span>${esc(dateTime(x.createdAt))}</span></div><span></span></div>`, "Ingen løpende notater")}</section>
    </div>`;
  }

  function pricingLabel(order) {
    if (order.pricingMode === "fixed") return `Fastpris · ${money(order.fixedPrice)}`;
    if (order.pricingMode === "hybrid") return `Fastpris ${money(order.fixedPrice)} + ${money(order.hourlyRate)}/t`;
    return `${money(order.hourlyRate)} / time`;
  }

  function render(order, completionCheck) {
    currentOrder = order;
    const customer = order.customerSnapshot || {};
    const issues = invoiceIssues(order, completionCheck);
    const missingPrice = (order.materials || []).some((x) => x.billable !== false && x.unitPrice == null);
    const contact = [customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Ingen kontaktinformasjon registrert";
    if (title) title.textContent = customer.name || "Oppdrag";

    detail.innerHTML = `<div class="field-workspace" data-field-workspace data-order-id="${esc(order._id)}">
      <section class="field-hero">
        <div class="field-hero-top"><div class="field-identity"><p class="field-kicker">Kundeoppdrag</p><h2>${esc(customer.name || "Ukjent kunde")}</h2><p class="field-service">${esc(order.serviceName)}</p></div><span class="field-status ${esc(order.status)}">${esc(statusNames[order.status] || order.status)}</span></div>
        <div class="field-metrics">
          <div class="field-metric"><span>Arbeidstid</span><strong data-field-total-time>${esc(durationText(totalSeconds(order)))}</strong><small>Alle registrerte økter</small></div>
          <div class="field-metric"><span>Pris hittil</span><strong data-field-total-price>${esc(money(projectedTotal(order)))}</strong><small>${missingPrice ? "Foreløpig – materiale mangler pris" : "Fakturerbart registrert"}</small></div>
          <div class="field-metric"><span>Fakturagrunnlag</span><strong>${issues.count ? `${issues.count} mangler` : "Klar ✓"}</strong><small>${issues.count ? "Trykk for å kontrollere" : "Alt viktig er registrert"}</small></div>
        </div>
        <button type="button" class="field-readiness${issues.count ? "" : " ready"}" data-field-readiness-jump><span class="field-readiness-icon">${issues.count ? "!" : "✓"}</span><span class="field-readiness-copy"><strong>${issues.count ? "Fakturagrunnlaget trenger kontroll" : "Fakturagrunnlaget ser bra ut"}</strong><span>${issues.count ? `${issues.count} ting bør ordnes før faktura` : "Ingen manglende opplysninger funnet"}</span></span><span class="field-readiness-tail">›</span></button>
        ${!["completed", "cancelled"].includes(order.status) ? `<div class="field-action-row"><div class="field-add-wrap"><button type="button" class="field-add-main" data-field-add-toggle aria-expanded="false">+ Legg til</button><div class="field-add-menu" data-field-add-menu hidden><button type="button" data-entry="time" data-id="${esc(order._id)}">Tid / arbeid</button><button type="button" data-entry="expense" data-id="${esc(order._id)}">Utgift</button><button type="button" data-entry="material" data-id="${esc(order._id)}">Materiale</button><button type="button" data-entry="note" data-id="${esc(order._id)}">Notat</button></div></div>${order.customerId ? `<a class="field-secondary-action" href="kunde.html?id=${encodeURIComponent(order.customerId)}">Kundeinfo</a>` : ""}</div>` : ""}
      </section>

      <section class="field-section"><div class="field-section-head"><div><h3>Arbeidslogg</h3><p>Dato, klokkeslett, pauser og hva som ble gjort.</p></div></div><div class="field-log">${dailyLogMarkup(order)}</div></section>

      <details id="fieldReadiness" class="field-collapse" ${issues.count ? "open" : ""}><summary>Fakturakontroll <span>${issues.count ? `${issues.count} ting å kontrollere` : "Klar"}</span></summary><div class="field-collapse-body">${issues.count ? `<ul class="field-issue-list">${issues.blocking.map((x) => `<li class="blocking">${esc(x)}</li>`).join("")}${issues.warnings.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="field-clear-note">Kunden, prisgrunnlaget og registreringene har opplysningene systemet krever akkurat nå.</p>'}</div></details>

      <details class="field-collapse"><summary>Kunde og prosjektinfo <span>${esc(pricingLabel(order))}</span></summary><div class="field-collapse-body"><div class="field-info-grid"><div><span>Kunde</span><strong>${esc(customer.name || "–")}</strong></div><div><span>Kontakt</span><strong>${esc(contact)}</strong></div><div><span>Oppdrag</span><strong>${esc(order.serviceName)}</strong></div><div><span>Oppdragsdato</span><strong>${esc(order.jobDate || "–")}</strong></div><div><span>Pris</span><strong>${esc(pricingLabel(order))}</strong></div><div><span>Kilde</span><strong>${esc(order.customerSourceType || "Manuell")}${order.sourceRefNumber ? ` · #${esc(order.sourceRefNumber)}` : ""}</strong></div></div></div></details>

      <details class="field-collapse"><summary>Utgifter, materialer og notater <span>${(order.additionalCosts || []).length + (order.materials || []).length + (order.projectNotes || []).length} registreringer</span></summary><div class="field-collapse-body">${registrationsMarkup(order)}</div></details>

      <details class="field-collapse field-notes"><summary>Prosjektbeskrivelse <span>${order.notes ? "Registrert" : "Tom"}</span></summary><div class="field-collapse-body"><textarea id="detailNotes" maxlength="5000" placeholder="Avtaler, omfang eller annen viktig prosjektinfo">${esc(order.notes || "")}</textarea><button id="saveDetailNotes" type="button" class="secondary-btn">Lagre prosjektbeskrivelse</button></div></details>

      ${(currentControls || currentInvoiceAction) ? `<div class="field-work-controls">${currentControls}${currentInvoiceAction}</div>` : ""}
    </div>`;
  }

  function orderIdFromLegacy() {
    return detail.querySelector("[data-work-action][data-id]")?.dataset.id || detail.querySelector("[data-entry][data-id]")?.dataset.id || "";
  }

  function captureLegacyActions() {
    const controlParent = [...detail.querySelectorAll(".detail-controls")].find((node) => node.querySelector("[data-work-action]"));
    currentControls = controlParent ? [...controlParent.children].map((x) => x.outerHTML).join("") : "";
    const invoiceLink = [...detail.querySelectorAll('a[href*="faktura-"]')].find((x) => /faktura-(ny|detalj)\.html/.test(x.getAttribute("href") || ""));
    currentInvoiceAction = invoiceLink ? invoiceLink.outerHTML : "";
  }

  async function enhance() {
    if (enhancing) return;
    if (detail.querySelector("[data-field-workspace]")) {
      detail.querySelectorAll(".operations-edit-button").forEach((node) => node.remove());
      return;
    }
    const id = orderIdFromLegacy();
    if (!id) return;
    enhancing = true;
    captureLegacyActions();
    try {
      const [orderData, checkData] = await Promise.all([
        api(`/admin/work-orders/${encodeURIComponent(id)}`),
        api(`/admin/work-orders/${encodeURIComponent(id)}/completion-check`),
      ]);
      render(orderData.workOrder, checkData.completionCheck || {});
    } catch (error) {
      console.warn("Kunne ikke bygge feltvisning:", error.message);
    } finally {
      enhancing = false;
    }
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-field-add-toggle]");
    if (toggle) {
      const menu = detail.querySelector("[data-field-add-menu]");
      if (!menu) return;
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      return;
    }
    if (!event.target.closest(".field-add-wrap")) {
      const menu = detail.querySelector("[data-field-add-menu]");
      const addToggle = detail.querySelector("[data-field-add-toggle]");
      if (menu) menu.hidden = true;
      addToggle?.setAttribute("aria-expanded", "false");
    }
    const readiness = event.target.closest("[data-field-readiness-jump]");
    if (readiness) {
      const target = document.getElementById("fieldReadiness");
      if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }
    const edit = event.target.closest("[data-field-edit-session]");
    if (edit && currentOrder) {
      const entry = (currentOrder.workIntervals || []).find((x) => x.entryId === edit.dataset.fieldEditSession);
      if (!entry) return;
      if (window.SorgulenOperations?.openManualTime) {
        window.SorgulenOperations.openManualTime({ orderId: currentOrder._id, entry, rate: currentOrder.hourlyRate });
      } else {
        alert("Tidsredigering er ikke klar ennå. Oppdater siden og prøv igjen.");
      }
    }
  }, false);

  const observer = new MutationObserver(() => window.setTimeout(enhance, 0));
  observer.observe(detail, { childList: true, subtree: true });
  window.setInterval(() => {
    if (!currentOrder || !detail.querySelector("[data-field-workspace]")) return;
    const time = detail.querySelector("[data-field-total-time]");
    const price = detail.querySelector("[data-field-total-price]");
    if (time) time.textContent = durationText(totalSeconds(currentOrder));
    if (price) price.textContent = money(projectedTotal(currentOrder));
  }, 1000);
  window.setTimeout(enhance, 100);
})();
