(() => {
  const style = document.createElement("style");
  style.textContent = `
    .customer-portal-link { margin-left: 8px; }
    .history-action .customer-portal-link { display: inline-block; margin-top: 5px; }
    @media (max-width: 640px) { .history-action .customer-portal-link { margin-left: 0; } }
  `;
  document.head.appendChild(style);

  function portalHref(id) {
    return `kundeportal.html?workOrderId=${encodeURIComponent(id)}`;
  }

  function injectHistoryLinks() {
    document.querySelectorAll(".work-history-card").forEach((card) => {
      const openButton = card.querySelector(".open-job-detail[data-id]");
      const action = card.querySelector(".history-action");
      if (!openButton || !action || action.querySelector(".customer-portal-link")) return;
      const link = document.createElement("a");
      link.className = "details-link customer-portal-link";
      link.href = portalHref(openButton.dataset.id);
      link.textContent = "Kundeportal";
      action.appendChild(link);
    });
  }

  function injectActiveLink() {
    const content = document.getElementById("activeWorkOrderContent");
    const openButton = content?.querySelector(".open-job-detail[data-id]");
    const controls = content?.querySelector(".meter-controls");
    if (!openButton || !controls || controls.querySelector(".customer-portal-link")) return;
    const link = document.createElement("a");
    link.className = "secondary-btn customer-portal-link";
    link.href = portalHref(openButton.dataset.id);
    link.textContent = "Kundeportal";
    controls.appendChild(link);
  }

  function injectDetailLink() {
    const content = document.getElementById("detailModalContent");
    if (!content || content.querySelector(".customer-portal-detail-link")) return;
    const idSource = content.querySelector("[data-work-action][data-id], [data-entry][data-id]");
    if (!idSource?.dataset.id) return;
    const link = document.createElement("a");
    link.className = "secondary-btn customer-portal-detail-link";
    link.href = portalHref(idSource.dataset.id);
    link.textContent = "Åpne kundeportal";
    const row = document.createElement("div");
    row.className = "meter-controls detail-controls";
    row.appendChild(link);
    content.prepend(row);
  }

  function inject() {
    injectHistoryLinks();
    injectActiveLink();
    injectDetailLink();
  }

  const targets = [
    document.getElementById("workOrderHistory"),
    document.getElementById("activeWorkOrderContent"),
    document.getElementById("detailModalContent"),
  ].filter(Boolean);
  const observer = new MutationObserver(inject);
  targets.forEach((target) => observer.observe(target, { childList: true, subtree: true }));
  inject();
})();
