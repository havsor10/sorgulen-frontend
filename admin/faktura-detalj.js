(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const content = document.getElementById("fdContent");
  const statusMessage = document.getElementById("statusMessage");
  const invoiceId = new URLSearchParams(window.location.search).get("id");

  const statusLabels = {
    draft: "Utkast",
    issued: "Utstedt",
    sent: "Sendt",
    paid: "Betalt",
    credited: "Kreditert",
  };

  function getAdminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }
  function headers() { return { "Content-Type": "application/json", "x-admin-key": getAdminKey() }; }
  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = type === "error" ? "#ff8a8a" : "#8fe0a8";
    if (message && type !== "error") setTimeout(() => { statusMessage.style.display = "none"; }, 4500);
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtDate(value) {
    if (!value) return "–";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [y, m, d] = text.split("-");
      return `${d}.${m}.${y}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function money(value) {
    const n = Number(value);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)} kr`;
  }
  function quantity(value) {
    const n = Number(value);
    return new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
  }
  function documentName(inv) {
    if (!inv.invoiceNumber) return inv.isCreditNote ? "Kreditnotautkast" : "Fakturautkast";
    return inv.isCreditNote ? `Kreditnota ${inv.invoiceNumber}` : `Faktura ${inv.invoiceNumber}`;
  }
  function sourceLabel(inv) {
    if (inv.sourceType === "workOrder") return `Hentet fra oppdrag${inv.sourceRef ? ` #${inv.sourceRef}` : ""}`;
    if (inv.sourceType === "customer") return "Samlefaktura fra kundens registreringer";
    if (inv.sourceRef) return `Hentet fra ${inv.sourceType === "booking" ? "bestilling" : "forespørsel"} #${inv.sourceRef}`;
    return "Manuell faktura";
  }
  function customerAddress(inv) {
    const rows = [inv.customerAddress, [inv.customerPostalCode, inv.customerCity].filter(Boolean).join(" ")].filter(Boolean);
    return rows.map((row) => escapeHtml(row)).join("<br>");
  }
  function latestFailedEmail(inv) {
    return [...(inv.emailLog || [])].reverse().find((entry) => entry.status === "failed") || null;
  }

  function actionButtons(inv) {
    const buttons = [`<button class="btn-preview" data-action="preview">📄 Forhåndsvis PDF</button>`];
    if (inv.status === "draft") {
      if (!inv.invoiceNumber) buttons.push(`<a class="btn-edit" href="faktura-rediger.html?id=${encodeURIComponent(inv._id)}">✏️ Rediger utkast</a>`);
      buttons.push(`<button class="btn-send" data-action="issue">${inv.isCreditNote ? "Utsted kreditnota" : "Utsted faktura"}</button>`);
      if (!inv.invoiceNumber) buttons.push(`<button class="btn-delete" data-action="delete">🗑 Slett utkast</button>`);
    }
    if (inv.status === "issued") {
      if (inv.customerEmail) buttons.push(`<button class="btn-send" data-action="send">📧 Send til kunde</button>`);
      if (!inv.isCreditNote) buttons.push(`<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>`);
    }
    if (inv.status === "sent") {
      if (!inv.isCreditNote) buttons.push(`<button class="btn-paid" data-action="paid">💰 Marker betalt</button>`);
      if (!inv.isCreditNote) buttons.push(`<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>`);
    }
    if (inv.status === "paid" && !inv.isCreditNote) {
      buttons.push(`<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>`);
    }
    return buttons.join("");
  }

  function emailComposer(inv) {
    if (inv.status !== "issued") return "";
    const failed = latestFailedEmail(inv);
    if (!inv.customerEmail) {
      return `<div class="fd-section"><p class="fd-warn">Fakturaen er utstedt, men kunden mangler e-post. PDF-en kan fortsatt åpnes og leveres på annen måte.</p></div>`;
    }
    return `
      <div class="fd-section" id="emailComposer">
        <div class="fd-label">E-post til ${escapeHtml(inv.customerEmail)}</div>
        ${failed ? `<p class="fd-warn">Siste sending feilet: ${escapeHtml(failed.error || "ukjent feil")}. Fakturaen er fortsatt utstedt og kan sendes på nytt.</p>` : ""}
        <button class="btn-edit" type="button" data-action="email-suggestion">Lag e-postforslag</button>
        <label class="fd-label" for="emailSubject" style="display:block;margin-top:14px">Emne</label>
        <textarea id="emailSubject" rows="2" style="width:100%">${escapeHtml(inv.emailDraft?.subject || "")}</textarea>
        <label class="fd-label" for="emailBody" style="display:block;margin-top:10px">Melding</label>
        <textarea id="emailBody" rows="9" style="width:100%">${escapeHtml(inv.emailDraft?.body || "")}</textarea>
        <p class="fd-info">PDF og økonomiske data er allerede låst. E-postteksten kan redigeres uten å endre fakturaen.</p>
      </div>`;
  }

  function lifecycle(inv) {
    if (!Array.isArray(inv.lifecycleLog) || !inv.lifecycleLog.length) return "";
    const rows = inv.lifecycleLog.slice().reverse().slice(0, 12).map((event) =>
      `<div style="padding:7px 0;border-bottom:1px solid #26303b"><strong>${escapeHtml(event.description || event.type)}</strong><br><small>${fmtDate(event.at)}</small></div>`
    ).join("");
    return `<div class="fd-section"><div class="fd-label">Historikk</div><div class="fd-value">${rows}</div></div>`;
  }

  function render(inv) {
    const linesRows = (inv.lines || []).map((line) => `
      <tr>
        <td>${escapeHtml(line.item || "")}${line.description ? `<br><small>${escapeHtml(line.description)}</small>` : ""}</td>
        <td>${line.quantity != null && line.unitPrice != null ? `${quantity(line.quantity)} ${escapeHtml(line.unitLabel || "")} × ${money(line.unitPrice)}` : ""}</td>
        <td class="amt">${money(line.amount)}</td>
      </tr>`).join("");
    const serviceDate = inv.serviceDateFrom
      ? (inv.serviceDateTo && inv.serviceDateTo !== inv.serviceDateFrom ? `${fmtDate(inv.serviceDateFrom)}–${fmtDate(inv.serviceDateTo)}` : fmtDate(inv.serviceDateFrom))
      : "–";

    content.innerHTML = `
      <div class="fd-card">
        <div class="fd-head">
          <div class="fd-num">${escapeHtml(documentName(inv))}</div>
          <span class="fd-badge badge-${escapeHtml(inv.status)}">${escapeHtml(statusLabels[inv.status] || inv.status)}</span>
        </div>
        <div class="fd-info" style="color:#9aa6b8;">${escapeHtml(sourceLabel(inv))}</div>

        ${inv.status === "draft" ? `<div class="fd-section" id="issueValidation"><div class="fd-label">Kontroll før utstedelse</div><div class="fd-value">Kontrollerer fakturaen…</div></div>` : ""}
        ${inv.status !== "draft" ? `<p class="fd-info">🔒 Utstedt dokument. Kunde, datoer, linjer, priser, MVA og betalingsinformasjon er låst i et historisk snapshot.</p>` : ""}

        <div class="fd-section">
          <div class="fd-label">Faktura til</div>
          <div class="fd-value">
            <strong>${escapeHtml(inv.customerName || "–")}</strong><br>
            ${customerAddress(inv) || "<span style='color:#f0a85f;'>Adresse mangler</span>"}<br>
            ${inv.customerOrganizationNumber ? `Org.nr. ${escapeHtml(inv.customerOrganizationNumber)}<br>` : ""}
            ${inv.customerEmail ? `${escapeHtml(inv.customerEmail)}<br>` : ""}
            ${inv.customerPhone ? escapeHtml(inv.customerPhone) : ""}
          </div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Gjelder</div>
          <div class="fd-value">
            <strong>${escapeHtml(inv.description || "–")}</strong><br>
            Utført: ${escapeHtml(serviceDate)}<br>
            Arbeidssted: ${escapeHtml(inv.serviceLocation || "–")}
          </div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Fakturalinjer</div>
          <table class="fd-lines"><tbody>${linesRows}</tbody></table>
          ${inv.vatRegisteredSnapshot ? `<div class="fd-total" style="font-size:14px;color:#aab3bf">Delsum: ${money(inv.subtotal)} · MVA ${escapeHtml(inv.taxRate)} %: ${money(inv.taxAmount)}</div>` : `<p class="fd-info">Merverdiavgift er ikke beregnet.</p>`}
          <div class="fd-total">${inv.isCreditNote ? "Kreditert" : "Total"}: ${money(inv.amount)}</div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Dokumentdatoer</div>
          <div class="fd-value">
            Fakturanr.: ${inv.invoiceNumber || "–"}<br>
            Fakturadato: ${fmtDate(inv.issuedAt)}<br>
            Forfall: ${fmtDate(inv.dueDate)}
            ${inv.sentAt ? `<br><span style="color:#8fe0a8;">Sendt: ${fmtDate(inv.sentAt)}</span>` : ""}
            ${inv.paidAt ? `<br><span style="color:#8fe0a8;">Betalt: ${fmtDate(inv.paidAt)}</span>` : ""}
            ${inv.creditedAt ? `<br><span style="color:#e0b66c;">Kreditert: ${fmtDate(inv.creditedAt)}</span>` : ""}
          </div>
        </div>

        <div class="fd-section fd-actions">${actionButtons(inv)}</div>
        ${emailComposer(inv)}
        ${inv.creditNoteId ? `<div class="fd-section"><a class="btn-edit" href="faktura-detalj.html?id=${encodeURIComponent(inv.creditNoteId)}">Åpne tilhørende kreditnota</a></div>` : ""}
        ${lifecycle(inv)}
      </div>`;

    content.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", () => handleAction(element.getAttribute("data-action"), inv, element));
    });
    if (inv.status === "draft") loadIssueValidation(inv);
  }

  async function loadIssueValidation(inv) {
    const box = document.getElementById("issueValidation");
    if (!box) return;
    try {
      const res = await fetch(`${API_BASE}/invoices/${inv._id}/issue-validation`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke kontrollere fakturaen");
      if (data.canIssue) {
        box.innerHTML = `<div class="fd-label">Kontroll før utstedelse</div><div class="fd-value" style="color:#8fe0a8;">✓ Klar til utstedelse. Fakturanummer tildeles først når du trykker «${inv.isCreditNote ? "Utsted kreditnota" : "Utsted faktura"}».</div>`;
      } else {
        box.innerHTML = `<div class="fd-label">Kan ikke utstede ennå</div><ul class="fd-validation-list">${(data.problems || []).map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`;
      }
      const issueBtn = content.querySelector('[data-action="issue"]');
      if (issueBtn) issueBtn.disabled = !data.canIssue;
    } catch (err) {
      box.innerHTML = `<div class="fd-label">Kontroll før utstedelse</div><div class="fd-warn">${escapeHtml(err.message || "Kontroll feilet")}</div>`;
    }
  }

  async function preview(inv) {
    setMessage("Lager PDF…");
    const res = await fetch(`${API_BASE}/invoices/${inv._id}/preview`, { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Kunne ikke lage PDF");
    }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMessage("");
  }

  async function handleAction(action, inv, element) {
    try {
      if (action === "preview") return await preview(inv);

      if (action === "issue") {
        const validationRes = await fetch(`${API_BASE}/invoices/${inv._id}/issue-validation`, { headers: headers() });
        const validation = await validationRes.json().catch(() => ({}));
        if (!validationRes.ok) throw new Error(validation.error || "Kunne ikke kontrollere fakturaen");
        if (!validation.canIssue) throw new Error(`Kan ikke utstede: ${(validation.problems || []).join(" ")}`);
        const label = inv.isCreditNote ? "kreditnotaen" : "fakturaen";
        if (!confirm(`Du er i ferd med å utstede ${label}. Fakturanummer vil bli tildelt og dokumentets økonomiske opplysninger låses.\n\nFortsette?`)) return;
        if (element) element.disabled = true;
        setMessage(`Utsteder ${label}…`);
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/issue`, { method: "POST", headers: headers(), body: JSON.stringify({ operationId }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke utstede");
        setMessage(`${inv.isCreditNote ? "Kreditnota" : "Faktura"} ${data.invoice.invoiceNumber} er utstedt og låst. ✓`, "success");
        return load();
      }

      if (action === "email-suggestion") {
        if (element) element.disabled = true;
        setMessage("Lager e-postforslag…");
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/email-suggestion`, { method: "POST", headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke lage e-postforslag");
        const subject = document.getElementById("emailSubject");
        const body = document.getElementById("emailBody");
        if (subject) subject.value = data.subject || "";
        if (body) body.value = data.body || "";
        setMessage(data.aiAvailable ? "AI-forslaget er klart. Kontroller teksten før sending." : "Standard e-postutkast er klart.", "success");
        if (element) element.disabled = false;
        return;
      }

      if (action === "send") {
        const subject = document.getElementById("emailSubject")?.value.trim() || "";
        const body = document.getElementById("emailBody")?.value.trim() || "";
        if (!subject || !body) throw new Error("Lag eller skriv e-postemne og melding før sending.");
        if (!confirm(`Send ${inv.isCreditNote ? "kreditnota" : "faktura"} ${inv.invoiceNumber} til ${inv.customerEmail}?`)) return;
        if (element) element.disabled = true;
        setMessage("Sender e-post…");
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/send`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ operationId, subject, body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "E-postsending feilet. Fakturaen er fortsatt utstedt og kan prøves sendt igjen.");
        setMessage("Dokumentet er sendt. ✓", "success");
        return load();
      }

      if (action === "paid") {
        if (!confirm(`Markere faktura ${inv.invoiceNumber} som betalt?`)) return;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/paid`, { method: "POST", headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke markere betalt");
        setMessage("Faktura markert som betalt. ✓", "success");
        return load();
      }

      if (action === "delete") {
        if (!confirm("Slette dette unummererte fakturautkastet permanent?")) return;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}`, { method: "DELETE", headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke slette utkastet");
        setMessage("Utkast slettet.", "success");
        return setTimeout(() => { window.location.href = "fakturaer.html"; }, 400);
      }

      if (action === "credit") {
        if (!confirm(`Opprette et kreditnotautkast som reverserer faktura ${inv.invoiceNumber}? Originalfakturaen beholdes i historikken.`)) return;
        setMessage("Oppretter kreditnotautkast…");
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/credit`, { method: "POST", headers: headers() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.creditNoteId) return window.location.href = `faktura-detalj.html?id=${encodeURIComponent(data.creditNoteId)}`;
          throw new Error(data.error || "Kunne ikke opprette kreditnota");
        }
        setMessage("Kreditnotautkast opprettet. Kontroller og utsted det.", "success");
        return setTimeout(() => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(data.creditNote._id)}`; }, 350);
      }
    } catch (err) {
      if (element) element.disabled = false;
      setMessage(err.message || "Noe gikk galt", "error");
    }
  }

  async function load() {
    if (!invoiceId) {
      content.innerHTML = `<div class="fd-loading">Mangler faktura-ID.</div>`;
      return;
    }
    content.innerHTML = `<div class="fd-loading">Laster faktura…</div>`;
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, { headers: headers() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Admin-tilgangen må fornyes. Last siden på nytt.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente faktura");
      render(data.invoice);
    } catch (err) {
      content.innerHTML = `<div class="fd-loading">${escapeHtml(err.message || "Noe gikk galt")}</div>`;
    }
  }

  load();
})();
