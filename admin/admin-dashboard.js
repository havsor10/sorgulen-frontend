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

  const serviceOptions = ["Brøyting", "Dekkskift", "Plenklipp", "Takvask", "Trefelling", "Diverse arbeid"];
  const timeOptions = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

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
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fallback(value) {
    const v = String(value ?? "").trim();
    return v || "-";
  }

  function formatDate(value) {
    if (!value) return "-";
    const normalized = String(value).slice(0, 10);
    const parts = normalized.split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return value;
  }

  function normalizedStatus(b) {
    return b.status || "pending";
  }

  function normalizedPayment(b) {
    return b.paymentStatus || "unpaid";
  }

  function findBooking(id) {
    return bookings.find((b) => String(b._id || b.id) === String(id));
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
      const phone = fallback(b.customerPhone);
      const email = fallback(b.customerEmail);
      const address = fallback(b.customerAddress);
      const comment = fallback(b.comment);
      const name = fallback(b.customerName);
      const serviceName = fallback(b.serviceName);
      const time = fallback(b.time);

      return `
        <article class="order-card status-${escapeHtml(status)}" data-id="${escapeHtml(id)}">
          <div class="order-card-header">
            <div>
              <h3>${escapeHtml(name)}</h3>
              <p>${escapeHtml(serviceName)} – ${escapeHtml(formatDate(b.date))} kl. ${escapeHtml(time)}</p>
            </div>
            <div class="badge-row">
              <span class="badge">${escapeHtml(statusLabels[status] || status)}</span>
              <span class="badge payment-${escapeHtml(payment)}">${escapeHtml(paymentLabels[payment] || payment)}</span>
            </div>
          </div>

          <div class="order-grid">
            <p><strong>Telefon:</strong> ${phone !== "-" ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : "-"}</p>
            <p><strong>E-post:</strong> ${email !== "-" ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : "-"}</p>
            <p><strong>Adresse:</strong> ${escapeHtml(address)}</p>
            <p><strong>Kommentar:</strong> ${escapeHtml(comment)}</p>
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

            <button class="editBookingBtn" type="button" data-id="${escapeHtml(id)}">Rediger</button>
            <button class="deleteBookingBtn" type="button" data-id="${escapeHtml(id)}">Slett</button>
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
    bookings = bookings.map((b) => String(b._id || b.id) === String(id) ? updated : b);
    render();
    setMessage("Oppdatert.", "success");
  }

  async function deleteBooking(id) {
    const b = findBooking(id);
    const label = b ? `${fallback(b.customerName)} – ${fallback(b.serviceName)} ${formatDate(b.date)} kl. ${fallback(b.time)}` : "denne bookingen";

    const first = window.confirm(`Er du sikker på at du vil slette bookingen?\n\n${label}`);
    if (!first) return;

    const second = window.confirm("Dette kan ikke angres. Vil du slette bookingen permanent?");
    if (!second) return;

    await apiFetch(`/admin/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
    bookings = bookings.filter((item) => String(item._id || item.id) !== String(id));
    render();
    setMessage("Booking slettet.", "success");
  }

  function makeOptions(options, selected) {
    return options.map((option) => `<option value="${escapeHtml(option)}" ${String(selected) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
  }

  function openEditModal(id) {
    const b = findBooking(id);
    if (!b) {
      setMessage("Fant ikke booking.", "error");
      return;
    }

    closeEditModal();

    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "editBookingModal";
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editBookingTitle">
        <div class="modal-header">
          <h2 id="editBookingTitle">Rediger booking</h2>
          <button type="button" class="modal-close" id="closeEditModal" aria-label="Lukk">×</button>
        </div>
        <form id="editBookingForm" class="modal-grid">
          <label>Navn
            <input type="text" name="customerName" value="${escapeHtml(b.customerName || "")}" required>
          </label>
          <label>Telefon
            <input type="tel" name="customerPhone" value="${escapeHtml(b.customerPhone || "")}" required>
          </label>
          <label>E-post
            <input type="email" name="customerEmail" value="${escapeHtml(b.customerEmail || "")}" required>
          </label>
          <label>Adresse
            <input type="text" name="customerAddress" value="${escapeHtml(b.customerAddress || "")}">
          </label>
          <label>Tjeneste
            <select name="serviceName" required>${makeOptions(serviceOptions, b.serviceName)}</select>
          </label>
          <label>Dato
            <input type="date" name="date" value="${escapeHtml(String(b.date || "").slice(0, 10))}" required>
          </label>
          <label>Tidspunkt
            <select name="time" required>${makeOptions(timeOptions, b.time)}</select>
          </label>
          <label>Status
            <select name="status" required>
              <option value="pending" ${normalizedStatus(b) === "pending" ? "selected" : ""}>Venter</option>
              <option value="planned" ${normalizedStatus(b) === "planned" ? "selected" : ""}>Planlagt</option>
              <option value="done" ${normalizedStatus(b) === "done" ? "selected" : ""}>Utført</option>
              <option value="cancelled" ${normalizedStatus(b) === "cancelled" ? "selected" : ""}>Kansellert</option>
            </select>
          </label>
          <label>Betaling
            <select name="paymentStatus" required>
              <option value="unpaid" ${normalizedPayment(b) === "unpaid" ? "selected" : ""}>Ikke betalt</option>
              <option value="paid" ${normalizedPayment(b) === "paid" ? "selected" : ""}>Betalt</option>
            </select>
          </label>
          <label class="full-row">Kommentar
            <textarea name="comment" rows="3">${escapeHtml(b.comment || "")}</textarea>
          </label>
          <div class="modal-actions full-row">
            <button type="submit" class="primary-btn">Lagre endringer</button>
            <button type="button" class="secondary-btn" id="cancelEditModal">Avbryt</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add("modal-open");

    document.getElementById("closeEditModal")?.addEventListener("click", closeEditModal);
    document.getElementById("cancelEditModal")?.addEventListener("click", closeEditModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeEditModal();
    });

    document.getElementById("editBookingForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const payload = Object.fromEntries(formData.entries());
      try {
        setMessage("Lagrer endringer...", "info");
        await updateBooking(id, payload);
        closeEditModal();
      } catch (err) {
        setMessage(err.message || "Kunne ikke lagre endringer.", "error");
      }
    });
  }

  function closeEditModal() {
    document.getElementById("editBookingModal")?.remove();
    document.body.classList.remove("modal-open");
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

  ordersList?.addEventListener("click", async (event) => {
    const editBtn = event.target.closest(".editBookingBtn");
    const deleteBtn = event.target.closest(".deleteBookingBtn");

    if (editBtn?.dataset.id) {
      openEditModal(editBtn.dataset.id);
      return;
    }

    if (deleteBtn?.dataset.id) {
      try {
        setMessage("", "info");
        await deleteBooking(deleteBtn.dataset.id);
      } catch (err) {
        setMessage(err.message || "Kunne ikke slette booking.", "error");
      }
    }
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEditModal();
  });

  document.addEventListener("DOMContentLoaded", loadBookings);
})();
