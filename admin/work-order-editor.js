(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  const statusMessage = document.getElementById("statusMessage");
  if (!detail) return;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const id = () => globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function dateValue(value) {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function intervalSeconds(entry) {
    const explicit = Number(entry?.durationSeconds);
    if (entry?.source === "manual" && explicit > 0) return Math.floor(explicit);
    const start = new Date(entry?.startedAt).getTime();
    const end = entry?.endedAt ? new Date(entry.endedAt).getTime() : Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : 0;
  }

  function durationText(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours && minutes) return `${hours} t ${minutes} min`;
    if (hours) return `${hours} t`;
    if (total > 0 && total < 60) return "<1 min";
    return `${minutes} min`;
  }

  function setPageMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message ${message ? type : ""}`.trim();
  }

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
    if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
    return data;
  }

  async function getOrder(orderId) {
    const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
    return data.workOrder;
  }

  const modal = document.createElement("div");
  modal.className = "operation-modal";
  modal.hidden = true;
  modal.innerHTML = '<div class="operation-sheet" id="workOrderEditorSheet"></div>';
  document.body.appendChild(modal);
  const sheet = modal.querySelector("#workOrderEditorSheet");

  function closeModal() {
    modal.hidden = true;
    sheet.innerHTML = "";
    document.body.classList.remove("work-order-editor-open");
  }

  function showModal(title, subtitle, body, wide = false) {
    modal.hidden = false;
    document.body.classList.add("work-order-editor-open");
    sheet.className = `operation-sheet${wide ? " operation-sheet-wide" : ""}`;
    sheet.innerHTML = `<div class="operation-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button type="button" class="admin-icon-button" data-editor-close aria-label="Lukk">×</button></div>${body}`;
    sheet.querySelector("[data-editor-close]")?.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

  function actionButtons(kind, editing) {
    const label = kind === "time" ? "økt" : kind === "expense" ? "utgift" : kind === "material" ? "materiale" : "notat";
    return `<div class="operation-actions">${editing ? `<button type="button" class="danger-btn" data-editor-delete>Slett ${label}</button>` : ""}<button type="button" class="secondary-btn" data-editor-cancel>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div>`;
  }

  function timeForm(order, entry = null) {
    const seconds = entry ? intervalSeconds(entry) : 3600;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rate = Number(entry?.hourlyRateSnapshot ?? order.hourlyRate ?? 650) || 650;
    return `<form data-editor-form="time" data-order-id="${esc(order._id)}" data-entry-id="${esc(entry?.entryId || "")}">
      <div class="operation-grid">
        <div class="operation-field"><label>Dato</label><input name="workDate" type="date" value="${esc(entry?.workDate || dateValue(entry?.startedAt) || order.jobDate || today())}" required></div>
        <div class="operation-field"><label>Type</label><select name="category"><option value="work" ${!entry || entry.category === "work" ? "selected" : ""}>Arbeid</option><option value="purchase" ${entry?.category === "purchase" ? "selected" : ""}>Innkjøp</option><option value="transport" ${entry?.category === "transport" ? "selected" : ""}>Transport</option></select></div>
        <div class="operation-field wide"><label>Hva gjorde du?</label><input name="description" maxlength="1000" value="${esc(entry?.comment || "")}" required></div>
        <div class="operation-field"><label>Timer</label><input name="hours" type="number" min="0" max="168" step="1" value="${hours}"></div>
        <div class="operation-field"><label>Minutter</label><input name="minutes" type="number" min="0" max="59" step="1" value="${minutes}"></div>
        <div class="operation-field"><label>Timesats</label><input name="hourlyRate" type="number" min="0.01" max="100000" step="0.01" value="${esc(rate)}" required></div>
        <label class="operation-check"><input name="billable" type="checkbox" ${entry?.billable === false ? "" : "checked"}> Fakturerbar</label>
      </div><p class="operation-error" data-editor-error></p>${actionButtons("time", Boolean(entry))}</form>`;
  }

  function expenseForm(order, entry = null) {
    return `<form data-editor-form="expense" data-order-id="${esc(order._id)}" data-entry-id="${esc(entry?.entryId || "")}">
      <div class="operation-grid">
        <div class="operation-field wide"><label>Beskrivelse</label><input name="description" maxlength="500" value="${esc(entry?.item || "")}" required></div>
        <div class="operation-field"><label>Beløp</label><input name="amount" type="number" min="0.01" max="1000000" step="0.01" value="${esc(entry?.amount ?? "")}" required></div>
        <div class="operation-field"><label>Leverandør</label><input name="supplier" maxlength="160" value="${esc(entry?.supplier || "")}"></div>
        <div class="operation-field"><label>Dato</label><input name="occurredAt" type="date" value="${esc(dateValue(entry?.occurredAt) || order.jobDate || today())}" required></div>
        <label class="operation-check"><input name="billable" type="checkbox" ${entry?.billable === false ? "" : "checked"}> Fakturerbar</label>
      </div><p class="operation-error" data-editor-error></p>${actionButtons("expense", Boolean(entry))}</form>`;
  }

  function materialForm(order, entry = null) {
    return `<form data-editor-form="material" data-order-id="${esc(order._id)}" data-entry-id="${esc(entry?.entryId || "")}">
      <div class="operation-grid">
        <div class="operation-field wide"><label>Materiale</label><input name="item" maxlength="300" value="${esc(entry?.item || "")}" required></div>
        <div class="operation-field"><label>Antall</label><input name="quantity" type="number" min="0.01" max="100000" step="0.01" value="${esc(entry?.quantity ?? 1)}" required></div>
        <div class="operation-field"><label>Enhet</label><input name="unit" maxlength="40" value="${esc(entry?.unit || "stk")}"></div>
        <div class="operation-field"><label>Innkjøpspris / enhet</label><input name="purchaseUnitPrice" type="number" min="0" max="1000000" step="0.01" value="${esc(entry?.purchaseUnitPrice ?? "")}"></div>
        <div class="operation-field"><label>Kundepris / enhet</label><input name="unitPrice" type="number" min="0" max="1000000" step="0.01" value="${esc(entry?.unitPrice ?? "")}"></div>
        <div class="operation-field wide"><label>Kommentar</label><input name="comment" maxlength="500" value="${esc(entry?.comment || "")}"></div>
        <label class="operation-check"><input name="billable" type="checkbox" ${entry?.billable === false ? "" : "checked"}> Fakturerbar</label>
      </div><p class="operation-error" data-editor-error></p>${actionButtons("material", Boolean(entry))}</form>`;
  }

  function noteForm(order, entry = null) {
    return `<form data-editor-form="note" data-order-id="${esc(order._id)}" data-entry-id="${esc(entry?.entryId || "")}">
      <div class="operation-field"><label>Notat</label><textarea name="text" maxlength="2000" rows="6" required>${esc(entry?.text || "")}</textarea></div>
      <p class="operation-error" data-editor-error></p>${actionButtons("note", Boolean(entry))}</form>`;
  }

  function endpointFor(kind, orderId, entryId = "") {
    if (!entryId) {
      if (kind === "time") return `/admin/operations/work-orders/${encodeURIComponent(orderId)}/time`;
      const plural = kind === "expense" ? "expenses" : kind === "material" ? "materials" : "notes";
      return `/admin/work-orders/${encodeURIComponent(orderId)}/${plural}`;
    }
    const part = kind === "time" ? "time" : kind === "expense" ? "expenses" : kind === "material" ? "materials" : "notes";
    return `/admin/operations/work-orders/${encodeURIComponent(orderId)}/${part}/${encodeURIComponent(entryId)}`;
  }

  function payloadFor(form, kind, editing) {
    const raw = Object.fromEntries(new FormData(form).entries());
    if (kind !== "note") raw.billable = form.elements.billable.checked;
    if (!editing) raw.operationId = id();
    if (kind === "time") {
      const durationMinutes = Math.max(0, Number(raw.hours) || 0) * 60 + Math.max(0, Number(raw.minutes) || 0);
      if (!(durationMinutes > 0)) throw new Error("Varighet må være minst 1 minutt.");
      return { workDate: raw.workDate, description: raw.description.trim(), durationMinutes, category: raw.category, hourlyRate: Number(raw.hourlyRate), billable: raw.billable, ...(!editing ? { operationId: raw.operationId } : {}) };
    }
    if (kind === "expense") return { description: raw.description.trim(), amount: Number(raw.amount), supplier: raw.supplier.trim(), occurredAt: `${raw.occurredAt}T12:00:00.000Z`, billable: raw.billable, ...(!editing ? { operationId: raw.operationId } : {}) };
    if (kind === "material") return { item: raw.item.trim(), quantity: Number(raw.quantity), unit: raw.unit.trim() || "stk", purchaseUnitPrice: raw.purchaseUnitPrice === "" ? null : Number(raw.purchaseUnitPrice), unitPrice: raw.unitPrice === "" ? null : Number(raw.unitPrice), comment: raw.comment.trim(), billable: raw.billable, ...(!editing ? { operationId: raw.operationId } : {}) };
    return { text: raw.text.trim(), ...(!editing ? { operationId: raw.operationId } : {}) };
  }

  function collectionFor(order, kind) {
    if (kind === "time") return order.workIntervals || [];
    if (kind === "expense") return order.additionalCosts || [];
    if (kind === "material") return order.materials || [];
    return order.projectNotes || [];
  }

  function formFor(order, kind, entry) {
    if (kind === "time") return timeForm(order, entry);
    if (kind === "expense") return expenseForm(order, entry);
    if (kind === "material") return materialForm(order, entry);
    return noteForm(order, entry);
  }

  function titleFor(kind, editing) {
    if (kind === "time") return editing ? "Rediger arbeidsøkt" : "Legg til arbeid";
    if (kind === "expense") return editing ? "Rediger utgift" : "Legg til utgift";
    if (kind === "material") return editing ? "Rediger materiale" : "Legg til materiale";
    return editing ? "Rediger notat" : "Legg til notat";
  }

  async function openRegistration({ orderId, kind, entryId = "" }) {
    try {
      const order = await getOrder(orderId);
      const entry = entryId ? collectionFor(order, kind).find((item) => String(item.entryId) === String(entryId)) : null;
      if (entryId && !entry) throw new Error("Registreringen finnes ikke lenger. Oppdater siden og prøv igjen.");
      if (kind === "time" && entry && !entry.endedAt && entry.source !== "manual") throw new Error("Stopp eller pause takstameteret før økten redigeres.");
      showModal(titleFor(kind, Boolean(entry)), `${order.customerSnapshot?.name || "Kunde"} · ${order.serviceName}`, formFor(order, kind, entry));
      bindForm(sheet.querySelector("[data-editor-form]"), kind, Boolean(entry));
    } catch (error) {
      showModal("Kunne ikke åpne registreringen", "", `<p class="operation-error">${esc(error.message)}</p>`);
    }
  }

  function bindForm(form, kind, editing) {
    form.querySelector("[data-editor-cancel]")?.addEventListener("click", closeModal);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorNode = form.querySelector("[data-editor-error]");
      const save = form.querySelector('button[type="submit"]');
      errorNode.textContent = "";
      save.disabled = true;
      try {
        const payload = payloadFor(form, kind, editing);
        await api(endpointFor(kind, form.dataset.orderId, form.dataset.entryId), { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
        closeModal();
        await window.SorgulenAdminShell?.refreshBadges?.();
        location.href = `oppdrag.html?open=${encodeURIComponent(form.dataset.orderId)}&saved=registration`;
      } catch (error) {
        errorNode.textContent = error.message;
        save.disabled = false;
      }
    });
    form.querySelector("[data-editor-delete]")?.addEventListener("click", async (event) => {
      if (!confirm("Slette denne registreringen? Denne endringen lagres med en gang.")) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api(endpointFor(kind, form.dataset.orderId, form.dataset.entryId), { method: "DELETE" });
        closeModal();
        await window.SorgulenAdminShell?.refreshBadges?.();
        location.href = `oppdrag.html?open=${encodeURIComponent(form.dataset.orderId)}&saved=deleted`;
      } catch (error) {
        form.querySelector("[data-editor-error]").textContent = error.message;
        button.disabled = false;
      }
    });
  }

  async function openManager(orderId) {
    try {
      const order = await getOrder(orderId);
      const row = (kind, entry, title, meta) => `<button type="button" class="operations-entry work-order-editor-row" data-editor-open-kind="${kind}" data-editor-open-id="${esc(entry.entryId)}" data-editor-order-id="${esc(orderId)}"><span class="operations-entry-main"><strong>${esc(title)}</strong><span>${esc(meta)}</span></span><span aria-hidden="true">›</span></button>`;
      const time = (order.workIntervals || []).map((entry) => row("time", entry, entry.comment || "Arbeidsøkt", `${dateValue(entry.startedAt)} · ${durationText(intervalSeconds(entry))}`)).join("");
      const expenses = (order.additionalCosts || []).map((entry) => row("expense", entry, entry.item, money(entry.amount))).join("");
      const materials = (order.materials || []).map((entry) => row("material", entry, entry.item, `${entry.quantity} ${entry.unit || "stk"}${entry.unitPrice == null ? " · pris mangler" : ` · ${money(Number(entry.quantity) * Number(entry.unitPrice))}`}`)).join("");
      const notes = (order.projectNotes || []).map((entry) => row("note", entry, entry.text, dateValue(entry.createdAt))).join("");
      showModal("Registreringer", `${order.customerSnapshot?.name || "Kunde"} · ${order.serviceName}`, `<div class="work-order-editor-manager"><div class="work-order-editor-add"><button type="button" class="primary-btn" data-editor-add-kind="time">+ Tid</button><button type="button" class="secondary-btn" data-editor-add-kind="expense">+ Utgift</button><button type="button" class="secondary-btn" data-editor-add-kind="material">+ Materiale</button><button type="button" class="secondary-btn" data-editor-add-kind="note">+ Notat</button></div><section><h3>Tid</h3>${time || '<p class="muted">Ingen tid registrert.</p>'}</section><section><h3>Utgifter</h3>${expenses || '<p class="muted">Ingen utgifter.</p>'}</section><section><h3>Materialer</h3>${materials || '<p class="muted">Ingen materialer.</p>'}</section><section><h3>Notater</h3>${notes || '<p class="muted">Ingen notater.</p>'}</section></div>`, true);
      sheet.querySelectorAll("[data-editor-add-kind]").forEach((button) => button.addEventListener("click", () => openRegistration({ orderId, kind: button.dataset.editorAddKind })));
      sheet.querySelectorAll("[data-editor-open-kind]").forEach((button) => button.addEventListener("click", () => openRegistration({ orderId, kind: button.dataset.editorOpenKind, entryId: button.dataset.editorOpenId })));
    } catch (error) {
      showModal("Kunne ikke hente registreringene", "", `<p class="operation-error">${esc(error.message)}</p>`);
    }
  }

  function kindFromHeading(text) {
    const value = String(text || "").trim().toLowerCase();
    if (value.startsWith("utgifter")) return "expense";
    if (value.startsWith("materialer")) return "material";
    if (value.startsWith("notater")) return "note";
    return "";
  }

  const decorating = new Map();
  async function decorateWorkspace(workspace) {
    const orderId = workspace?.dataset.orderId || "";
    if (!orderId || decorating.has(orderId)) return;
    decorating.set(orderId, true);
    try {
      const order = await getOrder(orderId);
      for (const group of workspace.querySelectorAll(".field-register-group")) {
        const kind = kindFromHeading(group.querySelector("h4")?.textContent);
        if (!kind) continue;
        const entries = collectionFor(order, kind);
        [...group.querySelectorAll(".field-register-row")].forEach((row, index) => {
          const entry = entries[index];
          if (!entry?.entryId) return;
          row.dataset.fieldRegistrationEdit = "true";
          row.dataset.fieldRegistrationKind = kind;
          row.dataset.entryId = entry.entryId;
          row.tabIndex = 0;
          row.setAttribute("role", "button");
          row.setAttribute("aria-label", `Rediger ${kind === "expense" ? "utgift" : kind === "material" ? "materiale" : "notat"}`);
        });
      }
      applyWorkflow(workspace, order);
    } catch (_) {
      // Feltvisningen skal fortsatt fungere selv om ekstra redigeringsdata ikke kan hentes.
    } finally {
      decorating.delete(orderId);
    }
  }

  const statusLabels = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdigstilt", cancelled: "Avbrutt" };
  function workflowButton(action, orderId, label, primary = false) {
    return `<button type="button" class="${primary ? "primary-btn" : "secondary-btn"}" data-editor-workflow-action="${esc(action)}" data-order-id="${esc(orderId)}">${esc(label)}</button>`;
  }

  function applyWorkflow(workspace, order) {
    const workflow = order.workflow || { status: order.status, rawStatus: order.status };
    const displayStatus = workflow.status || order.status;
    const chip = workspace.querySelector(".field-status");
    if (chip) {
      chip.className = `field-status ${esc(displayStatus)}`;
      chip.textContent = statusLabels[displayStatus] || displayStatus;
    }

    let controls = workspace.querySelector(".field-work-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "field-work-controls";
      workspace.appendChild(controls);
    }
    controls.dataset.workflowOwned = "true";
    const orderId = order._id;
    let html = "";
    if (displayStatus === "active") {
      html = `${workflowButton("pause", orderId, "Pause")}${workflowButton("stop", orderId, "Stopp arbeid", true)}`;
    } else if (displayStatus === "paused") {
      html = `${workflowButton("resume", orderId, "Fortsett arbeid", true)}${workflowButton("stop", orderId, "Avslutt økt")}`;
    } else if (displayStatus === "stopped") {
      const continueAction = workflow.rawStatus === "planned" ? "start" : "resume";
      html = `${workflowButton("complete", orderId, "Ferdigstill oppdrag", true)}${workflowButton(continueAction, orderId, "Fortsett arbeid")}${workflowButton("cancel", orderId, "Forkast")}`;
    } else if (displayStatus === "planned") {
      html = `${workflowButton("start", orderId, "Start arbeid", true)}${workflowButton("cancel", orderId, "Forkast")}`;
    } else if (displayStatus === "completed" && !order.invoiceId) {
      html = `<a class="primary-btn work-order-invoice-action" href="faktura-ny.html?workOrderId=${encodeURIComponent(orderId)}">Opprett faktura</a>`;
    } else if (displayStatus === "completed" && order.invoiceId) {
      html = `<a class="primary-btn work-order-invoice-action" href="faktura-detalj.html?id=${encodeURIComponent(order.invoiceId)}">Åpne faktura</a>`;
    }
    controls.innerHTML = html;
  }

  async function runWorkflow(button) {
    const orderId = button.dataset.orderId || "";
    const action = button.dataset.editorWorkflowAction || "";
    if (!orderId || !action) return;
    if (action === "cancel" && !confirm("Forkaste oppdraget? Registrert historikk beholdes, men oppdraget markeres som avbrutt.")) return;
    if (action === "stop" && !confirm("Stoppe den aktive arbeidsøkten?")) return;

    button.disabled = true;
    try {
      if (action === "complete") {
        const check = await api(`/admin/work-orders/${encodeURIComponent(orderId)}/completion-check`);
        const blocking = check.completionCheck?.blocking || [];
        const warnings = check.completionCheck?.warnings || [];
        if (blocking.length) {
          setPageMessage(blocking.join(" "), "error");
          const readiness = detail.querySelector("#fieldReadiness");
          if (readiness) { readiness.open = true; readiness.scrollIntoView({ behavior: "smooth", block: "center" }); }
          button.disabled = false;
          return;
        }
        if (warnings.length && !confirm(`Ferdigstille oppdraget?\n\nKontroller først:\n• ${warnings.join("\n• ")}\n\nDu kan rette dette før fakturaen sendes.`)) { button.disabled = false; return; }
        await api(`/admin/work-orders/${encodeURIComponent(orderId)}/action`, { method: "POST", body: JSON.stringify({ action: "complete", confirmWarnings: true }) });
        location.href = `faktura-ny.html?workOrderId=${encodeURIComponent(orderId)}`;
        return;
      }
      await api(`/admin/work-orders/${encodeURIComponent(orderId)}/action`, { method: "POST", body: JSON.stringify({ action }) });
      location.href = `oppdrag.html?open=${encodeURIComponent(orderId)}&action=${encodeURIComponent(action)}`;
    } catch (error) {
      setPageMessage(error.message, "error");
      button.disabled = false;
    }
  }

  document.addEventListener("click", (event) => {
    const entryButton = event.target.closest("[data-entry]");
    if (entryButton && entryButton.dataset.id && ["time", "expense", "material", "note"].includes(entryButton.dataset.entry)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openRegistration({ orderId: entryButton.dataset.id, kind: entryButton.dataset.entry });
      return;
    }
    const sessionButton = event.target.closest("[data-field-edit-session]");
    if (sessionButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const workspace = sessionButton.closest("[data-field-workspace]");
      openRegistration({ orderId: workspace?.dataset.orderId || "", kind: "time", entryId: sessionButton.dataset.fieldEditSession });
      return;
    }
    const registrationRow = event.target.closest("[data-field-registration-edit]");
    if (registrationRow) {
      event.preventDefault();
      openRegistration({ orderId: registrationRow.closest("[data-field-workspace]")?.dataset.orderId || "", kind: registrationRow.dataset.fieldRegistrationKind, entryId: registrationRow.dataset.entryId });
      return;
    }
    const workflowAction = event.target.closest("[data-editor-workflow-action]");
    if (workflowAction) { event.preventDefault(); event.stopImmediatePropagation(); runWorkflow(workflowAction); }
  }, true);

  document.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-field-registration-edit]");
    if (!row || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openRegistration({ orderId: row.closest("[data-field-workspace]")?.dataset.orderId || "", kind: row.dataset.fieldRegistrationKind, entryId: row.dataset.entryId });
  });

  const observer = new MutationObserver(() => {
    const workspace = detail.querySelector("[data-field-workspace]");
    if (workspace) window.setTimeout(() => decorateWorkspace(workspace), 0);
  });
  observer.observe(detail, { childList: true, subtree: true });
  const initial = detail.querySelector("[data-field-workspace]");
  if (initial) decorateWorkspace(initial);

  window.SorgulenOperations = {
    api,
    openManager,
    openRegistration,
    openManualTime: ({ orderId, entry = null } = {}) => openRegistration({ orderId, kind: "time", entryId: entry?.entryId || "" }),
    refreshBadges: () => window.SorgulenAdminShell?.refreshBadges?.(),
  };
})();
