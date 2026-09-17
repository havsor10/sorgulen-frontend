(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const LOCKED = new Set(["ordered", "waiting_delivery", "ready_pickup", "purchased"]);
  const editor = document.getElementById("portalEditor");
  if (!editor) return;

  let refreshTimer = null;
  let currentPortal = null;
  let currentWorkOrderId = "";
  let activeProcurement = null;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function adminKey() { return (localStorage.getItem(KEY) || "").trim(); }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
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

  function selectedWorkOrderId() {
    return document.querySelector(".portal-project-button.active[data-project-id]")?.dataset.projectId || "";
  }

  function ensureModal() {
    if (document.getElementById("procurementCorrectionModal")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="procurementCorrectionModal" class="pc-modal hidden" role="dialog" aria-modal="true" aria-labelledby="pcTitle">
        <div class="pc-dialog">
          <div class="pc-head">
            <div><p>Kundeinnkjøp</p><h2 id="pcTitle">Korriger / erstatt</h2></div>
            <button type="button" class="pc-close" aria-label="Lukk">×</button>
          </div>
          <form id="pcForm" class="pc-body">
            <div class="pc-warning"><strong>Viktig:</strong> Den gamle versjonen og kundens tidligere godkjenning beholdes i historikken. Når pris, produkt eller mengde endres, må kunden godkjenne den nye versjonen før den kan markeres som innkjøpt igjen.</div>
            <div class="pc-grid">
              <label class="pc-field"><span>Hva skal kjøpes?</span><input id="pcTitleInput" maxlength="220" required></label>
              <label class="pc-field"><span>Leverandør</span><input id="pcSupplier" maxlength="220"></label>
              <label class="pc-field full"><span>Forklaring kunden skal se</span><textarea id="pcCustomerNote" maxlength="1000"></textarea></label>
              <label class="pc-field full"><span>Årsak til korrigering (internt)</span><input id="pcReason" maxlength="500" placeholder="F.eks. Byttet til annen herdende fugesand med ny pris"></label>
            </div>
            <div class="pc-items-head"><strong>Produkter, mengde og pris</strong><button type="button" class="pc-add-line">+ Produktlinje</button></div>
            <div id="pcItems" class="pc-items"></div>
            <div id="pcStatus" class="pc-status" role="status" aria-live="polite"></div>
            <div class="pc-actions"><button type="button" class="pc-cancel">Avbryt</button><button id="pcSave" type="submit" class="pc-save">Lagre ny versjon og krev ny godkjenning</button></div>
          </form>
        </div>
      </div>`);
  }

  function itemRow(item = {}) {
    return `<div class="pc-item" data-entry-id="${esc(item.entryId || "")}">
      <input data-field="name" class="wide" value="${esc(item.name || "")}" placeholder="Produkt" required>
      <input data-field="quantity" type="number" min="0.01" step="0.01" value="${esc(item.quantity ?? 1)}" placeholder="Mengde" required>
      <input data-field="unit" value="${esc(item.unit || "stk")}" placeholder="Enhet">
      <input data-field="unitPrice" type="number" min="0" step="0.01" value="${esc(item.unitPrice ?? "")}" placeholder="Pris pr. enhet" required>
      <input data-field="productUrl" class="wide" type="url" value="${esc(item.productUrl || "")}" placeholder="Produktlenke (valgfritt)">
      <input data-field="note" class="wide" value="${esc(item.note || "")}" placeholder="Merknad (valgfritt)">
      <button type="button" class="pc-remove-line">Fjern linje</button>
    </div>`;
  }

  function openCorrection(procurement) {
    ensureModal();
    activeProcurement = procurement;
    const modal = document.getElementById("procurementCorrectionModal");
    document.getElementById("pcTitleInput").value = procurement.title || "";
    document.getElementById("pcSupplier").value = procurement.supplier || "";
    document.getElementById("pcCustomerNote").value = procurement.customerNote || "";
    document.getElementById("pcReason").value = "";
    document.getElementById("pcStatus").textContent = "";
    document.getElementById("pcItems").innerHTML = (procurement.items?.length ? procurement.items : [{}]).map(itemRow).join("");
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeCorrection() {
    document.getElementById("procurementCorrectionModal")?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    activeProcurement = null;
  }

  function collectItems() {
    return [...document.querySelectorAll("#pcItems .pc-item")].map((row) => ({
      entryId: row.dataset.entryId || undefined,
      name: row.querySelector('[data-field="name"]').value.trim(),
      quantity: row.querySelector('[data-field="quantity"]').value,
      unit: row.querySelector('[data-field="unit"]').value.trim() || "stk",
      unitPrice: row.querySelector('[data-field="unitPrice"]').value,
      productUrl: row.querySelector('[data-field="productUrl"]').value.trim(),
      note: row.querySelector('[data-field="note"]').value.trim(),
    }));
  }

  async function saveCorrection(event) {
    event.preventDefault();
    if (!activeProcurement || !currentWorkOrderId) return;
    const save = document.getElementById("pcSave");
    const status = document.getElementById("pcStatus");
    save.disabled = true;
    save.textContent = "Lagrer…";
    status.textContent = "";
    try {
      await api(`/admin/customer-portal/${encodeURIComponent(currentWorkOrderId)}/procurements/${encodeURIComponent(activeProcurement.entryId)}/correct`, {
        method: "POST",
        body: JSON.stringify({
          title: document.getElementById("pcTitleInput").value.trim(),
          supplier: document.getElementById("pcSupplier").value.trim(),
          customerNote: document.getElementById("pcCustomerNote").value.trim(),
          reason: document.getElementById("pcReason").value.trim(),
          items: collectItems(),
        }),
      });
      closeCorrection();
      document.getElementById("refreshSelectedPortal")?.click();
      setTimeout(scheduleEnhance, 250);
    } catch (error) {
      status.textContent = error.message || "Kunne ikke lagre korrigeringen.";
    } finally {
      save.disabled = false;
      save.textContent = "Lagre ny versjon og krev ny godkjenning";
    }
  }

  async function removeProcurement(procurement) {
    if (!currentWorkOrderId || !procurement) return;
    const confirmed = confirm(`Fjerne «${procurement.title}» fra kundesiden?\n\nHistorikken slettes ikke. Tidligere versjon og godkjenning blir bevart internt.`);
    if (!confirmed) return;
    const reason = prompt("Årsak til at innkjøpet fjernes (valgfritt):", "") || "";
    try {
      await api(`/admin/customer-portal/${encodeURIComponent(currentWorkOrderId)}/procurements/${encodeURIComponent(procurement.entryId)}/remove`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      document.getElementById("refreshSelectedPortal")?.click();
      setTimeout(scheduleEnhance, 250);
    } catch (error) {
      alert(error.message || "Kunne ikke fjerne innkjøpet fra kundesiden.");
    }
  }

  async function enhance() {
    const workOrderId = selectedWorkOrderId();
    if (!workOrderId) return;
    currentWorkOrderId = workOrderId;
    try {
      const data = await api(`/admin/customer-portal/${encodeURIComponent(workOrderId)}`);
      currentPortal = data.portal || null;
    } catch {
      return;
    }
    const reversed = [...(currentPortal?.procurements || [])].reverse();
    const cards = [...editor.querySelectorAll(".procurement-admin-card")];
    cards.forEach((card, index) => {
      const procurement = reversed[index];
      if (!procurement) return;
      card.dataset.procurementCorrectionId = procurement.entryId;

      card.querySelectorAll("[data-cancel-procurement]").forEach((button) => {
        button.textContent = "Fjern fra kundesiden";
        button.title = "Skjuler innkjøpet for kunden, men beholder historikken i admin.";
      });

      card.querySelector(".procurement-correction-actions")?.remove();
      card.querySelector(".procurement-correction-note")?.remove();
      if (!LOCKED.has(procurement.status)) return;

      const actions = document.createElement("div");
      actions.className = "procurement-correction-actions";
      const correct = document.createElement("button");
      correct.type = "button";
      correct.className = "secondary-btn";
      correct.textContent = "Korriger / erstatt";
      correct.dataset.correctProcurement = procurement.entryId;
      actions.appendChild(correct);

      if (procurement.status === "purchased") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "secondary-btn";
        remove.textContent = "Fjern fra kundesiden";
        remove.dataset.removeLockedProcurement = procurement.entryId;
        actions.appendChild(remove);
      }
      card.appendChild(actions);

      if (procurement.correctionHistory?.length) {
        const note = document.createElement("p");
        note.className = "procurement-correction-note";
        note.textContent = `${procurement.correctionHistory.length} tidligere versjon${procurement.correctionHistory.length === 1 ? "" : "er"} er bevart i historikken.`;
        card.appendChild(note);
      }
    });
  }

  function scheduleEnhance() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(enhance, 120);
  }

  editor.addEventListener("click", (event) => {
    const correct = event.target.closest("[data-correct-procurement]");
    if (correct) {
      event.preventDefault();
      event.stopPropagation();
      const item = (currentPortal?.procurements || []).find((entry) => entry.entryId === correct.dataset.correctProcurement);
      if (item) openCorrection(item);
      return;
    }
    const remove = event.target.closest("[data-remove-locked-procurement]");
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      const item = (currentPortal?.procurements || []).find((entry) => entry.entryId === remove.dataset.removeLockedProcurement);
      if (item) removeProcurement(item);
    }
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest(".pc-close, .pc-cancel")) closeCorrection();
    if (event.target.classList.contains("pc-modal")) closeCorrection();
    if (event.target.closest(".pc-add-line")) document.getElementById("pcItems")?.insertAdjacentHTML("beforeend", itemRow());
    const removeLine = event.target.closest(".pc-remove-line");
    if (removeLine) {
      const rows = document.querySelectorAll("#pcItems .pc-item");
      if (rows.length > 1) removeLine.closest(".pc-item")?.remove();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "pcForm") saveCorrection(event);
  });

  new MutationObserver(scheduleEnhance).observe(editor, { childList: true, subtree: true });
  ensureModal();
  scheduleEnhance();
})();
