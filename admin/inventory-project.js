(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  if (!document.querySelector('script[src^="inventory-material-edit.js"]')) {
    const materialEditor = document.createElement("script");
    materialEditor.src = "inventory-material-edit.js?v=20260904-inventory2";
    document.head.appendChild(materialEditor);
  }

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const money = (value) => value == null || value === "" ? "–" : new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const qty = (value) => new Intl.NumberFormat("no-NO", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `inventory-use-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "", ...(options.headers || {}) } });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) { localStorage.removeItem(KEY); location.href = "login.html"; throw new Error("Logg inn på nytt"); }
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  const modal = document.createElement("div");
  modal.className = "operation-modal";
  modal.hidden = true;
  modal.innerHTML = '<div class="operation-sheet operation-sheet-wide"><div class="operation-head"><div><p class="section-kicker">Lager</p><h2>Materiale fra lager</h2><p>Velg varen du bruker på dette oppdraget.</p></div><button class="admin-icon-button" type="button" data-close-inventory-project>×</button></div><div id="inventoryProjectBody"></div></div>';
  document.body.appendChild(modal);
  const body = modal.querySelector("#inventoryProjectBody");

  function close() { modal.hidden = true; document.body.classList.remove("modal-open"); body.innerHTML = ""; }
  modal.querySelector("[data-close-inventory-project]").addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });

  function orderIdFromDetail() {
    return detail.querySelector("[data-entry][data-id]")?.dataset.id || detail.querySelector("[data-work-action][data-id]")?.dataset.id || "";
  }

  async function open(orderId) {
    if (!orderId) return alert("Kunne ikke finne oppdraget. Oppdater siden og prøv igjen.");
    modal.hidden = false; document.body.classList.add("modal-open");
    body.innerHTML = '<div class="loading-card">Henter lager…</div>';
    try {
      const data = await api("/admin/inventory/?limit=200");
      const items = (data.items || []).filter((item) => Number(item.stockQuantity) > 0 && !item.archivedAt);
      body.innerHTML = `<div class="operation-field"><label>Søk lager</label><input id="projectInventorySearch" type="search" placeholder="Filter, olje, merke eller varenummer"></div><div id="projectInventoryResults" class="operations-manager-list" style="margin-top:12px"></div><div id="projectInventorySelection"></div>`;
      const search = body.querySelector("#projectInventorySearch");
      const results = body.querySelector("#projectInventoryResults");
      const selection = body.querySelector("#projectInventorySelection");
      function render() {
        const q = search.value.trim().toLowerCase();
        const visible = items.filter((item) => !q || [item.name, item.brand, item.partNumber, item.category, ...(item.searchTerms || [])].join(" ").toLowerCase().includes(q)).slice(0, 50);
        results.innerHTML = visible.length ? visible.map((item) => `<button type="button" class="operations-entry" data-project-inventory-id="${esc(item._id)}" style="width:100%;text-align:left;color:inherit"><div class="operations-entry-main"><strong>${esc(item.name)}</strong><p>${esc([item.brand, item.partNumber, item.category].filter(Boolean).join(" · "))} · ${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")} på lager${item.storageLocation ? ` · ${esc(item.storageLocation)}` : ""}</p></div><div class="operations-entry-actions"><span class="secondary-btn">Velg</span></div></button>`).join("") : '<p class="empty-state">Ingen varer funnet.</p>';
        results.querySelectorAll("[data-project-inventory-id]").forEach((button) => button.addEventListener("click", () => {
          const item = items.find((candidate) => candidate._id === button.dataset.projectInventoryId);
          if (item) showSelection(item);
        }));
      }
      function showSelection(item) {
        selection.innerHTML = `<form id="projectInventoryUseForm" class="operation-grid" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--admin-border-soft)">
          <div class="operation-field wide"><strong>${esc(item.name)}</strong><span class="operation-source">${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")} på lager</span></div>
          <div class="operation-field"><label>Antall brukt</label><input name="quantity" type="number" min="0.001" max="${esc(item.stockQuantity)}" step="0.001" value="1" required></div>
          <div class="operation-field"><label>Kundepris / enhet</label><input name="unitPrice" type="number" min="0" step="0.01" value="${esc(item.defaultCustomerUnitPrice ?? "")}"></div>
          <label class="operation-check"><input name="billable" type="checkbox" checked> Fakturerbar</label>
          <div class="operation-field wide"><label>Kommentar</label><input name="comment" maxlength="500" placeholder="Valgfritt"></div>
          <div class="operation-preview"><span>Standardpris</span><strong>${esc(money(item.defaultCustomerUnitPrice))}</strong></div>
          <p id="projectInventoryError" class="operation-error wide"></p>
          <div class="operation-actions wide"><button type="submit" class="primary-btn">Legg til på oppdrag</button></div>
        </form>`;
        const form = selection.querySelector("#projectInventoryUseForm");
        form.addEventListener("submit", async (event) => {
          event.preventDefault(); const save = form.querySelector("button[type=submit]"); const error = form.querySelector("#projectInventoryError"); error.textContent = ""; save.disabled = true;
          const payload = { workOrderId: orderId, quantity: Number(form.elements.quantity.value), billable: form.elements.billable.checked, comment: form.elements.comment.value.trim(), operationId: uuid() };
          if (form.elements.unitPrice.value !== "") payload.unitPrice = Number(form.elements.unitPrice.value);
          try {
            await api(`/admin/inventory/${encodeURIComponent(item._id)}/use`, { method: "POST", body: JSON.stringify(payload) });
            close();
            await window.SorgulenAdminShell?.refreshBadges?.();
            location.reload();
          } catch (err) { error.textContent = err.message; }
          finally { save.disabled = false; }
        });
      }
      search.addEventListener("input", render); render(); search.focus();
    } catch (error) { body.innerHTML = `<p class="operation-error">${esc(error.message)}</p>`; }
  }

  function enhance() {
    if (detail.querySelector("[data-inventory-project-open]")) return;
    const reference = detail.querySelector("[data-entry=material][data-id]") || detail.querySelector("[data-entry][data-id]");
    if (!reference) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-btn";
    button.dataset.inventoryProjectOpen = "true";
    button.textContent = "+ Fra lager";
    button.addEventListener("click", () => open(orderIdFromDetail()));
    reference.parentElement?.insertBefore(button, reference.nextSibling);
  }

  const observer = new MutationObserver(() => enhance());
  observer.observe(detail, { childList: true, subtree: true });
  enhance();
})();