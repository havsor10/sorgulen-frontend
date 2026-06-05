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

  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editBookingForm");
  const closeEditModal = document.getElementById("closeEditModal");
  const cancelEdit = document.getElementById("cancelEdit");

  const confirmModal = document.getElementById("confirmModal");
  const confirmText = document.getElementById("confirmText");
  const confirmNo = document.getElementById("confirmNo");
  const confirmYes = document.getElementById("confirmYes");

  let bookings = [];
  let currentTab = "all";
  let pendingDeleteId = null;
  let deleteStep = 0;

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
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clean(value, fallback = "-") {
    const v = String(value ?? "").trim();
    return v || fallback;
  }

  function normalizeDateValue(value) {
    if (!value) return "";
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);
    return str;
  }

  function formatDate(value) {
    const normalized = normalizeDateValue(value);
    if (!normalized) return "-";
    const parts = normalized.split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return normalized;
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
      const phone = clean(b.customerPhone);
      const email = clean(b.customerEmail);
      const address = clean(b.customerAddress);
      const comment = clean(b.comment);
      const name = clean(b.customerName);
      const serviceName = clean(b.serviceName);
      const time = clean(b.time);

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

            <button type="button" class="editBookingBtn" data-id="${escapeHtml(id)}">Rediger</button>
            <button type="button" class="deleteBookingBtn" data-id="${escapeHtml(id)}">Slett</button>
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

  function openEditModal(id) {
    const booking = findBooking(id);
    if (!booking || !editModal || !editForm) return;

    document.getElementById("editBookingId").value = id;
    document.getElementById("editName").value = booking.customerName || "";
    document.getElementById("editPhone").value = booking.customerPhone || "";
    document.getElementById("editEmail").value = booking.customerEmail || "";
    document.getElementById("editAddress").value = booking.customerAddress || "";
    document.getElementById("editService").value = booking.serviceName || "Brøyting";
    document.getElementById("editDate").value = normalizeDateValue(booking.date);
    document.getElementById("editTime").value = booking.time || "09:00";
    document.getElementById("editStatus").value = normalizedStatus(booking);
    document.getElementById("editPayment").value = normalizedPayment(booking);
    document.getElementById("editComment").value = booking.comment || "";

    editModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    editModal?.classList.add("hidden");
    confirmModal?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    pendingDeleteId = null;
    deleteStep = 0;
  }

  function openDeleteConfirm(id) {
    const booking = findBooking(id);
    pendingDeleteId = id;
    deleteStep = 1;
    if (confirmText) {
      confirmText.textContent = `Er du sikker på at du vil slette bookingen til ${booking?.customerName || "kunden"}?`;
    }
    confirmYes.textContent = "Ja";
    confirmModal?.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  async function deleteBooking(id) {
    await apiFetch(`/admin/bookings/${encodeURIComponent(id)}`, { method: "DELETE" });
    bookings = bookings.filter((b) => String(b._id || b.id) !== String(id));
    render();
    setMessage("Booking slettet.", "success");
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
    const target = event.target;
    const id = target.dataset.id;
    if (!id) return;

    if (target.classList.contains("editBookingBtn")) {
      openEditModal(id);
    }

    if (target.classList.contains("deleteBookingBtn")) {
      openDeleteConfirm(id);
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

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("editBookingId").value;
    const payload = {
      customerName: document.getElementById("editName").value.trim(),
      customerPhone: document.getElementById("editPhone").value.trim(),
      customerEmail: document.getElementById("editEmail").value.trim(),
      customerAddress: document.getElementById("editAddress").value.trim(),
      serviceName: document.getElementById("editService").value,
      date: document.getElementById("editDate").value,
      time: document.getElementById("editTime").value,
      status: document.getElementById("editStatus").value,
      paymentStatus: document.getElementById("editPayment").value,
      comment: document.getElementById("editComment").value.trim(),
    };

    try {
      setMessage("Lagrer endringer...", "info");
      await updateBooking(id, payload);
      closeModal();
    } catch (err) {
      setMessage(err.message || "Kunne ikke lagre endringer.", "error");
    }
  });

  closeEditModal?.addEventListener("click", closeModal);
  cancelEdit?.addEventListener("click", closeModal);
  confirmNo?.addEventListener("click", closeModal);

  confirmYes?.addEventListener("click", async () => {
    if (!pendingDeleteId) return closeModal();
    if (deleteStep === 1) {
      deleteStep = 2;
      if (confirmText) confirmText.textContent = "Dette kan ikke angres. Slett bookingen permanent?";
      confirmYes.textContent = "Ja, slett";
      return;
    }

    try {
      const id = pendingDeleteId;
      closeModal();
      setMessage("Sletter booking...", "info");
      await deleteBooking(id);
    } catch (err) {
      setMessage(err.message || "Kunne ikke slette booking.", "error");
      await loadBookings();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      serviceName: document.getElementById("createService").value,
      date: document.getElementById("createDate").value,
      time: document.getElementById("createTime").value,
      customerName: document.getElementById("createName").value.trim(),
      customerPhone: document.getElementById("createPhone").value.trim(),
      customerEmail: document.getElementById("createEmail").value.trim(),
      customerAddress: document.getElementById("createAddress").value.trim(),
      comment: document.getElementById("createComment").value.trim(),
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