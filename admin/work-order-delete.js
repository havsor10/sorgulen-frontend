(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  let decorating = false;

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

  function orderIdFromDetail() {
    return detail.querySelector("[data-field-workspace][data-order-id]")?.dataset.orderId
      || detail.querySelector("[data-field-closed-order-id]")?.dataset.fieldClosedOrderId
      || detail.querySelector("[data-work-action][data-id]")?.dataset.id
      || "";
  }

  function removeDeleteZone() {
    detail.querySelectorAll("[data-work-order-delete-zone]").forEach((node) => node.remove());
  }

  async function decorate() {
    if (decorating || detail.querySelector("[data-work-order-delete]")) return;
    const orderId = orderIdFromDetail();
    if (!orderId) return;

    decorating = true;
    try {
      const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      const order = data?.workOrder;
      if (!order || order.invoiceId || ["active", "paused"].includes(order.status)) {
        removeDeleteZone();
        return;
      }

      const zone = document.createElement("section");
      zone.dataset.workOrderDeleteZone = "true";
      zone.style.marginTop = "18px";
      zone.style.paddingTop = "14px";
      zone.style.borderTop = "1px solid rgba(180,85,85,.35)";
      zone.innerHTML = `
        <button type="button" class="danger-btn" data-work-order-delete style="width:100%">Slett oppdrag</button>
        <p class="muted" style="margin:8px 0 0">Sletter bare oppdraget. Kunden beholdes.</p>`;

      const workspace = detail.querySelector("[data-field-workspace]") || detail;
      workspace.appendChild(zone);

      zone.querySelector("[data-work-order-delete]").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const customer = order.customerSnapshot?.name || "kunden";
        const service = order.serviceName || "oppdraget";
        const hasRegistrations = Boolean(
          (order.workIntervals || []).length
          || (order.additionalCosts || []).length
          || (order.materials || []).length
          || (order.projectNotes || []).length
        );
        const warning = hasRegistrations
          ? "\n\nRegistrert tid, utgifter, materialer og notater på oppdraget blir også slettet."
          : "";
        if (!confirm(`Slette oppdraget «${service}» for ${customer}?\n\nKunden blir beholdt.${warning}\n\nDette kan ikke angres.`)) return;

        button.disabled = true;
        button.textContent = "Sletter…";
        try {
          await api(`/admin/work-orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
          location.href = "oppdrag.html?deleted=1";
        } catch (error) {
          alert(error.message || "Kunne ikke slette oppdraget.");
          button.disabled = false;
          button.textContent = "Slett oppdrag";
        }
      });
    } catch (_) {
      removeDeleteZone();
    } finally {
      decorating = false;
    }
  }

  new MutationObserver(() => window.setTimeout(decorate, 0)).observe(detail, { childList: true, subtree: true });
  window.setTimeout(decorate, 120);
})();
