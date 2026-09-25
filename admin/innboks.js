(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const listNode = document.getElementById("mailboxList");
  const detailNode = document.getElementById("mailDetail");
  const statusNode = document.getElementById("mailboxStatus");
  const listMeta = document.getElementById("mailboxListMeta");
  const syncBtn = document.getElementById("syncMailboxBtn");
  const attentionCount = document.getElementById("mailAttentionCount");
  const otherCount = document.getElementById("mailOtherCount");
  const handledCount = document.getElementById("mailHandledCount");
  const lastSync = document.getElementById("mailLastSync");
  const tabs = [...document.querySelectorAll("[data-mail-scope]")];
  const jumps = [...document.querySelectorAll("[data-scope-jump]")];

  let scope = "attention";
  let messages = [];
  let activeId = new URLSearchParams(window.location.search).get("open") || "";
  let busy = false;

  function adminKey() { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}/admin/mailbox${path}`, {
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
    if (!response.ok) throw new Error(data.error || `Feil ${response.status}`);
    return data;
  }

  function setStatus(text, kind = "") {
    statusNode.textContent = text || "";
    statusNode.className = `mailbox-status${kind ? ` ${kind}` : ""}`;
  }

  function fmtDate(value, includeTime = true) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat("nb-NO", {
      day: "2-digit",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  }

  function categoryLabel(value) {
    return ({
      customer: "Kunde",
      lead: "Oppdrag / lead",
      invoice: "Økonomi",
      supplier: "Leverandør",
      system: "System",
      newsletter: "Nyhetsbrev",
      other: "Annet",
    })[value] || "Annet";
  }

  function priorityLabel(value) {
    return value === "high" ? "Høy prioritet" : value === "medium" ? "Middels" : "Lav";
  }

  function renderSummary(data) {
    attentionCount.textContent = data.counts?.attention ?? 0;
    otherCount.textContent = data.counts?.other ?? 0;
    handledCount.textContent = data.counts?.handled ?? 0;
    lastSync.textContent = data.state?.lastSuccessAt ? fmtDate(data.state.lastSuccessAt) : "Ikke synkronisert";
    if (!data.configured) {
      setStatus("Firmamail er ikke konfigurert på backend ennå.", "error");
      return;
    }
    if (data.state?.lastError) {
      setStatus(`Siste synk feilet: ${data.state.lastError}`, "error");
      return;
    }
    setStatus("");
  }

  function renderList() {
    listMeta.textContent = `${messages.length} e-post${messages.length === 1 ? "" : "er"}`;
    if (!messages.length) {
      const copy = scope === "attention"
        ? "Ingen e-poster krever handling akkurat nå."
        : scope === "handled"
          ? "Ingen ferdigbehandlede e-poster ennå."
          : "Ingen e-poster i denne visningen.";
      listNode.innerHTML = `<div class="mailbox-empty">${escapeHtml(copy)}</div>`;
      return;
    }

    listNode.innerHTML = messages.map((mail) => {
      const sender = mail.senderName || mail.senderEmail || "Ukjent avsender";
      return `
        <button class="mail-row${mail.id === activeId ? " is-active" : ""}${mail.status === "new" ? " is-new" : ""}" type="button" data-mail-id="${escapeHtml(mail.id)}">
          <div class="mail-row-head">
            <span class="mail-sender">${escapeHtml(sender)}</span>
            <span class="mail-time">${escapeHtml(fmtDate(mail.receivedAt))}</span>
          </div>
          <div class="mail-subject">${escapeHtml(mail.subject || "(uten emne)")}</div>
          <div class="mail-snippet">${escapeHtml(mail.snippet || "Ingen forhåndsvisning")}</div>
          <div class="mail-row-meta">
            ${mail.requiresAction ? `<span class="mail-pill ${escapeHtml(mail.priority)}">${escapeHtml(priorityLabel(mail.priority))}</span>` : ""}
            <span class="mail-pill ${escapeHtml(mail.category)}">${escapeHtml(categoryLabel(mail.category))}</span>
            ${mail.customer ? '<span class="mail-pill customer">Registrert kunde</span>' : ""}
          </div>
        </button>`;
    }).join("");
  }

  function renderDetail(mail) {
    if (!mail) {
      detailNode.innerHTML = `
        <div class="mail-detail-empty">
          <span>✉</span>
          <h2>Velg en e-post</h2>
          <p>Her ser du hele meldingen og kan markere hva som er ferdig eller må følges opp.</p>
        </div>`;
      return;
    }

    const sender = mail.senderName || mail.senderEmail || "Ukjent avsender";
    const reasons = (mail.classificationReasons || []).length
      ? `<div class="mail-reasons"><strong>Hvorfor systemet sorterte den slik</strong><ul>${mail.classificationReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>`
      : "";
    const customer = mail.customer
      ? `<a class="mail-customer-link" href="kunde.html?id=${encodeURIComponent(mail.customer.id)}">Åpne kunde: ${escapeHtml(mail.customer.name)}</a>`
      : "";
    const attachments = (mail.attachmentNames || []).length
      ? `<div class="mail-attachments"><strong>Vedlegg:</strong> ${mail.attachmentNames.map(escapeHtml).join(", ")}</div>`
      : "";

    detailNode.innerHTML = `
      <div class="mail-detail-head">
        <p class="mail-detail-kicker">${mail.requiresAction ? "Krever handling" : "Firmamail"} · ${escapeHtml(categoryLabel(mail.category))}</p>
        <h2>${escapeHtml(mail.subject || "(uten emne)")}</h2>
        <div class="mail-from">
          <strong>${escapeHtml(sender)}</strong>
          <span>${escapeHtml(mail.senderEmail || "")}</span>
          <span>${escapeHtml(fmtDate(mail.receivedAt))}</span>
        </div>
        <div class="mail-detail-meta">
          <span class="mail-pill ${escapeHtml(mail.priority)}">${escapeHtml(priorityLabel(mail.priority))}</span>
          <span class="mail-pill ${escapeHtml(mail.category)}">${escapeHtml(categoryLabel(mail.category))}</span>
          <span class="mail-pill">${escapeHtml(mail.status === "handled" ? "Ferdig" : mail.status === "ignored" ? "Ignorert" : "Åpen")}</span>
        </div>
        ${customer}
      </div>
      <div class="mail-body">${escapeHtml(mail.plainText || mail.snippet || "Ingen lesbar tekst i meldingen.")}</div>
      ${attachments}
      ${reasons}
      <div class="mail-actions">
        ${mail.status !== "handled" ? '<button class="mail-action primary" type="button" data-mail-action="handled">Ferdig behandlet</button>' : ""}
        ${!mail.requiresAction ? '<button class="mail-action warn" type="button" data-mail-action="attention">Må følges opp</button>' : ""}
        ${mail.status !== "ignored" ? '<button class="mail-action danger" type="button" data-mail-action="ignored">Ikke relevant</button>' : ""}
        <a class="mail-action" href="${escapeHtml(mail.gmailUrl || "#")}" target="_blank" rel="noopener">Åpne i Gmail</a>
      </div>
    `;
  }

  async function loadSummary() {
    const data = await api("/summary");
    renderSummary(data);
    return data;
  }

  async function loadMessages({ preserveActive = true } = {}) {
    listNode.innerHTML = '<div class="mailbox-empty">Henter firmamail…</div>';
    const data = await api(`/messages?scope=${encodeURIComponent(scope)}&limit=80`);
    messages = data.messages || [];
    if (!preserveActive || (activeId && !messages.some((mail) => mail.id === activeId))) {
      if (!activeId || scope !== "all") activeId = messages[0]?.id || "";
    }
    renderList();
    if (activeId) await openMessage(activeId, { updateUrl: false });
    else renderDetail(null);
  }

  async function openMessage(id, { updateUrl = true } = {}) {
    if (!id) return;
    activeId = id;
    renderList();
    detailNode.innerHTML = '<div class="mailbox-empty">Henter e-post…</div>';
    try {
      const data = await api(`/messages/${encodeURIComponent(id)}`);
      renderDetail(data.message);
      const row = messages.find((mail) => mail.id === id);
      if (row && row.status === "new") row.status = "seen";
      renderList();
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set("open", id);
        history.replaceState({}, "", url);
      }
      await loadSummary();
      window.SorgulenAdminShell?.refreshBadges?.();
    } catch (error) {
      renderDetail(null);
      setStatus(error.message, "error");
    }
  }

  async function syncMailbox() {
    if (busy) return;
    busy = true;
    syncBtn.disabled = true;
    syncBtn.textContent = "Synkroniserer…";
    setStatus("Henter nye e-poster fra firmakontoen…");
    try {
      const result = await api("/sync", { method: "POST", body: "{}" });
      setStatus(result.imported ? `${result.imported} nye e-poster hentet inn.` : "Innboksen er oppdatert.", "success");
      await Promise.all([loadSummary(), loadMessages({ preserveActive: true })]);
      window.SorgulenAdminShell?.refreshBadges?.();
    } catch (error) {
      setStatus(error.message || "Synkronisering feilet", "error");
    } finally {
      busy = false;
      syncBtn.disabled = false;
      syncBtn.textContent = "Synkroniser nå";
    }
  }

  async function updateActive(action) {
    if (!activeId || busy) return;
    busy = true;
    try {
      let body;
      if (action === "handled") body = { status: "handled", requiresAction: false };
      else if (action === "ignored") body = { status: "ignored", requiresAction: false };
      else body = { status: "seen", requiresAction: true, priority: "high" };

      const data = await api(`/messages/${encodeURIComponent(activeId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setStatus(action === "handled" ? "Markert som ferdig behandlet." : action === "ignored" ? "Markert som ikke relevant." : "Markert som viktig.", "success");
      renderDetail(data.message);
      await Promise.all([loadSummary(), loadMessages({ preserveActive: false })]);
      window.SorgulenAdminShell?.refreshBadges?.();
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      busy = false;
    }
  }

  function setScope(next) {
    scope = next;
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.mailScope === scope));
    activeId = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    history.replaceState({}, "", url);
    loadMessages({ preserveActive: false }).catch((error) => setStatus(error.message, "error"));
  }

  listNode.addEventListener("click", (event) => {
    const row = event.target.closest("[data-mail-id]");
    if (row) openMessage(row.dataset.mailId);
  });
  detailNode.addEventListener("click", (event) => {
    const action = event.target.closest("[data-mail-action]")?.dataset.mailAction;
    if (action) updateActive(action);
  });
  tabs.forEach((tab) => tab.addEventListener("click", () => setScope(tab.dataset.mailScope)));
  jumps.forEach((node) => node.addEventListener("click", () => setScope(node.dataset.scopeJump)));
  syncBtn.addEventListener("click", syncMailbox);

  (async () => {
    try {
      const summary = await loadSummary();
      await loadMessages({ preserveActive: true });

      const last = summary.state?.lastSuccessAt ? new Date(summary.state.lastSuccessAt).getTime() : 0;
      if (summary.configured && (!last || Date.now() - last > 5 * 60 * 1000)) {
        syncMailbox();
      }
    } catch (error) {
      setStatus(error.message || "Kunne ikke hente firmainnboksen", "error");
      listNode.innerHTML = '<div class="mailbox-empty">Kunne ikke hente e-poster.</div>';
    }
  })();
})();
