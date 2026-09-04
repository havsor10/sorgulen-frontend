(() => {
  "use strict";

  function boot() {
    if (window.SorgulenOperations) return;
    const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
    const KEY = "sorgulen_admin_key";
    const state = { modalMode: null, currentOrderId: new URLSearchParams(location.search).get("open") || null, currentOrder: null };

    const esc = (value) => String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    const money = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
    const dateValue = (value) => {
      if (!value) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 10);
    };
    const today = () => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const get = (type) => parts.find((part) => part.type === type)?.value || "";
      return `${get("year")}-${get("month")}-${get("day")}`;
    };
    const intervalSeconds = (entry) => {
      const explicit = Number(entry?.durationSeconds);
      if (entry?.source === "manual" && explicit > 0) return explicit;
      const start = new Date(entry?.startedAt).getTime();
      const end = entry?.endedAt ? new Date(entry.endedAt).getTime() : Date.now();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : 0;
    };
    const durationText = (seconds) => {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      if (hours && minutes) return `${hours} t ${minutes} min`;
      if (hours) return `${hours} t`;
      return `${minutes} min`;
    };
    const categoryName = (value) => value === "purchase" ? "Innkjøp" : value === "transport" ? "Transport" : "Arbeid";

    async function api(path, options = {}) {
      const response = await fetch(`${API}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...(options.headers || {}) },
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

    const modal = document.createElement("div");
    modal.className = "operation-modal";
    modal.hidden = true;
    modal.innerHTML = '<div class="operation-sheet" id="operationSheet"></div>';
    document.body.appendChild(modal);
    const sheet = modal.querySelector("#operationSheet");

    function closeModal() {
      modal.hidden = true;
      state.modalMode = null;
      state.currentOrder = null;
      document.body.classList.remove("modal-open");
      sheet.onclick = null;
      sheet.innerHTML = "";
    }
    modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeModal(); });

    function showModal({ title, subtitle = "", wide = false, body = "" }) {
      modal.hidden = false;
      document.body.classList.add("modal-open");
      sheet.onclick = null;
      sheet.className = `operation-sheet${wide ? " operation-sheet-wide" : ""}`;
      sheet.innerHTML = `<div class="operation-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button type="button" class="admin-icon-button" data-operation-close aria-label="Lukk">×</button></div>${body}`;
      sheet.querySelector("[data-operation-close]").addEventListener("click", closeModal);
    }

    async function getOrder(orderId) {
      const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      return data.workOrder;
    }

    function timeFormMarkup({ orderId = "", customerId = "", entry = null, rate = 850 } = {}) {
      const seconds = entry ? intervalSeconds(entry) : 0;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const workDate = entry?.workDate || dateValue(entry?.startedAt) || today();
      const selectedRate = Number(entry?.hourlyRateSnapshot ?? rate ?? 850) || 850;
      return `<form id="operationTimeForm" data-order-id="${esc(orderId)}" data-customer-id="${esc(customerId)}" data-entry-id="${esc(entry?.entryId || "")}">
        <div class="operation-grid">
          <div class="operation-field"><label for="opWorkDate">Dato</label><input id="opWorkDate" name="workDate" type="date" value="${esc(workDate)}" required></div>
          <div class="operation-field"><label for="opCategory">Type</label><select id="opCategory" name="category"><option value="work" ${entry?.category === "work" || !entry ? "selected" : ""}>Arbeid</option><option value="purchase" ${entry?.category === "purchase" ? "selected" : ""}>Innkjøp</option><option value="transport" ${entry?.category === "transport" ? "selected" : ""}>Transport</option></select></div>
          <div class="operation-field wide"><label for="opDescription">Hva gjorde du?</label><input id="opDescription" name="description" maxlength="1000" value="${esc(entry?.comment || "")}" placeholder="For eksempel hentet og monterte deler" required></div>
          <div class="operation-field wide"><span class="operation-label">Varighet</span><div class="operation-duration"><label class="operation-field">Timer<input id="opHours" name="hours" type="number" inputmode="numeric" min="0" max="168" step="1" value="${hours}"></label><label class="operation-field">Minutter<input id="opMinutes" name="minutes" type="number" inputmode="numeric" min="0" max="59" step="1" value="${minutes || (!entry ? 20 : 0)}"></label></div></div>
          <div class="operation-field"><label for="opRate">Timesats</label><input id="opRate" name="hourlyRate" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01" value="${esc(selectedRate)}" required></div>
          <label class="operation-check"><input id="opBillable" name="billable" type="checkbox" ${entry?.billable === false ? "" : "checked"}> Fakturerbar</label>
          <div class="operation-preview"><span>Beregnet beløp</span><strong id="operationAmount">0 kr</strong></div>
        </div>
        <p id="operationError" class="operation-error" role="alert"></p>
        <div class="operation-actions"><button type="button" class="secondary-btn" data-operation-close-2>Avbryt</button><button id="operationSaveTime" type="submit" class="primary-btn">Lagre</button></div>
      </form>`;
    }

    function bindTimeForm({ orderId = "", customerId = "", entry = null }) {
      const form = sheet.querySelector("#operationTimeForm");
      sheet.querySelector("[data-operation-close-2]").addEventListener("click", closeModal);
      const preview = () => {
        const hours = Math.max(0, Number(form.elements.hours.value) || 0);
        const minutes = Math.max(0, Number(form.elements.minutes.value) || 0);
        const rate = Math.max(0, Number(form.elements.hourlyRate.value) || 0);
        sheet.querySelector("#operationAmount").textContent = money(((hours * 60 + minutes) / 60) * rate);
      };
      ["hours", "minutes", "hourlyRate"].forEach((name) => form.elements[name].addEventListener("input", preview));
      preview();
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const error = sheet.querySelector("#operationError");
        const save = sheet.querySelector("#operationSaveTime");
        error.textContent = "";
        const hours = Math.max(0, Number(form.elements.hours.value) || 0);
        const minutes = Math.max(0, Number(form.elements.minutes.value) || 0);
        const durationMinutes = hours * 60 + minutes;
        if (!(durationMinutes > 0)) { error.textContent = "Varighet må være minst 1 minutt."; return; }
        const payload = {
          workDate: form.elements.workDate.value,
          description: form.elements.description.value.trim(),
          durationMinutes,
          category: form.elements.category.value,
          hourlyRate: Number(form.elements.hourlyRate.value),
          billable: form.elements.billable.checked,
          operationId: globalThis.crypto?.randomUUID?.() || `time-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        save.disabled = true;
        try {
          if (entry?.entryId) {
            await api(`/admin/operations/work-orders/${encodeURIComponent(orderId)}/time/${encodeURIComponent(entry.entryId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          } else if (customerId) {
            await api(`/admin/operations/customers/${encodeURIComponent(customerId)}/time`, { method: "POST", body: JSON.stringify(payload) });
          } else {
            await api(`/admin/operations/work-orders/${encodeURIComponent(orderId)}/time`, { method: "POST", body: JSON.stringify(payload) });
          }
          closeModal();
          await window.SorgulenAdminShell?.refreshBadges?.();
          location.reload();
        } catch (err) { error.textContent = err.message; }
        finally { save.disabled = false; }
      });
    }

    async function openManualTime({ orderId = "", customerId = "", rate = null, entry = null } = {}) {
      try {
        let selectedRate = rate;
        if (orderId && selectedRate == null) {
          const order = await getOrder(orderId);
          selectedRate = entry?.hourlyRateSnapshot ?? order.hourlyRate;
        }
        showModal({ title: entry ? "Rediger tid" : "Legg til arbeid", subtitle: entry?.source === "timer" ? "Takstameterøkt – korriger varighet ved behov" : "Dato, hva du gjorde og hvor lenge det tok", body: timeFormMarkup({ orderId, customerId, entry, rate: selectedRate ?? 850 }) });
        bindTimeForm({ orderId, customerId, entry });
      } catch (error) {
        showModal({ title: "Kunne ikke åpne tidsregistrering", body: `<p class="operation-error">${esc(error.message)}</p>` });
      }
    }

    function expenseFormMarkup(orderId, item) {
      return `<form id="operationEditForm" data-kind="expense" data-order-id="${esc(orderId)}" data-entry-id="${esc(item.entryId)}"><div class="operation-grid">
        <div class="operation-field wide"><label>Beskrivelse</label><input name="description" value="${esc(item.item)}" required></div>
        <div class="operation-field"><label>Beløp</label><input name="amount" type="number" min="0.01" max="1000000" step="0.01" value="${esc(item.amount)}" required></div>
        <div class="operation-field"><label>Leverandør</label><input name="supplier" value="${esc(item.supplier || "")}"></div>
        <div class="operation-field"><label>Dato</label><input name="occurredAt" type="date" value="${esc(dateValue(item.occurredAt) || today())}" required></div>
        <label class="operation-check"><input name="billable" type="checkbox" ${item.billable === false ? "" : "checked"}> Fakturerbar</label>
      </div><p id="operationError" class="operation-error"></p><div class="operation-actions"><button type="button" class="secondary-btn" data-operation-close-2>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div></form>`;
    }
    function materialFormMarkup(orderId, item) {
      return `<form id="operationEditForm" data-kind="material" data-order-id="${esc(orderId)}" data-entry-id="${esc(item.entryId)}"><div class="operation-grid">
        <div class="operation-field wide"><label>Materiale</label><input name="item" value="${esc(item.item)}" required></div>
        <div class="operation-field"><label>Antall</label><input name="quantity" type="number" min="0.01" max="100000" step="0.01" value="${esc(item.quantity)}" required></div>
        <div class="operation-field"><label>Enhet</label><input name="unit" value="${esc(item.unit || "stk")}"></div>
        <div class="operation-field"><label>Innkjøpspris</label><input name="purchaseUnitPrice" type="number" min="0" max="1000000" step="0.01" value="${esc(item.purchaseUnitPrice ?? "")}"></div>
        <div class="operation-field"><label>Kundepris</label><input name="unitPrice" type="number" min="0" max="1000000" step="0.01" value="${esc(item.unitPrice ?? "")}"></div>
        <div class="operation-field wide"><label>Kommentar</label><input name="comment" value="${esc(item.comment || "")}"></div>
        <label class="operation-check"><input name="billable" type="checkbox" ${item.billable === false ? "" : "checked"}> Fakturerbar</label>
      </div><p id="operationError" class="operation-error"></p><div class="operation-actions"><button type="button" class="secondary-btn" data-operation-close-2>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div></form>`;
    }
    function noteFormMarkup(orderId, item) {
      return `<form id="operationEditForm" data-kind="note" data-order-id="${esc(orderId)}" data-entry-id="${esc(item.entryId)}"><div class="operation-field"><label>Notat</label><textarea name="text" maxlength="2000" required>${esc(item.text)}</textarea></div><p id="operationError" class="operation-error"></p><div class="operation-actions"><button type="button" class="secondary-btn" data-operation-close-2>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div></form>`;
    }

    function bindGenericEdit(kind) {
      const form = sheet.querySelector("#operationEditForm");
      sheet.querySelector("[data-operation-close-2]").addEventListener("click", closeModal);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(form).entries());
        if (kind !== "note") payload.billable = form.elements.billable.checked;
        if (kind === "expense") payload.occurredAt = `${payload.occurredAt}T12:00:00.000Z`;
        const endpoint = kind === "expense" ? "expenses" : kind === "material" ? "materials" : "notes";
        const button = form.querySelector("button[type=submit]");
        button.disabled = true;
        try {
          await api(`/admin/operations/work-orders/${encodeURIComponent(form.dataset.orderId)}/${endpoint}/${encodeURIComponent(form.dataset.entryId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          closeModal();
          await window.SorgulenAdminShell?.refreshBadges?.();
          location.reload();
        } catch (error) { sheet.querySelector("#operationError").textContent = error.message; }
        finally { button.disabled = false; }
      });
    }

    function projectFormMarkup(order) {
      return `<form id="operationProjectForm" data-order-id="${esc(order._id)}"><div class="operation-grid">
        <div class="operation-field wide"><label>Oppdrag / tjeneste</label><input name="serviceName" value="${esc(order.serviceName)}" required></div>
        <div class="operation-field"><label>Dato</label><input name="jobDate" type="date" value="${esc(order.jobDate)}" required></div>
        <div class="operation-field"><label>Timesats</label><input name="hourlyRate" type="number" min="0.01" step="0.01" value="${esc(order.hourlyRate)}" required></div>
        <div class="operation-field"><label>Prismodell</label><select name="pricingMode"><option value="hourly" ${order.pricingMode === "hourly" ? "selected" : ""}>Timespris</option><option value="fixed" ${order.pricingMode === "fixed" ? "selected" : ""}>Fastpris</option><option value="hybrid" ${order.pricingMode === "hybrid" ? "selected" : ""}>Fastpris + tillegg</option></select></div>
        <div class="operation-field"><label>Fastpris</label><input name="fixedPrice" type="number" min="0" step="0.01" value="${esc(order.fixedPrice ?? "")}"></div>
        <div class="operation-field wide"><label>Prosjektbeskrivelse</label><textarea name="notes" maxlength="5000">${esc(order.notes || "")}</textarea></div>
      </div><p id="operationError" class="operation-error"></p><div class="operation-actions"><button type="button" class="secondary-btn" data-operation-close-2>Avbryt</button><button type="submit" class="primary-btn">Lagre prosjekt</button></div></form>`;
    }

    async function openProjectEdit(orderId) {
      try {
        const order = await getOrder(orderId);
        showModal({ title: "Rediger prosjekt", subtitle: order.customerSnapshot?.name || "", body: projectFormMarkup(order) });
        sheet.querySelector("[data-operation-close-2]").addEventListener("click", closeModal);
        const form = sheet.querySelector("#operationProjectForm");
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const payload = Object.fromEntries(new FormData(form).entries());
          if (!payload.fixedPrice) payload.fixedPrice = null;
          const save = form.querySelector("button[type=submit]");
          save.disabled = true;
          try {
            await api(`/admin/work-orders/${encodeURIComponent(orderId)}`, { method: "PATCH", body: JSON.stringify(payload) });
            closeModal();
            location.reload();
          } catch (error) { sheet.querySelector("#operationError").textContent = error.message; }
          finally { save.disabled = false; }
        });
      } catch (error) { showModal({ title: "Kunne ikke åpne prosjektet", body: `<p class="operation-error">${esc(error.message)}</p>` }); }
    }

    function managerMarkup(order) {
      const intervals = order.workIntervals || [];
      const expenses = order.additionalCosts || [];
      const materials = order.materials || [];
      const notes = order.projectNotes || [];
      const list = (items, mapper, empty) => items.length ? items.map(mapper).join("") : `<p class="empty-state">${esc(empty)}</p>`;
      const timeRows = list(intervals, (entry) => {
        const seconds = intervalSeconds(entry);
        const rate = Number(entry.hourlyRateSnapshot ?? order.hourlyRate ?? 0);
        const amount = (seconds / 3600) * rate;
        const openTimer = entry.source !== "manual" && !entry.endedAt;
        const actions = openTimer
          ? '<span class="operation-source">Pågår – stopp eller pause før redigering</span>'
          : `<button class="secondary-btn" data-op-edit="time" data-entry-id="${esc(entry.entryId)}">Rediger</button><button class="secondary-btn operation-danger" data-op-delete="time" data-entry-id="${esc(entry.entryId)}" data-label="${esc(entry.comment || "tidsregistreringen")}">Slett</button>`;
        return `<div class="operations-entry"><div class="operations-entry-main"><strong>${esc(entry.comment || categoryName(entry.category))}<span class="operation-source">${entry.source === "manual" ? "Manuell" : "Takstameter"}</span></strong><p>${esc(entry.workDate || dateValue(entry.startedAt))} · ${esc(durationText(seconds))} · ${esc(categoryName(entry.category))} · ${esc(money(rate))}/t · ${esc(money(amount))}${entry.billable === false ? " · Intern" : ""}</p></div><div class="operations-entry-actions">${actions}</div></div>`;
      }, "Ingen tid registrert.");
      const expenseRows = list(expenses, (item) => `<div class="operations-entry"><div class="operations-entry-main"><strong>${esc(item.item)}</strong><p>${esc(dateValue(item.occurredAt))} · ${esc(money(item.amount))}${item.supplier ? ` · ${esc(item.supplier)}` : ""}${item.billable === false ? " · Intern" : ""}</p></div><div class="operations-entry-actions"><button class="secondary-btn" data-op-edit="expense" data-entry-id="${esc(item.entryId)}">Rediger</button><button class="secondary-btn operation-danger" data-op-delete="expense" data-entry-id="${esc(item.entryId)}" data-label="${esc(item.item)}">Slett</button></div></div>`, "Ingen utgifter registrert.");
      const materialRows = list(materials, (item) => `<div class="operations-entry"><div class="operations-entry-main"><strong>${esc(item.item)}</strong><p>${esc(item.quantity)} ${esc(item.unit || "stk")}${item.unitPrice != null ? ` · ${esc(money(Number(item.quantity) * Number(item.unitPrice)))}` : " · Pris ikke satt"}${item.billable === false ? " · Intern" : ""}</p></div><div class="operations-entry-actions"><button class="secondary-btn" data-op-edit="material" data-entry-id="${esc(item.entryId)}">Rediger</button><button class="secondary-btn operation-danger" data-op-delete="material" data-entry-id="${esc(item.entryId)}" data-label="${esc(item.item)}">Slett</button></div></div>`, "Ingen materialer registrert.");
      const noteRows = list(notes, (item) => `<div class="operations-entry"><div class="operations-entry-main"><strong>${esc(item.text)}</strong><p>${esc(dateValue(item.createdAt))}</p></div><div class="operations-entry-actions"><button class="secondary-btn" data-op-edit="note" data-entry-id="${esc(item.entryId)}">Rediger</button><button class="secondary-btn operation-danger" data-op-delete="note" data-entry-id="${esc(item.entryId)}" data-label="notatet">Slett</button></div></div>`, "Ingen notater registrert.");
      return `<div class="customer-ops-actions" style="margin-bottom:18px"><button class="primary-btn" data-op-add-time>+ Tid</button><button class="secondary-btn" data-op-edit-project>Rediger prosjekt</button></div><div class="operations-manager-list"><section class="operations-manager-section"><h3>Tid</h3>${timeRows}</section><section class="operations-manager-section"><h3>Utgifter</h3>${expenseRows}</section><section class="operations-manager-section"><h3>Materialer</h3>${materialRows}</section><section class="operations-manager-section"><h3>Notater</h3>${noteRows}</section></div>`;
    }

    async function openManager(orderId) {
      try {
        const order = await getOrder(orderId);
        state.currentOrder = order;
        state.currentOrderId = orderId;
        showModal({ title: "Rediger registreringer", subtitle: `${order.customerSnapshot?.name || "Kunde"} · ${order.serviceName}`, wide: true, body: managerMarkup(order) });
        sheet.querySelector("[data-op-add-time]").addEventListener("click", () => openManualTime({ orderId, rate: order.hourlyRate }));
        sheet.querySelector("[data-op-edit-project]").addEventListener("click", () => openProjectEdit(orderId));
        sheet.onclick = async (event) => {
          const edit = event.target.closest("[data-op-edit]");
          const del = event.target.closest("[data-op-delete]");
          if (edit) {
            const kind = edit.dataset.opEdit;
            const id = edit.dataset.entryId;
            if (kind === "time") {
              const item = (order.workIntervals || []).find((entry) => entry.entryId === id);
              if (item) openManualTime({ orderId, entry: item, rate: order.hourlyRate });
            } else if (kind === "expense") {
              const item = (order.additionalCosts || []).find((entry) => entry.entryId === id);
              if (item) { showModal({ title: "Rediger utgift", body: expenseFormMarkup(orderId, item) }); bindGenericEdit("expense"); }
            } else if (kind === "material") {
              const item = (order.materials || []).find((entry) => entry.entryId === id);
              if (item) { showModal({ title: "Rediger materiale", body: materialFormMarkup(orderId, item) }); bindGenericEdit("material"); }
            } else {
              const item = (order.projectNotes || []).find((entry) => entry.entryId === id);
              if (item) { showModal({ title: "Rediger notat", body: noteFormMarkup(orderId, item) }); bindGenericEdit("note"); }
            }
          }
          if (del) {
            const kind = del.dataset.opDelete;
            const id = del.dataset.entryId;
            const label = del.dataset.label || "registreringen";
            if (!confirm(`Slette ${label}? Denne endringen lagres.`)) return;
            const endpoint = kind === "time" ? "time" : kind === "expense" ? "expenses" : kind === "material" ? "materials" : "notes";
            try {
              await api(`/admin/operations/work-orders/${encodeURIComponent(orderId)}/${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
              closeModal();
              await window.SorgulenAdminShell?.refreshBadges?.();
              location.reload();
            } catch (error) { alert(error.message); }
          }
        };
      } catch (error) { showModal({ title: "Kunne ikke hente registreringene", body: `<p class="operation-error">${esc(error.message)}</p>` }); }
    }

    function enhanceDetailModal() {
      const content = document.getElementById("detailModalContent");
      if (!content || !state.currentOrderId || content.querySelector("[data-operations-manager]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-btn operations-edit-button";
      button.dataset.operationsManager = state.currentOrderId;
      button.textContent = "Rediger registreringer";
      content.prepend(button);
    }

    function enhanceHomeFocus() {
      const focus = document.getElementById("focusContent");
      if (!focus) return;
      const stop = focus.querySelector('[data-confirm="stop"]');
      if (stop && stop.textContent.trim() !== "STOPP ARBEID") stop.textContent = "STOPP ARBEID";
      const start = focus.querySelector('[data-action="start"][data-session="work"], [data-action="resume"][data-session="work"]');
      if (start) start.textContent = start.dataset.action === "start" ? "START ARBEID" : "FORTSETT ARBEID";
    }

    async function enhanceInvoiceDetail() {
      if (!location.pathname.endsWith("/faktura-detalj.html")) return;
      const invoiceId = new URLSearchParams(location.search).get("id");
      const content = document.getElementById("fdContent");
      if (!invoiceId || !content) return;
      try {
        const data = await api(`/admin/operations/invoices/${encodeURIComponent(invoiceId)}/basis-status`);
        if (data.status !== "draft" || !data.outdated) return;
        if (document.getElementById("invoiceBasisWarning")) return;
        const warning = document.createElement("div");
        warning.id = "invoiceBasisWarning";
        warning.className = "billing-draft-warning";
        warning.innerHTML = `<strong>Fakturagrunnlaget er endret</strong><span>${data.added?.length || 0} nye, ${data.removed?.length || 0} fjernede og ${data.modified?.length || 0} endrede registreringer. Kontroller utkastet før sending.</span><div class="customer-ops-actions" style="margin-top:9px"><button type="button" class="secondary-btn" id="syncInvoiceBasis">Oppdater fakturautkast</button></div>`;
        content.parentNode.insertBefore(warning, content);
        warning.querySelector("#syncInvoiceBasis").addEventListener("click", async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try { await api(`/admin/operations/invoices/${encodeURIComponent(invoiceId)}/sync-basis`, { method: "POST", body: "{}" }); location.reload(); }
          catch (error) { alert(error.message); button.disabled = false; }
        });
      } catch (error) {
        if (![400, 404].includes(error.status)) console.warn("Kunne ikke kontrollere fakturagrunnlag:", error.message);
      }
    }

    document.addEventListener("click", (event) => {
      const timeButton = event.target.closest('[data-entry="time"],[data-quick="time"]');
      if (timeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openManualTime({ orderId: timeButton.dataset.id });
        return;
      }
      const customerTime = event.target.closest("[data-customer-time]");
      if (customerTime) {
        event.preventDefault();
        openManualTime({ customerId: customerTime.dataset.customerTime, rate: Number(customerTime.dataset.rate) || 850 });
        return;
      }
      const detailButton = event.target.closest(".open-job-detail");
      if (detailButton?.dataset.id) state.currentOrderId = detailButton.dataset.id;
      const managerButton = event.target.closest("[data-operations-manager]");
      if (managerButton) { event.preventDefault(); openManager(managerButton.dataset.operationsManager); }
    }, true);

    const detailContent = document.getElementById("detailModalContent");
    if (detailContent) new MutationObserver(enhanceDetailModal).observe(detailContent, { childList: true, subtree: true });
    const focusContent = document.getElementById("focusContent");
    if (focusContent) new MutationObserver(enhanceHomeFocus).observe(focusContent, { childList: true, subtree: true });
    enhanceDetailModal();
    enhanceHomeFocus();
    setTimeout(enhanceInvoiceDetail, 300);

    window.SorgulenOperations = { api, openManualTime, openManager, refreshBadges: () => window.SorgulenAdminShell?.refreshBadges?.() };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
