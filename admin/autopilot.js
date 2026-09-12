(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const approvalList = document.getElementById("approvalList");
  const revisionList = document.getElementById("revisionList");
  const executionList = document.getElementById("executionList");
  const attentionSection = document.getElementById("attentionSection");
  const revisionSection = document.getElementById("revisionSection");
  const allClear = document.getElementById("allClear");
  const pendingCount = document.getElementById("pendingCount");
  const watchdogList = document.getElementById("watchdogList");
  const watchdogCount = document.getElementById("watchdogCount");
  const subtitle = document.getElementById("autopilotSubtitle");
  const status = document.getElementById("autopilotStatus");
  const mode = document.getElementById("autopilotMode");
  const dot = document.getElementById("autopilotDot");
  const message = document.getElementById("autopilotMessage");
  const refreshBtn = document.getElementById("refreshAutopilot");

  let busy = false;

  function adminKey() { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }
  function setMessage(text, kind = "") {
    message.textContent = text || "";
    message.className = `status-message${kind ? ` ${kind}` : ""}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}/admin/autopilot${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      window.location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) {
      const error = new Error(data.error || `Feil ${response.status}`);
      error.code = data.code;
      error.approval = data.approval;
      error.execution = data.execution;
      throw error;
    }
    return data;
  }

  const actionTitles = {
    prepare_booking_work_order: "Klargjør booking som oppdrag",
    resolve_booking_capacity_conflict: "Løs kapasitetskollisjon",
    review_booking_date: "Kontroller bookingdato",
    prepare_customer_portal: "Klargjør kundeside",
    plan_next_work_manually: "Velg neste arbeidsdag",
    review_work_order_next_step: "Bestem neste steg",
    create_invoice_draft: "Opprett fakturautkast",
    repair_invoice_basis: "Kontroller fakturagrunnlag",
    approve_purchase_execution: "Godkjenn innkjøp",
    publish_next_work: "Publiser neste arbeidsdag",
  };

  const factLabels = {
    bookingDate: "Dato", bookingTime: "Tid", serviceName: "Tjeneste",
    workOrderId: "Oppdrag", estimatedTotal: "Beløp", lineCount: "Linjer",
    total: "Beløp", amount: "Beløp", supplier: "Leverandør", entryId: "Innkjøp",
    expectedStart: "Fra", expectedEnd: "Til", customerMessage: "Kundemelding",
    nextWorkStart: "Neste dag", nextWorkEnd: "Til", status: "Status",
  };

  function formatValue(key, value) {
    if (value === null || value === undefined || value === "") return "–";
    if (["estimatedTotal", "total", "amount"].includes(key) && Number.isFinite(Number(value))) {
      return `${new Intl.NumberFormat("nb-NO").format(Number(value))} kr`;
    }
    if (Array.isArray(value)) return value.length ? value.join(", ") : "–";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function facts(data = {}) {
    const entries = Object.entries(data).filter(([key, value]) => factLabels[key] && value !== "" && value !== null && value !== undefined);
    if (!entries.length) return "";
    return `<ul class="autopilot-facts">${entries.map(([key, value]) => `<li><span>${esc(factLabels[key])}</span><strong>${esc(formatValue(key, value))}</strong></li>`).join("")}</ul>`;
  }

  function riskLabel(risk) {
    return ({ critical: "Kritisk", high: "Viktig", medium: "Kontroll", low: "Lav risiko" })[risk] || "Kontroll";
  }

  function approvalCard(item) {
    const title = actionTitles[item.actionName] || item.actionName || "Sak til kontroll";
    return `
      <article class="autopilot-card is-${esc(item.risk || "low")}" data-approval-id="${esc(item.id)}" data-action-name="${esc(item.actionName || "")}">
        <div class="autopilot-card-top">
          <h3>${esc(title)}</h3>
          <span class="autopilot-pill">${esc(riskLabel(item.risk))}</span>
        </div>
        <p class="autopilot-reason"><strong>${esc(item.summary)}</strong></p>
        ${item.reason ? `<p class="autopilot-reason">${esc(item.reason)}</p>` : ""}
        ${facts(item.actionData)}
        <div class="autopilot-actions">
          <button class="autopilot-approve" type="button" data-choice="approve">Godkjenn</button>
          <button class="autopilot-change" type="button" data-open-change>Endre</button>
          <button class="autopilot-reject" type="button" data-choice="reject">Avvis</button>
        </div>
        <div class="autopilot-change-box">
          <textarea maxlength="2000" placeholder="Skriv kort hva AI skal endre…"></textarea>
          <button type="button" data-choice="change">Send endring til AI</button>
        </div>
      </article>`;
  }

  function revisionCard(item) {
    return `
      <article class="autopilot-card is-revision">
        <div class="autopilot-card-top"><h3>${esc(actionTitles[item.actionName] || item.actionName)}</h3><span class="autopilot-pill">Venter</span></div>
        <p class="autopilot-reason">${esc(item.requestedChange || "Endring er sendt tilbake til AI.")}</p>
      </article>`;
  }

  function watchdogItem(item) {
    return `<div class="autopilot-watchdog-item"><strong>${esc(item.message || item.code)}</strong><small>${esc(riskLabel(item.severity))}</small></div>`;
  }

  function executionState(item) {
    return ({
      succeeded: "Utført",
      failed: "Feilet",
      superseded: "Ikke lenger aktuell",
      undone: "Angret",
      running: "Utfører…",
      queued: "Venter",
    })[item.state] || item.state || "Ukjent";
  }

  function executionTitle(item) {
    if (item.actionName === "publish_next_work") return "Neste arbeidsdag publisert";
    if (item.actionName === "create_invoice_draft") return "Fakturautkast opprettet";
    return actionTitles[item.actionName] || item.actionName || "Autopilot-handling";
  }

  function executionCard(item) {
    const undoOpen = item.actionName === "publish_next_work"
      && item.state === "succeeded"
      && item.undoUntil
      && new Date(item.undoUntil).getTime() > Date.now();
    const retry = item.state === "failed";
    const details = item.result || item.actionData || {};
    return `
      <article class="autopilot-card autopilot-execution is-execution-${esc(item.state || "unknown")}" data-execution-id="${esc(item.id)}">
        <div class="autopilot-card-top">
          <h3>${esc(executionTitle(item))}</h3>
          <span class="autopilot-pill">${esc(executionState(item))}</span>
        </div>
        ${facts(details)}
        ${item.error?.message ? `<p class="autopilot-reason">${esc(item.error.message)}</p>` : ""}
        ${undoOpen || retry ? `<div class="autopilot-execution-actions">
          ${undoOpen ? '<button type="button" data-execution-action="undo">Angre</button>' : ""}
          ${retry ? '<button type="button" data-execution-action="retry">Prøv igjen</button>' : ""}
        </div>` : ""}
      </article>`;
  }

  function renderInbox(inbox) {
    const approvals = inbox.approvals || [];
    const pending = approvals.filter((item) => item.state === "pending");
    const revisions = approvals.filter((item) => item.state === "revision_requested");
    const watchdog = inbox.watchdog || [];

    pendingCount.textContent = String(pending.length);
    approvalList.innerHTML = pending.length ? pending.map(approvalCard).join("") : "";
    revisionList.innerHTML = revisions.length ? revisions.map(revisionCard).join("") : "";
    watchdogCount.textContent = String(watchdog.length);
    watchdogList.innerHTML = watchdog.length ? watchdog.map(watchdogItem).join("") : '<div class="autopilot-empty">Ingen ekstra funn.</div>';

    attentionSection.hidden = pending.length === 0;
    revisionSection.hidden = revisions.length === 0;
    allClear.hidden = pending.length > 0 || revisions.length > 0;

    const needsYou = pending.length;
    subtitle.textContent = needsYou ? `${needsYou} ting trenger deg.` : "Ingen nye beslutninger trenger deg akkurat nå.";
    status.textContent = needsYou ? `${needsYou} ting trenger deg` : "Sørgulen er under kontroll";
    mode.textContent = inbox.controlMode === "guarded" || inbox.executionEnabled ? "Guarded Autopilot" : "Shadow Mode";
    dot.classList.toggle("is-ok", needsYou === 0);
    window.SorgulenAdminShell?.refreshBadges?.();
  }

  function renderExecutions(executions = []) {
    const visible = executions.slice(0, 12);
    executionList.innerHTML = visible.length
      ? visible.map(executionCard).join("")
      : '<div class="autopilot-empty">Ingen Autopilot-handlinger er utført ennå.</div>';
  }

  async function load({ scan = false, sync = true } = {}) {
    if (busy) return;
    busy = true;
    refreshBtn.disabled = true;
    setMessage("");
    try {
      if (!adminKey()) {
        window.location.href = "login.html";
        return;
      }
      if (scan) await api("/scan", { method: "POST", body: JSON.stringify({ days: 14 }) });
      const [inboxData, executionData] = await Promise.all([
        api(`/inbox?state=all&limit=200&sync=${sync && !scan ? "true" : "false"}`),
        api("/executions?limit=12"),
      ]);
      renderInbox(inboxData.inbox);
      renderExecutions(executionData.executions || []);
    } catch (error) {
      setMessage(error.message || "Kunne ikke hente Autopilot", "error");
    } finally {
      busy = false;
      refreshBtn.disabled = false;
    }
  }

  function approvalSuccessMessage(actionName, response, choice) {
    if (choice === "change") return "Endringen er sendt tilbake til AI-køen.";
    if (choice === "reject") return "Saken er avvist.";
    const execution = response.execution;
    if (execution?.supported && execution.execution?.state === "succeeded") {
      if (actionName === "create_invoice_draft") return "Godkjent. Fakturautkast er opprettet.";
      return "Godkjent og utført.";
    }
    if (execution?.supported === false) return "Godkjent. Denne handlingen krever fortsatt manuell oppfølging.";
    return "Godkjent.";
  }

  async function decide(card, choice) {
    if (busy) return;
    const id = card.dataset.approvalId;
    const actionName = card.dataset.actionName || "";
    const textarea = card.querySelector("textarea");
    if (choice === "reject" && !window.confirm("Avvise denne saken?")) return;
    const requestedChange = choice === "change" ? (textarea?.value || "").trim() : "";
    if (choice === "change" && !requestedChange) {
      textarea?.focus();
      return;
    }
    busy = true;
    card.classList.add("is-busy");
    setMessage("");
    let shouldReload = false;
    try {
      const response = await api(`/inbox/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        body: JSON.stringify({ choice, requestedChange }),
      });
      setMessage(approvalSuccessMessage(actionName, response, choice), "success");
      shouldReload = true;
    } catch (error) {
      setMessage(error.message || "Kunne ikke lagre valget", "error");
      shouldReload = error.code === "approval_changed" || error.code === "approval_superseded";
    } finally {
      busy = false;
      card.classList.remove("is-busy");
    }
    if (shouldReload) await load({ sync: false });
  }

  async function handleExecution(card, action) {
    if (busy) return;
    const id = card.dataset.executionId;
    if (!id) return;
    if (action === "undo" && !window.confirm("Angre denne automatiske endringen?")) return;
    busy = true;
    card.classList.add("is-busy");
    setMessage("");
    try {
      await api(`/executions/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(action === "undo" ? "Autopilot-handlingen er angret." : "Handlingen ble kjørt på nytt.", "success");
    } catch (error) {
      setMessage(error.message || "Kunne ikke behandle handlingen", "error");
    } finally {
      busy = false;
      card.classList.remove("is-busy");
    }
    await load({ sync: false });
  }

  document.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-change]");
    if (open) {
      const card = open.closest("[data-approval-id]");
      const box = card?.querySelector(".autopilot-change-box");
      box?.classList.toggle("is-open");
      if (box?.classList.contains("is-open")) box.querySelector("textarea")?.focus();
      return;
    }

    const executionButton = event.target.closest("[data-execution-action]");
    if (executionButton) {
      const card = executionButton.closest("[data-execution-id]");
      if (card) handleExecution(card, executionButton.dataset.executionAction);
      return;
    }

    const button = event.target.closest("[data-choice]");
    if (!button) return;
    const card = button.closest("[data-approval-id]");
    if (card) decide(card, button.dataset.choice);
  });

  refreshBtn.addEventListener("click", () => load({ scan: true, sync: false }));
  load();
  setInterval(() => load({ sync: false }), 60_000);
})();