(() => {
  "use strict";

  const detail = document.getElementById("detailModalContent");
  if (!detail) return;

  const INTERACTIVE = "button,a,input,textarea,select,label";

  function bindProxy(container, action, label) {
    if (!container || !action || container.dataset.actionableProxy === "true") return;
    if (action.disabled) return;

    container.dataset.actionableProxy = "true";
    container.setAttribute("role", "button");
    container.setAttribute("tabindex", "0");
    if (label) container.setAttribute("aria-label", label);

    const activate = (event) => {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.target.closest(INTERACTIVE)) return;
      event.preventDefault();
      event.stopPropagation();
      action.click();
    };

    container.addEventListener("click", activate);
    container.addEventListener("keydown", activate);
  }

  function enhanceMissingDescriptions() {
    detail.querySelectorAll(".field-session.missing-description").forEach((session) => {
      const summary = session.querySelector(":scope > summary");
      const action = session.querySelector("[data-field-edit-session]");
      bindProxy(summary, action, "Legg inn beskrivelse av arbeidsøkten");
    });
  }

  function enhanceIssueCards() {
    detail.querySelectorAll(".field-issue").forEach((issue) => {
      const action = issue.querySelector(".field-issue-action, .actionable-warning-action");
      bindProxy(issue, action, (issue.textContent || "").trim());
    });
  }

  function enhance() {
    enhanceMissingDescriptions();
    enhanceIssueCards();
  }

  const observer = new MutationObserver(() => window.setTimeout(enhance, 0));
  observer.observe(detail, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance, { once: true });
  } else {
    enhance();
  }
})();
