(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
  const accessToken = decodeURIComponent((window.location.hash || "").replace(/^#/, "").trim());

  const loadingCard = document.getElementById("loadingCard");
  const errorCard = document.getElementById("errorCard");
  const errorText = document.getElementById("errorText");
  const projectContent = document.getElementById("projectContent");
  const procurementContainer = document.getElementById("procurementContainer");
  let currentProject = null;
  let approvalInFlight = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, withWeekday = true) {
    if (!value) return "Ikke satt";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? new Date(`${value}T12:00:00`)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("no-NO", {
      weekday: withWeekday ? "long" : undefined,
      day: "numeric",
      month: "long",
      timeZone: "Europe/Oslo",
    }).format(date);
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("no-NO", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Oslo",
    }).format(date);
  }

  function formatDateRange(start, end) {
    if (!start) return "Ikke satt ennå";
    if (!end || end === start) return formatDate(start, true);
    const startDate = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return `${start}–${end}`;
    const sameMonth = startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth();
    if (sameMonth) {
      const weekday = new Intl.DateTimeFormat("no-NO", { weekday: "long", timeZone: "Europe/Oslo" }).format(startDate);
      const month = new Intl.DateTimeFormat("no-NO", { month: "long", timeZone: "Europe/Oslo" }).format(endDate);
      return `${weekday} ${startDate.getDate()}.–${endDate.getDate()}. ${month}`;
    }
    return `${formatDate(start, false)} – ${formatDate(end, false)}`;
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours} t ${minutes} min`;
    if (hours) return `${hours} ${hours === 1 ? "time" : "timer"}`;
    return `${minutes} min`;
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "–";
    return new Intl.NumberFormat("no-NO", {
      style: "currency",
      currency: "NOK",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function fallbackStatusHelp(status) {
    return ({
      planned: "Oppdraget er opprettet og venter på oppstart.",
      active: "Det registreres arbeid på prosjektet nå.",
      paused: "Arbeidet er pauset akkurat nå.",
      stopped: "Arbeidet fortsetter ved neste arbeidsøkt.",
      completed: "Oppdraget er ferdigstilt.",
      cancelled: "Oppdraget er avsluttet.",
    })[status] || "";
  }

  function showError(message) {
    loadingCard.classList.add("hidden");
    projectContent.classList.add("hidden");
    errorText.textContent = message || "Lenken kan være utløpt eller erstattet.";
    errorCard.classList.remove("hidden");
  }

  function renderPhotos(images) {
    const card = document.getElementById("photosCard");
    const grid = document.getElementById("photoGrid");
    grid.replaceChildren();
    const safeImages = (images || []).filter((image) => /^https:\/\//i.test(image.url || ""));
    if (!safeImages.length) {
      card.classList.add("hidden");
      return;
    }
    safeImages.forEach((image) => {
      const figure = document.createElement("figure");
      figure.className = "portal-photo";
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = image.caption || "Bilde fra prosjektet";
      img.loading = "lazy";
      figure.appendChild(img);
      if (image.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = image.caption;
        figure.appendChild(caption);
      }
      grid.appendChild(figure);
    });
    card.classList.remove("hidden");
  }

  function procurementStatus(procurement) {
    return ({
      awaiting_approval: "Venter på din godkjenning",
      approved: "Godkjent – klart for innkjøp",
      ordered: "Bestilt",
      waiting_delivery: "Bestilt – venter på levering",
      ready_pickup: "Klar for henting",
      purchased: "Innkjøpt",
    })[procurement.status] || "";
  }

  function procurementResult(procurement) {
    if (procurement.status === "approved") {
      return `<div class="approval-result success"><strong>Godkjent av deg</strong>${procurement.approvedAt ? `<span>${escapeHtml(formatDateTime(procurement.approvedAt))}</span>` : ""}<p>Håvard kan nå gå videre med innkjøpet.</p></div>`;
    }
    if (procurement.status === "ordered") {
      return '<div class="approval-result success"><strong>Bestilt</strong><p>Innkjøpet er bestilt.</p></div>';
    }
    if (procurement.status === "waiting_delivery") {
      return '<div class="approval-result purchased"><strong>Venter på levering</strong><p>Håvard oppdaterer siden når varen er klar.</p></div>';
    }
    if (procurement.status === "ready_pickup") {
      return '<div class="approval-result success"><strong>Klar for henting</strong><p>Varen er klar og kan hentes inn til prosjektet.</p></div>';
    }
    if (procurement.status === "purchased") {
      return `<div class="approval-result purchased"><strong>Innkjøpet er gjort</strong>${procurement.purchasedAt ? `<span>${escapeHtml(formatDateTime(procurement.purchasedAt))}</span>` : ""}<p>Du trenger ikke gjøre noe mer.</p></div>`;
    }
    return "";
  }

  function renderProcurements(procurements) {
    const visible = (procurements || []).filter((item) => [
      "awaiting_approval", "approved", "ordered", "waiting_delivery", "ready_pickup", "purchased",
    ].includes(item.status));
    if (!visible.length) {
      procurementContainer.innerHTML = "";
      procurementContainer.classList.add("hidden");
      return;
    }

    procurementContainer.innerHTML = visible.map((procurement) => {
      const rows = (procurement.items || []).map((item) => {
        const productName = /^https?:\/\//i.test(item.productUrl || "")
          ? `<a href="${escapeHtml(item.productUrl)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>`
          : escapeHtml(item.name);
        return `<li class="procurement-line">
          <div><strong>${productName}</strong>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</div>
          <div class="procurement-line-numbers"><span>${escapeHtml(item.quantity)} ${escapeHtml(item.unit || "stk")} × ${escapeHtml(formatCurrency(item.unitPrice))}</span><strong>${escapeHtml(formatCurrency(item.lineTotal))}</strong></div>
        </li>`;
      }).join("");
      const awaiting = procurement.status === "awaiting_approval";
      return `<section class="portal-card procurement-card procurement-${escapeHtml(procurement.status)}" data-procurement-card="${escapeHtml(procurement.entryId)}">
        <p class="procurement-kicker">Innkjøp til prosjektet</p>
        <h2>${escapeHtml(procurement.title)}</h2>
        <span class="procurement-state">${escapeHtml(procurementStatus(procurement))}</span>
        ${procurement.supplier ? `<p class="procurement-supplier">Leverandør: <strong>${escapeHtml(procurement.supplier)}</strong></p>` : ""}
        ${procurement.customerNote ? `<p class="procurement-note">${escapeHtml(procurement.customerNote)}</p>` : ""}
        <ul class="procurement-list">${rows}</ul>
        <div class="procurement-total"><span>Totalt</span><strong>${escapeHtml(formatCurrency(procurement.total))}</strong></div>
        ${awaiting ? `<div class="procurement-approval">
          <p><strong>Godkjenner du at dette kjøpes inn?</strong></p>
          <button type="button" class="approve-button" data-approve-procurement="${escapeHtml(procurement.entryId)}">Godkjenn innkjøp</button>
          <div class="approval-confirm hidden" data-approval-confirm="${escapeHtml(procurement.entryId)}">
            <p>Bekreft at Sørgulen Industriservice kan kjøpe dette inn for totalt <strong>${escapeHtml(formatCurrency(procurement.total))}</strong>.</p>
            <div class="approval-actions">
              <button type="button" class="approve-button" data-confirm-approval="${escapeHtml(procurement.entryId)}" data-revision="${escapeHtml(procurement.revision)}">Ja, godkjenn</button>
              <button type="button" class="cancel-approval-button" data-cancel-approval="${escapeHtml(procurement.entryId)}">Avbryt</button>
            </div>
          </div>
        </div>` : procurementResult(procurement)}
      </section>`;
    }).join("");
    procurementContainer.classList.remove("hidden");
  }

  function render(project) {
    currentProject = project;
    loadingCard.classList.add("hidden");
    errorCard.classList.add("hidden");

    document.getElementById("projectName").textContent = project.serviceName || "Prosjekt";
    document.getElementById("customerName").textContent = project.customerName ? `For ${project.customerName}` : "";
    document.getElementById("statusText").textContent = project.statusText || "Prosjektet er aktivt";
    document.getElementById("statusHelp").textContent = project.statusHelp || fallbackStatusHelp(project.status);
    const statusCard = document.getElementById("statusText").closest(".portal-card");
    statusCard?.classList.toggle("status-attention", Boolean(project.statusAttention));

    const nextText = document.getElementById("nextWorkText");
    const nextSubtext = document.getElementById("nextWorkSubtext");
    if (["completed", "cancelled"].includes(project.status)) {
      nextText.textContent = project.status === "completed" ? "Arbeidet er ferdig" : "Oppdraget er avsluttet";
      nextSubtext.textContent = "Det er ikke planlagt flere arbeidsdager på dette oppdraget.";
    } else if (project.nextWork?.start) {
      nextText.textContent = formatDateRange(project.nextWork.start, project.nextWork.end);
      nextSubtext.textContent = project.nextWork.mode === "planned"
        ? "Denne arbeidsperioden er planlagt. Siden oppdateres dersom planen endrer seg."
        : "Dette er forventet tidspunkt og kan endres. Siden oppdateres dersom planen endrer seg.";
    } else {
      nextText.textContent = "Ikke satt ennå";
      nextSubtext.textContent = project.nextWorkMessage || "Prosjektet er fortsatt aktivt. Siden oppdateres så snart neste arbeidsdag er satt.";
    }

    renderProcurements(project.procurements);

    const legacyMaterialCard = document.getElementById("legacyMaterialCard");
    if (!(project.procurements || []).length && project.material?.title) {
      document.getElementById("materialTitle").textContent = project.material.title;
      document.getElementById("materialMessage").textContent = project.material.message || "";
      legacyMaterialCard.classList.remove("hidden");
    } else {
      legacyMaterialCard.classList.add("hidden");
    }

    const messageCard = document.getElementById("messageCard");
    if (project.customerMessage) {
      document.getElementById("customerMessage").textContent = project.customerMessage;
      messageCard.classList.remove("hidden");
    } else {
      messageCard.classList.add("hidden");
    }

    const workFactsCard = document.getElementById("workFactsCard");
    const lastWorkedFact = document.getElementById("lastWorkedFact");
    const hoursFact = document.getElementById("hoursFact");
    const showLastWorked = Boolean(project.lastWorked);
    const showHours = project.hours != null && Number(project.hours) > 0;
    if (showLastWorked) {
      document.getElementById("lastWorked").textContent = formatDate(project.lastWorked, false);
      lastWorkedFact.classList.remove("hidden");
    } else lastWorkedFact.classList.add("hidden");
    if (showHours) {
      document.getElementById("hoursText").textContent = formatDuration(project.hours);
      hoursFact.classList.remove("hidden");
    } else hoursFact.classList.add("hidden");
    workFactsCard.classList.toggle("hidden", !showLastWorked && !showHours);

    const workDaysCard = document.getElementById("workDaysCard");
    const workDayList = document.getElementById("workDayList");
    workDayList.replaceChildren();
    if (project.workDays?.length) {
      project.workDays.slice(0, 6).forEach((day) => {
        const li = document.createElement("li");
        const date = document.createElement("strong");
        date.textContent = formatDate(day.date, false);
        const duration = document.createElement("span");
        duration.textContent = formatDuration(day.seconds);
        li.append(date, duration);
        workDayList.appendChild(li);
      });
      workDaysCard.classList.remove("hidden");
    } else workDaysCard.classList.add("hidden");

    renderPhotos(project.images);
    const updated = project.updatedAt ? new Date(project.updatedAt) : null;
    document.getElementById("updatedText").textContent = updated && !Number.isNaN(updated.getTime())
      ? `Sist oppdatert ${new Intl.DateTimeFormat("no-NO", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Oslo" }).format(updated)}`
      : "";
    projectContent.classList.remove("hidden");
  }

  function demoProject() {
    return {
      customerName: "Eksempelkunde",
      serviceName: "Spyling og rengjøring av uteområde",
      status: "stopped",
      statusText: "Venter på din godkjenning",
      statusHelp: "Se innkjøpet «Fugesand til området» nedenfor og godkjenn når det ser riktig ut.",
      statusAttention: "approval",
      nextWork: { start: "2026-09-17", end: "2026-09-18", mode: "expected" },
      customerMessage: "Spylingen er godt i gang. Før neste del av jobben vil jeg avklare fugesand med deg.",
      procurements: [{
        entryId: "demo-fugesand",
        title: "Fugesand til området",
        supplier: "Eksempel leverandør",
        customerNote: "Jeg har beregnet mengden jeg mener området trenger. Prisene under er eksempeldata i demoen.",
        status: "awaiting_approval",
        revision: 1,
        total: 1032,
        approvedAt: null,
        purchasedAt: null,
        items: [{
          name: "Fugesand – eksempelprodukt",
          productUrl: "",
          quantity: 8,
          unit: "sekker",
          unitPrice: 129,
          lineTotal: 1032,
          note: "Beregnet mengde for området som skal fuges.",
        }],
      }],
      material: null,
      hours: 9 * 3600 + 24 * 60,
      lastWorked: "2026-09-13",
      workDays: [
        { date: "2026-09-13", seconds: 2 * 3600 + 14 * 60 },
        { date: "2026-09-08", seconds: 3 * 3600 + 25 * 60 },
        { date: "2026-09-02", seconds: 3 * 3600 + 45 * 60 },
      ],
      images: [],
      updatedAt: new Date().toISOString(),
    };
  }

  async function confirmApproval(entryId, revision) {
    if (approvalInFlight || !currentProject) return;
    const procurement = (currentProject.procurements || []).find((item) => item.entryId === entryId);
    if (!procurement) return;
    approvalInFlight = true;
    const buttons = document.querySelectorAll(`[data-confirm-approval="${CSS.escape(entryId)}"], [data-approve-procurement="${CSS.escape(entryId)}"]`);
    buttons.forEach((button) => { button.disabled = true; });
    try {
      let approved;
      if (isDemo) {
        approved = { ...procurement, status: "approved", approvedAt: new Date().toISOString() };
      } else {
        const response = await fetch(`${API_BASE}/customer-project/access/procurements/${encodeURIComponent(entryId)}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token: accessToken, revision }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Kunne ikke lagre godkjenningen.");
        approved = data.procurement;
      }
      currentProject.procurements = (currentProject.procurements || []).map((item) => item.entryId === entryId ? approved : item);
      currentProject.statusText = "Innkjøpet er godkjent";
      currentProject.statusHelp = "Håvard kan nå gå videre med innkjøpet.";
      currentProject.statusAttention = "";
      currentProject.updatedAt = new Date().toISOString();
      render(currentProject);
    } catch (error) {
      alert(error.message || "Kunne ikke lagre godkjenningen. Prøv igjen.");
      buttons.forEach((button) => { button.disabled = false; });
    } finally {
      approvalInFlight = false;
    }
  }

  procurementContainer.addEventListener("click", (event) => {
    const approve = event.target.closest("[data-approve-procurement]");
    if (approve) {
      const entryId = approve.dataset.approveProcurement;
      procurementContainer.querySelector(`[data-approval-confirm="${CSS.escape(entryId)}"]`)?.classList.remove("hidden");
      approve.classList.add("hidden");
      return;
    }
    const cancel = event.target.closest("[data-cancel-approval]");
    if (cancel) {
      const entryId = cancel.dataset.cancelApproval;
      procurementContainer.querySelector(`[data-approval-confirm="${CSS.escape(entryId)}"]`)?.classList.add("hidden");
      procurementContainer.querySelector(`[data-approve-procurement="${CSS.escape(entryId)}"]`)?.classList.remove("hidden");
      return;
    }
    const confirmButton = event.target.closest("[data-confirm-approval]");
    if (confirmButton) confirmApproval(confirmButton.dataset.confirmApproval, Number(confirmButton.dataset.revision));
  });

  async function load() {
    if (isDemo) {
      render(demoProject());
      return;
    }
    if (!accessToken) {
      showError("Denne prosjektlenken mangler tilgangsnøkkel. Bruk lenken du fikk fra Sørgulen Industriservice.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/customer-project/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: accessToken }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Kunne ikke hente prosjektet.");
      render(data.project);
    } catch (error) {
      showError(error.message || "Kunne ikke hente prosjektet akkurat nå. Prøv igjen senere.");
    }
  }

  load();
})();
