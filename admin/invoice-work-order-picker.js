(() => {
  "use strict";
  if (!location.pathname.endsWith("/faktura-ny.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const params = new URLSearchParams(location.search);
  const selectedWorkOrderId = String(params.get("workOrderId") || "").trim();
  const cards = [...document.querySelectorAll(".nf-card")];
  const legacyLookupCard = cards[0] || null;
  const main = document.querySelector("main");

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function money(value) {
    return new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  async function api(path) {
    const response = await fetch(`${API}${path}`, {
      cache: "no-store",
      headers: { "x-admin-key": localStorage.getItem(KEY) || "" },
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

  function insertBeforeFirstCard(node) {
    if (legacyLookupCard?.parentNode) legacyLookupCard.parentNode.insertBefore(node, legacyLookupCard);
    else main?.appendChild(node);
  }

  async function showSelectedSource() {
    if (!selectedWorkOrderId) return;
    if (legacyLookupCard) legacyLookupCard.hidden = true;

    const card = document.createElement("section");
    card.className = "nf-card invoice-workorder-source";
    card.innerHTML = `<h3>Faktura fra kundeoppdrag</h3><p class="hint">Henter kunde, arbeid, priser, utgifter og materialer automatisk fra oppdraget…</p>`;
    insertBeforeFirstCard(card);

    try {
      const data = await api(`/invoices/work-order/${encodeURIComponent(selectedWorkOrderId)}`);
      const customer = data.customer || {};
      const total = Number(data.totals?.amount ?? data.basis?.amount ?? 0);
      card.innerHTML = `
        <h3>Faktura fra kundeoppdrag</h3>
        <div class="invoice-workorder-selected">
          <strong>${esc(customer.name || "Kunde")}</strong>
          <span>${esc(data.description || "Utført arbeid")}</span>
          <span>${esc(data.serviceDateFrom || "")}${total > 0 ? ` · ${esc(money(total))}` : ""}</span>
        </div>
        <p class="hint">Fakturafeltene under er fylt fra oppdraget. Du trenger ikkje referansenummer.</p>
        <a class="quiet-link" href="oppdrag.html?open=${encodeURIComponent(selectedWorkOrderId)}">← Tilbake til oppdraget</a>`;
    } catch (error) {
      card.innerHTML = `<h3>Kunne ikkje hente oppdraget</h3><p class="lookup-fail">${esc(error.message)}</p><a class="quiet-link" href="oppdrag.html?open=${encodeURIComponent(selectedWorkOrderId)}">← Tilbake til oppdraget</a>`;
    }
  }

  async function showWorkOrderPicker() {
    if (selectedWorkOrderId) return;
    if (legacyLookupCard) {
      const heading = legacyLookupCard.querySelector("h3");
      const hint = legacyLookupCard.querySelector(".hint");
      if (heading) heading.textContent = "Eller hent fra bestilling / forespørsel";
      if (hint) hint.textContent = "Referansenummer brukes bare for gamle bestillinger og prisforespørsler – ikkje for kundeoppdrag du har opprettet i admin.";
    }

    const card = document.createElement("section");
    card.className = "nf-card invoice-workorder-picker";
    card.innerHTML = `<h3>Fakturer ferdigstilt oppdrag</h3><p class="hint">Velg oppdraget. Kunde, arbeidstid, pris og registrerte kostnader hentes automatisk.</p><div data-invoice-workorders>Henter oppdrag…</div>`;
    insertBeforeFirstCard(card);
    const list = card.querySelector("[data-invoice-workorders]");

    try {
      const data = await api("/admin/work-orders?limit=200");
      const orders = (Array.isArray(data.workOrders) ? data.workOrders : [])
        .filter((order) => order.status === "completed" && !order.invoiceId)
        .sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt || 0) - new Date(a.completedAt || a.updatedAt || a.createdAt || 0));

      if (!orders.length) {
        list.innerHTML = '<p class="hint">Ingen ferdigstilte oppdrag uten faktura akkurat nå.</p>';
        return;
      }

      list.innerHTML = `<div class="invoice-workorder-list">${orders.map((order) => {
        const customer = order.customerSnapshot || {};
        const amount = Number(order.calculatedAmount || 0)
          + (order.additionalCosts || []).filter((x) => x.billable !== false).reduce((sum, x) => sum + Number(x.amount || 0), 0)
          + (order.materials || []).filter((x) => x.billable !== false && x.unitPrice != null).reduce((sum, x) => sum + Number(x.quantity || 0) * Number(x.unitPrice || 0), 0);
        return `<a class="invoice-workorder-row" href="faktura-ny.html?workOrderId=${encodeURIComponent(order._id)}">
          <span><strong>${esc(customer.name || "Ukjent kunde")}</strong><small>${esc(order.serviceName || "Oppdrag")} · ${esc(order.jobDate || "")}</small></span>
          <span>${amount > 0 ? esc(money(amount)) : "Åpne"} ›</span>
        </a>`;
      }).join("")}</div>`;
    } catch (error) {
      list.innerHTML = `<p class="lookup-fail">${esc(error.message)}</p>`;
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .invoice-workorder-list{display:grid;gap:8px;margin-top:12px}
    .invoice-workorder-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;border:1px solid #33465e;border-radius:14px;background:#101b2a;color:inherit!important;text-decoration:none!important}
    .invoice-workorder-row span:first-child{display:grid;gap:4px}.invoice-workorder-row small{color:#9eacbd}.invoice-workorder-row>span:last-child{white-space:nowrap;font-weight:800}
    .invoice-workorder-selected{display:grid;gap:5px;padding:14px;border:1px solid #33465e;border-radius:14px;background:#101b2a;margin:10px 0}.invoice-workorder-selected span{color:#aab7c8}
  `;
  document.head.appendChild(style);

  if (selectedWorkOrderId) showSelectedSource();
  else showWorkOrderPicker();
})();
