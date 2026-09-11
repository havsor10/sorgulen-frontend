(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const taskList = document.getElementById("taskList");
  const focusSection = document.getElementById("focusSection");
  const refreshButton = document.getElementById("refreshBtn");
  const header = document.querySelector(".home-main .admin-page-header");
  const tasksSection = taskList?.closest("section");
  let refreshTimer = null;
  let loading = false;
  let actionBusy = false;

  if (!taskList || !tasksSection) return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function adminKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
        ...(options.headers || {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      location.href = "login.html";
      throw new Error("Logg inn på nytt.");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error || `API-feil ${response.status}`);
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function fetchHome() {
    return apiFetch("/admin/assistant/home");
  }

  function osloToday(offset = 0) {
    const date = new Date(Date.now() + offset * 86400000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function formatShortDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "");
    return new Intl.DateTimeFormat("no-NO", {
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(`${value}T12:00:00Z`));
  }

  function updateHeader() {
    if (!header) return;
    const eyebrow = header.querySelector(".admin-eyebrow");
    const title = header.querySelector("h1");
    const help = header.querySelector("p:last-child");
    if (eyebrow) eyebrow.textContent = "Driftsassistent";
    if (title) title.textContent = "Hva trenger deg nå?";
    if (help) help.textContent = "Bare ting som faktisk krever handling blir løftet fram.";
  }

  function taskActionMarkup(task, action, href) {
    const assistantAction = task.assistantAction;
    if (assistantAction?.kind === "publish_next_work" && assistantAction.workOrderId) {
      return `<button class="attention-action attention-action--assistant" type="button"
        data-assistant-action="publish_next_work"
        data-work-order-id="${escapeHtml(assistantAction.workOrderId)}"
        data-start="${escapeHtml(assistantAction.start || "")}"
        data-end="${escapeHtml(assistantAction.end || assistantAction.start || "")}"
        data-customer="${escapeHtml(assistantAction.customerName || "kunden")}"
        data-message="${escapeHtml(assistantAction.customerMessage || "")}">${escapeHtml(action)}</button>`;
    }
    return `<a class="attention-action" href="${escapeHtml(href)}">${escapeHtml(action)}</a>`;
  }

  function taskMarkup(task) {
    const priority = ["critical", "high", "medium", "low"].includes(task.priority) ? task.priority : "medium";
    const status = task.statusLabel || (priority === "critical" ? "MÅ GJØRES NÅ" : priority === "high" ? "KREVER DEG" : "BØR ORDNES");
    const action = task.actionLabel || "Åpne";
    const icon = task.icon || "●";
    const href = task.href || "hjem.html";
    const isAssistantReady = task.assistantAction?.kind === "publish_next_work";
    return `<article class="attention-card ${escapeHtml(priority)} ${isAssistantReady ? "assistant-ready" : ""}">
      <div class="attention-icon" aria-hidden="true">${escapeHtml(icon)}</div>
      <div class="attention-copy">
        <div class="attention-status-row"><span class="attention-signal" aria-hidden="true"></span><span class="attention-status">${escapeHtml(status)}</span></div>
        <h3>${escapeHtml(task.title || "Krever handling")}</h3>
        ${task.detail ? `<p>${escapeHtml(task.detail)}</p>` : ""}
        ${isAssistantReady ? '<p class="attention-assistant-note">Du ser den ferdige kundemeldingen før du godkjenner publisering.</p>' : ""}
      </div>
      ${taskActionMarkup(task, action, href)}
    </article>`;
  }

  function renderTasks(home) {
    const activeId = home.activeWorkOrder?._id ? String(home.activeWorkOrder._id) : "";
    const tasks = (home.overview?.tasks || []).filter((task) => {
      if (!activeId || task.priority === "critical") return true;
      return !String(task.href || "").includes(activeId);
    });

    const important = tasks.filter((task) => task.priority !== "low");
    const later = tasks.filter((task) => task.priority === "low");
    const highest = important[0]?.priority || later[0]?.priority || "none";

    taskList.className = "attention-list";
    const title = tasksSection.querySelector("h2");
    const eyebrow = tasksSection.querySelector(".eyebrow");
    const row = tasksSection.querySelector(".section-title-row");

    let caption = row?.querySelector(".attention-caption");
    if (!caption && row) {
      caption = document.createElement("p");
      caption.className = "attention-caption";
      row.querySelector("div")?.appendChild(caption);
    }

    if (!tasks.length) {
      if (eyebrow) eyebrow.textContent = "Status";
      if (title) title.textContent = "Alt er under kontroll";
      if (caption) caption.textContent = "Du trenger ikke følge opp noe akkurat nå.";
      taskList.innerHTML = `<div class="attention-ok">
        <div class="attention-ok-icon" aria-hidden="true">✓</div>
        <div><h3>Ingenting krever deg nå</h3><p>Systemet finner fram det som trenger handling når noe endrer seg.</p></div>
      </div>`;
      document.title = "Alt under kontroll – Sørgulen admin";
      return;
    }

    if (highest === "critical") {
      if (eyebrow) eyebrow.textContent = "Handling nå";
      if (title) title.textContent = "Dette må du ta tak i";
      if (caption) caption.textContent = "Rødt betyr at systemet mener du bør reagere nå.";
      document.title = "🔴 Krever handling – Sørgulen admin";
    } else if (highest === "high") {
      if (eyebrow) eyebrow.textContent = "Krever deg";
      if (title) title.textContent = "Dette bør du ordne";
      if (caption) caption.textContent = "Det viktigste ligger øverst. Trykk på handlingen for å gå rett dit.";
      document.title = "🟠 Ting å ordne – Sørgulen admin";
    } else {
      if (eyebrow) eyebrow.textContent = "Oppfølging";
      if (title) title.textContent = "Dette er neste steg";
      if (caption) caption.textContent = "Ingen akutte problemer. Dette er det systemet mener er mest relevant nå.";
      document.title = "Sørgulen admin";
    }

    taskList.innerHTML = important.map(taskMarkup).join("");
    if (later.length) {
      taskList.insertAdjacentHTML("afterend", `<details id="attentionLater" class="attention-later">
        <summary>Mindre viktig akkurat nå – vis ${later.length === 1 ? "den" : "dem"}</summary>
        <div class="attention-later-list">${later.map(taskMarkup).join("")}</div>
      </details>`);
    }
  }

  function tuneFocus(home) {
    if (!focusSection) return;
    focusSection.classList.remove("attention-live-focus", "attention-hidden");

    if (home.activeWorkOrder) {
      focusSection.classList.add("attention-live-focus");
      const eyebrow = focusSection.querySelector(".eyebrow");
      if (eyebrow) eyebrow.textContent = home.activeWorkOrder.status === "paused" ? "PAUSET HOS KUNDEN" : "LIVE HOS KUNDEN";
      return;
    }

    const today = osloToday(0);
    const tomorrow = osloToday(1);
    const workDate = home.nextWorkOrder?.jobDate || "";
    const bookingDate = home.nextBooking?.date || "";
    const imminent = [today, tomorrow].includes(workDate) || [today, tomorrow].includes(bookingDate);

    if (!imminent) {
      focusSection.classList.add("attention-hidden");
      return;
    }

    const eyebrow = focusSection.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = workDate === today || bookingDate === today ? "I DAG" : "I MORGEN";
  }

  function removeOldNoise() {
    document.getElementById("aiSummary")?.classList.add("hidden");
    document.getElementById("ongoingSection")?.classList.add("hidden");
    document.getElementById("attentionLater")?.remove();
  }

  async function refreshAttention() {
    if (loading) return;
    loading = true;
    try {
      const home = await fetchHome();
      removeOldNoise();
      tuneFocus(home);
      renderTasks(home);
    } catch (error) {
      taskList.className = "attention-list";
      taskList.innerHTML = `<article class="attention-card high"><div class="attention-icon" aria-hidden="true">⚠️</div><div class="attention-copy"><div class="attention-status-row"><span class="attention-signal"></span><span class="attention-status">KAN IKKE KONTROLLERE</span></div><h3>Systemet fikk ikke kontrollert hva som trenger handling</h3><p>${escapeHtml(error.message || "Prøv igjen.")}</p></div><button class="attention-action" type="button" id="attentionRetry">Prøv igjen</button></article>`;
      document.getElementById("attentionRetry")?.addEventListener("click", refreshAttention, { once: true });
    } finally {
      loading = false;
    }
  }

  async function publishNextWork(button) {
    if (actionBusy || button.disabled) return;
    const workOrderId = button.dataset.workOrderId || "";
    const start = button.dataset.start || "";
    const end = button.dataset.end || start;
    const customer = button.dataset.customer || "kunden";
    const message = button.dataset.message || "";
    if (!workOrderId || !start) return;

    const dateText = start === end ? formatShortDate(start) : `${formatShortDate(start)} til ${formatShortDate(end)}`;
    const messagePreview = message ? `\n\nKundemelding:\n«${message}»` : "";
    const approved = window.confirm(`Publisere ${dateText} som forventet neste arbeidsøkt for ${customer}?${messagePreview}\n\nDette oppdaterer bare kundesiden. Ingen SMS eller e-post sendes.`);
    if (!approved) return;

    actionBusy = true;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Publiserer…";
    try {
      await apiFetch(`/admin/assistant/actions/next-work/${encodeURIComponent(workOrderId)}`, {
        method: "POST",
        body: JSON.stringify({ expectedStart: start, expectedEnd: end }),
      });
      button.textContent = "Publisert ✓";
      await new Promise((resolve) => setTimeout(resolve, 450));
      await refreshAttention();
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      if (error.data?.code === "proposal_changed") {
        window.alert(error.message);
        await refreshAttention();
      } else {
        window.alert(error.message || "Kunne ikke publisere forslaget.");
      }
    } finally {
      actionBusy = false;
    }
  }

  updateHeader();
  tasksSection.classList.add("attention-section");
  window.setTimeout(refreshAttention, 250);

  refreshButton?.addEventListener("click", () => window.setTimeout(refreshAttention, 500));
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-assistant-action="publish_next_work"]');
    if (button) {
      event.preventDefault();
      publishNextWork(button);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshAttention();
  });

  refreshTimer = window.setInterval(() => {
    if (!document.hidden) refreshAttention();
  }, 90000);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
})();
