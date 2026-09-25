(() => {
  "use strict";
  if (!location.pathname.endsWith("/oppdrag.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const detail = document.getElementById("detailModalContent");
  const trashButton = document.getElementById("openWorkOrderTrash");
  if (!detail) return;

  let decorating = false;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

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

  function removeZone() {
    detail.querySelectorAll("[data-work-order-delete-zone]").forEach((node) => node.remove());
  }

  function managementHtml(order) {
    const testCopy = order.isTest
      ? "Testoppdrag · ignoreres av varslinger, fakturering, økonomioversikt og AI."
      : "Merk testdata dersom oppdraget bare brukes til testing.";
    return `
      <section data-work-order-delete-zone style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(180,85,85,.35)">
        <div style="display:grid;gap:10px">
          <button type="button" class="secondary-btn" data-work-order-test style="width:100%">
            ${order.isTest ? "✓ Testoppdrag – fjern testmerking" : "Marker som testoppdrag"}
          </button>
          <p class="muted" style="margin:-3px 0 4px">${esc(testCopy)}</p>
          <button type="button" class="danger-btn" data-work-order-trash style="width:100%">Flytt til papirkurv</button>
          <p class="muted" style="margin:-3px 0 0">Oppdraget skjules og varsler stopper. Kunden beholdes. Du kan gjenopprette oppdraget fra papirkurven.</p>
        </div>
      </section>`;
  }

  async function decorate() {
    if (decorating || detail.querySelector("[data-work-order-delete-zone]")) return;
    const orderId = orderIdFromDetail();
    if (!orderId) return;

    decorating = true;
    try {
      const data = await api(`/admin/work-orders/${encodeURIComponent(orderId)}`);
      const order = data?.workOrder;
      if (!order) return;

      const workspace = detail.querySelector("[data-field-workspace]") || detail;
      workspace.insertAdjacentHTML("beforeend", managementHtml(order));
      const zone = workspace.querySelector("[data-work-order-delete-zone]");

      const testBtn = zone.querySelector("[data-work-order-test]");
      testBtn.addEventListener("click", async () => {
        const next = !order.isTest;
        const message = next
          ? "Merke dette som TESTOPPDRAG?\n\nDet blir fortsatt synlig i Oppdrag, men ignoreres av varslinger, økonomioversikt, fakturering og AI."
          : "Fjerne testmerkingen?\n\nOppdraget blir behandlet som et ekte oppdrag igjen.";
        if (!confirm(message)) return;
        testBtn.disabled = true;
        try {
          await api(`/admin/work-orders/${encodeURIComponent(orderId)}/test`, {
            method: "POST",
            body: JSON.stringify({ isTest: next }),
          });
          location.reload();
        } catch (error) {
          alert(error.message || "Kunne ikke endre testmerking.");
          testBtn.disabled = false;
        }
      });

      const trashBtn = zone.querySelector("[data-work-order-trash]");
      if (order.invoiceId || ["active", "paused"].includes(order.status)) {
        trashBtn.disabled = true;
        trashBtn.title = order.invoiceId
          ? "Oppdrag med faktura beholdes som historikk."
          : "Stopp arbeidsøkten før oppdraget flyttes til papirkurven.";
      }

      trashBtn.addEventListener("click", async () => {
        const customer = order.customerSnapshot?.name || "kunden";
        const service = order.serviceName || "oppdraget";
        if (!confirm(`Flytte «${service}» for ${customer} til papirkurven?\n\nOppdraget forsvinner fra drift og varslinger, men blir IKKE slettet permanent. Du kan gjenopprette det senere.`)) return;
        trashBtn.disabled = true;
        trashBtn.textContent = "Flytter…";
        try {
          await api(`/admin/work-orders/${encodeURIComponent(orderId)}/trash`, {
            method: "POST",
            body: JSON.stringify({ reason: order.isTest ? "Testoppdrag ryddet bort fra admin" : "Flyttet til papirkurv fra admin" }),
          });
          location.href = "oppdrag.html?trashed=1";
        } catch (error) {
          alert(error.message || "Kunne ikke flytte oppdraget.");
          trashBtn.disabled = false;
          trashBtn.textContent = "Flytt til papirkurv";
        }
      });
    } catch (_) {
      removeZone();
    } finally {
      decorating = false;
    }
  }

  function ensureTrashModal() {
    let modal = document.getElementById("workOrderTrashModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "workOrderTrashModal";
    modal.className = "modal hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modal-card work-order-detail-modal">
        <div class="modal-header">
          <div><p class="admin-eyebrow">Sikker rydding</p><h2>Papirkurv</h2></div>
          <button type="button" class="icon-btn" data-trash-close aria-label="Lukk">×</button>
        </div>
        <p class="muted">Oppdrag her påvirker ikke drift eller varslinger. Gjenopprett hvis noe ble flyttet hit ved en feil.</p>
        <div data-trash-list><p class="muted">Henter papirkurven…</p></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-trash-close]").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.classList.add("hidden");
    });
    return modal;
  }

  async function openTrash() {
    const modal = ensureTrashModal();
    const list = modal.querySelector("[data-trash-list]");
    modal.classList.remove("hidden");
    list.innerHTML = '<p class="muted">Henter papirkurven…</p>';
    try {
      const data = await api("/admin/work-orders/trash");
      const orders = data.workOrders || [];
      if (!orders.length) {
        list.innerHTML = '<div class="empty-state">Papirkurven er tom.</div>';
        return;
      }
      list.innerHTML = orders.map((order) => `
        <article data-trash-order="${esc(order._id)}" style="border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:14px;margin-top:12px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <div>
              <strong>${esc(order.customerSnapshot?.name || "Ukjent kunde")}</strong>
              <p class="muted" style="margin:4px 0">${esc(order.serviceName || "Oppdrag")} · ${esc(order.jobDate || "")}</p>
              ${order.isTest ? '<span style="font-size:12px;font-weight:800;color:#f4bd67">TESTDATA</span>' : ""}
            </div>
          </div>
          <div style="display:grid;gap:8px;margin-top:12px">
            <button type="button" class="secondary-btn" data-trash-restore>Gjenopprett oppdrag</button>
            ${order.isTest && !order.invoiceId ? '<button type="button" class="danger-btn" data-trash-permanent>Slett testoppdrag permanent</button>' : ""}
          </div>
        </article>`).join("");

      list.querySelectorAll("[data-trash-order]").forEach((card) => {
        const id = card.dataset.trashOrder;
        card.querySelector("[data-trash-restore]")?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await api(`/admin/work-orders/${encodeURIComponent(id)}/restore`, { method: "POST", body: "{}" });
            await openTrash();
          } catch (error) {
            alert(error.message || "Kunne ikke gjenopprette oppdraget.");
            button.disabled = false;
          }
        });

        card.querySelector("[data-trash-permanent]")?.addEventListener("click", async () => {
          const typed = prompt("Permanent sletting kan ikke angres.\n\nSkriv SLETT for å slette dette TESTOPPDRAGET permanent:");
          if (String(typed || "").trim().toUpperCase() !== "SLETT") return;
          try {
            await api(`/admin/work-orders/${encodeURIComponent(id)}/permanent`, {
              method: "DELETE",
              body: JSON.stringify({ confirmation: "SLETT" }),
            });
            await openTrash();
          } catch (error) {
            alert(error.message || "Kunne ikke slette testoppdraget permanent.");
          }
        });
      });
    } catch (error) {
      list.innerHTML = `<p class="error-text">${esc(error.message || "Kunne ikke hente papirkurven.")}</p>`;
    }
  }

  trashButton?.addEventListener("click", openTrash);
  new MutationObserver(() => window.setTimeout(decorate, 0)).observe(detail, { childList: true, subtree: true });
  window.setTimeout(decorate, 120);
})();
