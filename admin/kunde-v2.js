(() => {
  "use strict";
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const customerParams = new URLSearchParams(location.search);
  const customerId = customerParams.get("id");
  const fieldContext = customerParams.get("from") === "field" || localStorage.getItem("sorgulen_admin_mode") === "field";
  const fieldQuerySuffix = fieldContext ? "&from=field" : "";
  const customerBackLink = document.getElementById("customerBackLink");
  if (fieldContext && customerBackLink) {
    customerBackLink.href = "felt.html";
    customerBackLink.textContent = "← Tilbake til Feltadmin";
  }
  const detail = document.getElementById("customerDetail");
  const status = document.getElementById("customerStatus");
  let pageData = null;
  let billingData = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "–";
  const fmtMoney = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
  const fmtDuration = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60);
    return h ? `${h} t${m ? ` ${m} min` : ""}` : `${m} min`;
  };
  const statusText = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdig", cancelled: "Avbrutt", draft: "Utkast", issued: "Utstedt", sent: "Sendt", paid: "Betalt", credited: "Kreditert" };
  const categoryText = (value) => value === "purchase" ? "Innkjøp" : value === "transport" ? "Transport" : "Arbeid";

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "content-type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY); location.href = "login.html"; throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || "Kunne ikke hente kunde"), { status: response.status, data });
    return data;
  }

  function rows(items, renderItem, empty = "Ingen registreringer.") {
    return items.length ? `<div class="customer-list">${items.map(renderItem).join("")}</div>` : `<p class="empty-state">${esc(empty)}</p>`;
  }
  function entryKey(orderId, type, entryId) { return `${String(orderId)}:${type}:${String(entryId)}`; }
  function intervalSeconds(entry) {
    const explicit = Number(entry?.durationSeconds);
    if (entry?.source === "manual" && explicit > 0) return explicit;
    const start = new Date(entry?.startedAt).getTime();
    const end = entry?.endedAt ? new Date(entry.endedAt).getTime() : Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1000) : 0;
  }
  function useState(order, type, entryId) {
    const sourceKey = entryKey(order._id, type, entryId);
    // Fakturastatus for denne posten går før prosjektets eldre invoiceId.
    // Ei delfaktura betyr ikkje at alle andre registreringar er fakturerte.
    const usage = billingData?.billing?.usage?.[sourceKey];
    if (usage) return usage;
    if (!order.invoiceId) return null;
    const invoice = (pageData?.invoices || []).find((item) => String(item._id) === String(order.invoiceId));
    if (!invoice) return null;
    if (Array.isArray(invoice.sourceEntryKeys) && invoice.sourceEntryKeys.length && !invoice.sourceEntryKeys.includes(sourceKey)) return null;
    return { status: invoice.status, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber };
  }
  const lockedStatuses = new Set(["issued", "sent", "paid", "credited"]);
  function registrationLocked(order, type, entryId, info) {
    if (order.status === "cancelled" || lockedStatuses.has(info?.status)) return true;
    if (order.invoiceId) {
      const invoice = (pageData?.invoices || []).find((item) => String(item._id) === String(order.invoiceId));
      if (invoice && lockedStatuses.has(invoice.status)) return true;
    }
    const entry = (order.workIntervals || []).find((item) => item.entryId === entryId);
    return type === "time" && entry?.source !== "manual" && !entry?.endedAt;
  }
  function stateBadge(info, billable = true) {
    if (!billable) return '<span class="billing-state">Intern</span>';
    if (!info) return '<span class="billing-state">Ikke fakturert</span>';
    if (info.status === "draft") return '<span class="billing-state draft">I utkast</span>';
    return `<span class="billing-state invoiced">${info.invoiceNumber ? `Faktura ${esc(info.invoiceNumber)}` : "Fakturert"}</span>`;
  }
  function recentRate(workOrders) {
    const withRate = [...workOrders].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).find((item) => Number(item.hourlyRate) > 0);
    return Number(withRate?.hourlyRate) || 850;
  }

  function registrationRows(workOrders) {
    const items = [];
    for (const order of workOrders || []) {
      for (const entry of order.workIntervals || []) {
        const seconds = intervalSeconds(entry);
        const rate = Number(entry.hourlyRateSnapshot ?? order.hourlyRate ?? 0);
        const amountText = entry.billable === false ? "Intern" : order.pricingMode === "fixed"
          ? "Inkludert i fastpris"
          : fmtMoney(window.SorgulenWorkOrderTime.calculateEstimatedAmount({
            status: "stopped", hourlyRate: rate, workIntervals: [entry],
          }));
        items.push({
          at: entry.workDate || entry.startedAt || order.jobDate,
          order, type: "time", entryId: entry.entryId,
          title: entry.comment || `${categoryText(entry.category)} – ${order.serviceName}`,
          meta: `${fmtDuration(seconds)} · ${fmtMoney(rate)}/t · ${amountText} · ${entry.source === "manual" ? "Manuell" : "Takstameter"}${seconds <= 0 ? " · Kontroller 0-min-økt" : ""}`,
          billable: entry.billable !== false,
        });
      }
      for (const entry of order.additionalCosts || []) items.push({
        at: entry.occurredAt || order.jobDate, order, type: "expense", entryId: entry.entryId,
        title: entry.item, meta: `${fmtMoney(entry.amount)}${entry.supplier ? ` · ${entry.supplier}` : ""} · Utgift`, billable: entry.billable !== false,
      });
      for (const entry of order.equipment || []) items.push({
        at: entry.createdAt || order.jobDate, order, type: "equipment", entryId: entry.entryId,
        title: entry.item || "Utstyr", meta: `${entry.durationMinutes || 0} min · ${fmtMoney(entry.hourlyRateSnapshot || 0)}/t · ${fmtMoney(entry.amount || 0)} · Utstyr`, billable: entry.billable !== false,
      });
      for (const entry of order.materials || []) items.push({
        at: entry.createdAt || order.jobDate, order, type: "material", entryId: entry.entryId,
        title: entry.item, meta: `${entry.quantity} ${entry.unit || "stk"}${entry.unitPrice != null ? ` · ${fmtMoney(Number(entry.quantity) * Number(entry.unitPrice))}` : " · Kundepris manglar"} · Materiale`, billable: entry.billable !== false,
      });
      for (const entry of order.projectNotes || []) items.push({
        at: entry.createdAt || order.jobDate, order, type: "note", entryId: entry.entryId,
        title: entry.text, meta: "Prosjektnotat", billable: false,
      });
    }
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!items.length) return '<p class="empty-state">Ingen arbeid, utgifter, utstyr, materiale eller notat registrert enno.</p>';
    return `<div class="customer-registration-list customer-ledger-entries">${items.map((item) => {
      const billing = useState(item.order, item.type, item.entryId);
      const locked = registrationLocked(item.order, item.type, item.entryId, billing);
      const actions = !item.entryId ? '<span class="customer-entry-locked">Mangler ID. Opne oppdraget for kontroll.</span>'
        : locked ? '<span class="customer-entry-locked">Låst av faktura, avslutta oppdrag eller aktiv tidsøkt</span>'
          : `<button type="button" data-customer-edit-entry data-order-id="${esc(item.order._id)}" data-kind="${esc(item.type)}" data-entry-id="${esc(item.entryId)}">Rediger</button>
            <button type="button" class="customer-entry-delete" data-customer-delete-entry data-order-id="${esc(item.order._id)}" data-kind="${esc(item.type)}" data-entry-id="${esc(item.entryId)}" data-entry-label="${esc(item.title)}">Slett</button>`;
      return `<div class="customer-registration"><div><strong>${esc(item.title)}</strong>
        <p>${esc(fmtDate(item.at))} · ${esc(item.meta)} · ${esc(item.order.serviceName)}${item.order.status === "cancelled" ? " · Avbrutt" : ""}</p></div>
        ${stateBadge(billing, item.billable)}
        <div class="customer-entry-actions">${actions}</div>
      </div>`;
    }).join("")}</div>`;
  }

  let entryBusy = false;
  async function editOrDeleteEntry(button, remove) {
    if (entryBusy || button.disabled) return;
    const orderId = button.dataset.orderId;
    const entryId = button.dataset.entryId;
    const kind = button.dataset.kind;
    if (!orderId || !entryId || !["time", "expense", "equipment", "material", "note"].includes(kind)) return;
    entryBusy = true;
    button.disabled = true;
    try {
      // Sjå alltid på ferske fakturalåsar før handling – aldri stol berre på visinga.
      const result = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      const order = result.workOrder;
      const lock = order?.billingLocks?.entries?.[`${kind}:${entryId}`];
      if (order?.status === "cancelled" || order?.billingLocks?.projectLocked || lock?.locked) {
        throw new Error("Registreringa er låst. Ei utstedt faktura må korrigerast via fakturaflyten.");
      }
      if (!remove) {
        if (!window.SorgulenOperations?.openRegistration) throw new Error("Redigering er ikkje tilgjengeleg. Oppdater sida.");
        await window.SorgulenOperations.openRegistration({ orderId, kind, entryId });
        return;
      }
      if (!confirm(`Slette «${button.dataset.entryLabel || "registreringa"}»? Dette endrar registrert grunnlag. Allereie utstedt faktura blir ikkje endra.`)) return;
      const endpoint = ({ time: "time", expense: "expenses", equipment: "equipment", material: "materials", note: "notes" })[kind];
      await api(`/admin/operations/work-orders/${encodeURIComponent(orderId)}/${endpoint}/${encodeURIComponent(entryId)}`, { method: "DELETE" });
      await load();
      status.textContent = "Registreringa er sletta. Kontroller fakturautkast dersom det finst.";
      await window.SorgulenAdminShell?.refreshBadges?.();
    } catch (error) {
      status.textContent = error.message;
      status.className = "status-message error";
    } finally {
      entryBusy = false;
      button.disabled = false;
    }
  }
  detail.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-customer-edit-entry]");
    const remove = event.target.closest("[data-customer-delete-entry]");
    if (edit || remove) { event.preventDefault(); editOrDeleteEntry(edit || remove, Boolean(remove)); }
  });

  function scheduleLabel(schedule) {
    if (schedule?.mode === "monthly") return "Månedlig";
    if (schedule?.mode === "interval") return `Hver ${Number(schedule.intervalDays) || 14}. dag`;
    return "Manuell";
  }

  function render(data, billingResponse) {
    pageData = data; billingData = billingResponse;
    const customer = data.customer;
    const workOrders = data.workOrders || [];
    const activeProjects = workOrders.filter((item) => !["completed", "cancelled"].includes(item.status));
    const previousProjects = workOrders.filter((item) => ["completed", "cancelled"].includes(item.status));
    const basis = billingResponse?.billing?.basis || { entries: [], count: 0, total: 0, timeSeconds: 0 };
    const due = billingResponse?.billing?.due || { due: false };
    const draftChanges = (billingResponse?.billing?.drafts || []).filter((item) => item.changed);
    const rate = recentRate(workOrders);
    const schedule = customer.billingSchedule || { mode: "manual", intervalDays: 14, anchorDate: "" };
    const totals = window.SorgulenCustomerLedger.summarizeCustomer(workOrders);

    document.getElementById("pageTitle").textContent = customer.name;
    const primaryProject = activeProjects[0] || null;
    const historyCount = previousProjects.length + (data.invoices || []).length + (data.bookings || []).length + (data.requests || []).length;
    detail.innerHTML = `
      <section class="customer-section customer-ops-hero customer-ops-hero-simple">
        <div class="customer-heading">
          <div>
            <p class="eyebrow">Kunde</p>
            <h2>${esc(customer.name)}</h2>
            <p class="customer-contact-line">${esc([customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Ingen kontaktinformasjon")}</p>
          </div>
        </div>

        <div class="customer-ledger-summary" aria-label="Totalt registrert på kunden">
          <div class="customer-ops-stat"><span>Alle oppdrag</span><strong>${esc(totals.orders)}</strong></div>
          <div class="customer-ops-stat"><span>Arbeidstid totalt</span><strong>${esc(fmtDuration(totals.totalSeconds))}</strong></div>
          <div class="customer-ops-stat"><span>Alle registreringar</span><strong>${esc(totals.count)}</strong></div>
          <div class="customer-ops-stat"><span>Utgifter ført</span><strong>${esc(fmtMoney(totals.expensesTotal))}</strong></div>
          <div class="customer-ops-stat"><span>Utstyr ført</span><strong>${esc(fmtMoney(totals.equipmentTotal))}</strong></div>
          <div class="customer-ops-stat"><span>Materiale kundepris</span><strong>${esc(fmtMoney(totals.materialsTotal))}</strong></div>
          <div class="customer-ops-stat"><span>Sum registrert (anslag)</span><strong>${esc(fmtMoney(totals.estimate))}</strong></div>
          <div class="customer-ops-stat"><span>Ledig fakturagrunnlag</span><strong>${esc(fmtMoney(basis.total || 0))}</strong></div>
        </div>
        <p class="customer-ledger-explainer">Utgifter er det som er ført på oppdraga, også interne utgifter. Anslaget er ikkje ei utstedt faktura; tidlegare fakturerte postar kan vere inkluderte. Ledig fakturagrunnlag kjem frå serveren og inkluderer ikkje postar som ligg i fakturautkast eller utstedt faktura.</p>

        ${due.due ? `<div class="billing-ready"><strong>Klar for fakturering.</strong> ${esc(basis.count)} poster ligger klare.</div>` : ""}
        ${draftChanges.map((draft) => `<div class="billing-draft-warning"><strong>Fakturautkast må oppdateres.</strong><span>${draft.added?.length || 0} nye, ${draft.removed?.length || 0} fjernede og ${draft.modified?.length || 0} endrede poster.</span><a href="faktura-detalj.html?id=${encodeURIComponent(draft.invoiceId)}">Åpne utkast</a></div>`).join("")}

        <div class="customer-primary-actions">
          ${primaryProject
            ? `<a class="primary-btn" href="oppdrag.html?open=${encodeURIComponent(primaryProject._id)}${fieldQuerySuffix}">Åpne aktivt oppdrag</a>`
            : `<a class="primary-btn" href="oppdrag.html?customerId=${encodeURIComponent(customer._id)}${fieldQuerySuffix}">+ Nytt oppdrag</a>`}
          <details class="customer-action-more">
            <summary>Mer</summary>
            <div class="customer-action-more-menu">
              <button type="button" data-customer-time="${esc(customer._id)}" data-rate="${esc(rate)}">Registrer arbeid</button>
              ${primaryProject ? `<a href="oppdrag.html?customerId=${encodeURIComponent(customer._id)}${fieldQuerySuffix}">Nytt oppdrag</a>` : ""}
              ${basis.count ? '<button type="button" data-open-customer-billing>Opprett faktura</button>' : ""}
            </div>
          </details>
        </div>
      </section>

      ${activeProjects.length ? `
        <section class="customer-section customer-active-projects">
          <div class="customer-heading"><div><p class="eyebrow">Pågår</p><h2>Aktive oppdrag</h2></div></div>
          ${rows(activeProjects, (item) => `<a class="customer-row customer-row-primary" href="oppdrag.html?open=${encodeURIComponent(item._id)}${fieldQuerySuffix}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>›</span></a>`)}
        </section>` : ""}

      <details id="customerBillingSection" class="customer-section customer-collapse">
        <summary><span><strong>Fakturering</strong><small>${basis.count ? `${esc(basis.count)} poster · ${esc(fmtMoney(basis.total || 0))}` : "Ingen poster klare"}</small></span><b>›</b></summary>
        <div class="customer-collapse-body">
          <div class="customer-billing-overview">
            <div><span>Ikke fakturert tid</span><strong>${esc(fmtDuration(basis.timeSeconds || 0))}</strong></div>
            <div><span>Poster</span><strong>${esc(basis.count || 0)}</strong></div>
            <div><span>Grunnlag</span><strong>${esc(fmtMoney(basis.total || 0))}</strong></div>
          </div>
          <button type="button" class="primary-btn" id="toggleInvoicePanel" ${basis.count ? "" : "disabled"}>Opprett fakturautkast</button>
          <section id="customerInvoicePanel" class="customer-inline-panel hidden">
            <h3>Samlet fakturautkast</h3>
            <p>Standard er alle ikke-fakturerte poster.</p>
            <form id="customerInvoiceForm" class="customer-form-grid">
              <label>Fra dato (valgfritt)<input name="from" type="date"></label>
              <label>Til dato (valgfritt)<input name="to" type="date"></label>
              <p id="customerInvoiceError" class="error-text wide"></p>
              <button class="primary-btn" type="submit">Lag fakturautkast</button>
            </form>
          </section>

          <details class="customer-subcollapse">
            <summary>Faktureringsrytme · ${esc(scheduleLabel(schedule))}</summary>
            <form id="billingSettingsForm" class="billing-settings">
              <label class="operation-field">Rytme<select name="mode" id="billingMode"><option value="manual" ${schedule.mode === "manual" ? "selected" : ""}>Manuell</option><option value="interval" ${schedule.mode === "interval" ? "selected" : ""}>Hver X dag</option><option value="monthly" ${schedule.mode === "monthly" ? "selected" : ""}>Månedlig</option></select></label>
              <label class="operation-field" id="billingDaysField">Antall dager<input name="intervalDays" type="number" min="1" max="365" value="${esc(schedule.intervalDays || 14)}"></label>
              <label class="operation-field wide">Startdato / anker (valgfritt)<input name="anchorDate" type="date" value="${esc(schedule.anchorDate || "")}"></label>
              <p id="billingSettingsError" class="error-text wide"></p>
              <button class="secondary-btn" type="submit">Lagre rytme</button>
            </form>
          </details>
        </div>
      </details>

      <details id="customerRegistrations" class="customer-section customer-collapse customer-ledger-section" open>
        <summary><span><strong>Alle registreringar</strong><small>${esc(totals.count)} postar på ${esc(totals.orders)} oppdrag · rediger eller slett direkte</small></span><b>›</b></summary>
        <div class="customer-collapse-body">${registrationRows(workOrders)}</div>
      </details>

      <details class="customer-section customer-collapse">
        <summary><span><strong>Kundeopplysninger</strong><small>Telefon, e-post og adresse</small></span><b>›</b></summary>
        <div class="customer-collapse-body">
          <form id="customerEditForm" class="customer-form-grid">
            <label>Navn<input name="name" value="${esc(customer.name)}" required maxlength="160"></label>
            <label>Telefon<input name="phone" type="tel" value="${esc(customer.phone)}"></label>
            <label>E-post<input name="email" type="email" value="${esc(customer.email)}"></label>
            <label class="wide">Gateadresse<input name="address" value="${esc(customer.address)}" maxlength="220" autocomplete="street-address"></label>
            <label>Postnummer<input name="postalCode" value="${esc(customer.postalCode)}" maxlength="20" inputmode="numeric"></label>
            <label>Poststed<input name="city" value="${esc(customer.city)}" maxlength="100"></label>
            <label class="wide">Organisasjonsnummer<input name="organizationNumber" value="${esc(customer.organizationNumber)}" maxlength="30" inputmode="numeric"></label>
            <p id="customerEditError" class="error-text wide"></p>
            <button class="secondary-btn" type="submit">Lagre kundeopplysninger</button>
          </form>
        </div>
      </details>

      <details class="customer-section customer-collapse">
        <summary><span><strong>Historikk</strong><small>${esc(historyCount)} elementer</small></span><b>›</b></summary>
        <div class="customer-collapse-body customer-history-groups">
          <section><h3>Tidligere oppdrag</h3>${rows(previousProjects, (item) => `<a class="customer-row" href="oppdrag.html?open=${encodeURIComponent(item._id)}${fieldQuerySuffix}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>›</span></a>`)}</section>
          <section><h3>Fakturaer</h3>${rows(data.invoices || [], (item) => `<a class="customer-row" href="faktura-detalj.html?id=${encodeURIComponent(item._id)}"><div><strong>${item.invoiceNumber ? `${item.isCreditNote ? "Kreditnota" : "Faktura"} ${esc(item.invoiceNumber)}` : "Fakturautkast"}</strong><p>${esc(fmtMoney(item.amount))} · ${esc(statusText[item.status] || item.status)}</p></div><span>›</span></a>`)}</section>
          <section><h3>Bookinger</h3>${rows(data.bookings || [], (item) => `<a class="customer-row" href="order-detail.html?id=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName || "Booking")}</strong><p>${esc(item.date || fmtDate(item.createdAt))} · ${esc(item.status || "")}</p></div><span>›</span></a>`)}</section>
          <section><h3>Prisforespørsler</h3>${rows(data.requests || [], (item) => `<a class="customer-row" href="foresporsler.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.description || "Prisforespørsel")}</strong><p>${fmtDate(item.createdAt)} · ${esc(item.status || "")}</p></div><span>›</span></a>`)}</section>
        </div>
      </details>

      <details class="customer-section customer-collapse">
        <summary><span><strong>Notater</strong><small>${esc((customer.notes || []).length)} notater</small></span><b>›</b></summary>
        <div class="customer-collapse-body">
          ${rows([...(customer.notes || [])].reverse(), (note) => `<div class="customer-note"><time>${fmtDate(note.createdAt)}</time><p>${esc(note.text)}</p></div>`, "Ingen kundenotater.")}
          <form id="customerNoteForm" class="customer-note-form">
            <label for="customerNote">Nytt internt kundenotat</label>
            <textarea id="customerNote" name="note" maxlength="2000" required></textarea>
            <p id="customerNoteError" class="error-text"></p>
            <button class="secondary-btn" type="submit">Lagre notat</button>
          </form>
        </div>
      </details>`;

    document.querySelector("[data-open-customer-billing]")?.addEventListener("click", () => {
      const section = document.getElementById("customerBillingSection");
      if (section) {
        section.open = true;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(() => document.getElementById("toggleInvoicePanel")?.click(), 150);
      }
    });
    document.getElementById("customerEditForm").addEventListener("submit", saveCustomer);
    document.getElementById("customerNoteForm").addEventListener("submit", saveNote);
    document.getElementById("billingSettingsForm").addEventListener("submit", saveBillingSettings);
    document.getElementById("billingMode").addEventListener("change", updateBillingFields);
    updateBillingFields();
    document.getElementById("toggleInvoicePanel").addEventListener("click", () => document.getElementById("customerInvoicePanel").classList.toggle("hidden"));
    document.getElementById("customerInvoiceForm").addEventListener("submit", createInvoiceDraft);
  }

  function updateBillingFields() {
    const mode = document.getElementById("billingMode")?.value;
    const field = document.getElementById("billingDaysField");
    if (field) field.style.display = mode === "interval" ? "grid" : "none";
  }

  async function load() {
    if (!customerId) throw new Error("Kunde-id mangler");
    status.textContent = "Laster kunde…";
    const [data, billing] = await Promise.all([
      api(`/admin/customers/${encodeURIComponent(customerId)}`),
      api(`/admin/operations/customers/${encodeURIComponent(customerId)}/billing-summary`),
    ]);
    render(data, billing); status.textContent = "";
  }

  async function submitPatch(form, body, errorId) {
    const button = form.querySelector("button[type=submit]"); button.disabled = true; document.getElementById(errorId).textContent = "";
    try { await api(`/admin/customers/${encodeURIComponent(customerId)}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); status.textContent = "Lagret."; window.SorgulenAdminShell?.refreshBadges?.(); }
    catch (error) { document.getElementById(errorId).textContent = error.message; }
    finally { button.disabled = false; }
  }
  function saveCustomer(event) { event.preventDefault(); return submitPatch(event.currentTarget, Object.fromEntries(new FormData(event.currentTarget)), "customerEditError"); }
  function saveNote(event) { event.preventDefault(); const form = event.currentTarget; return submitPatch(form, { note: new FormData(form).get("note") }, "customerNoteError"); }

  async function saveBillingSettings(event) {
    event.preventDefault(); const form = event.currentTarget; const error = document.getElementById("billingSettingsError"); const button = form.querySelector("button[type=submit]");
    const payload = Object.fromEntries(new FormData(form).entries()); if (payload.mode !== "interval") delete payload.intervalDays; if (!payload.anchorDate) delete payload.anchorDate;
    button.disabled = true; error.textContent = "";
    try { await api(`/admin/operations/customers/${encodeURIComponent(customerId)}/billing-settings`, { method: "PATCH", body: JSON.stringify(payload) }); await load(); status.textContent = "Faktureringsrytmen er lagret."; await window.SorgulenAdminShell?.refreshBadges?.(); }
    catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  }

  async function createInvoiceDraft(event) {
    event.preventDefault(); const form = event.currentTarget; const error = document.getElementById("customerInvoiceError"); const button = form.querySelector("button[type=submit]");
    const payload = Object.fromEntries(new FormData(form).entries()); if (!payload.from) delete payload.from; if (!payload.to) delete payload.to;
    button.disabled = true; error.textContent = "";
    try { const result = await api(`/admin/operations/customers/${encodeURIComponent(customerId)}/invoice-draft`, { method: "POST", body: JSON.stringify(payload) }); location.href = `faktura-detalj.html?id=${encodeURIComponent(result.invoice._id)}`; }
    catch (err) { error.textContent = err.message; button.disabled = false; }
  }

  load().catch((error) => { detail.innerHTML = `<p class="error-text">${esc(error.message)}</p>`; status.textContent = ""; });
})();
