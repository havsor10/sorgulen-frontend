(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const OPEN_STATUSES = new Set(["active", "paused"]);
  const PROJECT_OPEN_STATUSES = new Set(["active", "paused", "stopped"]);
  const workOrderTime = window.SorgulenWorkOrderTime;
  const financeModel = window.SorgulenOrderBoard;

  if (!workOrderTime) throw new Error("Mangler tidsberegning for oppdrag");
  if (!financeModel) throw new Error("Mangler felles økonomistatus for oppdrag");

  const statusLabels = {
    planned: "Planlagt",
    active: "Aktiv",
    paused: "Pauset",
    stopped: "Mellom økter",
    completed: "Ferdigstilt",
    cancelled: "Avbrutt",
  };

  const effectiveStatus = (workOrder) => workOrder?.workflow?.status || workOrder?.status || "planned";

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
  const customerEmailInput = document.getElementById("customerEmail");
  const customerPhoneInput = document.getElementById("customerPhone");
  const customerAddressInput = document.getElementById("customerAddress");
  const pricingModeInput = document.getElementById("pricingMode");
  const fixedPriceField = document.getElementById("fixedPriceField");
  const fixedPriceInput = document.getElementById("fixedPrice");
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
  const entryModal = document.getElementById("entryModal");
  const entryForm = document.getElementById("entryForm");
  const entryFields = document.getElementById("entryFields");
  const entryError = document.getElementById("entryError");

  let openWorkOrder = null;
  let workOrders = [];
  let orderBoard = null;
  let financeError = "";
  let detailWorkOrder = null;
  let selectedCustomer = null;
  let customerOptions = [];
  let customerSearchTimer = null;
  let customerSearchSequence = 0;
  let serverOffsetMs = 0;
  let actionInFlight = false;
  let pendingConfirmation = null;
  let tickInterval = null;
  let entryTargetId = null;
  let entryOperationId = null;

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

    const categoryLabels = { work: "Arbeid", purchase: "Innkjøp", transport: "Transport" };
    return `<ol class="interval-list">${intervals.map((interval, index) => {
      const startMs = new Date(interval.startedAt).getTime();
      const endMs = interval.endedAt ? new Date(interval.endedAt).getTime() : nowMs;
      const seconds = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs
        ? Math.floor((endMs - startMs) / 1000)
        : 0;
      return `<li>
        <span>${escapeHtml(categoryLabels[interval.category] || "Arbeid")} ${index + 1}</span>
        <strong>${escapeHtml(formatTime(interval.startedAt))}–${interval.endedAt ? escapeHtml(formatTime(interval.endedAt)) : "pågår"}</strong>
        <span>${escapeHtml(formatDuration(seconds))}</span>
      </li>`;
    }).join("")}</ol>`;
  }

  function intervalCategoryTotals(workOrder) {
    const totals = { work: 0, purchase: 0, transport: 0 };
    const nowMs = Date.now() + serverOffsetMs;
    (workOrder.workIntervals || []).forEach((interval) => {
      const start = new Date(interval.startedAt).getTime();
      const end = interval.endedAt ? new Date(interval.endedAt).getTime() : nowMs;
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) totals[interval.category || "work"] += Math.floor((end - start) / 1000);
    });
    return totals;
  }

  function renderProjectHistory(workOrder) {
    const labels = { created: "Prosjekt opprettet", started: "Arbeidsøkt startet", paused: "Arbeidsøkt pauset", resumed: "Ny arbeidsøkt startet", stopped: "Arbeidsøkt avsluttet", completed: "Prosjekt fullført", cancelled: "Prosjekt avbrutt", notes_updated: "Prosjektbeskrivelse oppdatert", invoice_draft_created: "Fakturautkast opprettet" };
    const items = (workOrder.events || []).filter((event) => labels[event.type]).map((event) => ({ at: event.at, title: labels[event.type], detail: event.description || "" }));
    (workOrder.workIntervals || []).filter((interval) => interval.source === "manual").forEach((interval) => items.push({ at: interval.createdAt || interval.startedAt, title: "Tid lagt til manuelt", detail: `${interval.category === "purchase" ? "Innkjøp" : interval.category === "transport" ? "Transport" : "Arbeid"} · ${formatDuration(Math.max(0, (new Date(interval.endedAt) - new Date(interval.startedAt)) / 1000))}${interval.comment ? ` · ${interval.comment}` : ""}` }));
    (workOrder.additionalCosts || []).forEach((item) => items.push({ at: item.occurredAt, title: "Utgift registrert", detail: `${item.item} · ${formatCurrency(item.amount)}` }));
    (workOrder.equipment || []).forEach((item) => items.push({ at: item.createdAt, title: "Utstyr registrert", detail: `${item.item} · ${item.durationMinutes || 0} min · ${formatCurrency(item.amount || 0)}` }));
    (workOrder.materials || []).forEach((item) => items.push({ at: item.createdAt, title: "Materiale registrert", detail: `${item.item} · ${item.quantity} ${item.unit || "stk"}` }));
    (workOrder.projectNotes || []).forEach((item) => items.push({ at: item.createdAt, title: "Notat", detail: item.text }));
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    return items.length ? `<ul class="interval-list">${items.map((item) => `<li><span>${escapeHtml(formatDateTime(item.at))}</span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></li>`).join("")}</ul>` : '<p class="muted">Ingen historikk registrert.</p>';
  }

  function workOrderControls(workOrder) {
    if (!workOrder) return "";
    const id = escapeHtml(workOrder._id);
    const disabledByOtherOpen = effectiveStatus(workOrder) === "planned" && openWorkOrder && openWorkOrder._id !== workOrder._id;

    if (effectiveStatus(workOrder) === "planned") {
      const ready = workOrder.workflow?.canComplete === true;
      const fixed = workOrder.pricingMode === "fixed";
      return `
        ${ready ? `<button class="work-btn work-btn-complete" type="button" data-work-action="complete" data-id="${id}">${fixed ? "FERDIGSTILL FASTPRIS" : "FERDIGSTILL OPPDRAG"}</button>` : ""}
        <button class="work-btn work-btn-start" type="button" data-work-action="start" data-id="${id}" ${disabledByOtherOpen ? "disabled" : ""}>${ready ? "START TIDTAKING" : "START"}</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Forkast</button>`;
    }
    if (effectiveStatus(workOrder) === "active") {
      return `
        <button class="work-btn work-btn-pause" type="button" data-work-action="pause" data-id="${id}">PAUSE</button>
        <button class="work-btn work-btn-stop" type="button" data-work-action="stop" data-id="${id}">STOPP</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Avbryt oppdrag</button>`;
    }
    if (effectiveStatus(workOrder) === "paused") {
      return `
        <button class="work-btn work-btn-start" type="button" data-work-action="resume" data-id="${id}">FORTSETT</button>
        <button class="work-btn work-btn-stop" type="button" data-work-action="stop" data-id="${id}">STOPP</button>
        <button class="work-btn work-btn-ghost" type="button" data-work-action="cancel" data-id="${id}">Avbryt oppdrag</button>`;
    }
    if (effectiveStatus(workOrder) === "stopped") {
      return `
        <button class="work-btn work-btn-start" type="button" data-work-action="resume" data-id="${id}">FORTSETT OPPDRAG</button>
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
      return;
    }

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

        ${status === "stopped" ? '<p class="meter-stopped-note">Arbeidsøkten er avsluttet. Åpne detaljer for arbeidslogg, registreringer og ferdigstilling.</p>' : ""}

        <div class="meter-controls">${workOrderControls(openWorkOrder)}</div>
      </article>`;
  }

  const NOK = new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 });
  const boardFilters = ["attention", "waiting", "working", "planned", "done", "other", "test", "cancelled", "unknown"];
  function filteredWorkOrders() {
    const query = (historySearch.value || "").trim().toLowerCase();
    const filter = historyStatus.value;
    return (orderBoard?.records || []).filter(({ order, finance }) => {
      if (filter !== "all" && finance.group !== filter) return false;
      if (!query) return true;
      const customer = order.customerSnapshot || {};
      return [customer.name, customer.email, customer.phone, order.serviceName,
        order.notes, finance.stageLabel, ...finance.labels.map((item) => item.label),
        ...finance.linkedInvoices.map((inv) => inv.number)]
        .join(" ").toLowerCase().includes(query);
    });
  }

  function boardChip(key, label) {
    return '<span class="order-board-status-chip" data-finance="' +
      escapeHtml(key) + '">' + escapeHtml(label) + '</span>';
  }

  function financeInfo(finance) {
    const invoices = finance.linkedInvoices || [];
    const primaryInvoice = invoices.find((item) => item.id && ["draft", "issued", "sent"].includes(item.status)) || invoices[0];
    const numberText = primaryInvoice?.number ? "Faktura " + primaryInvoice.number : primaryInvoice ? "Fakturautkast" : "";
    const unpaid = Number(finance.outstanding) || 0;
    const fragments = [numberText];
    if (unpaid > 0) fragments.push(NOK.format(unpaid) + " uteståande");
    if (primaryInvoice?.dueDate && ["sent", "issued"].includes(primaryInvoice.status))
      fragments.push("Forfall " + primaryInvoice.dueDate.split("-").reverse().join("."));
    if (finance.source === "ambiguous") fragments.push("Kunden har ein faktura utan sikker oppdragskopling");
    return fragments.filter(Boolean).join(" · ");
  }

  function renderBoardSummary() {
    const mount = document.getElementById("orderBoardSummary");
    const errorElement = document.getElementById("orderBoardError");
    if (!mount || !errorElement || !orderBoard) return;
    const healthy = orderBoard.financeAvailable;
    errorElement.hidden = healthy;
    errorElement.textContent = healthy ? "" :
      "Fakturastatus kunne ikkje hentast. Oppdraga kan visast, men det er ikkje trygt å konkludere med at noko er fakturert eller betalt. " +
      (financeError ? "Feil: " + financeError : "Prøv Oppdater.");
    const summary = orderBoard.summary;
    const tile = (filter, value, title, desc) => {
      const selected = historyStatus.value === filter;
      return '<button type="button" class="order-board-total' + (selected ? ' active' : '') +
        '" data-board-filter="' + filter + '" aria-pressed="' + String(selected) + '">' +
        '<strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(title) +
        '</span><small>' + escapeHtml(desc) + '</small></button>';
    };
    mount.innerHTML = '<div class="order-board-summary-head"><div><h2>Din oversikt</h2>' +
      '<p>Arbeid og økonomi blir følgt opp kvar for seg. Ingen manuell statusdobling.</p></div></div>' +
      '<div class="order-board-totals">' +
      tile("attention", healthy ? summary.attention : "–", "Krev handling", "Faktura, levering eller forfall") +
      tile("waiting", healthy ? summary.waiting : "–", "Ventar på betaling", "Faktura sendt, ikkje betalt") +
      tile("working", summary.working, "I arbeid", "Aktive og stoppa økter") +
      tile("done", healthy ? summary.done : "–", "Ferdig og betalt", "Inga open betalingsoppgåve") +
      '</div>' +
      (healthy ? '<div class="order-board-balance"><div><span>Uteståande på alle registrerte fakturaer</span><strong>' +
        escapeHtml(NOK.format(summary.outstanding)) + '</strong><small>' +
        summary.unpaidInvoices + ' fakturaer utstedt/sendt, av desse ' + summary.overdueInvoices +
        ' registrert forfalne. Restbeløp frå Fiken blir brukt når det finst.</small></div>' +
        '<a href="fakturaer.html">Sjå alle fakturaer</a></div>' :
        '<p class="order-board-diagnostic">Oppdater sida når fakturatenesta er tilgjengeleg. I mellomtida blir ingen oppdrag feilaktig merkte som betalte eller ufakturerte.</p>');
  }

  function renderHistory() {
    const visible = filteredWorkOrders();
    const renderCard = ({ order, finance }) => {
      const customer = order.customerSnapshot || {};
      const seconds = calculateWorkSeconds(order);
      // Bruk same registeroversikt som kundedetaljen. Den gamle kortsummen
      // tok berre med timebetaling og viste til dømes 0 kr når kunden hadde utgifter.
      const ledger = window.SorgulenCustomerLedger?.summarizeOrder(order);
      const amount = ledger ? ledger.estimate : calculateEstimatedAmount(order, seconds);
      const status = effectiveStatus(order);
      const showAmount = status !== "planned" && status !== "cancelled";
      const labelChips = finance.labels.length
        ? finance.labels.map((label) => boardChip(label.key, label.label + (label.count > 1 ? " (" + label.count + ")" : ""))).join("")
        : boardChip(finance.source === "unbilled" ? "unbilled" :
          finance.source === "ambiguous" ? "ambiguous" :
          finance.source === "unknown" ? "unknown" :
          status === "cancelled" ? "cancelled" : finance.source === "test" ? "test" : "unlinked",
          finance.source === "unbilled" ? "Ingen kopla faktura" :
          finance.source === "ambiguous" ? "Fakturakopling uklar" :
          finance.source === "unknown" ? "Økonomistatus utilgjengeleg" :
          status === "cancelled" ? "Ingen aktiv oppfølging" : finance.source === "test" ? "Testdata" :
          "Inga uteståande faktura");
      const action = finance.href
        ? '<a class="order-board-action" href="' + escapeHtml(finance.href) + '">' + escapeHtml(finance.action) + '</a>'
        : '<span class="order-board-note">' + escapeHtml(finance.action || "Ingen handling") + '</span>';
      return '<article class="work-history-card work-history-card-simple order-board-card status-' +
        escapeHtml(status) + ' order-board-' + escapeHtml(finance.group) + '">' +
        '<button type="button" class="work-history-open open-job-detail" data-id="' + escapeHtml(order._id) + '">' +
          '<span class="history-main"><strong>' + escapeHtml(customer.name || "Ukjend kunde") +
          (order.isTest ? ' <span class="work-status-badge history-test">TEST</span>' : '') +
          '</strong><span>' + escapeHtml(order.serviceName || "Oppdrag") + '</span></span>' +
          '<span class="history-summary"><span>' + escapeHtml(formatDate(order.jobDate)) + '</span>' +
          (status === "planned" ? "" : '<span>' + escapeHtml(formatDuration(seconds)) + '</span>') +
          (showAmount ? '<span>Registrert anslag ' + escapeHtml(formatCurrency(amount, true)) + '</span>' : '') + '</span>' +
          '<span class="history-tail"><span class="work-status-badge status-' + escapeHtml(status) + '">' +
          escapeHtml(finance.stageLabel) + '</span><b aria-hidden="true">›</b></span></button>' +
          '<div class="order-board-status" aria-label="Økonomistatus">' + labelChips + '</div>' +
          '<div class="order-board-next"><span>' + escapeHtml(financeInfo(finance) || (
            finance.source === "unbilled" ? "Arbeidet er ferdig. Fakturagrunnlaget må kontrollerast." :
            finance.source === "unknown" ? "Klarte ikkje hente opplysningar om faktura." :
            finance.group === "working" ? "Oppdraget pågår – opne for timar og registreringar." :
            finance.group === "planned" ? "Neste steg: utfør arbeidet." :
            finance.group === "done" ? "Oppdraget er betalt og ferdig." : "Arbeid og økonomi er viste kvar for seg."
          )) + '</span>' + action + '</div></article>';
    };

    const grouped = boardFilters.map((key) => {
      const entries = visible.filter((item) => item.finance.group === key);
      if (!entries.length) return "";
      const cards = entries.map(renderCard).join("");
      const title = escapeHtml(orderBoard?.groupNames?.[key] || key);
      const count = '<span class="order-group-count">' + entries.length + '</span>';
      if (["test", "cancelled"].includes(key) && historyStatus.value === "all")
        return '<details class="work-order-group work-order-group-' + key +
          ' order-board-secondary"><summary class="work-order-group-title">' + title + count +
          '</summary>' + cards + '</details>';
      return '<section class="work-order-group work-order-group-' + key +
        '"><h3 class="work-order-group-title">' + title + count +
        '</h3>' + cards + '</section>';
    }).join("");
    // Fakturaer frå andre kanalar kan ikkje koplast til eit oppdrag berre fordi kundenamnet liknar.
    const invoiceSearch = (historySearch.value || "").trim().toLowerCase();
    const extraInvoices = (orderBoard?.unmatchedInvoices || []).filter((invoice) => {
      if (!["all", "attention", "waiting"].includes(historyStatus.value)) return false;
      if (historyStatus.value !== "all" && invoice.group !== historyStatus.value) return false;
      return !invoiceSearch || [invoice.name, invoice.number, invoice.status].join(" ").toLowerCase().includes(invoiceSearch);
    });
    const extra = orderBoard?.financeAvailable && extraInvoices.length
      ? '<section class="order-board-other-invoices"><h3>Andre fakturaer som må følgjast opp (' +
        extraInvoices.length + ')</h3><p>Fakturaene har ikkje ei eintydig oppdragskopling i systemet. ' +
        'Dei kan komme frå booking, førespurnad eller manuell fakturering. Dei er ikkje automatisk knytte til feil kundeoppdrag.</p>' +
        extraInvoices.map((inv) =>
          '<div class="order-board-other-invoice"><div><strong>' +
          escapeHtml(inv.name) + (inv.number ? ' · faktura ' + escapeHtml(inv.number) : ' · fakturautkast') +
          '</strong><span>' + escapeHtml(inv.status === "draft" ? "Utkast må kontrollerast" :
          inv.status === "issued" ? "Utstedt – kontroller levering" :
          inv.overdue ? "Forfalt – følg opp" : "Sendt – ventar på betaling") +
          (inv.outstanding > 0 ? ' · ' + escapeHtml(NOK.format(inv.outstanding)) + ' uteståande' : '') +
          '</span></div><a class="order-board-action" href="faktura-detalj.html?id=' +
          encodeURIComponent(inv.id) + '">Åpne faktura</a></div>'
        ).join("") + '</section>'
      : "";
    historyContainer.innerHTML = grouped + extra;
    if (!grouped && !extra) historyContainer.innerHTML = '<div class="order-board-empty">Ingen oppdrag i denne gruppa.</div>';
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
      const source = option.sourceType === "booking" ? "Booking" : option.sourceType === "request" ? "Prisforespørsel" : "Kunderegister";
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
    customerEmailInput.value = customer.email || "";
    customerPhoneInput.value = customer.phone || "";
    customerAddressInput.value = customer.address || "";
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
    const hourlyRate = getHourlyRate();
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      setMessage("Skriv inn en gyldig timesats.", "error");
      customRateInput.focus();
      return;
    }

    const payload = {
      customerSourceType: selectedCustomer?.sourceType || "manual",
      customerSourceId: selectedCustomer?.sourceId || null,
      customerId: selectedCustomer?.sourceType === "customer" ? selectedCustomer.sourceId : null,
      customer: selectedCustomer?.customer || { name: customerSearch.value.trim(), email: customerEmailInput.value.trim(), phone: customerPhoneInput.value.trim(), address: customerAddressInput.value.trim() },
      serviceName: serviceNameInput.value.trim(),
      jobDate: jobDateInput.value,
      hourlyRate,
      pricingMode: pricingModeInput.value,
      fixedPrice: fixedPriceInput.value,
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

  async function confirmationForAction(action, id, customerName) {
    if (action === "stop") {
      askForConfirmation({
        title: "Stoppe tidtakingen?",
        text: `Den aktive arbeidsøkten for ${customerName} avsluttes. Prosjektet og historikken beholdes, og kan fortsettes senere.`,
        confirmLabel: "Ja, stopp",
        run: () => performAction(id, action),
      });
      return;
    }
    if (action === "complete") {
      try {
        const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(id)}/completion-check`);
        const check = data.completionCheck || { blocking: [], warnings: [] };
        if (check.blocking.length) { setMessage(check.blocking.join(" "), "error"); return; }
        const warningText = check.warnings.length ? ` Kontroller: ${check.warnings.join(" ")}` : "";
        askForConfirmation({ title: "Ferdigstille prosjektet?", text: `All tid, utgifter, materialer og notater for ${customerName} bevares. Prosjektet blir klart til fakturering.${warningText}`, confirmLabel: "Fullfør prosjekt", danger: false, run: () => performAction(id, action, { confirmWarnings: true }) });
      } catch (error) { setMessage(error.message, "error"); }
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

  async function performAction(id, action, extra = {}) {
    if (actionInFlight) return;
    actionInFlight = true;
    setActionButtonsDisabled(true);
    setMessage(actionLabels[action] || "Lagrer handling...", "info");

    try {
      const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });

      if (detailWorkOrder && detailWorkOrder._id === id) detailWorkOrder = data.workOrder;
      await loadDashboard(false);

      if (["start", "complete", "cancel"].includes(action)) closeDetailModal();
      else if (detailWorkOrder && !detailModal.classList.contains("hidden")) renderDetailModal();

      const successText = {
        start: "Takstameteret er startet.",
        pause: "Takstameteret er pauset. Pausen teller ikke som arbeidstid.",
        resume: "Takstameteret fortsetter.",
        stop: "Arbeidsøkten er avsluttet. Prosjektet kan fortsettes senere eller ferdigstilles.",
        complete: "Oppdraget er ferdigstilt og lagret i historikken.",
        cancel: "Oppdraget er markert som avbrutt. Tidsloggen er bevart.",
      };
      setMessage(successText[action] || "Oppdatert.", "success");
    } catch (err) {
      if (err.data?.workOrder && OPEN_STATUSES.has(effectiveStatus(err.data.workOrder))) {
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

  function localDateTimeValue(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function openEntry(kind, id) {
    entryTargetId = id;
    entryOperationId = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    entryForm.dataset.kind = kind;
    entryError.textContent = "";
    const billable = '<label class="check-field"><input name="billable" type="checkbox" checked> Skal med på kundens fakturagrunnlag</label>';
    if (kind === "time") {
      document.getElementById("entryModalTitle").textContent = "Legg til tid manuelt";
      entryFields.innerHTML = `<div class="entry-field"><label>Kategori</label><select name="category"><option value="work">Arbeid</option><option value="purchase">Innkjøp</option><option value="transport">Transport</option></select></div><div class="entry-field"><label>Fra</label><input name="startedAt" type="datetime-local" value="${localDateTimeValue()}" required></div><div class="entry-field"><label>Til</label><input name="endedAt" type="datetime-local" value="${localDateTimeValue(new Date(Date.now() + 60 * 60000))}" required></div><div class="entry-field"><label>Kommentar</label><input name="comment" maxlength="1000"></div>${billable}`;
    } else if (kind === "expense") {
      document.getElementById("entryModalTitle").textContent = "Ny utgift";
      entryFields.innerHTML = `<div class="entry-field"><label>Beløp</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="entry-field"><label>Beskrivelse</label><input name="description" maxlength="500" required></div><div class="entry-field"><label>Leverandør</label><input name="supplier" maxlength="160"></div><div class="entry-field"><label>Dato</label><input name="occurredAt" type="date" value="${getOsloDateInputValue()}" required></div><div class="entry-field"><label>Kvittering (bilde, valgfritt)</label><input name="receiptImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic"></div>${billable}`;
    } else if (kind === "material") {
      document.getElementById("entryModalTitle").textContent = "Nytt materiale";
      entryFields.innerHTML = `<div class="entry-field"><label>Beskrivelse</label><input name="item" maxlength="300" required></div><div class="entry-field"><label>Antall</label><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></div><div class="entry-field"><label>Enhet</label><input name="unit" value="stk" maxlength="40"></div><div class="entry-field"><label>Innkjøpspris per enhet (valgfritt)</label><input name="purchaseUnitPrice" type="number" min="0.01" step="0.01"></div><div class="entry-field"><label>Kundepris per enhet (valgfritt)</label><input name="unitPrice" type="number" min="0.01" step="0.01"></div><div class="entry-field"><label>Kommentar</label><input name="comment" maxlength="500"></div>${billable}`;
    } else {
      document.getElementById("entryModalTitle").textContent = "Nytt notat";
      entryFields.innerHTML = '<div class="entry-field"><label>Notat</label><textarea name="text" maxlength="2000" required></textarea></div>';
    }
    entryModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (actionInFlight || !entryTargetId) return;
    const kind = entryForm.dataset.kind;
    const form = new FormData(entryForm);
    const payload = Object.fromEntries(form.entries());
    payload.operationId = entryOperationId;
    if (kind !== "note") payload.billable = form.has("billable");
    if (kind === "time") {
      payload.startedAt = new Date(payload.startedAt).toISOString();
      payload.endedAt = new Date(payload.endedAt).toISOString();
    }
    if (kind === "expense") payload.occurredAt = new Date(`${payload.occurredAt}T12:00:00`).toISOString();
    const endpoint = kind === "time" ? "time-entries" : kind === "expense" ? "expenses" : kind === "material" ? "materials" : "notes";
    actionInFlight = true;
    document.getElementById("saveEntry").disabled = true;
    try {
      if (kind === "expense") {
        const receipt = form.get("receiptImage");
        delete payload.receiptImage;
        if (receipt instanceof File && receipt.size > 0) {
          if (receipt.size > 10 * 1024 * 1024) throw new Error("Kvitteringen er for stor (maks 10 MB).");
          payload.receiptImage = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Kunne ikke lese kvitteringen."));
            reader.readAsDataURL(receipt);
          });
        }
      }
      const data = await apiFetch(`/admin/work-orders/${encodeURIComponent(entryTargetId)}/${endpoint}`, { method: "POST", body: JSON.stringify(payload) });
      entryModal.classList.add("hidden");
      entryOperationId = null;
      detailWorkOrder = data.workOrder;
      await loadDashboard(false);
      renderDetailModal();
      setMessage(data.overlapWarning || "Registreringen er lagret.", data.overlapWarning ? "info" : "success");
    } catch (error) { entryError.textContent = error.message; }
    finally { actionInFlight = false; document.getElementById("saveEntry").disabled = false; }
  }

  function renderDetailModal() {
    if (!detailWorkOrder) return;
    const workOrder = detailWorkOrder;
    const customer = workOrder.customerSnapshot || {};
    const seconds = calculateWorkSeconds(workOrder);
    const amount = calculateEstimatedAmount(workOrder, seconds);
    const completed = effectiveStatus(workOrder) === "completed";
    const contactParts = [customer.phone, customer.email, customer.address].filter(Boolean);
    const expenses = workOrder.additionalCosts || [];
    const equipment = workOrder.equipment || [];
    const materials = workOrder.materials || [];
    const projectNotes = workOrder.projectNotes || [];
    const expenseTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const equipmentTotal = equipment.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const categoryTotals = intervalCategoryTotals(workOrder);

    detailModalContent.innerHTML = `
      <div class="detail-status-row">
        <span class="work-status-badge status-${escapeHtml(effectiveStatus(workOrder))}">${escapeHtml(statusLabels[effectiveStatus(workOrder)] || effectiveStatus(workOrder))}</span>
        <span>${escapeHtml(sourceLabel(workOrder))}${workOrder.sourceRefNumber ? ` · Ref #${escapeHtml(workOrder.sourceRefNumber)}` : ""}</span>
      </div>

      <div class="detail-grid work-order-detail-grid">
        <div><span>Kunde</span><strong>${workOrder.customerId ? `<a href="kunde.html?id=${encodeURIComponent(workOrder.customerId)}">${escapeHtml(customer.name || "Ukjent kunde")}</a>` : escapeHtml(customer.name || "Ukjent kunde")}</strong></div>
        <div><span>Kontakt</span><strong>${escapeHtml(contactParts.join(" · ") || "–")}</strong></div>
        <div><span>Oppdrag</span><strong>${escapeHtml(workOrder.serviceName)}</strong></div>
        <div><span>Dato</span><strong>${escapeHtml(formatDate(workOrder.jobDate))}</strong></div>
        <div><span>Start</span><strong>${escapeHtml(formatDateTime(workOrder.startedAt))}</strong></div>
        <div><span>Stopp</span><strong>${escapeHtml(formatDateTime(workOrder.stoppedAt))}</strong></div>
        <div><span>Arbeidstid</span><strong data-live-time-id="${escapeHtml(workOrder._id)}">${escapeHtml(formatDuration(seconds))}</strong></div>
        <div><span>Timesats</span><strong>${escapeHtml(formatCurrency(workOrder.hourlyRate))} / time</strong></div>
        <div><span>${completed ? "Arbeidsbeløp" : "Estimert beløp"}</span><strong data-live-amount-id="${escapeHtml(workOrder._id)}">${escapeHtml(formatCurrency(amount, !completed && effectiveStatus(workOrder) !== "stopped"))}</strong></div>
      </div>

      ${!["completed", "cancelled"].includes(effectiveStatus(workOrder)) ? `<div class="meter-controls detail-controls"><button type="button" class="secondary-btn" data-entry="time" data-id="${escapeHtml(workOrder._id)}">+ Tid</button><button type="button" class="secondary-btn" data-entry="expense" data-id="${escapeHtml(workOrder._id)}">+ Utgift</button><button type="button" class="secondary-btn" data-entry="material" data-id="${escapeHtml(workOrder._id)}">+ Materiale</button><button type="button" class="secondary-btn" data-entry="note" data-id="${escapeHtml(workOrder._id)}">+ Notat</button></div>` : ""}

      <section class="detail-section">
        <h3>Tidslogg</h3>
        <p class="muted">Arbeid ${escapeHtml(formatDuration(categoryTotals.work))} · Innkjøp ${escapeHtml(formatDuration(categoryTotals.purchase))} · Transport ${escapeHtml(formatDuration(categoryTotals.transport))}</p>
        ${renderIntervals(workOrder)}
      </section>

      <section class="detail-section">
        <h3>Utgifter · ${escapeHtml(formatCurrency(expenseTotal))}</h3>
        ${expenses.length ? `<ul class="interval-list">${expenses.map((expense) => `<li><span>${escapeHtml(formatDateTime(expense.occurredAt))}</span><strong>${escapeHtml(expense.item)}</strong><span>${escapeHtml(formatCurrency(expense.amount))} · ${expense.billable === false ? "Intern" : "Fakturerbar"}${expense.receiptUrl ? ` · <a href="${escapeHtml(expense.receiptUrl)}" target="_blank" rel="noopener">Kvittering</a>` : ""}</span></li>`).join("")}</ul>` : '<p class="muted">Ingen utgifter registrert.</p>'}
      </section>

      <section class="detail-section">
        <h3>Utstyr · ${escapeHtml(formatCurrency(equipmentTotal))}</h3>
        ${equipment.length ? `<ul class="interval-list">${equipment.map((item) => `<li><span>${escapeHtml(formatDateTime(item.createdAt))}</span><strong>${escapeHtml(item.item)}</strong><span>${escapeHtml(String(item.durationMinutes || 0))} min · ${escapeHtml(formatCurrency(item.hourlyRateSnapshot || 0))}/t · ${escapeHtml(formatCurrency(item.amount || 0))}${item.billable === false ? " · Intern" : ""}</span></li>`).join("")}</ul>` : '<p class="muted">Ingen utstyrsbruk registrert.</p>'}
      </section>

      <section class="detail-section">
        <h3>Materialer</h3>
        ${materials.length ? `<ul class="interval-list">${materials.map((material) => `<li><span>${escapeHtml(formatDateTime(material.createdAt))}</span><strong>${escapeHtml(material.item)} · ${escapeHtml(material.quantity)}</strong><span>${material.unitPrice != null ? escapeHtml(formatCurrency(Number(material.unitPrice) * Number(material.quantity))) : "Pris ikke satt"}</span></li>`).join("")}</ul>` : '<p class="muted">Ingen materialer registrert.</p>'}
      </section>

      <section class="detail-section">
        <h3>Prosjektnotater</h3>
        ${projectNotes.length ? `<ul class="interval-list">${projectNotes.map((note) => `<li><span>${escapeHtml(formatDateTime(note.createdAt))}</span><strong>${escapeHtml(note.text)}</strong><span></span></li>`).join("")}</ul>` : '<p class="muted">Ingen løpende notater registrert.</p>'}
      </section>

      <section class="detail-section"><h3>Historikk</h3>${renderProjectHistory(workOrder)}</section>

      <section class="detail-section">
        <label for="detailNotes"><strong>Notater</strong></label>
        <textarea id="detailNotes" rows="5" maxlength="5000">${escapeHtml(workOrder.notes || "")}</textarea>
        <button id="saveDetailNotes" type="button" class="secondary-btn">Lagre notater</button>
      </section>

      ${workOrderControls(workOrder) ? `<div class="meter-controls detail-controls">${workOrderControls(workOrder)}</div>` : ""}`;
    if (effectiveStatus(workOrder) === "completed") {
      detailModalContent.insertAdjacentHTML("beforeend", `<div class="meter-controls detail-controls">${workOrder.invoiceId ? `<a class="primary-btn" href="faktura-detalj.html?id=${encodeURIComponent(workOrder.invoiceId)}">Åpne faktura</a>` : `<a class="primary-btn" href="faktura-ny.html?workOrderId=${encodeURIComponent(workOrder._id)}">Opprett fakturautkast</a>`}</div>`);
    }
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
      const estimated = !["completed", "stopped"].includes(effectiveStatus(workOrder));
      element.textContent = formatCurrency(calculateEstimatedAmount(workOrder), estimated);
    });
  }

  function ensureTickInterval() {
    if (tickInterval) return;
    tickInterval = window.setInterval(updateLiveDisplays, 1000);
  }

  async function loadDashboard(showLoading = true) {
    if (showLoading) setMessage("Henter oppdrag...", "info");
    const [activeData, historyData, invoiceResult] = await Promise.all([
      apiFetch("/admin/work-orders/active"),
      apiFetch("/admin/work-orders?limit=300"),
      apiFetch("/invoices").then((data) => ({ ok: true, invoices: data.invoices || [] }))
        .catch((error) => ({ ok: false, message: error.message })),
    ]);
    openWorkOrder = activeData.workOrder || null;
    workOrders = Array.isArray(historyData.workOrders) ? historyData.workOrders : [];
    financeError = invoiceResult.ok ? "" : invoiceResult.message;
    orderBoard = financeModel.buildBoard(workOrders, invoiceResult.invoices || [], { financeAvailable: invoiceResult.ok });
    window.SorgulenOrderBoardCurrent = orderBoard;
    renderBoardSummary();
    renderActiveWorkOrder();
    renderHistory();
    ensureTickInterval();
    if (workOrders.length >= 300) {
      setMessage("300 oppdrag henta. Fleire kan finnast i databasen – oppdragslista er ikkje komplett.", "error");
    } else if (!invoiceResult.ok) {
      setMessage("Fakturastatus manglar. Sjå feilmeldinga over.", "error");
    } else if (showLoading) setMessage(`Kontrollert ${workOrders.length} oppdrag mot fakturasystemet.`, "success");
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

  pricingModeInput.addEventListener("change", () => {
    const usesFixed = ["fixed", "hybrid"].includes(pricingModeInput.value);
    fixedPriceField.classList.toggle("hidden", !usesFixed);
    fixedPriceInput.required = usesFixed;
  });

  createForm.addEventListener("submit", createWorkOrder);
  historySearch.addEventListener("input", renderHistory);
  historyStatus.addEventListener("change", () => { renderHistory(); renderBoardSummary(); });
  document.getElementById("orderBoardSummary")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-board-filter]");
    if (!button) return;
    historyStatus.value = button.dataset.boardFilter;
    renderHistory();
    renderBoardSummary();
    document.getElementById("historyHeading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  refreshBtn.addEventListener("click", () => loadDashboard(true).catch((err) => setMessage(err.message, "error")));
  logoutBtn.addEventListener("click", () => localStorage.removeItem(KEY_STORAGE));

  document.addEventListener("click", (event) => {
    const entryButton = event.target.closest("[data-entry]");
    if (entryButton) {
      openEntry(entryButton.dataset.entry, entryButton.dataset.id);
      return;
    }
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
  document.getElementById("closeEntryModal").addEventListener("click", () => {
    entryModal.classList.add("hidden");
    if (detailModal.classList.contains("hidden")) document.body.classList.remove("modal-open");
  });
  entryForm.addEventListener("submit", saveEntry);
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
      const bookingId = new URLSearchParams(window.location.search).get("bookingId");
      if (bookingId) {
        const data = await apiFetch(`/admin/work-orders/customer-options?sourceType=booking&sourceId=${encodeURIComponent(bookingId)}`);
        const option = (data.customerOptions || []).find((candidate) => candidate.sourceType === "booking" && candidate.sourceId === bookingId);
        if (option) {
          createSection.classList.remove("hidden");
          selectCustomer(option);
          createSection.scrollIntoView({ behavior: "smooth", block: "start" });
          setMessage("Bookingen er hentet inn. Velg riktig timesats og opprett oppdraget.", "success");
        }
      }
      const requestId = new URLSearchParams(window.location.search).get("requestId");
      if (requestId) {
        const data = await apiFetch(`/admin/work-orders/customer-options?sourceType=request&sourceId=${encodeURIComponent(requestId)}`);
        const option = (data.customerOptions || [])[0];
        if (option) { createSection.classList.remove("hidden"); selectCustomer(option); createSection.scrollIntoView({ behavior: "smooth", block: "start" }); setMessage("Prisforespørselen er hentet inn. Kontroller pris og opprett prosjektet.", "success"); }
      }
      const customerId = new URLSearchParams(window.location.search).get("customerId");
      if (customerId) {
        const data = await apiFetch(`/admin/work-orders/customer-options?sourceType=customer&sourceId=${encodeURIComponent(customerId)}`);
        const option = (data.customerOptions || []).find((candidate) => candidate.sourceType === "customer" && candidate.sourceId === customerId);
        if (option) {
          createSection.classList.remove("hidden");
          selectCustomer(option);
          createSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      const openId = new URLSearchParams(window.location.search).get("open");
      if (openId) await openDetails(openId);
    } catch (err) {
      renderActiveWorkOrder();
      renderHistory();
      setMessage(err.message || "Kunne ikke hente oppdrag. Kontroller tilkoblingen og prøv igjen.", "error");
    }
  });
})();
