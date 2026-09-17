(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const token = decodeURIComponent((location.hash || "").replace(/^#/, "").trim());
  const loadingCard = document.getElementById("loadingCard");
  const errorCard = document.getElementById("errorCard");
  const errorText = document.getElementById("errorText");
  const content = document.getElementById("jobContent");
  const liveTime = document.getElementById("liveTime");
  const workTime = document.getElementById("workTime");

  let currentJob = null;
  let fetchedAt = Date.now();
  let pollTimer = null;
  let clockTimer = null;

  function formatDate(value) {
    if (!value) return "Ikke satt";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("no-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Oslo" }).format(date);
  }

  function formatClock(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }).format(date);
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours} t ${minutes} min`;
    if (hours) return `${hours} ${hours === 1 ? "time" : "timer"}`;
    return `${minutes} min`;
  }

  function showError(message) {
    clearInterval(pollTimer);
    clearInterval(clockTimer);
    loadingCard.classList.add("hidden");
    content.classList.add("hidden");
    errorText.textContent = message || "Lenken kan være utløpt eller erstattet.";
    errorCard.classList.remove("hidden");
  }

  function renderTimeline(items) {
    const timeline = document.getElementById("jobTimeline");
    timeline.replaceChildren();
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.className = item.state || "pending";
      const dot = document.createElement("span");
      dot.className = "timeline-dot";
      dot.textContent = item.state === "done" ? "✓" : item.state === "current" ? "●" : "";
      const copy = document.createElement("div");
      copy.className = "timeline-copy";
      const strong = document.createElement("strong");
      strong.textContent = item.label || "";
      copy.appendChild(strong);
      li.append(dot, copy);
      timeline.appendChild(li);
    });
  }

  function updateLiveClock() {
    if (!currentJob) return;
    let seconds = Number(currentJob.workSeconds || 0);
    if (currentJob.stage === "in_progress") seconds += Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
    workTime.textContent = formatDuration(seconds);
  }

  function render(job) {
    currentJob = job;
    fetchedAt = Date.now();
    loadingCard.classList.add("hidden");
    errorCard.classList.add("hidden");
    content.classList.remove("hidden");

    const snow = job.portalType === "snow_service";
    document.getElementById("serviceEyebrow").textContent = snow ? "Brøyting hos deg" : "Jobben din";
    document.getElementById("serviceName").textContent = job.serviceName || (snow ? "Brøyting" : "Oppdrag");
    document.getElementById("customerGreeting").textContent = job.customerName ? `Hei ${job.customerName}. Her kan du følge jobben din.` : "Her kan du følge jobben din.";

    const statusPanel = document.getElementById("statusPanel");
    statusPanel.dataset.stage = job.stage || "booked";
    document.getElementById("statusText").textContent = job.statusText || "Bestillingen er mottatt";
    document.getElementById("statusHelp").textContent = job.statusHelp || "";

    renderTimeline(job.timeline);
    document.getElementById("bookingDate").textContent = formatDate(job.bookingDate);
    document.getElementById("bookingTime").textContent = job.bookingTime ? `kl. ${job.bookingTime}` : "Ikke satt";
    document.getElementById("jobAddress").textContent = job.address || "Ikke oppgitt";
    document.getElementById("addressRow").classList.toggle("hidden", !job.address);

    document.getElementById("startedRow").classList.toggle("hidden", !job.startedAt);
    document.getElementById("completedRow").classList.toggle("hidden", !job.completedAt);
    if (job.startedAt) document.getElementById("startedAt").textContent = `kl. ${formatClock(job.startedAt)}`;
    if (job.completedAt) document.getElementById("completedAt").textContent = `kl. ${formatClock(job.completedAt)}`;

    const showTime = ["in_progress", "completed"].includes(job.stage) || Number(job.workSeconds) > 0;
    liveTime.classList.toggle("hidden", !showTime);
    document.getElementById("liveTimeLabel").textContent = job.stage === "completed" ? "Registrert arbeidstid" : "Arbeidstid så langt";
    updateLiveClock();

    const finishedCard = document.getElementById("finishedCard");
    const finished = job.stage === "completed";
    finishedCard.classList.toggle("hidden", !finished);
    if (finished) {
      const finish = job.completedAt ? `Ferdig kl. ${formatClock(job.completedAt)}.` : "Jobben er ferdig.";
      const time = Number(job.workSeconds) > 0 ? ` Registrert arbeidstid: ${formatDuration(job.workSeconds)}.` : "";
      document.getElementById("finishedSummary").textContent = `${finish}${time}`;
    }

    const updated = job.updatedAt ? new Date(job.updatedAt) : null;
    document.getElementById("updatedText").textContent = updated && !Number.isNaN(updated.getTime())
      ? `Sist oppdatert ${new Intl.DateTimeFormat("no-NO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Oslo" }).format(updated)}`
      : "";

    clearInterval(clockTimer);
    clockTimer = setInterval(updateLiveClock, 1000);
  }

  async function load({ quiet = false } = {}) {
    if (!token) return showError("Denne Min jobb-lenken mangler tilgangskode.");
    try {
      const response = await fetch(`${API}/customer-job/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Kunne ikke hente jobben.");
      render(data.job);
      if (["completed", "cancelled"].includes(data.job?.stage)) clearInterval(pollTimer);
    } catch (error) {
      if (!quiet || !currentJob) showError(error.message);
    }
  }

  load();
  pollTimer = setInterval(() => load({ quiet: true }), 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentJob && !["completed", "cancelled"].includes(currentJob.stage)) load({ quiet: true });
  });
})();
