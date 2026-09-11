(() => {
  "use strict";

  if (window.__sorgulenFikenInvoiceBridge) return;
  window.__sorgulenFikenInvoiceBridge = true;

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const file = window.location.pathname.split("/").filter(Boolean).at(-1) || "";
  const isDetail = file === "faktura-detalj.html";
  const isList = file === "fakturaer.html";
  if (!isDetail && !isList) return;

  let bridgeStatus = null;
  let detailInvoice = null;
  let fikenState = null;
  let running = false;

  function adminKey() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  async function api(path, options = {}) {
    const headers = { "x-admin-key": adminKey(), ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Fiken-kall feilet (${response.status})`);
      error.status = response.status;
      error.code = data.code || "";
      throw error;
    }
    return data;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtDate(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fmtMoney(value) {
    const n = Number(value);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)} kr`;
  }

  function operationId() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function setBusy(value) {
    running = value;
    document.querySelectorAll("[data-fiken-action]").forEach((button) => { button.disabled = value; });
  }

  function localMutationButtons() {
    return document.querySelectorAll('[data-action="issue"],[data-action="send"],[data-action="paid"],[data-action="credit"]');
  }

  function applyLegacyGuard() {
    if (!detailInvoice || !bridgeStatus) return;
    const linked = Boolean(fikenState?.linked);
    const isNewDraft = detailInvoice.status === "draft" && !detailInvoice.invoiceNumber;
    if (linked || isNewDraft) {
      localMutationButtons().forEach((node) => { node.hidden = true; node.style.display = "none"; });
    }
    if (linked && fikenState?.status === "draft") {
      document.querySelectorAll('.btn-edit,[data-action="delete"]').forEach((node) => { node.hidden = true; node.style.display = "none"; });
    }
    if (linked) {
      const composer = document.getElementById("emailComposer");
      if (composer) composer.style.display = "none";
    }
  }

  function insertStrip() {
    if (document.getElementById("fikenInvoiceStrip")) return;
    const anchor = document.getElementById("statusMessage") || document.querySelector(".admin-page-header");
    if (!anchor) return;
    const strip = document.createElement("section");
    strip.id = "fikenInvoiceStrip";
    strip.className = "fiken-strip";
    const configured = bridgeStatus?.configured;
    const ready = bridgeStatus?.invoicingReady;
    strip.innerHTML = `
      <div class="fiken-strip-copy">
        <span class="fiken-dot ${configured ? (ready ? "is-live" : "is-warn") : "is-warn"}"></span>
        <div>
          <strong>${configured ? (ready ? "Fiken er regnskapskilden" : "Fiken er koblet") : "Fiken venter på oppsett"}</strong>
          <small>${configured ? (ready ? `${esc(bridgeStatus.company?.name || "Fiken")} · nye fakturaer går via Fiken` : "Sett inntektskonto før nye fakturaer utstedes") : "Legg API-variablene i Render før fakturering"}</small>
        </div>
      </div>
      <div class="fiken-strip-actions">
        <a class="fiken-mini-link" href="okonomi.html">Økonomi</a>
        ${configured ? '<button class="fiken-mini-btn" type="button" data-fiken-list-sync>Synk</button>' : ""}
      </div>`;
    anchor.insertAdjacentElement("afterend", strip);
    strip.querySelector("[data-fiken-list-sync]")?.addEventListener("click", syncAll);
  }

  function statusLabel() {
    if (!fikenState?.linked) return "Ikke koblet";
    return ({ draft: "Utkast i Fiken", issued: "Utstedt i Fiken", sent: "Sendt via Fiken", paid: "Betalt i Fiken", credited: "Kreditert i Fiken", error: "Fiken-feil" })[fikenState.status] || "Koblet til Fiken";
  }

  function renderDetailPanel(message = "", error = false) {
    if (!isDetail || !detailInvoice) return;
    let panel = document.getElementById("fikenInvoicePanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "fikenInvoicePanel";
      const actionSection = document.querySelector(".fd-actions");
      if (actionSection) actionSection.insertAdjacentElement("beforebegin", panel);
      else document.querySelector(".fd-card")?.appendChild(panel);
    }

    const linked = Boolean(fikenState?.linked);
    const legacy = detailInvoice.status !== "draft" && !linked;
    const ready = Boolean(bridgeStatus?.invoicingReady);
    const klass = error || fikenState?.lastError ? "is-error" : ready ? "is-ready" : "is-warn";
    panel.className = `fiken-panel ${klass}`;

    const meta = linked ? `
      <div class="fiken-meta">
        <div><span>Fiken-faktura</span><strong>${fikenState.invoiceNumber ? `#${esc(fikenState.invoiceNumber)}` : fikenState.draftId ? `Utkast #${esc(fikenState.draftId)}` : "–"}</strong></div>
        <div><span>Status</span><strong>${esc(statusLabel())}</strong></div>
        <div><span>Utestående</span><strong>${fikenState.outstandingBalance == null ? "–" : esc(fmtMoney(fikenState.outstandingBalance))}</strong></div>
        <div><span>Sist synk</span><strong>${esc(fmtDate(fikenState.syncedAt))}</strong></div>
      </div>` : "";

    let actions = "";
    if (legacy) {
      actions = '<a class="fiken-secondary" href="okonomi.html" style="display:inline-flex;align-items:center;text-decoration:none">Åpne økonomi</a>';
    } else if (!ready) {
      actions = '<a class="fiken-secondary" href="okonomi.html" style="display:inline-flex;align-items:center;text-decoration:none">Vis Fiken-oppsett</a>';
    } else if (detailInvoice.status === "draft" && !linked) {
      actions = '<button class="fiken-primary" type="button" data-fiken-action="draft">Opprett utkast i Fiken</button>';
    } else if (detailInvoice.status === "draft" && fikenState?.draftId && !fikenState?.invoiceId) {
      actions = '<button class="fiken-primary" type="button" data-fiken-action="issue">Utsted i Fiken</button><button class="fiken-secondary" type="button" data-fiken-action="syncDraftInfo">Oppdater status</button>';
    } else if (fikenState?.invoiceId && ["issued", "sent"].includes(detailInvoice.status)) {
      actions = `${detailInvoice.status === "issued" ? '<button class="fiken-primary" type="button" data-fiken-action="send">Send via Fiken</button>' : ""}<button class="fiken-secondary" type="button" data-fiken-action="sync">Synk betaling</button><button class="fiken-danger" type="button" data-fiken-action="credit">Krediter i Fiken</button>`;
    } else if (fikenState?.invoiceId && detailInvoice.status === "paid") {
      actions = '<button class="fiken-secondary" type="button" data-fiken-action="sync">Synk status</button><button class="fiken-danger" type="button" data-fiken-action="credit">Krediter i Fiken</button>';
    } else if (detailInvoice.status === "credited" && linked) {
      actions = '<a class="fiken-secondary" href="okonomi.html" style="display:inline-flex;align-items:center;text-decoration:none">Åpne økonomi</a>';
    }

    const explanatory = legacy
      ? "Denne fakturaen ble utstedt i det gamle lokale systemet og beholdes som historikk. Nye fakturaer skal gå via Fiken."
      : !bridgeStatus?.configured
        ? "Nye fakturaer er sperret fra lokal utstedelse. Legg Fiken-variablene i Render først."
        : !ready
          ? "Fiken kan leses, men FIKEN_INCOME_ACCOUNT mangler. Ingen faktura utstedes før den er satt."
          : linked
            ? "Fiken eier regnskapsstatusen. Admin viser en synkronisert kopi for oppfølging."
            : "Når utkastet er ferdig redigert kan du sende det til Fiken. Fiken får fakturanummer, MVA-behandling og regnskapsregistrering.";

    panel.innerHTML = `
      <div class="fiken-panel-head">
        <div><p class="fiken-panel-kicker">Regnskap · Fiken</p><h3>${esc(statusLabel())}</h3></div>
        <span class="fiken-state-pill">${legacy ? "Legacy" : bridgeStatus?.configured ? "Fiken" : "Ikke konfigurert"}</span>
      </div>
      <p class="fiken-panel-copy">${esc(explanatory)}</p>
      ${meta}
      <div class="fiken-actions">${actions}</div>
      <p class="fiken-message${error ? " is-error" : ""}" id="fikenActionMessage">${esc(message || fikenState?.lastError || "")}</p>`;

    panel.querySelectorAll("[data-fiken-action]").forEach((button) => {
      button.addEventListener("click", () => runDetailAction(button.dataset.fikenAction));
    });
    applyLegacyGuard();
  }

  async function refreshDetail() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const [localData, stateData] = await Promise.all([
      api(`/invoices/${encodeURIComponent(id)}`),
      api(`/admin/fiken/invoices/${encodeURIComponent(id)}`),
    ]);
    detailInvoice = localData.invoice;
    fikenState = stateData.fiken;
    renderDetailPanel();
  }

  async function runDetailAction(action) {
    if (running || !detailInvoice?._id) return;
    if (action === "syncDraftInfo") return refreshDetail();
    const id = detailInvoice._id;
    if (action === "issue" && !confirm("Utstede fakturaen i Fiken nå? Fiken tildeler fakturanummer og regnskapsdata blir låst.")) return;
    if (action === "send" && !confirm("Sende fakturaen til kunden via Fiken nå?")) return;
    if (action === "credit") {
      if (!confirm("Kreditere hele Fiken-fakturaen? Dette oppretter en kreditnota i regnskapet.")) return;
      if (!confirm("Bekreft én gang til: full kreditnota blir opprettet og sendt via Fiken.")) return;
    }
    setBusy(true);
    renderDetailPanel(action === "draft" ? "Oppretter Fiken-utkast…" : action === "issue" ? "Utsteder i Fiken…" : action === "send" ? "Sender via Fiken…" : action === "sync" ? "Synkroniserer…" : "Oppretter kreditnota…");
    try {
      const endpoint = action === "draft" ? "draft" : action;
      const body = action === "credit"
        ? { operationId: operationId(), send: true }
        : { operationId: operationId() };
      await api(`/admin/fiken/invoices/${encodeURIComponent(id)}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      window.location.reload();
    } catch (error) {
      renderDetailPanel(error.message || "Fiken-handlingen feilet.", true);
      setBusy(false);
    }
  }

  async function syncAll(event) {
    const button = event?.currentTarget;
    if (button) button.disabled = true;
    try {
      const data = await api("/admin/fiken/invoices/sync-open", { method: "POST", body: "{}" });
      if (isList) window.location.reload();
      else if (isDetail) await refreshDetail();
      if (!isList && button) button.textContent = `${data.paid || 0} betalt`;
    } catch (error) {
      if (button) button.textContent = "Synk feilet";
    } finally {
      if (button) button.disabled = false;
    }
  }

  function markListRows() {
    document.querySelectorAll(".inv-row-link").forEach((row) => {
      if (row.querySelector(".fiken-account-badge")) return;
      const firstCell = row.querySelector("td");
      if (!firstCell) return;
      // Selve Fiken-nummeret rendres av fakturaer.js når feltet finnes.
      if (firstCell.dataset?.fiken === "true") {
        const badge = document.createElement("span");
        badge.className = "fiken-account-badge";
        badge.textContent = "Fiken";
        firstCell.appendChild(badge);
      }
    });
  }

  async function start() {
    if (!adminKey()) return;
    try {
      bridgeStatus = await api("/admin/fiken/status");
    } catch (error) {
      // Backend uten Fiken-rutene ennå: ikke forstyrr eksisterende fakturaflyt.
      if (error.status === 404) return;
      bridgeStatus = { configured: false, invoicingReady: false, invoicingMode: "fiken" };
    }
    insertStrip();
    if (isDetail) {
      try { await refreshDetail(); }
      catch (error) { renderDetailPanel(error.message || "Kunne ikke hente Fiken-status.", true); }
      const observer = new MutationObserver(() => applyLegacyGuard());
      observer.observe(document.getElementById("fdContent") || document.body, { childList: true, subtree: true });
    } else {
      markListRows();
      const observer = new MutationObserver(markListRows);
      observer.observe(document.getElementById("invContent") || document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
