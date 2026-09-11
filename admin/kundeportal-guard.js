(() => {
  "use strict";

  const editor = document.getElementById("portalEditor");
  const statusBox = document.getElementById("portalStatus");
  if (!editor) return;

  function normalizeStatusSelects() {
    editor.querySelectorAll("[data-procurement-status-select]").forEach((select) => {
      const approvedOption = select.querySelector('option[value="approved"]');
      if (!approvedOption) return;
      const wasApproved = select.value === "approved";
      approvedOption.remove();
      if (wasApproved) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Velg neste status";
        placeholder.selected = true;
        select.prepend(placeholder);
      }
    });
  }

  const observer = new MutationObserver(normalizeStatusSelects);
  observer.observe(editor, { childList: true, subtree: true });
  normalizeStatusSelects();

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-procurement-status]");
    if (!button) return;
    const id = button.dataset.setProcurementStatus;
    const select = editor.querySelector(`[data-procurement-status-select="${CSS.escape(id)}"]`);
    if (select?.value) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (statusBox) {
      statusBox.textContent = "Velg hva som har skjedd med innkjøpet før du oppdaterer status.";
      statusBox.className = "portal-status-message error";
    }
    select?.focus();
  }, true);
})();
