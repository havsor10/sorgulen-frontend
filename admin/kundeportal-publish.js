(() => {
  const editor = document.getElementById("portalEditor");
  const projectList = document.getElementById("projectList");
  const statusBox = document.getElementById("portalStatus");

  let dirty = false;
  let publishRequested = false;
  let lastConfirmationHtml = "";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("no-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Oslo",
    }).format(date);
  }

  function linkIsActive() {
    return Boolean(editor?.querySelector(".portal-state-pill.active"));
  }

  function publishStateCopy() {
    if (dirty) {
      return {
        state: "dirty",
        title: "Du har endringer som ikke er lagret",
        help: "Trykk knappen under når du er ferdig. Da lagres kundeoppdateringen samlet.",
      };
    }
    if (linkIsActive()) {
      return {
        state: "saved",
        title: "Kundesiden er lagret",
        help: "Neste endring du gjør markeres som ulagret til du oppdaterer kundesiden igjen.",
      };
    }
    return {
      state: "saved",
      title: "Endringene kan lagres nå",
      help: "Kunden kan først åpne siden når du har opprettet en aktiv kundelenke.",
    };
  }

  function currentSummaryHtml() {
    const customer = editor?.querySelector(".portal-editor-head h2")?.textContent?.trim() || "kunden";
    const start = editor?.querySelector("#nextWorkStart")?.value || "";
    const end = editor?.querySelector("#nextWorkEnd")?.value || "";
    const message = editor?.querySelector("#customerMessage")?.value?.trim() || "";
    const showHours = Boolean(editor?.querySelector("#showHours")?.checked);
    const showHistory = Boolean(editor?.querySelector("#showWorkHistory")?.checked);
    const showImages = Boolean(editor?.querySelector("#showImages")?.checked);
    const visibleProcurements = [...(editor?.querySelectorAll(".procurement-admin-card") || [])].filter((card) => {
      const text = card.textContent || "";
      return !/Henter inn produkt \/ pris|Avbrutt/i.test(text);
    }).length;
    const imageCount = editor?.querySelectorAll(".portal-photo-admin").length || 0;

    const lines = [];
    if (start) {
      const period = end && end !== start ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(start);
      lines.push(`Neste besøk: ${period}`);
    } else {
      lines.push("Neste besøk: ingen dato er publisert");
    }
    if (message) lines.push("Kundeoppdatering: teksten er publisert");
    if (showHours) lines.push("Arbeidstid vises når registrert tid finnes");
    if (showHistory) lines.push("Arbeidsdager vises når arbeidsøkter finnes");
    if (showImages) lines.push(`Prosjektbilder er slått på${imageCount ? ` (${imageCount} bilde${imageCount === 1 ? "" : "r"})` : ""}`);
    if (visibleProcurements) lines.push(`${visibleProcurements} innkjøp er synlig eller i en kundeprosess`);

    const lead = linkIsActive()
      ? `Alt under er lagret for ${escapeHtml(customer)}. Kunden som åpner den aktive lenken får nå den siste lagrede versjonen.`
      : `Endringene for ${escapeHtml(customer)} er lagret, men kunden har ingen aktiv kundelenke ennå.`;

    return `<strong>${linkIsActive() ? "Kundesiden er oppdatert" : "Endringene er lagret"}</strong><p>${lead}</p>${lines.length ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}`;
  }

  function ensurePublishBar() {
    if (!editor?.querySelector("#portalSettingsForm")) return;
    if (editor.querySelector("#portalPublishBar")) return;

    const wrapper = document.createElement("div");
    const copy = publishStateCopy();
    wrapper.id = "portalPublishBar";
    wrapper.className = `portal-publish-bar ${copy.state}`;
    wrapper.innerHTML = `
      <div class="portal-publish-status">
        <span class="portal-publish-dot" aria-hidden="true"></span>
        <span class="portal-publish-copy">
          <strong data-publish-title>${escapeHtml(copy.title)}</strong>
          <small data-publish-help>${escapeHtml(copy.help)}</small>
        </span>
      </div>
      <button id="publishCustomerPortal" class="portal-publish-button" type="button">Lagre og oppdater kundesiden</button>
      <div id="portalPublishConfirmation" class="portal-publish-confirmation" ${lastConfirmationHtml ? "" : "hidden"}>${lastConfirmationHtml}</div>`;
    editor.appendChild(wrapper);
  }

  function refreshPublishBar() {
    ensurePublishBar();
    const bar = editor?.querySelector("#portalPublishBar");
    if (!bar) return;
    const copy = publishStateCopy();
    bar.classList.remove("dirty", "saved", "error");
    bar.classList.add(copy.state);
    const title = bar.querySelector("[data-publish-title]");
    const help = bar.querySelector("[data-publish-help]");
    if (title) title.textContent = copy.title;
    if (help) help.textContent = copy.help;
    const confirmation = bar.querySelector("#portalPublishConfirmation");
    if (confirmation) {
      confirmation.innerHTML = lastConfirmationHtml;
      confirmation.hidden = !lastConfirmationHtml;
    }
  }

  function markDirty() {
    dirty = true;
    lastConfirmationHtml = "";
    refreshPublishBar();
  }

  function clarifyActionButtons() {
    if (!editor) return;
    const internalDraft = editor.querySelector('[data-save-procurement="researching"]');
    if (internalDraft) {
      internalDraft.textContent = "Lagre som internt utkast";
      internalDraft.title = "Dette blir ikke synlig for kunden.";
    }
    const sendApproval = editor.querySelector('[data-save-procurement="awaiting_approval"]');
    if (sendApproval) {
      sendApproval.textContent = "Gjør synlig for kunden og be om godkjenning";
      sendApproval.title = "Denne handlingen gjør innkjøpet synlig på kundesiden med en gang.";
    }
    editor.querySelectorAll("[data-set-procurement-status]").forEach((button) => {
      button.textContent = "Lagre status på kundesiden";
      button.title = "Statusen blir synlig for kunden med en gang.";
    });
    const upload = editor.querySelector("#uploadPortalImage");
    if (upload) {
      upload.textContent = "Legg til bilde på kundesiden";
      upload.title = "Bildet blir lagt til på kundesiden når opplastingen er ferdig.";
    }
  }

  function enhance() {
    clarifyActionButtons();
    ensurePublishBar();
    refreshPublishBar();
  }

  editor?.addEventListener("input", (event) => {
    if (event.target.closest("#portalSettingsForm")) markDirty();
  });
  editor?.addEventListener("change", (event) => {
    if (event.target.closest("#portalSettingsForm")) markDirty();
  });

  editor?.addEventListener("click", (event) => {
    const publish = event.target.closest("#publishCustomerPortal");
    if (!publish) return;
    const form = editor.querySelector("#portalSettingsForm");
    const originalSubmit = editor.querySelector("#savePortalSettings");
    if (!form || !originalSubmit || publishRequested) return;

    publishRequested = true;
    publish.disabled = true;
    publish.textContent = "Lagrer og oppdaterer…";
    lastConfirmationHtml = "";
    form.requestSubmit(originalSubmit);
  });

  statusBox && new MutationObserver(() => {
    const message = statusBox.textContent.trim();
    if (!publishRequested) {
      if (/Bildet er nå synlig|Innkjøpet er nå synlig|Status satt til/i.test(message)) {
        lastConfirmationHtml = currentSummaryHtml();
        refreshPublishBar();
      }
      return;
    }

    if (message === "Kundeoppdateringen er lagret.") {
      dirty = false;
      publishRequested = false;
      lastConfirmationHtml = currentSummaryHtml();
      const button = editor?.querySelector("#publishCustomerPortal");
      if (button) {
        button.disabled = false;
        button.textContent = "Lagre og oppdater kundesiden";
      }
      statusBox.textContent = linkIsActive()
        ? "Kundesiden er oppdatert. Kunden ser nå den siste lagrede versjonen."
        : "Endringene er lagret. Opprett kundelenke før kunden kan åpne siden.";
      statusBox.className = "portal-status-message success";
      refreshPublishBar();
      return;
    }

    if (message && !/Lagrer det kunden skal se/i.test(message)) {
      publishRequested = false;
      const bar = editor?.querySelector("#portalPublishBar");
      bar?.classList.add("error");
      const button = editor?.querySelector("#publishCustomerPortal");
      if (button) {
        button.disabled = false;
        button.textContent = "Prøv å lagre og oppdatere igjen";
      }
    }
  }).observe(statusBox, { childList: true, subtree: true, characterData: true });

  projectList?.addEventListener("click", (event) => {
    const projectButton = event.target.closest("[data-project-id]");
    if (!projectButton || !dirty) return;
    const leave = window.confirm("Du har ulagrede endringer på denne kundesiden. Vil du bytte kunde uten å lagre dem?");
    if (!leave) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    dirty = false;
    lastConfirmationHtml = "";
  }, true);

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  if (editor) {
    const observer = new MutationObserver(() => requestAnimationFrame(enhance));
    observer.observe(editor, { childList: true, subtree: true });
  }
  enhance();
})();
