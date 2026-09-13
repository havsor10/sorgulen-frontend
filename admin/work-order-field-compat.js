(() => {
  "use strict";
  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  function markFieldWorkspace() {
    const workspace = detail.querySelector("[data-field-workspace]");
    if (!workspace || detail.querySelector("[data-field-manager-sentinel]")) return;
    const sentinel = document.createElement("span");
    sentinel.hidden = true;
    sentinel.dataset.fieldManagerSentinel = "true";
    sentinel.dataset.operationsManager = workspace.dataset.orderId || "field-workspace";
    workspace.appendChild(sentinel);
  }

  new MutationObserver(markFieldWorkspace).observe(detail, { childList: true, subtree: true });
  markFieldWorkspace();
})();
