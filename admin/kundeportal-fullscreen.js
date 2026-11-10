(() => {
  "use strict";
  if (!document.documentElement.classList.contains("portal-fullscreen")) return;

  const params = new URLSearchParams(window.location.search);
  const workOrderId = params.get("workOrderId") || "";
  const header = document.getElementById("portalFullscreenHeader");
  const back = document.getElementById("portalReturnOrder");
  const dock = document.getElementById("portalFullscreenDock");
  const saveButton = document.getElementById("portalFullscreenSave");
  const saveStatus = document.getElementById("portalFullscreenSaveStatus");
  const statusBox = document.getElementById("portalStatus");
  const editor = document.getElementById("portalEditor");
  const dirty = { settings: false, procurement: false, image: false };
  let saving = false;
  let postingProcurement = false;
  let lastMessage = "";

  const hasChanges = () => Object.values(dirty).some(Boolean);
  const api = () => window.SorgulenPortalFullscreenAdmin;

  if (!/^[0-9a-f]{24}$/i.test(workOrderId)) {
    if (statusBox) {
      statusBox.textContent = "Manglar gyldig oppdrag. Opne kundeportalen frå eit kundeoppdrag.";
      statusBox.className = "portal-status-message error";
    }
    return;
  }

  back.href = "oppdrag.html?open=" + encodeURIComponent(workOrderId);
  header.hidden = false;
  dock.hidden = false;

  function refreshStatus() {
    const n = Object.values(dirty).filter(Boolean).length;
    if (saving) {
      saveStatus.textContent = "Lagrar endringane…";
      saveButton.textContent = "Lagrar…";
    } else {
      saveStatus.textContent = lastMessage || (!api()?.isReady()
        ? "Hentar oppdraget…"
        : n
          ? "Ulagra endringar" + (n > 1 ? " i fleire delar" : "")
          : "Alle endringar er lagra");
      saveButton.textContent = "Lagre endringar";
    }
    saveButton.disabled = saving || !hasChanges() || !api()?.isReady();
  }

  function mark(section) {
    if (!dirty[section] || !hasChanges()) {
      dirty[section] = true;
      lastMessage = "";
      refreshStatus();
    }
  }

  function clearAll() {
    Object.keys(dirty).forEach((key) => { dirty[key] = false; });
    refreshStatus();
  }

  // Fire reelle faner. Vi skjuler dei andre felta utan å fjerne dei frå DOM.
  // Slik blir ulagrede verdiar bevarte medan vi skiftar mellom fanene.
  const tabNames = ["update", "procurement", "images", "settings"];
  const tabButtons = [...document.querySelectorAll("[data-portal-tab]")];
  let activeTab = "update";

  function showTab(name, focus = false) {
    if (!tabNames.includes(name)) return;
    activeTab = name;
    const panes = editor.querySelectorAll?.("[data-portal-tab-section]") || [];
    for (const pane of panes) {
      pane.hidden = pane.dataset.portalTabSection !== name;
    }
    const form = editor.querySelector("#portalSettingsForm");
    if (form) form.hidden = name !== "update" && name !== "settings";

    for (const button of tabButtons) {
      const selected = button.dataset.portalTab === name;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    }
  }

  // Kundeoverskrifta og lenkjestatusen er felles for alle fanene.
  // Den gamle administrasjonssida blir ikkje endra.
  function enhanceEditor() {
    const customer = editor.querySelector(".portal-editor-head h2");
    const service = editor.querySelector(".portal-editor-head p:not(.section-kicker)");
    const state = editor.querySelector(".portal-state-pill");
    if (customer) {
      document.getElementById("portalFullscreenCustomer").textContent = customer.textContent;
      document.getElementById("portalFullscreenJob").textContent = service?.textContent || "Kundeoppdrag";
    }
    const stateLabel = document.getElementById("portalFullscreenLinkState");
    if (stateLabel && state) stateLabel.textContent = state.textContent;
    const copyButton = document.getElementById("portalFullscreenCopyLink");
    if (copyButton) copyButton.disabled = !editor.querySelector("#copyPortalLink");

    showTab(activeTab);
    refreshStatus();
  }

  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      showTab(button.dataset.portalTab);
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    });
    button.addEventListener("keydown", (event) => {
      const keys = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
      const delta = keys[event.key];
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? tabButtons.length - 1
          : delta ? (index + delta + tabButtons.length) % tabButtons.length : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      showTab(tabButtons[nextIndex].dataset.portalTab, true);
    });
  });

  document.getElementById("portalFullscreenCopyLink")?.addEventListener("click", () => {
    // Same eksisterande kopifunksjon som inne på Innstillingar.
    editor.querySelector("#copyPortalLink")?.click();
  });

  editor.addEventListener("input", (event) => {
    if (event.target.closest("#portalSettingsForm")) mark("settings");
    else if (event.target.closest(".procurement-builder")) mark("procurement");
    else if (event.target.closest("#portalImage, #portalImageCaption")) mark("image");
  });
  editor.addEventListener("change", (event) => {
    if (event.target.closest("#portalSettingsForm")) mark("settings");
    else if (event.target.closest(".procurement-builder")) mark("procurement");
    else if (event.target.closest("#portalImage, #portalImageCaption")) mark("image");
  });

  editor.addEventListener("click", (event) => {
    if (event.target.closest("#addProcurementRow, .remove-procurement-row")) {
      mark("procurement");
      return;
    }

    // Handlingar som teiknar opp skjemaet på nytt kan ikkje overskrive
    // ulagrede felt frå andre seksjonar.
    const replacing = event.target.closest(
      "#generatePortalLink, #revokePortalLink, #refreshSelectedPortal, "
      + "#uploadPortalImage, [data-edit-procurement], [data-set-procurement-status], "
      + "[data-cancel-procurement], [data-delete-image], [data-correct-procurement], "
      + "[data-remove-procurement], #cancelProcurementEdit"
    );
    if (replacing && hasChanges()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      alert("Lagre endringane først, eller oppdater sida for å forkaste dei.");
      return;
    }

    const approval = event.target.closest('[data-save-procurement="awaiting_approval"]');
    if (approval) {
      if (dirty.settings || dirty.image) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("Lagre endringane i kundeinformasjon og bilete før du ber om innkjøpsgodkjenning.");
        return;
      }
      if (!window.confirm(
        "Dette gjer innkjøpet synleg for kunden og ber om godkjenning."
        + "\nIngen SMS eller e-post blir sendt.\n\nVil du publisere innkjøpsforslaget?"
      )) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      postingProcurement = true;
    }
  }, true);

  // Skjemainnsending med Enter må gå gjennom same kontroll som lagreknappen.
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "portalSettingsForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (hasChanges()) saveAll();
  }, true);

  async function saveAll() {
    if (saving || !hasChanges()) return;
    if (!api()?.isReady()) {
      saveStatus.textContent = "Kundeoppdraget blir framleis henta. Prøv igjen.";
      return;
    }
    const changes = { ...dirty };
    if (api().linkIsActive() && (changes.settings || changes.image || api().editingPublicProcurement())) {
      const approved = window.confirm(
        "Lagre endringane?\n\nEndringar i framdrift, kundeinformasjon og bilete "
        + "blir synlege på kundesida fordi ho har aktiv lenkje. "
        + "Innkjøpsutkast blir lagra internt.\n\nDet blir ikkje sendt SMS eller e-post."
      );
      if (!approved) return;
    }
    lastMessage = "";
    saving = true;
    refreshStatus();
    try {
      const result = await api().save(changes);
      clearAll();
      lastMessage = result.publicUpdated
        ? "Lagra. Kundesida er oppdatert."
        : "Lagra. Ingen kundemelding er sendt.";
    } catch (error) {
      if (error.partialSaved?.length) clearAll();
      lastMessage = error.message || "Lagring feila. Prøv igjen.";
    } finally {
      saving = false;
      refreshStatus();
      // Ei feilmelding blir vist i det vanlege statusfeltet. Ikkje rapporter falsk suksess.
      if (statusBox.classList.contains("error")) {
        lastMessage = statusBox.textContent;
        refreshStatus();
      }
    }
  }

  saveButton.addEventListener("click", saveAll);

  statusBox && new MutationObserver(() => {
    const text = statusBox.textContent.trim();
    if (postingProcurement && /Innkjøpet er nå synlig for kunden/.test(text)) {
      dirty.procurement = false;
      postingProcurement = false;
      refreshStatus();
    } else if (postingProcurement && /API-feil|Kunne ikke|Ugyldig|feil|mangler|manglar/i.test(text)) {
      postingProcurement = false;
    }
  }).observe(statusBox, { childList: true, subtree: true, characterData: true });

  back.addEventListener("click", (event) => {
    if (!hasChanges()) return;
    if (!window.confirm("Du har ulagrede endringar. Gå tilbake utan å lagre?")) {
      event.preventDefault();
      return;
    }
    clearAll();
  });
  window.addEventListener("beforeunload", (event) => {
    if (!hasChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  new MutationObserver(() => window.requestAnimationFrame(enhanceEditor))
    .observe(editor, { childList: true, subtree: true });
  enhanceEditor();
})();
