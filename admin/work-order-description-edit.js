(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  let activeOrderId = "";
  let activeEntryId = "";
  let activeButton = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "x-admin-key": localStorage.getItem(KEY) || "",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
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

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("no-NO", {
      timeZone: "Europe/Oslo",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  const modal = document.createElement("div");
  modal.className = "direct-description-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="direct-description-sheet" role="dialog" aria-modal="true" aria-labelledby="directDescriptionTitle">
      <div class="direct-description-head">
        <div>
          <span>Arbeidsøkt</span>
          <h2 id="directDescriptionTitle">Hva gjorde du?</h2>
          <p id="directDescriptionMeta"></p>
        </div>
        <button type="button" class="direct-description-close" data-direct-description-close aria-label="Lukk">×</button>
      </div>
      <form id="directDescriptionForm">
        <label for="directDescriptionText">Beskrivelse av arbeidet</label>
        <textarea id="directDescriptionText" name="description" maxlength="1000" rows="6" placeholder="For eksempel: fjernet mose på øvre del av innkjørselen og spylte kantene" required></textarea>
        <p class="direct-description-help">Skriv kort nok til at du forstår fakturagrunnlaget senere.</p>
        <p class="direct-description-error" id="directDescriptionError" role="alert"></p>
        <div class="direct-description-actions">
          <button type="button" class="secondary-btn" data-direct-description-close>Avbryt</button>
          <button type="submit" class="primary-btn" id="directDescriptionSave">Lagre beskrivelse</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  const form = modal.querySelector("#directDescriptionForm");
  const textarea = modal.querySelector("#directDescriptionText");
  const meta = modal.querySelector("#directDescriptionMeta");
  const error = modal.querySelector("#directDescriptionError");
  const save = modal.querySelector("#directDescriptionSave");

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("direct-description-open");
    activeOrderId = "";
    activeEntryId = "";
    if (activeButton) activeButton.disabled = false;
    activeButton = null;
    error.textContent = "";
  }

  async function openEditor(button) {
    const workspace = button.closest("[data-field-workspace]");
    const orderId = workspace?.dataset.orderId || "";
    const entryId = button.dataset.fieldEditSession || "";
    if (!orderId || !entryId) {
      alert("Kunne ikke finne arbeidsøkten. Oppdater siden og prøv igjen.");
      return;
    }

    activeButton = button;
    activeButton.disabled = true;
    try {
      const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      const order = data.workOrder;
      const entry = (order?.workIntervals || []).find((item) => item.entryId === entryId);
      if (!entry) throw new Error("Arbeidsøkten finnes ikke lenger.");
      if (!entry.endedAt && entry.source !== "manual") throw new Error("Stopp eller pause takstameteret før du redigerer økten.");

      activeOrderId = orderId;
      activeEntryId = entryId;
      textarea.value = String(entry.comment || "");
      meta.textContent = `${formatDateTime(entry.startedAt)}${entry.endedAt ? ` – ${formatDateTime(entry.endedAt)}` : ""}`;
      error.textContent = "";
      modal.hidden = false;
      document.body.classList.add("direct-description-open");
      window.setTimeout(() => textarea.focus(), 30);
    } catch (err) {
      activeButton.disabled = false;
      activeButton = null;
      alert(err.message || "Kunne ikke åpne arbeidsøkten.");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-field-edit-session]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditor(button);
  }, true);

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-direct-description-close]")) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const description = textarea.value.trim();
    if (!description) {
      error.textContent = "Skriv kort hva du gjorde.";
      textarea.focus();
      return;
    }
    if (!activeOrderId || !activeEntryId) {
      error.textContent = "Arbeidsøkten kunne ikke identifiseres. Lukk vinduet og prøv igjen.";
      return;
    }

    save.disabled = true;
    save.textContent = "Lagrer…";
    error.textContent = "";
    try {
      await api(`/admin/operations/work-orders/${encodeURIComponent(activeOrderId)}/time/${encodeURIComponent(activeEntryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ description }),
      });
      const orderId = activeOrderId;
      closeModal();
      location.href = `oppdrag.html?open=${encodeURIComponent(orderId)}&saved=description`;
    } catch (err) {
      error.textContent = err.message || "Kunne ikke lagre beskrivelsen.";
    } finally {
      save.disabled = false;
      save.textContent = "Lagre beskrivelse";
    }
  });
})();
