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
  let currentCompletionCheck = {};
  let currentControls = "";
  let lastOpenedOrderId = new URLSearchParams(location.search).get("open") || "";

  const statusNames = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdigstilt", cancelled: "Avbrutt" };
  const categoryNames = { work: "Arbeid", purchase: "Innkjøp", transport: "Transport" };
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
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
    if (total > 0 && total < 60) return "<1 min";
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

  function handledCompletionText(text) {
    const value = String(text || "");
    return value === "En tidsregistrering er fortsatt åpen."
      || value === "Prosjektet er allerede koblet til en faktura."
      || value.includes("Kunden mangler e-postadresse")
      || value.includes("mangler kundepris")
      || value.includes("Fastpris er valgt")
      || value.includes("Timesats mangler");
  }

  function invoiceIssues(order, completionCheck) {
    const items = [];
    const customer = order.customerSnapshot || {};

    if (!String(customer.email || "").trim()) {
      items.push({
        key: "customer-email",
        tone: "warning",
        message: "Kunden mangler e-postadresse for elektronisk faktura.",
        action: order.customerId ? "email" : "",
        actionLabel: order.customerId ? "Legg inn e-post" : "",
      });
    }

    for (const entry of missingDescriptions(order)) {
      items.push({
        key: `description-${entry.entryId}`,
        tone: "warning",
        message: `Arbeidsøkt ${dateTime(entry.startedAt)}–${clock(entry.endedAt)} mangler beskrivelse av hva som ble gjort.`,
        action: "session",
        actionId: entry.entryId,
        actionLabel: "Legg inn beskrivelse",
      });
    }

    for (const material of (order.materials || []).filter((x) => x.billable !== false && x.unitPrice == null)) {
      items.push({
        key: `material-${material.entryId}`,
        tone: "warning",
        message: `Materialet «${material.item}» mangler kundepris.`,
        action: "registrations",
        actionLabel: "Sett kundepris",
      });
    }

    if (["fixed", "hybrid"].includes(order.pricingMode) && !(Number(order.fixedPrice) > 0)) {
      items.push({ key: "fixed-price", tone: "blocking", message: "Fastpris er valgt, men fastpris mangler.", action: "registrations", actionLabel: "Sett pris" });
    }
    if (order.pricingMode !== "fixed" && !(Number(order.hourlyRate) > 0)) {
      items.push({ key: "hourly-rate", tone: "blocking", message: "Timesats mangler.", action: "registrations", actionLabel: "Sett timesats" });
    }

    const generic = [
      ...(completionCheck?.blocking || []).map((message) => ({ message, tone: "blocking" })),
      ...(completionCheck?.warnings || []).map((message) => ({ message, tone: "warning" })),
    ].filter((item) => !handledCompletionText(item.message));

    generic.forEach((item, index) => items.push({ key: `generic-${index}`, ...item, action: "", actionLabel: "" }));
    return { items, count: items.length };
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
        const seconds = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.floor((end - start) / 1000) : 0;
        if (seconds > 0) pauses.push({ startedAt: pausedAt, endedAt: event.at, seconds });
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
        ${open
          ? '<button class="field-edit-session" type="button" disabled>Pause eller stopp økten før du redigerer</button>'
          : order.invoiceId
            ? '<p class="field-locked-note">Økten er låst fordi oppdraget er koblet til faktura.</p>'
            : order.status === "cancelled"
              ? '<p class="field-locked-note">Gjenåpne oppdraget før du endrer registreringer.</p>'
              : `<div class="field-entry-actions"><button class="field-edit-session" type="button" data-field-edit-session="${esc(entry.entryId)}">${missing ? "Legg inn hva eg gjorde" : "Rediger denne økten"}</button><button class="field-delete-entry" type="button" data-field-delete-registration="time" data-entry-id="${esc(entry.entryId)}" data-entry-label="${esc(entry.comment || "arbeidsøkten")}">Slett økt</button></div>`}
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
    const editable = typeof order.workflow?.canEditRegistrations === "boolean"
      ? order.workflow.canEditRegistrations
      : !order.invoiceId && order.status !== "cancelled";
    const actions = (kind, entryId, label) => editable
      ? `<div class="field-register-actions"><button type="button" data-field-registration-edit="${esc(kind)}" data-entry-id="${esc(entryId)}">Rediger</button><button type="button" class="field-delete-entry" data-field-delete-registration="${esc(kind)}" data-entry-id="${esc(entryId)}" data-entry-label="${esc(label)}">Slett</button></div>`
      : "";
    const rows = (items, mapper, empty) => items.length ? `<div class="field-register-list">${items.map(mapper).join("")}</div>` : `<p class="muted">${esc(empty)}</p>`;
    return `<div class="field-registration-groups">
      <section class="field-register-group"><h4>Utgifter · ${expenses.length}</h4>${rows(expenses, (x) => `<div class="field-register-row"><div><strong>${esc(x.item)}</strong><span>${esc(dateTime(x.occurredAt))}${x.supplier ? ` · ${esc(x.supplier)}` : ""}</span></div><span>${esc(money(x.amount))}</span>${actions("expense", x.entryId, x.item || "utgiften")}</div>`, "Ingen utgifter")}</section>
      <section class="field-register-group"><h4>Materialer · ${materials.length}</h4>${rows(materials, (x) => `<div class="field-register-row"><div><strong>${esc(x.item)}</strong><span>${esc(x.quantity)} ${esc(x.unit || "stk")}${x.comment ? ` · ${esc(x.comment)}` : ""}</span></div><span>${x.unitPrice == null ? "Pris mangler" : esc(money(Number(x.quantity) * Number(x.unitPrice)))}</span>${actions("material", x.entryId, x.item || "materialet")}</div>`, "Ingen materialer")}</section>
      <section class="field-register-group"><h4>Notater · ${notes.length}</h4>${rows(notes, (x) => `<div class="field-register-row"><div><strong>${esc(x.text)}</strong><span>${esc(dateTime(x.createdAt))}</span></div><span></span>${actions("note", x.entryId, "notatet")}</div>`, "Ingen løpende notater")}</section>
    </div>`;
  }

  function pricingLabel(order) {
    if (order.pricingMode === "fixed") return `Fastpris · ${money(order.fixedPrice)}`;
    if (order.pricingMode === "hybrid") return `Fastpris ${money(order.fixedPrice)} + ${money(order.hourlyRate)}/t`;
    return `${money(order.hourlyRate)} / time`;
  }

  function issueMarkup(issue, order) {
    const action = issue.action === "email"
      ? `<button type="button" class="field-issue-action" data-field-fix-email>${esc(issue.actionLabel)}</button>`
      : issue.action === "session"
        ? `<button type="button" class="field-issue-action" data-field-edit-session="${esc(issue.actionId)}">${esc(issue.actionLabel)}</button>`
        : issue.action === "registrations"
          ? `<button type="button" class="field-issue-action" data-field-open-manager>${esc(issue.actionLabel)}</button>`
          : "";
    const emailForm = issue.action === "email" && order.customerId
      ? `<form class="field-inline-task" data-field-email-form hidden><label>E-postadresse<input name="email" type="email" autocomplete="email" placeholder="kunde@epost.no" required></label><p class="field-inline-error" data-field-email-error></p><div><button type="button" class="secondary-btn" data-field-email-cancel>Avbryt</button><button type="submit" class="primary-btn">Lagre e-post</button></div></form>`
      : "";
    return `<li class="field-issue ${issue.tone === "blocking" ? "blocking" : ""}" data-field-issue="${esc(issue.key)}"><div class="field-issue-row"><span>${esc(issue.message)}</span>${action}</div>${emailForm}</li>`;
  }

  function addMenuMarkup(order) {
    const canAdd = typeof order.workflow?.canAddRegistrations === "boolean"
      ? order.workflow.canAddRegistrations
      : order.status !== "cancelled" && !order.invoiceId;
    if (!canAdd) return "";
    return `<div class="field-action-row">
      <button type="button" class="field-add-main" data-field-add-toggle aria-expanded="false">+ Legg til registrering</button>
      ${order.customerId ? `<a class="field-secondary-action" href="kunde.html?id=${encodeURIComponent(order.customerId)}">Kundeinfo</a>` : ""}
      <div class="field-add-backdrop" data-field-add-backdrop hidden></div>
      <section class="field-add-menu" data-field-add-menu hidden role="dialog" aria-modal="true" aria-label="Legg til på oppdrag">
        <div class="field-add-head"><div><span>Legg til på oppdrag</span><strong>Hva vil du registrere?</strong></div><button type="button" data-field-add-close aria-label="Lukk">×</button></div>
        <div class="field-add-grid">
          <button type="button" class="field-add-option" data-field-add-time><span class="field-add-icon">◷</span><strong>Tid / arbeid</strong><small>Arbeidstid og hva du gjorde</small></button>
          <button type="button" class="field-add-option" data-entry="expense" data-id="${esc(order._id)}"><span class="field-add-icon">kr</span><strong>Utgift</strong><small>Kjøp og andre kostnader</small></button>
          <button type="button" class="field-add-option" data-entry="material" data-id="${esc(order._id)}"><span class="field-add-icon">▣</span><strong>Materiale</strong><small>Materiale kjøpt til oppdraget</small></button>
          <button type="button" class="field-add-option" data-entry="note" data-id="${esc(order._id)}"><span class="field-add-icon">✎</span><strong>Notat</strong><small>Husk noe om arbeidet</small></button>
        </div>
      </section>
    </div>`;
  }

  function workflowMarkup(order) {
    const workflow = order.workflow || {};
    const status = workflow.status || order.status;
    if (status === "cancelled") {
      return `<section class="field-status-workflow is-cancelled"><div><strong>Oppdraget er avbrutt</strong><span>Registreringene er bevart. Gjenåpne før du korrigerer, ferdigstiller eller fakturerer.</span></div><button type="button" data-field-recover-order>Gjenåpne for korrigering</button></section>`;
    }
    if (status !== "completed") return "";
    if (workflow.canOpenInvoice || order.invoiceId) {
      return `<section class="field-status-workflow is-invoiced"><div><strong>Oppdraget er koblet til faktura</strong><span>Registreringene er låst mot fakturagrunnlaget.</span></div><a href="faktura-detalj.html?id=${encodeURIComponent(order.invoiceId)}">Åpne faktura</a></section>`;
    }
    if (workflow.canCreateInvoice === false) return "";
    return `<section class="field-status-workflow is-completed"><div><strong>Ferdigstilt – klar for kontroll og faktura</strong><span>Du kan fortsatt korrigere tid, utgifter, materialer og notater før fakturaen opprettes.</span></div><a href="faktura-ny.html?workOrderId=${encodeURIComponent(order._id)}">Opprett faktura</a></section>`;
  }

  function closeAddMenu() {
    detail.querySelector("[data-field-add-menu]")?.setAttribute("hidden", "");
    detail.querySelector("[data-field-add-backdrop]")?.setAttribute("hidden", "");
    detail.querySelector("[data-field-add-toggle]")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("field-add-open");
  }

  function openAddMenu() {
    const menu = detail.querySelector("[data-field-add-menu]");
    const backdrop = detail.querySelector("[data-field-add-backdrop]");
    if (!menu || !backdrop) return;
    menu.removeAttribute("hidden");
    backdrop.removeAttribute("hidden");
    detail.querySelector("[data-field-add-toggle]")?.setAttribute("aria-expanded", "true");
    document.body.classList.add("field-add-open");
  }

  function render(order, completionCheck) {
    closeAddMenu();
    currentOrder = order;
    currentCompletionCheck = completionCheck || {};
    const customer = order.customerSnapshot || {};
    const displayStatus = order.workflow?.status || order.status;
    const issues = invoiceIssues(order, completionCheck);
    const missingPrice = (order.materials || []).some((x) => x.billable !== false && x.unitPrice == null);
    const contact = [customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Ingen kontaktinformasjon registrert";
    if (title) title.textContent = customer.name || "Oppdrag";

    detail.innerHTML = `<div class="field-workspace" data-field-workspace data-order-id="${esc(order._id)}">
      <section class="field-hero">
        <div class="field-hero-top"><div class="field-identity"><p class="field-kicker">Kundeoppdrag</p><h2>${esc(customer.name || "Ukjent kunde")}</h2><p class="field-service">${esc(order.serviceName)}</p></div><span class="field-status ${esc(displayStatus)}">${esc(statusNames[displayStatus] || displayStatus)}</span></div>
        <div class="field-metrics">
          <div class="field-metric"><span>Arbeidstid</span><strong data-field-total-time>${esc(durationText(totalSeconds(order)))}</strong><small>Alle registrerte økter</small></div>
          <div class="field-metric"><span>Pris hittil</span><strong data-field-total-price>${esc(money(projectedTotal(order)))}</strong><small>${missingPrice ? "Foreløpig – materiale mangler pris" : "Fakturerbart registrert"}</small></div>
          <div class="field-metric"><span>Fakturagrunnlag</span><strong>${issues.count ? `${issues.count} mangler` : "Klar ✓"}</strong><small>${issues.count ? "Trykk og ordne direkte" : "Alt viktig er registrert"}</small></div>
        </div>
        <button type="button" class="field-readiness${issues.count ? "" : " ready"}" data-field-readiness-jump><span class="field-readiness-icon">${issues.count ? "!" : "✓"}</span><span class="field-readiness-copy"><strong>${issues.count ? "Fakturagrunnlaget trenger kontroll" : "Fakturagrunnlaget ser bra ut"}</strong><span>${issues.count ? `${issues.count} ting kan ordnes herfra` : "Ingen manglende opplysninger funnet"}</span></span><span class="field-readiness-tail">›</span></button>
        ${workflowMarkup(order)}
        ${addMenuMarkup(order)}
      </section>

      <section class="field-section"><div class="field-section-head"><div><h3>Arbeidslogg</h3><p>Dato, klokkeslett, pauser og hva som ble gjort.</p></div></div><div class="field-log">${dailyLogMarkup(order)}</div></section>

      <details id="fieldReadiness" class="field-collapse" ${issues.count ? "open" : ""}><summary>Fakturakontroll <span>${issues.count ? `${issues.count} ting å ordne` : "Klar"}</span></summary><div class="field-collapse-body">${issues.count ? `<ul class="field-issue-list">${issues.items.map((issue) => issueMarkup(issue, order)).join("")}</ul>` : '<p class="field-clear-note">Kunden, prisgrunnlaget og registreringene har opplysningene systemet krever akkurat nå.</p>'}</div></details>

      <details id="fieldProjectInfo" class="field-collapse"><summary>Kunde og prosjektinfo <span>${esc(pricingLabel(order))}</span></summary><div class="field-collapse-body"><div class="field-info-grid"><div><span>Kunde</span><strong>${esc(customer.name || "–")}</strong></div><div><span>Kontakt</span><strong>${esc(contact)}</strong></div><div><span>Oppdrag</span><strong>${esc(order.serviceName)}</strong></div><div><span>Oppdragsdato</span><strong>${esc(order.jobDate || "–")}</strong></div><div><span>Pris</span><strong>${esc(pricingLabel(order))}</strong></div><div><span>Kilde</span><strong>${esc(order.customerSourceType || "Manuell")}${order.sourceRefNumber ? ` · #${esc(order.sourceRefNumber)}` : ""}</strong></div></div></div></details>

      <details class="field-collapse"><summary>Utgifter, materialer og notater <span>${(order.additionalCosts || []).length + (order.materials || []).length + (order.projectNotes || []).length} registreringer</span></summary><div class="field-collapse-body">${registrationsMarkup(order)}</div></details>

      <details class="field-collapse field-notes"><summary>Prosjektbeskrivelse <span>${order.notes ? "Registrert" : "Tom"}</span></summary><div class="field-collapse-body"><textarea id="detailNotes" maxlength="5000" placeholder="Avtaler, omfang eller annen viktig prosjektinfo">${esc(order.notes || "")}</textarea><button id="saveDetailNotes" type="button" class="secondary-btn">Lagre prosjektbeskrivelse</button></div></details>

      ${currentControls && !["completed", "cancelled"].includes(displayStatus) ? `<div class="field-work-controls">${currentControls}</div>` : ""}
    </div>`;
  }

  function orderIdFromLegacy() {
    return detail.querySelector("[data-work-action][data-id]")?.dataset.id
      || detail.querySelector("[data-entry][data-id]")?.dataset.id
      || lastOpenedOrderId
      || "";
  }

  function captureLegacyActions() {
    const controlParent = [...detail.querySelectorAll(".detail-controls")].find((node) => node.querySelector("[data-work-action]"));
    currentControls = controlParent ? [...controlParent.children].map((x) => x.outerHTML).join("") : "";
  }

  async function refreshWorkspace(orderId = currentOrder?._id) {
    if (!orderId) return;
    const orderData = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
    const order = orderData.workOrder;
    let completionCheck = {};
    if (order?.status !== "cancelled") {
      try {
        const checkData = await api(`/admin/work-orders/${encodeURIComponent(orderId)}/completion-check`);
        completionCheck = checkData.completionCheck || {};
      } catch (error) {
        console.warn("Kunne ikke hente fakturakontroll:", error.message);
      }
    }
    render(order, completionCheck);
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
      await refreshWorkspace(id);
    } catch (error) {
      console.warn("Kunne ikke bygge feltvisning:", error.message);
    } finally {
      enhancing = false;
    }
  }

  function openSessionEditor(entryId) {
    if (!currentOrder) return;
    const entry = (currentOrder.workIntervals || []).find((x) => x.entryId === entryId);
    if (!entry) return;
    if (window.SorgulenOperations?.openManualTime) {
      closeAddMenu();
      window.SorgulenOperations.openManualTime({ orderId: currentOrder._id, entry, rate: currentOrder.hourlyRate });
    } else {
      alert("Tidsredigering er ikke klar ennå. Oppdater siden og prøv igjen.");
    }
  }

  async function openRegistration(kind, entryId) {
    if (!currentOrder || !kind || !entryId) return;
    if (!window.SorgulenOperations?.openRegistration) {
      alert("Redigering er ikke klar ennå. Oppdater siden og prøv igjen.");
      return;
    }
    try {
      closeAddMenu();
      await window.SorgulenOperations.openRegistration({ orderId: currentOrder._id, kind, entryId });
    } catch (error) {
      alert(error?.message || "Kunne ikke åpne registreringen.");
    }
  }

  function registrationEndpoint(kind) {
    return ({ time: "time", expense: "expenses", material: "materials", note: "notes" })[kind] || "";
  }

  async function deleteRegistration(kind, entryId, label) {
    if (!currentOrder || currentOrder.invoiceId || currentOrder.status === "cancelled") return;
    const endpoint = registrationEndpoint(kind);
    if (!endpoint || !entryId) return;
    if (!confirm(`Slette ${label || "registreringen"}? Denne endringen lagres med en gang.`)) return;
    try {
      await api(`/admin/operations/work-orders/${encodeURIComponent(currentOrder._id)}/${endpoint}/${encodeURIComponent(entryId)}`, { method: "DELETE" });
      await refreshWorkspace(currentOrder._id);
      await window.SorgulenAdminShell?.refreshBadges?.();
    } catch (error) {
      alert(error?.message || "Kunne ikke slette registreringen.");
    }
  }

  document.addEventListener("click", (event) => {
    const opener = event.target.closest(".open-job-detail[data-id]");
    if (opener?.dataset.id) lastOpenedOrderId = opener.dataset.id;
  }, true);

  document.addEventListener("click", async (event) => {
    const recover = event.target.closest("[data-field-recover-order]");
    if (recover && currentOrder?.status === "cancelled") {
      event.preventDefault();
      recover.disabled = true;
      recover.textContent = "Gjenåpner…";
      try {
        await api(`/admin/work-orders/${encodeURIComponent(currentOrder._id)}/recover`, { method: "POST", body: JSON.stringify({}) });
        lastOpenedOrderId = currentOrder._id;
        await refreshWorkspace(currentOrder._id);
      } catch (error) {
        alert(error?.message || "Kunne ikke gjenåpne oppdraget.");
        recover.disabled = false;
        recover.textContent = "Gjenåpne for korrigering";
      }
      return;
    }

    const registrationEdit = event.target.closest("[data-field-registration-edit][data-entry-id]");
    if (registrationEdit) {
      event.preventDefault();
      await openRegistration(registrationEdit.dataset.fieldRegistrationEdit, registrationEdit.dataset.entryId);
      return;
    }

    const registrationDelete = event.target.closest("[data-field-delete-registration][data-entry-id]");
    if (registrationDelete) {
      event.preventDefault();
      await deleteRegistration(
        registrationDelete.dataset.fieldDeleteRegistration,
        registrationDelete.dataset.entryId,
        registrationDelete.dataset.entryLabel
      );
      return;
    }

    const toggle = event.target.closest("[data-field-add-toggle]");
    if (toggle) {
      if (detail.querySelector("[data-field-add-menu]")?.hasAttribute("hidden")) openAddMenu();
      else closeAddMenu();
      return;
    }
    if (event.target.closest("[data-field-add-close], [data-field-add-backdrop]")) {
      closeAddMenu();
      return;
    }
    const addTime = event.target.closest("[data-field-add-time]");
    if (addTime && currentOrder) {
      event.preventDefault();
      closeAddMenu();
      window.SorgulenOperations?.openManualTime?.({ orderId: currentOrder._id, rate: currentOrder.hourlyRate });
      return;
    }
    if (event.target.closest("[data-field-add-menu] [data-entry]")) closeAddMenu();

    const readiness = event.target.closest("[data-field-readiness-jump]");
    if (readiness) {
      const target = document.getElementById("fieldReadiness");
      if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); }
      return;
    }

    const edit = event.target.closest("[data-field-edit-session]");
    if (edit) {
      openSessionEditor(edit.dataset.fieldEditSession);
      return;
    }

    const emailButton = event.target.closest("[data-field-fix-email]");
    if (emailButton) {
      const issue = emailButton.closest("[data-field-issue]");
      const form = issue?.querySelector("[data-field-email-form]");
      if (form) {
        form.hidden = false;
        emailButton.hidden = true;
        form.elements.email.focus();
      }
      return;
    }

    const emailCancel = event.target.closest("[data-field-email-cancel]");
    if (emailCancel) {
      const issue = emailCancel.closest("[data-field-issue]");
      const form = issue?.querySelector("[data-field-email-form]");
      const button = issue?.querySelector("[data-field-fix-email]");
      if (form) form.hidden = true;
      if (button) button.hidden = false;
      return;
    }

    const manager = event.target.closest("[data-field-open-manager]");
    if (manager && currentOrder) {
      window.SorgulenOperations?.openManager?.(currentOrder._id);
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-field-email-form]");
    if (!form || !currentOrder?.customerId) return;
    event.preventDefault();
    const email = String(new FormData(form).get("email") || "").trim();
    const error = form.querySelector("[data-field-email-error]");
    const save = form.querySelector('button[type="submit"]');
    if (error) error.textContent = "";
    if (!email) {
      if (error) error.textContent = "Skriv inn e-postadressen.";
      return;
    }
    save.disabled = true;
    try {
      await api(`/admin/customers/${encodeURIComponent(currentOrder.customerId)}`, { method: "PATCH", body: JSON.stringify({ email }) });
      await refreshWorkspace(currentOrder._id);
    } catch (err) {
      if (error) error.textContent = err.message;
    } finally {
      save.disabled = false;
    }
  });

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
