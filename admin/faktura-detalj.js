(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const content = document.getElementById("fdContent");
  const statusMessage = document.getElementById("statusMessage");
  const logoutBtn = document.getElementById("logoutBtn");

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

  function getAdminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }
  function headers() {
    return { "Content-Type": "application/json", "x-admin-key": getAdminKey() };
  }
  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.style.display = "block";
    statusMessage.style.color = type === "error" ? "#ff8a8a" : "#8fe0a8";
    if (type !== "error") setTimeout(() => { statusMessage.style.display = "none"; }, 3500);
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const statusLabels = { draft: "Utkast", sent: "Sendt", paid: "Betalt", credited: "Kreditert" };
  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
  }

  function render(inv) {
    const num = inv.invoiceNumber
      ? (inv.isCreditNote ? `Kreditnota ${inv.invoiceNumber}` : `Faktura ${inv.invoiceNumber}`)
      : "Utkast (uten nummer)";

    const linesRows = (inv.lines || []).map((l) =>
      `<tr><td>${escapeHtml(l.item)}${l.description?`<br><small>${escapeHtml(l.description)}</small>`:""}</td><td>${l.quantity!=null&&l.unitPrice!=null?`${escapeHtml(l.quantity)} ${escapeHtml(l.unitLabel||"")} × ${escapeHtml(l.unitPrice)} kr`:""}</td><td class="amt">${escapeHtml(l.amount)} kr</td></tr>`
    ).join("");

    const ref = inv.sourceType === "workOrder"
      ? `Hentet fra oppdrag${inv.sourceRef ? ` #${escapeHtml(inv.sourceRef)}` : ""}`
      : inv.sourceRef
        ? `Hentet fra ${inv.sourceType === "booking" ? "bestilling" : "forespørsel"} #${escapeHtml(inv.sourceRef)}`
        : "Manuell faktura";

    // Knapper avhenger av status
    let actions = "";
    actions += `<button class="btn-preview" data-action="preview">📄 Forhåndsvis PDF</button>`;
    if (inv.status === "draft") {
      actions += `<a class="btn-edit" href="faktura-rediger.html?id=${encodeURIComponent(inv._id)}">✏️ Rediger</a>`;
      if (inv.customerEmail) {
        actions += `<button class="btn-send" data-action="send">📧 Kontroller og send</button>`;
      }
      actions += `<button class="btn-delete" data-action="delete">🗑 Slett utkast</button>`;
    } else if (inv.status === "sent") {
      actions += `<button class="btn-paid" data-action="paid">💰 Marker betalt</button>`;
      actions += `<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Lag kreditnota</button>`;
    } else if (inv.status === "paid") {
      actions += `<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Lag kreditnota</button>`;
    }

    content.innerHTML = `
      <div class="fd-card">
        <div class="fd-head">
          <div class="fd-num">${escapeHtml(num)}</div>
          <span class="fd-badge badge-${escapeHtml(inv.status)}">${escapeHtml(statusLabels[inv.status] || inv.status)}</span>
        </div>
        <div class="fd-info" style="color:#9aa6b8;">${escapeHtml(ref)}</div>

        <div class="fd-section">
          <div class="fd-label">Kunde</div>
          <div class="fd-value">
            ${escapeHtml(inv.customerName)}<br>
            ${inv.customerAddress ? escapeHtml(inv.customerAddress) + "<br>" : ""}
            ${inv.customerEmail ? escapeHtml(inv.customerEmail) + "<br>" : "<span style='color:#f0a85f;'>Ingen e-post</span><br>"}
            ${inv.customerPhone ? escapeHtml(inv.customerPhone) : ""}
          </div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Spesifikasjon</div>
          <table class="fd-lines"><tbody>${linesRows}</tbody></table>
          ${inv.vatRegisteredSnapshot ? `<div class="fd-total" style="font-size:14px;color:#aab3bf">Delsum: ${escapeHtml(inv.subtotal)} kr · MVA ${escapeHtml(inv.taxRate)} %: ${escapeHtml(inv.taxAmount)} kr</div>` : ""}
          <div class="fd-total">Total: ${escapeHtml(inv.amount)} kr</div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Datoer</div>
          <div class="fd-value">
            ${inv.issuedAt ? "Fakturadato: " + fmtDate(inv.issuedAt) + "<br>" : ""}
            ${inv.dueDate ? "Forfall: " + fmtDate(inv.dueDate) + "<br>" : ""}
            ${inv.sentAt ? "<span style='color:#8fe0a8;'>Sendt: " + fmtDate(inv.sentAt) + "</span><br>" : ""}
            ${inv.paidAt ? "<span style='color:#8fe0a8;'>Betalt: " + fmtDate(inv.paidAt) + "</span>" : ""}
            ${!inv.issuedAt && !inv.dueDate ? "<span style='color:#9aa6b8;'>Settes når fakturaen sendes</span>" : ""}
          </div>
        </div>

        <div class="fd-section fd-actions">${actions}</div>

        ${inv.status === "draft" && inv.customerEmail ? `<div class="fd-section" id="emailComposer"><div class="fd-label">E-post til ${escapeHtml(inv.customerEmail)}</div><button class="btn-edit" type="button" data-action="email-suggestion">Lag e-postforslag</button><label class="fd-label" for="emailSubject" style="display:block;margin-top:14px">Emne</label><textarea id="emailSubject" rows="2" style="width:100%">${escapeHtml(inv.emailDraft?.subject || "")}</textarea><label class="fd-label" for="emailBody" style="display:block;margin-top:10px">Melding</label><textarea id="emailBody" rows="9" style="width:100%">${escapeHtml(inv.emailDraft?.body || "")}</textarea><p class="fd-warn">Fakturaen sendes ikke før du trykker «Kontroller og send» og bekrefter.</p></div>` : ""}

        ${inv.status === "draft" && !inv.customerEmail ? `<p class="fd-warn">⚠ Mangler e-post – legg til via Rediger for å kunne sende automatisk.</p>` : ""}
        ${inv.status === "sent" ? `<p class="fd-info">🔒 Sendt faktura er låst. Feil? Lag en kreditnota (kommer).</p>` : ""}
      </div>`;

    // Knappe-handlinger
    content.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.getAttribute("data-action"), inv));
    });
  }

  async function handleAction(action, inv) {
    try {
      if (action === "preview") {
        setMessage("Lager forhåndsvisning…");
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/preview`, { headers: headers() });
        if (!res.ok) throw new Error("Kunne ikke lage forhåndsvisning");
        const url = URL.createObjectURL(await res.blob());
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else if (action === "email-suggestion") {
        setMessage("Lager e-postforslag…");
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/email-suggestion`, { method: "POST", headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke lage e-postforslag");
        document.getElementById("emailSubject").value = data.subject;
        document.getElementById("emailBody").value = data.body;
        setMessage(data.aiAvailable ? "AI-forslaget er klart. Kontroller og rediger før sending." : "Standard e-postutkast er klart. AI var ikke tilgjengelig.");
      } else if (action === "send") {
        const subject = document.getElementById("emailSubject")?.value.trim();
        const body = document.getElementById("emailBody")?.value.trim();
        if (!subject || !body) throw new Error("Lag eller skriv e-postemne og melding før sending.");
        if (!confirm("Sende fakturaen til kunden nå? Fakturaen får et fakturanummer og blir låst.")) return;
        setMessage("Sender faktura…");
        const operationId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/send`, { method: "POST", headers: headers(), body: JSON.stringify({ operationId, subject, body }) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Kunne ikke sende"); }
        setMessage("Faktura sendt! ✓", "success");
        load();
      } else if (action === "paid") {
        if (!confirm("Markere fakturaen som betalt?")) return;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/paid`, { method: "POST", headers: headers() });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Kunne ikke markere betalt"); }
        setMessage("Markert som betalt! 💰", "success");
        load();
      } else if (action === "delete") {
        if (!confirm("Slette dette fakturautkastet permanent?")) return;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}`, { method: "DELETE", headers: headers() });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Kunne ikke slette"); }
        setMessage("Utkast slettet.", "success");
        setTimeout(() => { window.location.href = "fakturaer.html"; }, 800);
      } else if (action === "credit") {
        if (!confirm("Opprette et redigerbart kreditnotautkast? Originalen merkes først kreditert når kreditnotaen faktisk er sendt.")) return;
        setMessage("Lager kreditnota…");
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/credit`, { method: "POST", headers: headers() });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Kunne ikke lage kreditnota"); }
        const data = await res.json();
        setMessage("Kreditnota opprettet som utkast. Kontroller før sending.", "success");
        setTimeout(() => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(data.creditNote._id)}`; }, 500);
      }
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
    }
  }

  async function load() {
    if (statusMessage) statusMessage.style.display = "none"; // nullstill gamle meldinger
    if (!invoiceId) { content.innerHTML = `<div class="fd-loading">Mangler faktura-ID.</div>`; return; }
    content.innerHTML = `<div class="fd-loading">Laster faktura…</div>`;
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, { headers: headers() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Feil admin-nøkkel. Last siden på nytt.");
      }
      if (!res.ok) throw new Error("Kunne ikke hente faktura");
      const data = await res.json();
      render(data.invoice);
    } catch (err) {
      content.innerHTML = `<div class="fd-loading">${escapeHtml(err.message || "Noe gikk galt")}</div>`;
    }
  }

  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(KEY_STORAGE);
    window.location.href = "login.html";
  });

  load();
})();
