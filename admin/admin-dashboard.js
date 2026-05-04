(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const ordersList = document.getElementById("ordersList");
  const statusMessage = document.getElementById("statusMessage");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const createForm = document.getElementById("createBookingForm");
  const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));

  let bookings = [];
  let currentTab = "all";

  const statusLabels = {
    pending: "Venter",
    planned: "Planlagt",
    done: "Utført",
    cancelled: "Kansellert",
  };

  const paymentLabels = {
    unpaid: "Ikke betalt",
    paid: "Betalt",
  };

  function getAdminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }

  function headers() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": getAdminKey(),
    };
  }

  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message ${type}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const parts = String(value).split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return value;
  }

  function normalizedStatus(b) {
    return b.status || "pending";
  }

  function normalizedPayment(b) {
    return b.paymentStatus || "unpaid";
  }

  function filteredBookings() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    return bookings.filter((b) => {
      const status = normalizedStatus(b);
      const payment = normalizedPayment(b);

      if (currentTab === "paid" && payment !== "paid") return false;
      if (!["all", "paid"].includes(currentTab) && status !== currentTab) return false;

      if (!q) return true;
      const haystack = [
        b.serviceName,
        b.customerName,
        b.customerEmail,
        b.customerPhone,
        b.customerAddress,
        b.date,
        b.time,
        b.comment,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  function updateCounts() {
    const counts = {
      all: bookings.length,
      pending: bookings.filter((b) => normalizedStatus(b) === "pending").length,
      planned: bookings.filter((b) => normalizedStatus(b) === "planned").length,
      done: bookings.filter((b) => normalizedStatus(b) === "done").length,
      paid: bookings.filter((b) => normalizedPayment(b) === "paid").length,
      cancelled: bookings.filter((b) => normalizedStatus(b) === "cancelled").length,
    };

    tabs.forEach((tab) => {
      const key = tab.dataset.tab;
      const label = tab.dataset.label || key;
      tab.textContent = `${label} (${counts[key] || 0})`;
    });
  }

  function render() {
    updateCounts();
    const visible = filteredBookings();

    if (!ordersList) return;
    if (!visible.length) {
      ordersList.innerHTML = `<div class="empty-state">Ingen bookinger å vise.</div>`;
      return;
    }

    ordersList.innerHTML = visible.map((b) => {
      const status = normalizedStatus(b);
      const payment = normalizedPayment(b);
      const id = String(b._id || b.id || "");

      return `
        <article class="order-card status-${escapeHtml(status)}" data-id="${escapeHtml(id)}">
          <div class="order-card-header">
            <div>
              <h3>${escapeHtml(b.customerName)}</h3>
              <p>${escapeHtml(b.serviceName)} – ${escapeHtml(formatDate(b.date))} kl. ${escapeHtml(b.time)}</p>
            </div>
            <div class="badge-row">
              <span class="badge">${escapeHtml(statusLabels[status] || status)}</span>
              <span class="badge payment-${escapeHtml(payment)}">${escapeHtml(paymentLabels[payment] || payment)}</span>
            </div>
          </div>

          <div class="order-grid">
            <p><strong>Telefon:</strong> <a href="tel:${escapeHtml(b.customerPhone)}">${escapeHtml(b.customerPhone)}</a></p>
            <p><strong>E-post:</strong> <a href="mailto:${escapeHtml(b.customerEmail)}">${escapeHtml(b.customerEmail)}</a></p>
            <p><strong>Adresse:</strong> ${escapeHtml(b.customerAddress || "-")}</p>
            <p><strong>Kommentar:</strong> ${escapeHtml(b.comment || "-")}</p>
          </div>

          <div class="order-actions">
            <label>Status
              <select class="statusSelect" data-id="${escapeHtml(id)}">
                <option value="pending" ${status === "pending" ? "selected" : ""}>Venter</option>
                <option value="planned" ${status === "planned" ? "selected" : ""}>Planlagt</option>
                <option value="done" ${status === "done" ? "selected" : ""}>Utført</option>
                <option value="cancelled" ${status === "cancelled" ? "selected" : ""}>Kansellert</option>
              </select>
            </label>

            <label>Betaling
              <select class="paymentSelect" data-id="${escapeHtml(id)}">
                <option value="unpaid" ${payment === "unpaid" ? "selected" : ""}>Ikke betalt</option>
                <option value="paid" ${payment === "paid" ? "selected" : ""}>Betalt</option>
              </select>
            </label>

            <a class="details-link" href="order-detail.html?id=${encodeURIComponent(id)}">Detaljer</a>
          </div>
        </article>
      `;
    }).join("");
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
    });

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw new Error("Admin-nøkkel er feil eller mangler.");
    }

    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || `API-feil ${res.status}`);
    return data;
  }

  async function loadBookings() {
    try {
      setMessage("Henter bookinger...", "info");
      const data = await apiFetch("/admin/bookings?limit=300");
      bookings = Array.isArray(data.bookings) ? data.bookings : [];
      setMessage(`Hentet ${bookings.length} bookinger.`, "success");
      render();
    } catch (err) {
      bookings = [];
      render();
      setMessage(err.message || "Kunne ikke hente bookinger.", "error");
    }
  }

  async function updateBooking(id, payload) {
    const data = await apiFetch(`/admin/bookings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    const updated = data.booking;
    bookings = bookings.map((b) => String(b._id) === String(id) ? updated : b);
    render();
    setMessage("Oppdatert.", "success");
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      render();
    });
  });

  searchInput?.addEventListener("input", render);
  refreshBtn?.addEventListener("click", loadBookings);

  logoutBtn?.addEventListener("click", () => {
    localStorage.removeItem(KEY_STORAGE);
  });

  ordersList?.addEventListener("change", async (event) => {
    const target = event.target;
    const id = target.dataset.id;
    if (!id) return;

    try {
      if (target.classList.contains("statusSelect")) {
        await updateBooking(id, { status: target.value });
      }
      if (target.classList.contains("paymentSelect")) {
        await updateBooking(id, { paymentStatus: target.value });
      }
    } catch (err) {
      setMessage(err.message || "Oppdatering feilet.", "error");
      await loadBookings();
    }
  });

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      serviceName: document.getElementById("createService").value,
      date: document.getElementById("createDate").value,
      time: document.getElementById("createTime").value,
      customerName: document.getElementById("createName").value,
      customerPhone: document.getElementById("createPhone").value,
      customerEmail: document.getElementById("createEmail").value,
      customerAddress: document.getElementById("createAddress").value,
      comment: document.getElementById("createComment").value,
    };

    try {
      setMessage("Lagrer booking...", "info");
      await apiFetch("/bookings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      createForm.reset();
      await loadBookings();
      setMessage("Booking opprettet.", "success");
    } catch (err) {
      setMessage(err.message || "Kunne ikke opprette booking.", "error");
    }
  });

  document.addEventListener("DOMContentLoaded", loadBookings);
})();
