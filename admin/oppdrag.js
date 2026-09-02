(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const OPEN_STATUSES = new Set(["active", "paused", "stopped"]);
  const workOrderTime = window.SorgulenWorkOrderTime;

  if (!workOrderTime) throw new Error("Mangler tidsberegning for oppdrag");

  const statusLabels = {
    planned: "Planlagt",
    active: "Aktiv",
    paused: "Pauset",
    stopped: "Stoppet",
    completed: "Ferdigstilt",
    cancelled: "Avbrutt",
  };

  const actionLabels = {
    start: "Starter oppdrag...",
    pause: "Pauser oppdrag...",
    resume: "Fortsetter oppdrag...",
    stop: "Stopper oppdrag...",
    complete: "Ferdigstiller oppdrag...",
    cancel: "Avbryter oppdrag...",
  };

  const statusMessage = document.getElementById("statusMessage");
  const activeContent = document.getElementById("activeWorkOrderContent");
  const createSection = document.getElementById("createWorkOrderSection");
  const createForm = document.getElementById("createWorkOrderForm");
  const createButton = document.getElementById("createWorkOrderBtn");
  const customerSearch = document.getElementById("customerSearch");
  const customerResults = document.getElementById("customerResults");
  const selectedCustomerInfo = document.getElementById("selectedCustomerInfo");
  const serviceNameInput = document.getElementById("serviceName");
  const jobDateInput = document.getElementById("jobDate");
  const ratePreset = document.getElementById("ratePreset");
  const customRateField = document.getElementById("customRateField");
  const customRateInput = document.getElementById("customRate");
  const notesInput = document.getElementById("workOrderNotes");
  const historySearch = document.getElementById("historySearch");
  const historyStatus = document.getElementById("historyStatus");
  const historyContainer = document.getElementById("workOrderHistory");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const detailModal = document.getElementById("detailModal");
  const detailModalContent = document.getElementById("detailModalContent");
  const closeDetailModalBtn = document.getElementById("closeDetailModal");
  const confirmModal = document.getElementById("confirmModal");
  const confirmModalTitle = document.getElementById("confirmModalTitle");
  const confirmModalText = document.getElementById("confirmModalText");
  const confirmNo = document.getElementById("confirmNo");
  const confirmYes = document.getElementById("confirmYes");

  let openWorkOrder = null;
  let workOrders = [];
  let detailWorkOrder = null;
  let selectedCustomer = null;
  let customerOptions = [];
  let customerSearchTimer = null;
  let customerSearchSequence = 0;
  let serverOffsetMs = 0;
  let actionInFlight = false;
  let pendingConfirmation = null;
  let tickInterval = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMessage(message, type = "info") {
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message ${message ? type : ""}`.trim();
  }

  function getAdminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }

  function updateServerOffset(serverTime) {
    const serverMs = new Date(serverTime || "").getTime();
    if (!Number.isNaN(serverMs)) serverOffsetMs = serverMs - Date.now();
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": getAdminKey(),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);
    if (data && data.serverTime) updateServerOffset(data.serverTime);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw Object.assign(new Error("Admin-nøkkel er feil eller mangler. Logg inn på nytt."), { status: response.status, data });
    }
    if (!response.ok) {
      throw Object.assign(new Error((data && data.error) || `API-feil ${response.status}`), { status: response.status, data });
    }
    return data;
  }

  function getOsloDateInputValue() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : "–";
  }

  function formatDateTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", {
      timeZone: "Europe/Oslo",
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }

  function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function formatCurrency(value, estimated = false) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "–";
    const text = new Intl.NumberFormat("no-NO", {
      style: "currency",
      currency: "NOK",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
    return estimated ? `ca. ${text}` : text;
  }

  function calculateWorkSeconds(workOrder) {
    return workOrderTime.calculateWorkSeconds(workOrder, Date.now() + serverOffsetMs);
  }

  function calculateEstimatedAmount(workOrder, seconds = calculateWorkSeconds(workOrder)) {
    return workOrderTime.calculateEstimatedAmount(workOrder, seconds);
  }

  function sourceLabel(workOrder) {
    if (workOrder.customerSourceType === "booking") return "Booking";
    if (workOrder.customerSourceType === "request") return "Prisforespørsel";
    return "Manuelt oppdrag";
  }

  function renderIntervals(workOrder) {
    const intervals = workOrder.workIntervals || [];
    if (!intervals.length) return '<p class="muted">Ingen arbeidstid registrert ennå.</p>';
    const nowMs = Date.now() + serverOffsetMs;

    return `<ol class="interval-list">${intervals.map((interval, index) => {
      const startMs = new Date(interval.startedAt).getTime();
      const endMs = interval.endedAt ? new Date(interval.endedAt).getTime() : nowMs;
      const seconds = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs
        ? Math.floor((endMs - startMs) / 1000)
        : 0;
      return `<li>
        <span>Arbeidsøkt ${index + 1}</span>
        <strong>${escapeHtml(formatTime(interval.startedAt))}–${interval.endedAt ? escapeHtml(formatTime(interval.endedAt)) : "pågår"}</strong>
        <span>${escapeHtml(formatDuration(seconds))}</span>
      </li>`;
    }).join("")}</ol>`;
  }

  function workOrderControls(workOrder) {
    if (!workOrder) return "";
    const id = escapeHtml(workOrder._id);
    const disabledByOtherOpen = workOrder.status === "planned" && openWorkOrder && openWorkOrder._id !== workOrder._id;

    if (workOrder.status === "planned") {
      return `
        <button class="work-btn work-btn-start" type="button" data-work-action="start" data-id="${id}" ${disabledByOtherOpen ? "disabled" : ""}>START</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Forkast</button>`;
    }
    if (workOrder.status === "active") {
      return `
        <button class="work-btn work-btn-pause" type="button" data-work-action="pause" data-id="${id}">PAUSE</button>
        <button class="work-btn work-btn-stop" type="button" data-work-action="stop" data-id="${id}">STOPP</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Avbryt oppdrag</button>`;
    }
    if (workOrder.status === "paused") {
      return `
        <button class="work-btn work-btn-start" type="button" data-work-action="resume" data-id="${id}">FORTSETT</button>
        <button class="work-btn work-btn-stop" type="button" data-work-action="stop" data-id="${id}">STOPP</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Avbryt oppdrag</button>`;
    }
    if (workOrder.status === "stopped") {
      return `
        <button class="work-btn work-btn-complete" type="button" data-work-action="complete" data-id="${id}">FERDIGSTILL OPPDRAG</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Forkast / avbryt</button>`;
    }
    return "";
  }

  function renderActiveWorkOrder() {
    if (!openWorkOrder) {
      activeContent.innerHTML = `
        <div class="empty-state active-empty-state">
          <strong>Ingen aktiv tidtaking.</strong>
          <span>Opprett et oppdrag nedenfor, og trykk START når arbeidet begynner.</span>
        </div>`;
      createSection.classList.remove("hidden");
      return;
    }

    createSection.classList.add("hidden");
    const seconds = calculateWorkSeconds(openWorkOrder);
    const amount = calculateEstimatedAmount(openWorkOrder, seconds);
    const customer = openWorkOrder.customerSnapshot || {};
    const status = openWorkOrder.status;
    const stateText = status === "active" ? "TAKSTAMETERET KJØRER" : status === "paused" ? "TAKSTAMETERET ER PAUSET" : "TIDTAKINGEN ER STOPPET";

    activeContent.innerHTML = `
      <article class="meter-card meter-${escapeHtml(status)}">
        <div class="meter-state-row">
          <span class="meter-indicator" aria-hidden="true"></span>
          <strong>${escapeHtml(stateText)}</strong>
          <span class="work-status-badge status-${escapeHtml(status)}">${escapeHtml(statusLabels[status])}</span>
        </div>

        <div class="meter-customer-row">
          <div>
            <p class="section-kicker">Kunde</p>
            <h3>${escapeHtml(customer.name || "Ukjent kunde")}</h3>
            <p>${escapeHtml(openWorkOrder.serviceName)} · ${escapeHtml(formatDate(openWorkOrder.jobDate))}</p>
          </div>
          <button type="button" class="details-link open-job-detail" data-id="${escapeHtml(openWorkOrder._id)}">Se detaljer</button>
        </div>

        <div class="meter-timer-block">
          <span>Aktiv arbeidstid</span>
          <strong class="meter-time" data-live-time-id="${escapeHtml(openWorkOrder._id)}">${escapeHtml(formatDuration(seconds))}</strong>
        </div>

        <div class="meter-financials">
          <div>
            <span>Timesats</span>
            <strong>${escapeHtml(formatCurrency(openWorkOrder.hourlyRate))} / time</strong>
          </div>
          <div>
            <span>${status === "stopped" ? "Arbeidsbeløp" : "Løpende estimat"}</span>
            <strong data-live-amount-id="${escapeHtml(openWorkOrder._id)}">${escapeHtml(formatCurrency(amount, status !== "stopped"))}</strong>
          </div>
        </div>

        ${status === "stopped" ? `
          <div class="stopped-summary">
            <h4>Kontroller før ferdigstilling</h4>
            ${renderIntervals(openWorkOrder)}
            <p><strong>Start:</strong> ${escapeHtml(formatDateTime(openWorkOrder.startedAt))}</p>
            <p><strong>Stopp:</strong> ${escapeHtml(formatDateTime(openWorkOrder.stoppedAt))}</p>
            <p><strong>Notater:</strong> ${escapeHtml(openWorkOrder.notes || "Ingen notater")}</p>
          </div>` : ""}

        <div class="meter-controls">${workOrderControls(openWorkOrder)}</div>
      </article>`;
  }

  function filteredWorkOrders() {
    const query = (historySearch.value || "").trim().toLowerCase();
    const filter = historyStatus.value;
    return workOrders.filter((workOrder) => {
      if (filter === "open" && !OPEN_STATUSES.has(workOrder.status)) return false;
      if (!["all", "open"].includes(filter) && workOrder.status !== filter) return false;
      if (!query) return true;
      const customer = workOrder.customerSnapshot || {};
      return [customer.name, customer.email, customer.phone, workOrder.serviceName, workOrder.notes]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }

  function renderHistory() {
    const visible = filteredWorkOrders();
    if (!visible.length) {
      historyContainer.innerHTML = '<div class="empty-state">Ingen oppdrag å vise.</div>';
      return;
    }

    historyContainer.innerHTML = visible.map((workOrder) => {
      const customer = workOrder.customerSnapshot || {};
      const seconds = calculateWorkSeconds(workOrder);
      const amount = calculateEstimatedAmount(workOrder, seconds);
      const showAmount = workOrder.status !== "planned" && workOrder.status !== "cancelled";
      const amountEstimated = !["completed", "stopped"].includes(workOrder.status);

      return `
        <article class="work-history-card status-${escapeHtml(workOrder.status)}">
          <div class="history-date">
            <span>Dato</span>
            <strong>${escapeHtml(formatDate(workOrder.jobDate))}</strong>
          </div>
          <div class="history-main">
            <h3>${escapeHtml(customer.name || "Ukjent kunde")}</h3>
            <p>${escapeHtml(workOrder.serviceName)}</p>
          </div>
          <div class="history-metric">
            <span>Arbeidstid</span>
            <strong>${workOrder.status === "planned" ? "–" : escapeHtml(formatDuration(seconds))}</strong>
          </div>
          <div class="history-metric">
            <span>Beløp</span>
            <strong>${showAmount ? escapeHtml(formatCurrency(amount, amountEstimated)) : "–"}</strong>
          </div>
          <div class="history-status">
            <span class="work-status-badge status-${escapeHtml(workOrder.status)}">${escapeHtml(statusLabels[workOrder.status] || workOrder.status)}</span>
          </div>
          <div class="history-action">
            <button type="button" class="details-link open-job-detail" data-id="${escapeHtml(workOrder._id)}">Åpne</button>
          </div>
        </article>`;
    }).join("");
  }

  function renderCustomerResults(options) {
    customerOptions = Array.isArray(options) ? options : [];
    if (!customerOptions.length) {
      customerResults.innerHTML = '<div class="customer-result-empty">Ingen eksisterende kunder funnet. Du kan bruke navnet du har skrevet.</div>';
      return;
    }

    customerResults.innerHTML = customerOptions.map((option, index) => {
      const customer = option.customer || {};
      const meta = [customer.phone, customer.email, customer.address].filter(Boolean).join(" · ");
      const source = option.sourceType === "booking" ? "Booking" : "Prisforespørsel";
      return `
        <button type="button" class="customer-result" role="option" data-customer-index="${index}">
          <strong>${escapeHtml(customer.name || "Ukjent kunde")}</strong>
          <span>${escapeHtml(meta || "Ingen kontaktinformasjon")}</span>
          <small>${escapeHtml(source)}${option.sourceRefNumber ? ` · Ref #${escapeHtml(option.sourceRefNumber)}` : ""}</small>
        </button>`;
    }).join("");
  }

  function clearSelectedCustomer() {
    selectedCustomer = null;
    selectedCustomerInfo.classList.add("hidden");
    selectedCustomerInfo.innerHTML = "";
  }

  function selectCustomer(option) {
    selectedCustomer = option;
    const customer = option.customer || {};
    customerSearch.value = customer.name || "";
    customerResults.innerHTML = "";
    selectedCustomerInfo.innerHTML = `
      <div>
        <strong>${escapeHtml(customer.name || "Ukjent kunde")}</strong>
        <span>${escapeHtml([customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Ingen kontaktinformasjon")}</span>
      </div>
      <button type="button" id="clearSelectedCustomer" class="secondary-btn">Bytt kunde</button>`;
    selectedCustomerInfo.classList.remove("hidden");

    if (!serviceNameInput.value.trim() && option.serviceName) serviceNameInput.value = option.serviceName;
    if (option.jobDate) jobDateInput.value = option.jobDate;
  }

  async function searchCustomers(query = "") {
    const sequence = ++customerSearchSequence;
    try {
      const data = await apiFetch(`/admin/work-orders/customer-options?q=${encodeURIComponent(query)}`);
      if (sequence !== customerSearchSequence) return;
      renderCustomerResults(data.customerOptions || []);
    } catch (err) {
      if (sequence !== customerSearchSequence) return;
      customerResults.innerHTML = `<div class="customer-result-empty error-text">${escapeHtml(err.message)}</div>`;
    }
  }

  function getHourlyRate() {
    if (ratePreset.value !== "custom") return Number(ratePreset.value);
    return Number(customRateInput.value);
  }

  function resetCreateForm() {
    createForm.reset();
    clearSelectedCustomer();
    customerResults.innerHTML = "";
    jobDateInput.value = getOsloDateInputValue();
    ratePreset.value = "650";
    customRateField.classList.add("hidden");
    customRateInput.required = false;
  }

  async function createWorkOrder(event) {
    event.preventDefault();
    if (actionInFlight) return;
    if (openWorkOrder) {
      setMessage("Ferdigstill eller avbryt det åpne oppdraget før du oppretter et nytt.", "error");
      return;
    }

    const hourlyRate = getHourlyRate();
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      setMessage("Skriv inn en gyldig timesats.", "error");
      customRateInput.focus();
      return;
    }

    const payload = {
      customerSourceType: selectedCustomer?.sourceType || "manual",
      customerSourceId: selectedCustomer?.sourceId || null,
      customer: selectedCustomer?.customer || { name: customerSearch.value.trim() },
      serviceName: serviceNameInput.value.trim(),
      jobDate: jobDateInput.value,
      hourlyRate,
      notes: notesInput.value.trim(),
    };

    actionInFlight = true;
    createButton.disabled = true;
    createButton.textContent = "Oppretter...";
    setMessage("Oppretter oppdrag...", "info");

    try {
      const data = await apiFetch("/admin/work-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      resetCreateForm();
      await loadDashboard(false);
      setMessage("Oppdraget er opprettet. Kontroller detaljene og trykk START når arbeidet begynner.", "success");
      await openDetails(data.workOrder._id);
    } catch (err) {
      setMessage(err.message || "Kunne ikke opprette oppdrag.", "error");
    } finally {
      actionInFlight = false;
      createButton.disabled = false;
      createButton.textContent = "Opprett oppdrag";
    }
  }

  function setActionButtonsDisabled(disabled) {
    document.querySelectorAll("[data-work-action], #saveDetailNotes").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function closeDetailModal() {
    detailModal.classList.add("hidden");
    detailWorkOrder = null;
    document.body.classList.remove("modal-open");
  }

  function closeConfirmModal() {
    confirmModal.classList.add("hidden");
    pendingConfirmation = null;
    if (detailModal.classList.contains("hidden")) document.body.classList.remove("modal-open");
  }

  function askForConfirmation({ title, text, confirmLabel, danger = true, run }) {
    pendingConfirmation = run;
    confirmModalTitle.textContent = title;
    confirmModalText.textContent = text;
    confirmYes.textContent = confirmLabel;
    confirmYes.className = danger ? "danger-btn" : "primary-btn";
    confirmModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function confirmationForAction(action, id, customerName) {
    if (action === "stop") {
      askForConfirmation({
        title: "Stoppe tidtakingen?",
        text: `Tidtakingen for ${customerName} stoppes og oppsummeringen åpnes. Etter STOPP kan timeren ikke fortsettes; bruk PAUSE hvis arbeidet skal fortsette senere.`,
        confirmLabel: "Ja, stopp",
        run: () => performAction(id, action),
      });
      return;
    }
    if (action === "complete") {
      askForConfirmation({
        title: "Ferdigstille oppdraget?",
        text: `Arbeidstid og beregnet arbeidsbeløp for ${customerName} lagres som ferdigstilt historikk.`,
        confirmLabel: "Ferdigstill",
        danger: false,
        run: () => performAction(id, action),
      });
      return;
    }
    if (action === "cancel") {
      askForConfirmation({
        title: "Avbryte oppdraget?",
        text: `Oppdraget for ${customerName} markeres som avbrutt. Registrert tidslogg beholdes i historikken.`,
        confirmLabel: "Ja, avbryt",
        run: () => performAction(id, action),
      });
    }
  }

  async function performAction(id, action) {
    if (actionInFlight) return;
    actionInFlight = true;
    setActionButtonsDisabled(true);
    setMessage(actionLabels[action] || "Lagrer handling...", "info");

    try {
      const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });

      if (detailWorkOrder && detailWorkOrder._id === id) detailWorkOrder = data.workOrder;
      await loadDashboard(false);

      if (["start", "complete", "cancel"].includes(action)) closeDetailModal();
      else if (detailWorkOrder && !detailModal.classList.contains("hidden")) renderDetailModal();

      const successText = {
        start: "Takstameteret er startet.",
        pause: "Takstameteret er pauset. Pausen teller ikke som arbeidstid.",
        resume: "Takstameteret fortsetter.",
        stop: "Tidtakingen er stoppet. Kontroller oppsummeringen før ferdigstilling.",
        complete: "Oppdraget er ferdigstilt og lagret i historikken.",
        cancel: "Oppdraget er markert som avbrutt. Tidsloggen er bevart.",
      };
      setMessage(successText[action] || "Oppdatert.", "success");
    } catch (err) {
      if (err.data?.workOrder && OPEN_STATUSES.has(err.data.workOrder.status)) {
        openWorkOrder = err.data.workOrder;
      }
      setMessage(err.message || "Handlingen kunne ikke lagres.", "error");
      await loadDashboard(false).catch(() => {});
    } finally {
      actionInFlight = false;
      setActionButtonsDisabled(false);
    }
  }

  async function saveDetailNotes() {
    if (!detailWorkOrder || actionInFlight) return;
    const textarea = document.getElementById("detailNotes");
    actionInFlight = true;
    setActionButtonsDisabled(true);
    setMessage("Lagrer notater...", "info");
    try {
      const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(detailWorkOrder._id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: textarea.value.trim() }),
      });
      detailWorkOrder = data.workOrder;
      await loadDashboard(false);
      renderDetailModal();
      setMessage("Notatene er lagret.", "success");
    } catch (err) {
      setMessage(err.message || "Kunne ikke lagre notatene.", "error");
    } finally {
      actionInFlight = false;
      setActionButtonsDisabled(false);
    }
  }

  function renderDetailModal() {
    if (!detailWorkOrder) return;
    const workOrder = detailWorkOrder;
    const customer = workOrder.customerSnapshot || {};
    const seconds = calculateWorkSeconds(workOrder);
    const amount = calculateEstimatedAmount(workOrder, seconds);
    const completed = workOrder.status === "completed";
    const contactParts = [customer.phone, customer.email, customer.address].filter(Boolean);

    detailModalContent.innerHTML = `
      <div class="detail-status-row">
        <span class="work-status-badge status-${escapeHtml(workOrder.status)}">${escapeHtml(statusLabels[workOrder.status] || workOrder.status)}</span>
        <span>${escapeHtml(sourceLabel(workOrder))}${workOrder.sourceRefNumber ? ` · Ref #${escapeHtml(workOrder.sourceRefNumber)}` : ""}</span>
      </div>

      <div class="detail-grid work-order-detail-grid">
        <div><span>Kunde</span><strong>${escapeHtml(customer.name || "Ukjent kunde")}</strong></div>
        <div><span>Kontakt</span><strong>${escapeHtml(contactParts.join(" · ") || "–")}</strong></div>
        <div><span>Oppdrag</span><strong>${escapeHtml(workOrder.serviceName)}</strong></div>
        <div><span>Dato</span><strong>${escapeHtml(formatDate(workOrder.jobDate))}</strong></div>
        <div><span>Start</span><strong>${escapeHtml(formatDateTime(workOrder.startedAt))}</strong></div>
        <div><span>Stopp</span><strong>${escapeHtml(formatDateTime(workOrder.stoppedAt))}</strong></div>
        <div><span>Arbeidstid</span><strong data-live-time-id="${escapeHtml(workOrder._id)}">${escapeHtml(formatDuration(seconds))}</strong></div>
        <div><span>Timesats</span><strong>${escapeHtml(formatCurrency(workOrder.hourlyRate))} / time</strong></div>
        <div><span>${completed ? "Arbeidsbeløp" : "Estimert beløp"}</span><strong data-live-amount-id="${escapeHtml(workOrder._id)}">${escapeHtml(formatCurrency(amount, !completed && workOrder.status !== "stopped"))}</strong></div>
      </div>

      <section class="detail-section">
        <h3>Tidslogg</h3>
        ${renderIntervals(workOrder)}
      </section>

      <section class="detail-section">
        <label for="detailNotes"><strong>Notater</strong></label>
        <textarea id="detailNotes" rows="5" maxlength="5000">${escapeHtml(workOrder.notes || "")}</textarea>
        <button id="saveDetailNotes" type="button" class="secondary-btn">Lagre notater</button>
      </section>

      ${workOrderControls(workOrder) ? `<div class="meter-controls detail-controls">${workOrderControls(workOrder)}</div>` : ""}`;
  }

  async function openDetails(id) {
    try {
      setMessage("Henter oppdragsdetaljer...", "info");
      const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(id)}`);
      detailWorkOrder = data.workOrder;
      renderDetailModal();
      detailModal.classList.remove("hidden");
      document.body.classList.add("modal-open");
      setMessage("", "info");
    } catch (err) {
      setMessage(err.message || "Kunne ikke hente oppdraget.", "error");
    }
  }

  function findWorkOrder(id) {
    if (openWorkOrder?._id === id) return openWorkOrder;
    if (detailWorkOrder?._id === id) return detailWorkOrder;
    return workOrders.find((workOrder) => workOrder._id === id) || null;
  }

  function updateLiveDisplays() {
    document.querySelectorAll("[data-live-time-id]").forEach((element) => {
      const workOrder = findWorkOrder(element.dataset.liveTimeId);
      if (workOrder) element.textContent = formatDuration(calculateWorkSeconds(workOrder));
    });
    document.querySelectorAll("[data-live-amount-id]").forEach((element) => {
      const workOrder = findWorkOrder(element.dataset.liveAmountId);
      if (!workOrder) return;
      const estimated = !["completed", "stopped"].includes(workOrder.status);
      element.textContent = formatCurrency(calculateEstimatedAmount(workOrder), estimated);
    });
  }

  function ensureTickInterval() {
    if (tickInterval) return;
    tickInterval = window.setInterval(updateLiveDisplays, 1000);
  }

  async function loadDashboard(showLoading = true) {
    if (showLoading) setMessage("Henter oppdrag...", "info");
    const [activeData, historyData] = await Promise.all([
      apiFetch("/admin/work-orders/active"),
      apiFetch("/admin/work-orders?limit=200"),
    ]);
    openWorkOrder = activeData.workOrder || null;
    workOrders = Array.isArray(historyData.workOrders) ? historyData.workOrders : [];
    renderActiveWorkOrder();
    renderHistory();
    ensureTickInterval();
    if (showLoading) setMessage(`Hentet ${workOrders.length} oppdrag.`, "success");
  }

  customerSearch.addEventListener("focus", () => {
    if (!selectedCustomer && !customerResults.innerHTML) searchCustomers(customerSearch.value.trim());
  });

  customerSearch.addEventListener("input", () => {
    if (selectedCustomer && customerSearch.value.trim() !== (selectedCustomer.customer?.name || "")) {
      clearSelectedCustomer();
    }
    window.clearTimeout(customerSearchTimer);
    customerSearchTimer = window.setTimeout(() => searchCustomers(customerSearch.value.trim()), 250);
  });

  customerResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-index]");
    if (!button) return;
    const option = customerOptions[Number(button.dataset.customerIndex)];
    if (option) selectCustomer(option);
  });

  selectedCustomerInfo.addEventListener("click", (event) => {
    if (event.target.id !== "clearSelectedCustomer") return;
    clearSelectedCustomer();
    customerSearch.value = "";
    customerSearch.focus();
    searchCustomers("");
  });

  ratePreset.addEventListener("change", () => {
    const custom = ratePreset.value === "custom";
    customRateField.classList.toggle("hidden", !custom);
    customRateInput.required = custom;
    if (custom) customRateInput.focus();
  });

  createForm.addEventListener("submit", createWorkOrder);
  historySearch.addEventListener("input", renderHistory);
  historyStatus.addEventListener("change", renderHistory);
  refreshBtn.addEventListener("click", () => loadDashboard(true).catch((err) => setMessage(err.message, "error")));
  logoutBtn.addEventListener("click", () => localStorage.removeItem(KEY_STORAGE));

  document.addEventListener("click", (event) => {
    const detailButton = event.target.closest(".open-job-detail");
    if (detailButton) {
      openDetails(detailButton.dataset.id);
      return;
    }

    if (event.target.id === "saveDetailNotes") {
      saveDetailNotes();
      return;
    }

    const actionButton = event.target.closest("[data-work-action]");
    if (!actionButton || actionButton.disabled) return;
    const id = actionButton.dataset.id;
    const action = actionButton.dataset.workAction;
    const workOrder = findWorkOrder(id);
    const customerName = workOrder?.customerSnapshot?.name || "kunden";

    if (["stop", "complete", "cancel"].includes(action)) {
      confirmationForAction(action, id, customerName);
    } else {
      performAction(id, action);
    }
  });

  closeDetailModalBtn.addEventListener("click", closeDetailModal);
  confirmNo.addEventListener("click", closeConfirmModal);
  confirmYes.addEventListener("click", async () => {
    const run = pendingConfirmation;
    closeConfirmModal();
    if (run) await run();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!confirmModal.classList.contains("hidden")) closeConfirmModal();
    else if (!detailModal.classList.contains("hidden")) closeDetailModal();
  });

  document.addEventListener("DOMContentLoaded", async () => {
    jobDateInput.value = getOsloDateInputValue();
    try {
      await loadDashboard(true);
    } catch (err) {
      renderActiveWorkOrder();
      renderHistory();
      setMessage(err.message || "Kunne ikke hente oppdrag. Kontroller tilkoblingen og prøv igjen.", "error");
    }
  });
})();
