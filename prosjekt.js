(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";

  const loadingCard = document.getElementById("loadingCard");
  const errorCard = document.getElementById("errorCard");
  const errorText = document.getElementById("errorText");
  const projectContent = document.getElementById("projectContent");

  function osloDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, withWeekday = true) {
    if (!value) return "Ikke satt";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("no-NO", {
      weekday: withWeekday ? "long" : undefined,
      day: "numeric",
      month: "long",
      timeZone: "Europe/Oslo",
    }).format(date);
  }

  function formatDateRange(start, end) {
    if (!start) return "Ikke satt ennå";
    if (!end || end === start) return formatDate(start, true);
    const startDate = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return `${start}–${end}`;

    const startMonth = startDate.getMonth();
    const endMonth = endDate.getMonth();
    const sameMonth = startDate.getFullYear() === endDate.getFullYear() && startMonth === endMonth;
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

  function statusHelp(status) {
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

  function render(project) {
    loadingCard.classList.add("hidden");
    errorCard.classList.add("hidden");

    document.getElementById("projectName").textContent = project.serviceName || "Prosjekt";
    document.getElementById("customerName").textContent = project.customerName ? `For ${project.customerName}` : "";
    document.getElementById("statusText").textContent = project.statusText || "Prosjektet er aktivt";
    document.getElementById("statusHelp").textContent = statusHelp(project.status);

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
      nextSubtext.textContent = "Prosjektet er fortsatt aktivt. Siden oppdateres så snart neste arbeidsdag er satt.";
    }

    const materialCard = document.getElementById("materialCard");
    if (project.material?.title) {
      document.getElementById("materialTitle").textContent = project.material.title;
      document.getElementById("materialMessage").textContent = project.material.message || "";
      materialCard.classList.remove("hidden");
    } else {
      materialCard.classList.add("hidden");
    }

    const messageCard = document.getElementById("messageCard");
    if (project.customerMessage) {
      document.getElementById("customerMessage").textContent = project.customerMessage;
      messageCard.classList.remove("hidden");
    } else {
      messageCard.classList.add("hidden");
    }

    const lastWorkedFact = document.getElementById("lastWorkedFact");
    if (project.lastWorked) {
      document.getElementById("lastWorked").textContent = formatDate(project.lastWorked, false);
      lastWorkedFact.classList.remove("hidden");
    } else {
      document.getElementById("lastWorked").textContent = "Ikke registrert ennå";
    }

    const hoursFact = document.getElementById("hoursFact");
    if (project.hours == null) {
      hoursFact.classList.add("hidden");
    } else {
      hoursFact.classList.remove("hidden");
      document.getElementById("hoursText").textContent = formatDuration(project.hours);
    }

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
    } else {
      workDaysCard.classList.add("hidden");
    }

    renderPhotos(project.images);

    const updated = osloDate(project.updatedAt);
    document.getElementById("updatedText").textContent = updated
      ? `Sist oppdatert ${new Intl.DateTimeFormat("no-NO", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Oslo" }).format(updated)}`
      : "";

    projectContent.classList.remove("hidden");
  }

  function demoProject() {
    return {
      customerName: "Ola Hansen",
      serviceName: "Rengjøring av innkjørsel",
      status: "stopped",
      statusText: "Mellom arbeidsøkter",
      nextWork: { start: "2026-09-17", end: "2026-09-18", mode: "expected" },
      customerMessage: "Parkeringsområdet er rengjort. Neste gang fortsetter jeg langs garasjen og avslutter kantene.",
      material: {
        status: "waiting_delivery",
        title: "Venter på levering",
        message: "Det som er bestilt forventes å være klart før neste arbeidsøkt.",
      },
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

  async function load() {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      render(demoProject());
      return;
    }

    const token = decodeURIComponent((window.location.hash || "").replace(/^#/, "").trim());
    if (!token) {
      showError("Denne prosjektlenken mangler tilgangsnøkkel. Bruk lenken du fikk fra Sørgulen Industriservice.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/customer-project/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token }),
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
