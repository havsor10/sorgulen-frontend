(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const uuid = (prefix) => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...(options.headers || {}) } });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) { localStorage.removeItem(KEY); location.href = "login.html"; throw new Error("Logg inn på nytt"); }
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  function currentOrderId() {
    return detail?.querySelector("[data-entry][data-id]")?.dataset.id
      || detail?.querySelector("[data-work-action][data-id]")?.dataset.id
      || new URLSearchParams(location.search).get("open")
      || "";
  }

  const modal = document.createElement("div");
  modal.className = "operation-modal";
  modal.hidden = true;
  modal.innerHTML = '<div class="operation-sheet"><div class="operation-head"><div><p class="section-kicker">Lagerkoblet materiale</p><h2 id="inventoryMaterialEditTitle">Korriger materiale</h2><p>Endringen oppdaterer både prosjektet og lagerbeholdningen.</p></div><button class="admin-icon-button" type="button" data-close-managed-material>×</button></div><div id="inventoryMaterialEditBody"></div></div>';
  document.body.appendChild(modal);
  const body = modal.querySelector("#inventoryMaterialEditBody");
  function close() { modal.hidden = true; body.innerHTML = ""; document.body.classList.remove("modal-open"); }
  modal.querySelector("[data-close-managed-material]").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });

  async function loadMaterial(entryId) {
    const orderId = currentOrderId();
    if (!orderId) return null;
    const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
    const material = (data.workOrder?.materials || []).find((entry) => entry.entryId === entryId);
    return { orderId, material };
  }

  function edit(material, orderId) {
    modal.hidden = false; document.body.classList.add("modal-open");
    modal.querySelector("#inventoryMaterialEditTitle").textContent = material.item || "Korriger materiale";
    body.innerHTML = `<form id="managedMaterialForm" class="operation-grid">
      <div class="operation-field wide"><label>Materiale</label><input name="item" maxlength="300" value="${esc(material.item)}" required></div>
      <div class="operation-field"><label>Antall brukt</label><input name="quantity" type="number" min="0.01" step="0.01" value="${esc(material.quantity)}" required></div>
      <div class="operation-field"><label>Enhet</label><input value="${esc(material.unit || "stk")}" disabled></div>
      <div class="operation-field"><label>Innkjøpspris</label><input name="purchaseUnitPrice" type="number" min="0" step="0.01" value="${esc(material.purchaseUnitPrice ?? "")}"></div>
      <div class="operation-field"><label>Kundepris</label><input name="unitPrice" type="number" min="0" step="0.01" value="${esc(material.unitPrice ?? "")}"></div>
      <label class="operation-check"><input name="billable" type="checkbox" ${material.billable === false ? "" : "checked"}> Fakturerbar</label>
      <div class="operation-field wide"><label>Kommentar</label><input name="comment" maxlength="500" value="${esc(material.comment || "")}"></div>
      <p id="managedMaterialError" class="operation-error wide"></p>
      <div class="operation-actions wide"><button type="button" class="secondary-btn" data-cancel-managed>Avbryt</button><button type="submit" class="primary-btn">Lagre og korriger lager</button></div>
    </form>`;
    const form = body.querySelector("#managedMaterialForm");
    body.querySelector("[data-cancel-managed]").addEventListener("click", close);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const save = form.querySelector("button[type=submit]"); const error = form.querySelector("#managedMaterialError"); error.textContent = ""; save.disabled = true;
      const payload = {
        quantity: Number(form.elements.quantity.value), item: form.elements.item.value.trim(),
        purchaseUnitPrice: form.elements.purchaseUnitPrice.value === "" ? null : Number(form.elements.purchaseUnitPrice.value),
        unitPrice: form.elements.unitPrice.value === "" ? null : Number(form.elements.unitPrice.value),
        billable: form.elements.billable.checked, comment: form.elements.comment.value.trim(),
        reason: "Korrigert fra admin", operationId: uuid("inventory-correct"),
      };
      try {
        await api(`/admin/inventory/usage/${encodeURIComponent(orderId)}/${encodeURIComponent(material.entryId)}`, { method: "PATCH", body: JSON.stringify(payload) });
        close(); await window.SorgulenAdminShell?.refreshBadges?.(); location.reload();
      } catch (err) { error.textContent = err.message; }
      finally { save.disabled = false; }
    });
  }

  async function remove(material, orderId) {
    if (!confirm(`Slette ${material.item} fra oppdraget og returnere ${material.quantity} ${material.unit || "stk"} til lager?`)) return;
    try {
      await api(`/admin/inventory/usage/${encodeURIComponent(orderId)}/${encodeURIComponent(material.entryId)}`, { method: "DELETE", body: JSON.stringify({ operationId: uuid("inventory-return"), reason: "Materialpost slettet fra admin" }) });
      await window.SorgulenAdminShell?.refreshBadges?.(); location.reload();
    } catch (error) { alert(error.message); }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-op-edit="material"], [data-op-delete="material"]');
    if (!button || button.dataset.inventoryBypass === "1") {
      if (button?.dataset.inventoryBypass === "1") delete button.dataset.inventoryBypass;
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      const found = await loadMaterial(button.dataset.entryId);
      if (!found?.material || found.material.source !== "inventory") {
        button.dataset.inventoryBypass = "1";
        button.click();
        return;
      }
      if (button.dataset.opEdit === "material") edit(found.material, found.orderId);
      else remove(found.material, found.orderId);
    } catch (error) { alert(error.message); }
  }, true);
}());
