(() => {
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const customerId = new URLSearchParams(location.search).get("id");
  const detail = document.getElementById("customerDetail");
  const status = document.getElementById("customerStatus");

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const fmtDate = (value) => value ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "–";
  const statusText = { planned: "Planlagt", active: "Aktiv", paused: "Pauset", stopped: "Mellom økter", completed: "Ferdig", cancelled: "Avbrutt", draft: "Utkast", sent: "Sendt", paid: "Betalt", credited: "Kreditert" };

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "content-type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data?.error || "Kunne ikke hente kunde");
    return data;
  }

  function rows(items, renderItem, empty = "Ingen registreringer.") {
    return items.length ? `<div class="customer-list">${items.map(renderItem).join("")}</div>` : `<p class="empty-state">${esc(empty)}</p>`;
  }

  function render(data) {
    const customer = data.customer;
    const activeProjects = (data.workOrders || []).filter((item) => !["completed", "cancelled"].includes(item.status));
    const previousProjects = (data.workOrders || []).filter((item) => ["completed", "cancelled"].includes(item.status));
    document.getElementById("pageTitle").textContent = customer.name;
    detail.innerHTML = `
      <section class="customer-section">
        <div class="customer-heading"><div><p class="eyebrow">Kunde</p><h2>${esc(customer.name)}</h2></div><a class="primary-btn customer-create" href="oppdrag.html?customerId=${encodeURIComponent(customer._id)}">Opprett prosjekt</a></div>
        <form id="customerEditForm" class="customer-form-grid">
          <label>Navn<input name="name" value="${esc(customer.name)}" required maxlength="160"></label>
          <label>Telefon<input name="phone" type="tel" value="${esc(customer.phone)}"></label>
          <label>E-post<input name="email" type="email" value="${esc(customer.email)}"></label>
          <label class="wide">Adresse<input name="address" value="${esc(customer.address)}" maxlength="220"></label>
          <p id="customerEditError" class="error-text wide"></p>
          <button class="secondary-btn" type="submit">Lagre kundeopplysninger</button>
        </form>
      </section>

      <section class="customer-section"><h2>Aktive prosjekter</h2>${rows(activeProjects, (item) => `<a class="customer-row" href="oppdrag.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Tidligere prosjekter</h2>${rows(previousProjects, (item) => `<a class="customer-row" href="oppdrag.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName)}</strong><p>${esc(statusText[item.status] || item.status)} · ${esc(item.jobDate)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Fakturaer</h2>${rows(data.invoices || [], (item) => `<a class="customer-row" href="faktura-detalj.html?id=${encodeURIComponent(item._id)}"><div><strong>${item.invoiceNumber ? `${item.isCreditNote ? "Kreditnota" : "Faktura"} ${esc(item.invoiceNumber)}` : "Fakturautkast"}</strong><p>${esc(item.amount)} kr · ${esc(statusText[item.status] || item.status)}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Bookinger</h2>${rows(data.bookings || [], (item) => `<a class="customer-row" href="order-detail.html?id=${encodeURIComponent(item._id)}"><div><strong>${esc(item.serviceName || "Booking")}</strong><p>${esc(item.date || fmtDate(item.createdAt))} · ${esc(item.status || "")}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section"><h2>Prisforespørsler</h2>${rows(data.requests || [], (item) => `<a class="customer-row" href="foresporsler.html?open=${encodeURIComponent(item._id)}"><div><strong>${esc(item.description || "Prisforespørsel")}</strong><p>${fmtDate(item.createdAt)} · ${esc(item.status || "")}</p></div><span>Åpne</span></a>`)}</section>
      <section class="customer-section">
        <h2>Notater</h2>
        ${rows([...(customer.notes || [])].reverse(), (note) => `<div class="customer-note"><time>${fmtDate(note.createdAt)}</time><p>${esc(note.text)}</p></div>`, "Ingen kundenotater.")}
        <form id="customerNoteForm" class="customer-note-form"><label for="customerNote">Nytt internt kundenotat</label><textarea id="customerNote" name="note" maxlength="2000" required></textarea><p id="customerNoteError" class="error-text"></p><button class="secondary-btn" type="submit">Lagre notat</button></form>
      </section>`;

    document.getElementById("customerEditForm").addEventListener("submit", saveCustomer);
    document.getElementById("customerNoteForm").addEventListener("submit", saveNote);
  }

  async function load() {
    if (!customerId) throw new Error("Kunde-id mangler");
    status.textContent = "Laster kunde…";
    const data = await api(`/admin/customers/${encodeURIComponent(customerId)}`);
    render(data);
    status.textContent = "";
  }

  async function submitPatch(form, body, errorId) {
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    document.getElementById(errorId).textContent = "";
    try {
      await api(`/admin/customers/${encodeURIComponent(customerId)}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      status.textContent = "Lagret.";
    } catch (error) {
      document.getElementById(errorId).textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function saveCustomer(event) {
    event.preventDefault();
    return submitPatch(event.currentTarget, Object.fromEntries(new FormData(event.currentTarget)), "customerEditError");
  }

  function saveNote(event) {
    event.preventDefault();
    const form = event.currentTarget;
    return submitPatch(form, { note: new FormData(form).get("note") }, "customerNoteError");
  }

  document.getElementById("logoutBtn").addEventListener("click", () => localStorage.removeItem(KEY));
  load().catch((error) => { detail.innerHTML = `<p class="error-text">${esc(error.message)}</p>`; status.textContent = ""; });
})();
