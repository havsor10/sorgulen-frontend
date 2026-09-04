(() => {
  "use strict";
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const customerId = new URLSearchParams(location.search).get("id");
  const detail = document.getElementById("customerDetail");
  const status = document.getElementById("customerStatus");
  let pageData = null;
  let billingData = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "–";
  const fmtMoney = (value) => new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
  const fmtDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(total / 3600); const m = Math.round((total % 3600) / 60);
    return h ? `${h} t${m ? ` ${m} min` : ""}` : `${m} min`;
  };
  const statusText = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdig", cancelled: "Avbrutt", draft: "Utkast", sent: "Sendt", paid: "Betalt", credited: "Kreditert" };
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
    if (order.invoiceId) {
      const invoice = (pageData.invoices || []).find((item) => String(item._id) === String(order.invoiceId));
      if (invoice) return { status: invoice.status, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber };
    }
    return billingData?.billing?.usage?.[entryKey(order._id, type, entryId)] || null;
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
        if (!(seconds > 0)) continue;
        const rate = Number(entry.hourlyRateSnapshot ?? order.hourlyRate ?? 0);
        items.push({
          at: entry.workDate || entry.startedAt || order.jobDate,
          order, type: "time", entryId: entry.entryId,
          title: entry.comment || `${categoryText(entry.category)} – ${order.serviceName}`,
          meta: `${fmtDuration(seconds)} · ${fmtMoney(rate)}/t · ${fmtMoney((seconds / 3600) * rate)} · ${entry.source === "manual" ? "Manuell" : "Takstameter"}`,
          billable: entry.billable !== false,
        });
      }
      for (const entry of order.additionalCosts || []) items.push({ at: entry.occurredAt || order.jobDate, order, type: "expense", entryId: entry.entryId, title: entry.item, meta: `${fmtMoney(entry.amount)}${entry.supplier ? ` · ${entry.supplier}` : ""} · Utgift`, billable: entry.billable !== false });
      for (const entry of order.materials || []) items.push({ at: entry.createdAt || order.jobDate, order, type: "material", entryId: entry.entryId, title: entry.item, meta: `${entry.quantity} ${entry.unit || "stk"}${entry.unitPrice != null ? ` · ${fmtMoney(Number(entry.quantity) * Number(entry.unitPrice))}` : " · Pris ikke satt"} · Materiale`, billable: entry.billable !== false });
    }
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!items.length) return '<p class="empty-state">Ingen arbeid, utgifter eller materialer registrert ennå.</p>';
    return `<div class="customer-registration-list">${items.map((item) => {
      const billing = useState(item.order, item.type, item.entryId);
      return `<div class="customer-registration"><div><strong>${esc(item.title)}</strong><p>${esc(fmtDate(item.at))} · ${esc(item.meta)} · ${esc(item.order.serviceName)}</p><button type="button" class="quiet-link" style="border:0;background:none;padding:7px 0 0;cursor:pointer" data-operations-manager="${esc(item.order._id)}">Rediger registrering</button></div>${stateBadge(billing, item.billable)}</div>`;
    }).join("")}</div>`;
  }

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
    const expenses = (basis.entries || []).filter((entry) => entry.type === "expense");
    const materials = (basis.entries || []).filter((entry) => entry.type === "material");
    const schedule = customer.billingSchedule || { mode: "manual", intervalDays: 14, anchorDate: "" };

    document.getElementById("pageTitle").textContent = customer.name;
    detail.innerHTML = `
      <section class="customer-section customer-ops-hero">
        <div class="customer-heading"><div><p class="eyebrow">Kunde</p><h2>${esc(customer.name)}</h2><p style="margin:5px 0 0;color:var(--admin-muted)">${esc([customer.phone, customer.email, customer.address].filter(Boolean).join(" · ") || "Ingen kontaktinformasjon")}</p></div></div>
        <div class="customer-ops-summary">
          <div class="customer-ops-stat"><span>Ikke fakturert tid</span><strong>${esc(fmtDuration(basis.timeSeconds || 0))}</strong></div>
          <div class="customer-ops-stat"><span>Ikke fakturerte poster</span><strong>${esc(basis.count || 0)}</strong></div>
          <div class="customer-ops-stat"><span>Foreløpig grunnlag</span><strong>${esc(fmtMoney(basis.total || 0))}</strong></div>
        </div>
        ${due.due ? `<div class="billing-ready"><strong>Klar for periodisk fakturering.</strong> Det finnes ${esc(basis.count)} ikke-fakturerte poster.</div>` : ""}
        ${draftChanges.map((draft) => `<div class="billing-draft-warning"><strong>Fakturagrunnlaget er endret etter at utkastet ble laget.</strong><span>${draft.added?.length || 0} nye og ${draft.removed?.length || 0} fjernede/endrede poster.</span><p style="margin:8px 0 0"><a href="faktura-detalj.html?id=${encodeURIComponent(draft.invoiceId)}">Åpne fakturautkast</a></p></div>`).join("")}
        <div class="customer-ops-actions">
          <button type="button" class="primary-btn" data-customer-time="${esc(customer._id)}" data-rate="${esc(rate)}">+ Legg til arbeid</button>
          <a class="secondary-btn" href="oppdrag.html?customerId=${encodeURIComponent(customer._id)}">Nytt prosjekt</a>
          <button type="button" class="secondary-btn" id="toggleInvoicePanel" ${basis.count ? "" : "disabled"}>Opprett faktura</button>
        </div>
      </section>

      <section id="customerInvoicePanel" class="customer-section hidden">
        <h2>Opprett samlet fakturautkast</h2>
        <p style="color:var(--admin-muted);margin-top:0">Standard er alle ikke-fakturerte poster. Begrens perioden bare hvis du trenger det.</p>
        <form id="customerInvoiceForm" class="customer-form-grid">
          <label>Fra dato (valgfritt)<input name="from" type="date"></label>
          <label>Til dato (valgfritt)<input name="to" type="date"></label>
          <p id="customerInvoiceError" class="error-text wide"></p>
          <button class="primary-btn" type="submit">Lag fakturautkast</button>
        </form>
      </section>

      <section class="customer-section">
        <div class="customer-heading"><div><p class="eyebrow">Fakturering</p><h2>Faktureringsrytme</h2><p style="margin:5px 0 0;color:var(--admin-muted)">Nå: ${esc(scheduleLabel(schedule))}. Dette sender aldri faktura automatisk.</p></div></div>
        <form id="billingSettingsForm" class="billing-settings" style="margin-top:14px">
          <label class="operation-field">Rytme<select name="mode" id="billingMode"><option value="manual" ${schedule.mode === "manual" ? "selected" : ""}>Manuell</option><option value="interval" ${schedule.mode === "interval" ? "selected" : ""}>Hver X dag</option><option value="monthly" ${schedule.mode === "monthly" ? "selected" : ""}>Månedlig</option></select></label>
          <label class="operation-field" id="billingDaysField">Antall dager<input name="intervalDays" type="number" min="1" max="365" value="${esc(schedule.intervalDays || 14)}"></label>
          <label class="operation-field wide">Startdato / anker (valgfritt)<input name="anchorDate" type="date" value="${esc(schedule.anchorDate || "")}"></label>
          <p id="billingSettingsError" class="error-text wide"></p>
          <button class="secondary-btn" type="submit">Lagre faktureringsrytme</button>
        </form>
      </section>

      <section class="customer-section"><div class="customer-heading"><div><p class="eyebrow">Arbeidslogg</p><h2>Registreringer</h2></div></div>${registrationRows(workOrders)}</section>

      <section class="customer-section">
        <h2>Kundeopplysninger</h2>
        <form id="customerEditForm" class="customer-form-grid">
          <label>Navn<input name="name" value="${esc(customer.name)}" required maxlength="160"></label>
          <label>Telefon<input name="phone" type="tel" value="${esc(customer.phone)}"></label>
          <label>E-post<input name="email" type="email" value="${esc(customer.email)}"></label>
          <label class="wide">Adresse<input name="address" value="${esc(customer.address)}" maxlength="220"></label>
          <p id="customerEditError" class="error-text wide"></p><button class="secondary-btn" type="submit">Lagre kundeopplysninger</button>
        </form>
      </section>

      <section class="customer-section"><h2>Aktive prosjekter</h2>${rows(activeProjects, (item) => `<a class="customer-row" href="oppdrag.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Tidligere prosjekter</h2>${rows(previousProjects, (item) => `<a class="customer-row" href="oppdrag.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Fakturaer</h2>${rows(data.invoices || [], (item) => `<a class="customer-row" href="faktura-detalj.html?id=${encodeURIComponent(item._id)}"><div><strong>${item.invoiceNumber ? `${item.isCreditNote ? "Kreditnota" : "Faktura"} ${esc(item.invoiceNumber)}` : "Fakturautkast"}</strong><p>${esc(fmtMoney(item.amount))} · ${esc(statusText[item.status] || item.status)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Bookinger</h2>${rows(data.bookings || [], (item) => `<a class="customer-row" href="order-detail.html?id=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName || "Booking")}</strong><p>${esc(item.date || fmtDate(item.createdAt))} · ${esc(item.status || "")}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Prisforespørsler</h2>${rows(data.requests || [], (item) => `<a class="customer-row" href="foresporsler.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.description || "Prisforespørsel")}</strong><p>${fmtDate(item.createdAt)} · ${esc(item.status || "")}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Notater</h2>${rows([...(customer.notes || [])].reverse(), (note) => `<div class="customer-note"><time>${fmtDate(note.createdAt)}</time><p>${esc(note.text)}</p></div>`, "Ingen kundenotater.")}<form id="customerNoteForm" class="customer-note-form"><label for="customerNote">Nytt internt kundenotat</label><textarea id="customerNote" name="note" maxlength="2000" required></textarea><p id="customerNoteError" class="error-text"></p><button class="secondary-btn" type="submit">Lagre notat</button></form></section>`;

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
