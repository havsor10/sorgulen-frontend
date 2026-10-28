(function () {
  "use strict";
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const STORAGE_KEY = "sorgulen_admin_key";
  const byId = function (id) { return document.getElementById(id); };
  const listNode = byId("rentalAdminList");
  const messageNode = byId("rentalAdminMessage");
  const filter = byId("rentalAdminFilter");
  const search = byId("rentalAdminSearch");
  let bookings = [];
  let busy = false;

  const names = {
    pending: "Ventar på svar",
    confirmed: "Stadfesta",
    completed: "Fullført",
    declined: "Avslått",
    cancelled: "Kansellert",
  };
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function authKey() {
    let value = localStorage.getItem(STORAGE_KEY) || "";
    if (!value) {
      value = (window.prompt("Skriv inn admin-nøkkelen din:") || "").trim();
      if (value) localStorage.setItem(STORAGE_KEY, value);
    }
    return value.trim();
  }
  function headers() {
    return { "Content-Type": "application/json", "x-admin-key": authKey() };
  }
  function setMessage(value, type) {
    messageNode.textContent = value || "";
    messageNode.className = "rental-admin-message" + (type ? " " + type : "");
  }
  function formatPrice(value) {
    return value == null ? "Avtalast" : Number(value).toLocaleString("nb-NO") + " kr";
  }
  function displayDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "–");
    const parts = value.split("-");
    return parts[2] + "." + parts[1] + "." + parts[0];
  }
  function actions(booking) {
    const status = booking.status || "pending";
    const choices = status === "pending"
      ? [["confirmed", "Stadfest utleige", "primary"], ["declined", "Avslå", "danger"], ["cancelled", "Kanseller", ""]]
      : status === "confirmed"
        ? [["completed", "Marker fullført", "primary"], ["cancelled", "Kanseller utleige", "danger"]]
        : status === "completed" ? [["cancelled", "Kanseller ved feil", "danger"]] : [];
    return choices.map(function (entry) {
      return '<button type="button" data-action="' + escapeHtml(entry[0]) +
        '" data-id="' + escapeHtml(booking._id) + '" class="' + escapeHtml(entry[2]) +
        '"' + (busy ? " disabled" : "") + ">" + escapeHtml(entry[1]) + "</button>";
    }).join("");
  }
  function row(label, value, isLink) {
    return "<div><span>" + escapeHtml(label) + "</span><strong>" +
      (isLink ? value : escapeHtml(value)) + "</strong></div>";
  }
  function render() {
    byId("rentalPendingCount").textContent = String(bookings.filter(function (b) { return b.status === "pending"; }).length);
    byId("rentalConfirmedCount").textContent = String(bookings.filter(function (b) { return b.status === "confirmed"; }).length);
    byId("rentalTotalCount").textContent = String(bookings.length);
    const needle = search.value.trim().toLowerCase();
    const visible = bookings.filter(function (b) {
      if (filter.value !== "all" && b.status !== filter.value) return false;
      if (!needle) return true;
      return [
        b.productName, b.customerName, b.customerEmail, b.customerPhone,
        b.startDate, b.endDate, b._id,
      ].some(function (v) { return String(v || "").toLowerCase().includes(needle); });
    });
    if (!visible.length) {
      listNode.innerHTML = '<div class="rental-admin-empty">Ingen utleigeforespurnader med dette filteret.</div>';
      return;
    }
    listNode.innerHTML = visible.map(function (b) {
      const reference = String(b._id || "").slice(-8).toUpperCase();
      const digits = String(b.customerPhone || "").replace(/[^0-9+]/g, "");
      const email = String(b.customerEmail || "");
      const safePhone = escapeHtml(digits);
      const safeEmail = escapeHtml(email);
      const phone = '<a href="tel:' + safePhone + '">' + escapeHtml(b.customerPhone || "–") + "</a>";
      const mail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? '<a href="mailto:' + safeEmail + '">' + safeEmail + "</a>"
        : "–";
      const amount = b.estimatedPrice != null ? formatPrice(b.estimatedPrice) : "Etter avtale";
      return '<article class="rental-admin-card">' +
        '<div class="rental-admin-card-head"><div><h2>' + escapeHtml(b.productName || b.productSlug) +
        '</h2><small>Referanse ' + escapeHtml(reference) + ' · ' +
        escapeHtml(String(b.createdAt || "").slice(0, 10)) + '</small></div>' +
        '<span class="rental-admin-status" data-status="' + escapeHtml(b.status) + '">' +
        escapeHtml(names[b.status] || b.status) + "</span></div>" +
        '<div class="rental-admin-detail-grid">' +
        row("Leigeperiode", displayDate(b.startDate) + " – " + displayDate(b.endDate)) +
        row("Leigepakke", ({ day: "Dag", weekend: "Helg", week: "Uke", other: "Etter avtale" })[b.periodType] || b.periodType) +
        row("Antal einingar", b.quantity || 1) +
        row("Veiledande pris", amount) +
        row("Kunde", b.customerName || "–") +
        row("Telefon", phone, true) +
        row("E-post", mail, true) +
        '</div>' +
        (b.customerNote ? '<div class="rental-admin-note">' + escapeHtml(b.customerNote) + '</div>' : "") +
        '<div class="rental-admin-actions">' + actions(b) + '</div>' +
        "</article>";
    }).join("");
  }
  async function load() {
    setMessage("Hentar utleigebestillingar …");
    try {
      const response = await fetch(API_BASE + "/admin/rentals/bookings", { headers: headers() });
      if ([401, 403].includes(response.status)) {
        localStorage.removeItem(STORAGE_KEY);
        throw new Error("Innlogginga er ikkje gyldig. Last inn sida på nytt og logg inn igjen.");
      }
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || "Kunne ikkje hente utleigeforespurnader.");
      bookings = Array.isArray(data.bookings) ? data.bookings : [];
      setMessage("");
      render();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }
  listNode.addEventListener("click", async function (event) {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button || busy) return;
    const id = button.dataset.id;
    const status = button.dataset.action;
    const booking = bookings.find(function (b) { return b._id === id; });
    if (!booking || !["confirmed", "declined", "completed", "cancelled"].includes(status)) return;
    const message = {
      confirmed: "Stadfeste leieperioden? Kalenderen blir sperra, og kunden får stadfesting på e-post.",
      declined: "Avslå leieforespurnaden? Kunden får e-post.",
      completed: "Markere denne leiga som fullført?",
      cancelled: "Kansellere leiga? Ledige datoar vil bli frigjorde, og kunden får melding.",
    }[status];
    if (!window.confirm(message)) return;
    busy = true;
    render();
    setMessage("Oppdaterer status …");
    try {
      const response = await fetch(API_BASE + "/admin/rentals/bookings/" + encodeURIComponent(id), {
        method: "PATCH", headers: headers(), body: JSON.stringify({ status: status }),
      });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.ok) throw new Error(data.error || "Kunne ikkje oppdatere utleiga.");
      setMessage("Status vart oppdatert. Kunden får e-post dersom e-posttenesta er tilgjengeleg.", "success");
      await load();
    } catch (error) {
      setMessage(error.message || "Kunne ikkje endre status.", "error");
    } finally {
      busy = false;
      render();
    }
  });
  filter.addEventListener("change", render);
  search.addEventListener("input", render);
  byId("rentalAdminRefresh").addEventListener("click", load);
  load();
}());
