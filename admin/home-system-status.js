(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const card = document.getElementById("systemStatusCard");
  const icon = document.getElementById("systemStatusIcon");
  const title = document.getElementById("systemStatusTitle");
  const text = document.getElementById("systemStatusText");
  const meta = document.getElementById("systemStatusMeta");
  const checks = document.getElementById("systemStatusChecks");
  const refresh = document.getElementById("systemStatusRefresh");
  let busy = false;
  let timer = null;

  if (!card || !icon || !title || !text || !meta || !checks) return;

  function key() { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  async function api(path) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", "x-admin-key": key() },
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
    return data;
  }

  function taskCount(tasks, types, predicate = () => true) {
    return tasks.filter((task) => types.includes(task.type) && predicate(task)).length;
  }

  function statusRow(label, state, detail) {
    const symbol = state === "ok" ? "✓" : state === "warn" ? "!" : state === "info" ? "•" : "×";
    return `<div class="system-check is-${esc(state)}"><span class="system-check-icon">${symbol}</span><div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div></div>`;
  }

  function renderLoading() {
    card.className = "system-status-card is-loading";
    icon.textContent = "…";
    title.textContent = "Kontrollerer hele systemet…";
    text.textContent = "Bookinger, forespørsler, oppdrag, kundeportaler, faktura og Autopilot.";
    meta.textContent = "Kjører kontroll nå";
    checks.innerHTML = "";
  }

  function renderUnknown(failedLabels) {
    card.className = "system-status-card is-unknown";
    icon.textContent = "?";
    title.textContent = "Kan ikke bekrefte at alt er i orden";
    text.textContent = "En eller flere kontroller svarte ikke. Systemet viser derfor ikke falskt grønt lys.";
    meta.textContent = `Kunne ikke kontrollere: ${failedLabels.join(", ")}`;
    checks.innerHTML = statusRow("Systemkontroll", "error", "Prøv kontrollen på nytt");
  }

  function renderStatus(home, autopilot, watchdog, inbox) {
    const tasks = home?.overview?.tasks || [];
    const urgentTasks = tasks.filter((task) => ["critical", "high", "medium"].includes(task.priority));
    const criticalTasks = tasks.filter((task) => task.priority === "critical");
    const bookingNeeds = taskCount(urgentTasks, ["booking", "request"]);
    const workCritical = taskCount(criticalTasks, ["workOrder"]);
    const portalNeeds = taskCount(urgentTasks, ["portal", "procurement"]);
    const invoiceNeeds = taskCount(urgentTasks, ["invoice"]);
    const activeWork = home?.activeWorkOrder ? 1 : 0;

    const pendingApprovals = Number(inbox?.inbox?.counts?.pending || 0);
    const executionCounts = autopilot?.autopilot?.actions?.counts || {};
    const failedActions = Number(executionCounts.failed || 0);
    const executionEnabled = autopilot?.autopilot?.executionEnabled === true;
    const watchdogFindings = watchdog?.findings || [];
    const watchdogCritical = watchdogFindings.filter((item) => ["critical", "high"].includes(item.severity)).length;
    const watchdogTotal = watchdogFindings.length;

    const hardProblem = failedActions > 0 || watchdogCritical > 0 || criticalTasks.length > 0 || !executionEnabled;
    const needsAttention = urgentTasks.length > 0 || pendingApprovals > 0 || watchdogTotal > 0;

    if (hardProblem) {
      card.className = "system-status-card is-problem";
      icon.textContent = "!";
      title.textContent = "Noe er ikke i orden";
      text.textContent = "Systemet fungerer, men det finnes forhold som må kontrolleres eller rettes.";
    } else if (needsAttention) {
      card.className = "system-status-card is-attention";
      icon.textContent = "!";
      title.textContent = "Systemet er kontrollert – noe trenger oppfølging";
      text.textContent = "Ingen systemfeil er registrert, men du har saker som bør håndteres.";
    } else {
      card.className = "system-status-card is-good";
      icon.textContent = "✓";
      title.textContent = "Alt er kontrollert – alt er i orden";
      text.textContent = "Bookinger, forespørsler, oppdrag, kundeportaler, faktura og Autopilot er kontrollert.";
    }

    const rows = [];
    rows.push(statusRow("Bookinger og forespørsler", bookingNeeds ? "warn" : "ok", bookingNeeds ? `${bookingNeeds} krever oppfølging` : "Ingen ubesvarte saker"));
    rows.push(statusRow("Oppdrag og takstameter", workCritical ? "error" : activeWork ? "info" : "ok", workCritical ? `${workCritical} kritisk funn` : activeWork ? "Aktivt oppdrag registrert" : "Ingen feil funnet"));
    rows.push(statusRow("Kundeportaler og innkjøp", portalNeeds ? "warn" : "ok", portalNeeds ? `${portalNeeds} krever oppfølging` : "Ingen blokkeringer funnet"));
    rows.push(statusRow("Faktura", invoiceNeeds ? "warn" : "ok", invoiceNeeds ? `${invoiceNeeds} krever oppfølging` : "Ingen fakturaproblemer funnet"));
    rows.push(statusRow("Autopilot", failedActions ? "error" : pendingApprovals ? "warn" : executionEnabled ? "ok" : "error", failedActions ? `${failedActions} handlinger har feilet` : pendingApprovals ? `${pendingApprovals} venter på deg` : executionEnabled ? "Aktiv og uten feil" : "Ikke aktiv"));
    rows.push(statusRow("Watchdog", watchdogCritical ? "error" : watchdogTotal ? "warn" : "ok", watchdogCritical ? `${watchdogCritical} viktige funn` : watchdogTotal ? `${watchdogTotal} funn følges opp` : "Ingen skjulte feil funnet"));
    checks.innerHTML = rows.join("");

    const now = new Intl.DateTimeFormat("no-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    meta.textContent = `6/6 områder kontrollert · sist kontrollert ${now}`;
  }

  async function load() {
    if (busy) return;
    busy = true;
    refresh && (refresh.disabled = true);
    renderLoading();
    try {
      if (!key()) {
        location.href = "login.html";
        return;
      }
      const requests = [
        ["driftsoversikt", "/admin/assistant/home"],
        ["Autopilot", "/admin/autopilot/status"],
        ["watchdog", "/admin/autopilot/watchdog"],
        ["godkjenningskø", "/admin/autopilot/inbox/summary"],
      ];
      const results = await Promise.allSettled(requests.map(([, path]) => api(path)));
      const failed = results.map((result, index) => result.status === "rejected" ? requests[index][0] : null).filter(Boolean);
      if (failed.length) {
        renderUnknown(failed);
        return;
      }
      renderStatus(results[0].value, results[1].value, results[2].value, results[3].value);
    } catch (_error) {
      renderUnknown(["systemstatus"]);
    } finally {
      busy = false;
      refresh && (refresh.disabled = false);
    }
  }

  refresh?.addEventListener("click", load);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  timer = window.setInterval(() => { if (!document.hidden) load(); }, 90_000);
  window.addEventListener("beforeunload", () => { if (timer) clearInterval(timer); });
  load();
})();
