(() => {
  "use strict";
  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  const kindByHeading = (text) => {
    const value = String(text || "").trim().toLowerCase();
    if (value.startsWith("utgifter")) return "expense";
    if (value.startsWith("materialer")) return "material";
    if (value.startsWith("notater")) return "note";
    return "";
  };

  function exposeCompletedInvoiceOrderId() {
    if (detail.querySelector("[data-field-workspace], [data-field-completed-order-id]")) return;
    const link = detail.querySelector('a[href*="faktura-ny.html?workOrderId="]');
    if (!link) return;
    try {
      const url = new URL(link.getAttribute("href") || "", location.href);
      const orderId = String(url.searchParams.get("workOrderId") || "").trim();
      if (!orderId) return;
      const sentinel = document.createElement("span");
      sentinel.hidden = true;
      sentinel.dataset.fieldCompletedOrderId = orderId;
      sentinel.dataset.entry = "completed";
      sentinel.dataset.id = orderId;
      detail.appendChild(sentinel);
    } catch (_) {}
  }

  function promoteInvoiceAction() {
    const workspace = detail.querySelector("[data-field-workspace]");
    if (!workspace || workspace.querySelector("[data-field-invoice-shortcut]")) return;
    const sourceLink = workspace.querySelector('a[href*="faktura-ny.html?workOrderId="], a[href*="faktura-detalj.html?id="]');
    if (!sourceLink) return;
    const hero = workspace.querySelector(".field-hero");
    if (!hero) return;

    const wrap = document.createElement("div");
    wrap.className = "field-invoice-shortcut";
    wrap.dataset.fieldInvoiceShortcut = "true";

    const link = sourceLink.cloneNode(true);
    link.classList.add("field-invoice-shortcut-button");
    const href = link.getAttribute("href") || "";
    link.textContent = href.includes("faktura-ny.html") ? "Opprett faktura" : "Åpne faktura";
    wrap.appendChild(link);
    hero.appendChild(wrap);
  }

  function markFieldWorkspace() {
    const workspace = detail.querySelector("[data-field-workspace]");
    if (!workspace) return;
    if (!detail.querySelector("[data-field-manager-sentinel]")) {
      const sentinel = document.createElement("span");
      sentinel.hidden = true;
      sentinel.dataset.fieldManagerSentinel = "true";
      sentinel.dataset.operationsManager = workspace.dataset.orderId || "field-workspace";
      workspace.appendChild(sentinel);
    }

    for (const group of workspace.querySelectorAll(".field-register-group")) {
      const kind = kindByHeading(group.querySelector("h4")?.textContent);
      if (!kind) continue;
      [...group.querySelectorAll(".field-register-row")].forEach((row, index) => {
        row.dataset.fieldRegistrationEdit = "true";
        row.dataset.fieldRegistrationKind = kind;
        row.dataset.fieldRegistrationIndex = String(index);
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        row.setAttribute("aria-label", `Rediger ${kind === "expense" ? "utgift" : kind === "material" ? "materiale" : "notat"}`);
      });
    }
  }

  async function openExactRegistration(row) {
    const workspace = row.closest("[data-field-workspace]");
    const orderId = workspace?.dataset.orderId || "";
    const kind = row.dataset.fieldRegistrationKind || "";
    const index = Number(row.dataset.fieldRegistrationIndex);
    if (!orderId || !kind || !Number.isInteger(index) || index < 0) return;
    const operations = window.SorgulenOperations;
    if (!operations?.openManager) {
      alert("Redigering er ikke klar ennå. Prøv igjen om et øyeblikk.");
      return;
    }
    try {
      await operations.openManager(orderId);
      const editButtons = [...document.querySelectorAll(`.operation-sheet [data-op-edit="${kind}"]`)];
      const editButton = editButtons[index];
      if (!editButton) throw new Error("Kunne ikke finne registreringen som skulle redigeres.");
      editButton.click();
    } catch (error) {
      alert(error?.message || "Kunne ikke åpne registreringen.");
    }
  }

  function deleteMeta(form) {
    const entryId = String(form?.dataset.entryId || "").trim();
    const orderId = String(form?.dataset.orderId || "").trim();
    if (!entryId || !orderId) return null;
    if (form.id === "operationTimeForm") return { kind: "time", endpoint: "time", label: "tidsregistreringen", entryId, orderId };
    if (form.id !== "operationEditForm") return null;
    const kind = form.dataset.kind;
    if (kind === "expense") return { kind, endpoint: "expenses", label: "utgiften", entryId, orderId };
    if (kind === "material") return { kind, endpoint: "materials", label: "materialet", entryId, orderId };
    if (kind === "note") return { kind, endpoint: "notes", label: "notatet", entryId, orderId };
    return null;
  }

  function installDeleteButton() {
    const form = document.querySelector(".operation-sheet #operationTimeForm, .operation-sheet #operationEditForm");
    const meta = deleteMeta(form);
    if (!meta || form.querySelector("[data-operation-delete-current]")) return;
    const actions = form.querySelector(".operation-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-btn";
    button.dataset.operationDeleteCurrent = "true";
    button.textContent = `Slett ${meta.kind === "time" ? "økt" : meta.kind === "expense" ? "utgift" : meta.kind === "material" ? "materiale" : "notat"}`;
    actions.prepend(button);
    button.addEventListener("click", async () => {
      if (!confirm(`Slette ${meta.label}? Denne endringen lagres med en gang.`)) return;
      const operations = window.SorgulenOperations;
      if (!operations?.api) {
        alert("Kunne ikke koble til redigeringen. Prøv igjen.");
        return;
      }
      button.disabled = true;
      try {
        await operations.api(`/admin/operations/work-orders/${encodeURIComponent(meta.orderId)}/${meta.endpoint}/${encodeURIComponent(meta.entryId)}`, { method: "DELETE" });
        await window.SorgulenAdminShell?.refreshBadges?.();
        location.reload();
      } catch (error) {
        alert(error?.message || "Kunne ikke slette registreringen.");
        button.disabled = false;
      }
    });
  }

  detail.addEventListener("click", (event) => {
    const row = event.target.closest("[data-field-registration-edit]");
    if (!row) return;
    event.preventDefault();
    openExactRegistration(row);
  });

  detail.addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-field-registration-edit]");
    if (!row || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openExactRegistration(row);
  });

  const style = document.createElement("style");
  style.textContent = `
    .field-register-row[data-field-registration-edit="true"]{cursor:pointer;position:relative;padding-right:42px;transition:border-color .15s ease,background .15s ease}
    .field-register-row[data-field-registration-edit="true"]::after{content:"›";position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:26px;line-height:1;color:#8ea0b6;font-weight:700}
    .field-register-row[data-field-registration-edit="true"]:active{background:rgba(126,184,255,.08)}
    .field-register-row[data-field-registration-edit="true"]:focus-visible{outline:2px solid #7eb8ff;outline-offset:2px}
    .operation-actions [data-operation-delete-current]{margin-right:auto}
    .field-invoice-shortcut{margin-top:14px}
    .field-invoice-shortcut-button{display:flex!important;width:100%;min-height:52px;align-items:center;justify-content:center;text-align:center;font-weight:800}
  `;
  document.head.appendChild(style);

  function syncCompatibility() {
    exposeCompletedInvoiceOrderId();
    markFieldWorkspace();
    promoteInvoiceAction();
    installDeleteButton();
  }

  new MutationObserver(syncCompatibility).observe(document.body, { childList: true, subtree: true });
  syncCompatibility();
})();
