(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  let checking = false;
  let lastOrderId = "";

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

  function orderIdFromDetail() {
    const workspace = detail.querySelector("[data-field-workspace][data-order-id]");
    if (workspace?.dataset.orderId) return workspace.dataset.orderId;

    const completed = detail.querySelector("[data-field-completed-order-id]");
    if (completed?.dataset.fieldCompletedOrderId) return completed.dataset.fieldCompletedOrderId;

    const direct = detail.querySelector("[data-work-action][data-id], [data-entry][data-id]");
    if (direct?.dataset.id) return direct.dataset.id;

    const invoiceLink = detail.querySelector('a[href*="faktura-ny.html?workOrderId="]');
    if (invoiceLink) {
      try {
        return new URL(invoiceLink.getAttribute("href") || "", location.href).searchParams.get("workOrderId") || "";
      } catch (_) {}
    }
    return "";
  }

  function removePanel() {
    detail.querySelectorAll("[data-completed-workflow]").forEach((node) => node.remove());
  }

  function renderPanel(order) {
    removePanel();
    if (order.status !== "completed") return;

    const host = detail.querySelector(".field-hero") || detail;
    const panel = document.createElement("section");
    panel.className = "completed-workflow";
    panel.dataset.completedWorkflow = "true";

    if (order.invoiceId) {
      panel.innerHTML = `
        <div class="completed-workflow-copy">
          <strong>Oppdraget er fakturert / har fakturautkast</strong>
          <span>Endringer i oppdraget er låst mot fakturagrunnlaget.</span>
        </div>
        <a class="completed-workflow-primary" href="faktura-detalj.html?id=${encodeURIComponent(order.invoiceId)}">Åpne faktura</a>`;
    } else {
      panel.innerHTML = `
        <div class="completed-workflow-copy">
          <strong>Ferdigstilt – ikkje låst</strong>
          <span>Du kan fortsatt korrigere og legge til registreringer fram til fakturaen blir opprettet.</span>
        </div>
        <a class="completed-workflow-primary" href="faktura-ny.html?workOrderId=${encodeURIComponent(order._id)}">Opprett faktura fra dette oppdraget</a>
        <div class="completed-workflow-grid">
          <button type="button" data-completed-add-time>+ Tid</button>
          <button type="button" data-entry="expense" data-id="${esc(order._id)}">+ Utgift</button>
          <button type="button" data-entry="material" data-id="${esc(order._id)}">+ Materiale</button>
          <button type="button" data-entry="note" data-id="${esc(order._id)}">+ Notat</button>
          ${order.customerId ? `<a href="kunde.html?id=${encodeURIComponent(order.customerId)}">Kundeinfo</a>` : ""}
        </div>`;
    }

    if (host === detail) detail.prepend(panel);
    else host.appendChild(panel);
  }

  async function sync() {
    if (checking) return;
    const orderId = orderIdFromDetail();
    if (!orderId) {
      lastOrderId = "";
      removePanel();
      return;
    }
    if (orderId === lastOrderId && detail.querySelector("[data-completed-workflow]")) return;

    checking = true;
    try {
      const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      const order = data?.workOrder;
      if (!order) return;
      lastOrderId = orderId;
      renderPanel(order);
    } catch (error) {
      console.warn("Kunne ikke bygge ferdigstillingsflyt:", error.message);
    } finally {
      checking = false;
    }
  }

  detail.addEventListener("click", (event) => {
    const timeButton = event.target.closest("[data-completed-add-time]");
    if (!timeButton || !lastOrderId) return;
    event.preventDefault();
    if (!window.SorgulenOperations?.openManualTime) {
      alert("Tidsredigering er ikke klar. Oppdater siden og prøv igjen.");
      return;
    }
    window.SorgulenOperations.openManualTime({ orderId: lastOrderId });
  });

  const style = document.createElement("style");
  style.textContent = `
    .completed-workflow{margin-top:16px;padding:16px;border:1px solid #35506f;border-radius:18px;background:#0d1929;display:grid;gap:12px}
    .completed-workflow-copy{display:grid;gap:4px}.completed-workflow-copy strong{font-size:17px}.completed-workflow-copy span{color:#9fb0c5;line-height:1.4}
    .completed-workflow-primary{display:flex;align-items:center;justify-content:center;min-height:54px;padding:12px 16px;border-radius:14px;background:#e9eef5;color:#101722!important;text-decoration:none!important;font-weight:900;text-align:center}
    .completed-workflow-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.completed-workflow-grid button,.completed-workflow-grid a{min-height:46px;border:1px solid #35475d;border-radius:12px;background:#172438;color:#f4f7fb;text-decoration:none;display:flex;align-items:center;justify-content:center;font:inherit;font-weight:700;padding:9px;text-align:center}
    @media(max-width:520px){.completed-workflow-grid{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);

  new MutationObserver(() => window.setTimeout(sync, 0)).observe(detail, { childList: true, subtree: true });
  window.setTimeout(sync, 100);
})();
