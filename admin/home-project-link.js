(() => {
  "use strict";

  const card = document.getElementById("focusContent");
  if (!card) return;

  const interactiveSelector = "a,button,input,select,textarea,label,[role=button],[data-action],[data-confirm],[data-quick]";

  function workOrderId() {
    const source = card.querySelector("[data-id]");
    return String(source?.getAttribute("data-id") || "").trim();
  }

  function clearProjectLink() {
    delete card.dataset.openWorkOrder;
    card.classList.remove("is-project-link");
    card.querySelector(".project-open-hint")?.remove();
  }

  function decorateProjectCard() {
    const id = workOrderId();
    if (!id) {
      clearProjectLink();
      return;
    }

    card.dataset.openWorkOrder = id;
    card.classList.add("is-project-link");

    const href = `oppdrag.html?open=${encodeURIComponent(id)}`;
    const name = card.querySelector(".focus-name")?.textContent?.trim() || "prosjektet";
    let hint = card.querySelector(".project-open-hint");

    if (!hint) {
      hint = document.createElement("a");
      hint.className = "project-open-hint";
      hint.innerHTML = '<span>Åpne hele prosjektet</span><span class="project-open-arrow" aria-hidden="true">›</span>';
      const actions = card.querySelector(".main-actions, .quick-actions");
      if (actions) card.insertBefore(hint, actions);
      else card.appendChild(hint);
    }

    hint.href = href;
    hint.setAttribute("aria-label", `Åpne hele prosjektet for ${name}`);
  }

  function openProject() {
    const id = card.dataset.openWorkOrder;
    if (!id) return;
    window.location.href = `oppdrag.html?open=${encodeURIComponent(id)}`;
  }

  card.addEventListener("click", (event) => {
    if (!card.dataset.openWorkOrder) return;
    if (event.target.closest(interactiveSelector)) return;
    openProject();
  });

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorateProjectCard();
    });
  });

  observer.observe(card, { childList: true, subtree: true });
  decorateProjectCard();
})();
