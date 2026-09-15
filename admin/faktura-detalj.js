(() => {
  "use strict";

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

  function headers(json = true) {
    const result = { "x-admin-key": getAdminKey() };
    if (json) result["Content-Type"] = "application/json";
    return result;
  }

  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = type === "error" ? "#ff8a8a" : "#8fe0a8";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(value) {
    if (!value) return "–";
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-");
      return `${day}.${month}.${year}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function money(value) {
    const amount = Number(value);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)} kr`;
  }

  function quantity(value) {
    const amount = Number(value);
    return new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  }

  function documentName(invoice) {
    if (!invoice.invoiceNumber) return invoice.isCreditNote ? "Kreditnotautkast" : "Fakturautkast";
    return invoice.isCreditNote ? `Kreditnota ${invoice.invoiceNumber}` : `Faktura ${invoice.invoiceNumber}`;
  }

  function sourceLabel(invoice) {
    if (invoice.sourceType === "workOrder") return "Hentet fra kundeoppdrag";
    if (invoice.sourceType === "customer") return "Samlefaktura fra kunde";
    if (invoice.sourceRef) return `Hentet fra ${invoice.sourceType === "booking" ? "bestilling" : "forespørsel"} #${invoice.sourceRef}`;
    return "Manuell faktura";
  }

  function customerAddress(invoice) {
    const rows = [
      invoice.customerAddress,
      [invoice.customerPostalCode, invoice.customerCity].filter(Boolean).join(" "),
    ].filter(Boolean);
    return rows.map((row) => escapeHtml(row)).join("<br>");
  }

  function validationParts(validation) {
    const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
    const blockers = Array.isArray(validation?.blockers)
      ? validation.blockers
      : (validation?.canOverride ? [] : (validation?.problems || []));
    return { blockers, warnings };
  }

  function latestFailedEmail(invoice) {
    return [...(invoice.emailLog || [])].reverse().find((entry) => entry.status === "failed") || null;
  }

  function finalDocumentPanel(invoice) {
    if (invoice.status === "draft") return "";
    const delivered = ["sent", "paid"].includes(invoice.status);
    return `
      <section class="fd-section invoice-final-panel">
        <div class="fd-label">Ferdig faktura</div>
        <div class="invoice-final-number">${escapeHtml(invoice.isCreditNote ? `Kreditnota ${invoice.invoiceNumber}` : `Faktura ${invoice.invoiceNumber}`)}</div>
        <p class="fd-info">Fakturanummer, fakturadato og forfall er satt automatisk. PDF-en under er dokumentet du kan vise eller sende til kunden.</p>
        <div class="invoice-final-actions">
          <button class="btn-preview" type="button" data-action="preview">📄 Åpne ferdig faktura (PDF)</button>
          <button class="btn-send" type="button" data-action="share">📱 Del / send på melding</button>
          <button class="btn-edit" type="button" data-action="show">👁 Vis til kunden</button>
        </div>
        ${delivered ? `<p class="fd-info" style="color:#8fe0a8;">✓ Fakturaen er registrert som levert.</p>` : ""}
      </section>`;
  }

  function draftActions(invoice) {
    if (invoice.status !== "draft") return "";
    return `
      <button class="btn-preview" data-action="preview">📄 Forhåndsvis utkast</button>
      ${!invoice.invoiceNumber ? `<a class="btn-edit" href="faktura-rediger.html?id=${encodeURIComponent(invoice._id)}">✏️ Rediger utkast</a>` : ""}
      <button class="btn-send" data-action="issue">${invoice.isCreditNote ? "Utsted kreditnota" : "Utsted faktura"}</button>
      ${!invoice.invoiceNumber ? `<button class="btn-delete" data-action="delete">🗑 Slett utkast</button>` : ""}
    `;
  }

  function issuedActions(invoice) {
    const buttons = [];
    if (invoice.status === "issued" && invoice.customerEmail) {
      buttons.push(`<button class="btn-send" data-action="send">📧 Send på e-post</button>`);
    }
    if (invoice.status === "issued") {
      buttons.push(`<button class="invoice-delivery-confirm" data-action="mark-message">✓ Marker levert på melding</button>`);
    }
    if (invoice.status === "sent" && !invoice.isCreditNote) {
      buttons.push(`<button class="btn-paid" data-action="paid">💰 Marker betalt</button>`);
    }
    if (["issued", "sent", "paid"].includes(invoice.status) && !invoice.isCreditNote) {
      buttons.push(`<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>`);
    }
    return buttons.join("");
  }

  function emailComposer(invoice) {
    if (invoice.status !== "issued") return "";
    const failed = latestFailedEmail(invoice);
    if (!invoice.customerEmail) {
      return `<div class="fd-section"><p class="fd-warn">Kunden har ingen e-post. Bruk «Del / send på melding» eller «Vis til kunden» over.</p></div>`;
    }
    return `
      <div class="fd-section" id="emailComposer">
        <div class="fd-label">E-post til ${escapeHtml(invoice.customerEmail)}</div>
        ${failed ? `<p class="fd-warn">Siste sending feilet: ${escapeHtml(failed.error || "ukjent feil")}.</p>` : ""}
        <button class="btn-edit" type="button" data-action="email-suggestion">Lag e-postforslag</button>
        <label class="fd-label" for="emailSubject" style="display:block;margin-top:14px">Emne</label>
        <textarea id="emailSubject" rows="2" style="width:100%">${escapeHtml(invoice.emailDraft?.subject || "")}</textarea>
        <label class="fd-label" for="emailBody" style="display:block;margin-top:10px">Melding</label>
        <textarea id="emailBody" rows="9" style="width:100%">${escapeHtml(invoice.emailDraft?.body || "")}</textarea>
      </div>`;
  }

  function lifecycle(invoice) {
    if (!Array.isArray(invoice.lifecycleLog) || !invoice.lifecycleLog.length) return "";
    const rows = invoice.lifecycleLog.slice().reverse().slice(0, 12).map((event) => `
      <div style="padding:7px 0;border-bottom:1px solid #26303b">
        <strong>${escapeHtml(event.description || event.type)}</strong><br>
        <small>${fmtDate(event.at)}</small>
      </div>`).join("");
    return `<div class="fd-section"><div class="fd-label">Historikk</div><div class="fd-value">${rows}</div></div>`;
  }

  function render(invoice) {
    const lineRows = (invoice.lines || []).map((line) => `
      <tr>
        <td>${escapeHtml(line.item || "")}${line.description ? `<br><small>${escapeHtml(line.description)}</small>` : ""}</td>
        <td>${line.quantity != null && line.unitPrice != null ? `${quantity(line.quantity)} ${escapeHtml(line.unitLabel || "")} × ${money(line.unitPrice)}` : ""}</td>
        <td class="amt">${money(line.amount)}</td>
      </tr>`).join("");

    const serviceDate = invoice.serviceDateFrom
      ? (invoice.serviceDateTo && invoice.serviceDateTo !== invoice.serviceDateFrom
        ? `${fmtDate(invoice.serviceDateFrom)}–${fmtDate(invoice.serviceDateTo)}`
        : fmtDate(invoice.serviceDateFrom))
      : "–";

    const draftDateText = `<span style="color:#9aa6b8;">Settes automatisk ved utstedelse</span>`;

    content.innerHTML = `
      <div class="fd-card">
        <div class="fd-head">
          <div class="fd-num">${escapeHtml(documentName(invoice))}</div>
          <span class="fd-badge badge-${escapeHtml(invoice.status)}">${escapeHtml(statusLabels[invoice.status] || invoice.status)}</span>
        </div>
        <div class="fd-info" style="color:#9aa6b8;">${escapeHtml(sourceLabel(invoice))}</div>

        ${invoice.status === "draft" ? `
          <div class="fd-section invoice-auto-doc-info">
            <div class="fd-label">Dette fylles automatisk</div>
            <div class="fd-value">Fakturanummer · fakturadato · forfallsdato</div>
            <p class="fd-info">Du skal ikkje skrive dette inn selv. Verdiene blir opprettet når du trykker «Utsted faktura».</p>
          </div>
          <div class="fd-section" id="issueValidation">
            <div class="fd-label">Kontroll før utstedelse</div>
            <div class="fd-value">Kontrollerer fakturaen…</div>
          </div>` : finalDocumentPanel(invoice)}

        <div class="fd-section">
          <div class="fd-label">Faktura til</div>
          <div class="fd-value">
            <strong>${escapeHtml(invoice.customerName || "–")}</strong><br>
            ${customerAddress(invoice) || "<span style='color:#f0a85f;'>Adresse mangler</span>"}<br>
            ${invoice.customerOrganizationNumber ? `Org.nr. ${escapeHtml(invoice.customerOrganizationNumber)}<br>` : ""}
            ${invoice.customerEmail ? `${escapeHtml(invoice.customerEmail)}<br>` : ""}
            ${invoice.customerPhone ? escapeHtml(invoice.customerPhone) : ""}
          </div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Gjelder</div>
          <div class="fd-value">
            <strong>${escapeHtml(invoice.description || "–")}</strong><br>
            Utført: ${escapeHtml(serviceDate)}<br>
            Arbeidssted: ${escapeHtml(invoice.serviceLocation || "–")}
          </div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Fakturalinjer</div>
          <table class="fd-lines"><tbody>${lineRows}</tbody></table>
          ${invoice.vatRegisteredSnapshot
            ? `<div class="fd-total" style="font-size:14px;color:#aab3bf">Delsum: ${money(invoice.subtotal)} · MVA ${escapeHtml(invoice.taxRate)} %: ${money(invoice.taxAmount)}</div>`
            : `<p class="fd-info">Merverdiavgift er ikke beregnet.</p>`}
          <div class="fd-total">${invoice.isCreditNote ? "Kreditert" : "Total"}: ${money(invoice.amount)}</div>
        </div>

        <div class="fd-section">
          <div class="fd-label">Dokumentdatoer</div>
          <div class="fd-value">
            Fakturanr.: ${invoice.status === "draft" ? draftDateText : escapeHtml(invoice.invoiceNumber || "–")}<br>
            Fakturadato: ${invoice.status === "draft" ? draftDateText : fmtDate(invoice.issuedAt)}<br>
            Forfall: ${invoice.status === "draft" ? draftDateText : fmtDate(invoice.dueDate)}
            ${invoice.sentAt ? `<br><span style="color:#8fe0a8;">Levert: ${fmtDate(invoice.sentAt)}</span>` : ""}
            ${invoice.paidAt ? `<br><span style="color:#8fe0a8;">Betalt: ${fmtDate(invoice.paidAt)}</span>` : ""}
          </div>
        </div>

        <div class="fd-section fd-actions">${invoice.status === "draft" ? draftActions(invoice) : issuedActions(invoice)}</div>
        ${emailComposer(invoice)}
        ${invoice.creditNoteId ? `<div class="fd-section"><a class="btn-edit" href="faktura-detalj.html?id=${encodeURIComponent(invoice.creditNoteId)}">Åpne tilhørende kreditnota</a></div>` : ""}
        ${lifecycle(invoice)}
      </div>`;

    content.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", () => handleAction(element.dataset.action, invoice, element));
    });

    if (invoice.status === "draft") loadIssueValidation(invoice);
  }

  async function loadIssueValidation(invoice) {
    const box = document.getElementById("issueValidation");
    if (!box) return;
    try {
      const response = await fetch(`${API_BASE}/invoices/${invoice._id}/issue-validation`, { cache: "no-store", headers: headers(false) });
      const validation = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(validation.error || "Kunne ikke kontrollere fakturaen");

      const { blockers, warnings } = validationParts(validation);
      const issueBtn = content.querySelector('[data-action="issue"]');
      const normalLabel = invoice.isCreditNote ? "Utsted kreditnota" : "Utsted faktura";

      if (blockers.length) {
        box.innerHTML = `<div class="fd-label">Må rettes før utstedelse</div><ul class="fd-validation-list">${blockers.map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`;
        if (issueBtn) {
          issueBtn.disabled = true;
          issueBtn.textContent = normalLabel;
        }
        return;
      }

      if (warnings.length) {
        box.innerHTML = `
          <div class="fd-label">Valgfri informasjon mangler</div>
          <p class="fd-info">Dette stopper ikkje fakturaen. Du kan redigere utkastet eller utstede den som den er.</p>
          <ul class="fd-validation-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`;
        if (issueBtn) {
          issueBtn.disabled = false;
          issueBtn.textContent = invoice.isCreditNote ? "Utsted kreditnota likevel" : "Utsted faktura likevel";
        }
        return;
      }

      box.innerHTML = `<div class="fd-label">Klar til utstedelse</div><div class="fd-value" style="color:#8fe0a8;">✓ Fakturanummer, fakturadato og forfall blir satt automatisk.</div>`;
      if (issueBtn) {
        issueBtn.disabled = false;
        issueBtn.textContent = normalLabel;
      }
    } catch (error) {
      box.innerHTML = `<div class="fd-label">Kontroll før utstedelse</div><div class="fd-warn">${escapeHtml(error.message || "Kontroll feilet")}</div>`;
    }
  }

  async function getPdf(invoice) {
    const response = await fetch(`${API_BASE}/invoices/${invoice._id}/preview`, { cache: "no-store", headers: headers(false) });
    if (!response.ok) throw new Error("Kunne ikke lage PDF");
    return response.blob();
  }

  async function preview(invoice) {
    setMessage(invoice.status === "draft" ? "Lager forhåndsvisning…" : "Åpner ferdig faktura…");
    const blob = await getPdf(invoice);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    setMessage("");
  }

  async function markDelivered(invoice, method) {
    if (invoice.status !== "issued") return;
    const response = await fetch(`${API_BASE}/invoices/${invoice._id}/delivery`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ method }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kunne ikke registrere leveringen");
    setMessage("Fakturaen er registrert som levert. ✓", "success");
    await load();
  }

  async function shareInvoice(invoice, button) {
    if (button) button.disabled = true;
    try {
      setMessage("Lager ferdig PDF for deling…");
      const blob = await getPdf(invoice);
      const filename = `${invoice.isCreditNote ? "kreditnota" : "faktura"}-${invoice.invoiceNumber || "utkast"}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const text = invoice.invoiceNumber
        ? `Hei! Her er faktura ${invoice.invoiceNumber} fra Sørgulen Industriservice. Beløp ${money(invoice.amount)}${invoice.dueDate ? `, forfall ${fmtDate(invoice.dueDate)}` : ""}.`
        : "Her er fakturautkast fra Sørgulen Industriservice.";
      const shareData = { title: invoice.invoiceNumber ? `Faktura ${invoice.invoiceNumber}` : "Fakturautkast", text, files: [file] };

      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData))) {
        try {
          await navigator.share(shareData);
        } catch (error) {
          if (error?.name === "AbortError") {
            setMessage("");
            return;
          }
          throw error;
        }
        setMessage("");
        if (invoice.status === "issued" && confirm("Ble fakturaen sendt/levert til kunden?")) {
          await markDelivered(invoice, "message");
        }
        return;
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      setMessage("PDF-en er åpnet. Del den fra telefonen.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function showInvoice(invoice, button) {
    if (button) button.disabled = true;
    try {
      await preview(invoice);
      if (invoice.status === "issued" && confirm("Har kunden fått se eller fått overlevert fakturaen?")) {
        await markDelivered(invoice, "shown");
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function handleAction(action, invoice, element) {
    try {
      if (action === "preview") return await preview(invoice);
      if (action === "share") return await shareInvoice(invoice, element);
      if (action === "show") return await showInvoice(invoice, element);
      if (action === "mark-message") {
        if (!confirm("Er fakturaen faktisk sendt/levert til kunden på melding?")) return;
        return await markDelivered(invoice, "message");
      }

      if (action === "issue") {
        const validationResponse = await fetch(`${API_BASE}/invoices/${invoice._id}/issue-validation`, { cache: "no-store", headers: headers(false) });
        const validation = await validationResponse.json().catch(() => ({}));
        if (!validationResponse.ok) throw new Error(validation.error || "Kunne ikke kontrollere fakturaen");
        const { blockers, warnings } = validationParts(validation);
        if (blockers.length) throw new Error(`Kan ikke utstede: ${blockers.join(" ")}`);

        const label = invoice.isCreditNote ? "kreditnotaen" : "fakturaen";
        const confirmation = warnings.length
          ? `Følgende valgfrie opplysninger mangler:\n\n• ${warnings.join("\n• ")}\n\nFakturanummer, fakturadato og forfall blir satt automatisk. Dette er valgfritt. Vil du utstede ${label} likevel?`
          : `Utstede ${label} nå?\n\nFakturanummer, fakturadato og forfall blir satt automatisk. De økonomiske opplysningene låses.`;
        if (!confirm(confirmation)) return;

        if (element) element.disabled = true;
        setMessage(`Utsteder ${label}…`);
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}/issue`, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ operationId, allowWarnings: warnings.length > 0 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunne ikke utstede fakturaen");
        sessionStorage.setItem(`invoice-issued-${invoice._id}`, "1");
        await load();
        return;
      }

      if (action === "email-suggestion") {
        if (element) element.disabled = true;
        setMessage("Lager e-postforslag…");
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}/email-suggestion`, { method: "POST", headers: headers(true) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunne ikke lage e-postforslag");
        const subject = document.getElementById("emailSubject");
        const body = document.getElementById("emailBody");
        if (subject) subject.value = data.subject || "";
        if (body) body.value = data.body || "";
        setMessage("E-postutkast er klart. Kontroller teksten før sending.", "success");
        if (element) element.disabled = false;
        return;
      }

      if (action === "send") {
        const subject = document.getElementById("emailSubject")?.value.trim() || "";
        const body = document.getElementById("emailBody")?.value.trim() || "";
        if (!subject || !body) throw new Error("Lag eller skriv e-postemne og melding før sending.");
        if (!confirm(`Send faktura ${invoice.invoiceNumber} til ${invoice.customerEmail}?`)) return;
        if (element) element.disabled = true;
        setMessage("Sender e-post…");
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}/send`, {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify({ operationId, subject, body }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "E-postsending feilet");
        setMessage("Fakturaen er sendt. ✓", "success");
        return await load();
      }

      if (action === "paid") {
        if (!confirm(`Markere faktura ${invoice.invoiceNumber} som betalt?`)) return;
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}/paid`, { method: "POST", headers: headers(true) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunne ikke markere betalt");
        setMessage("Faktura markert som betalt. ✓", "success");
        return await load();
      }

      if (action === "delete") {
        if (!confirm("Slette dette unummererte fakturautkastet permanent?")) return;
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}`, { method: "DELETE", headers: headers(false) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Kunne ikke slette utkastet");
        location.href = "fakturaer.html";
        return;
      }

      if (action === "credit") {
        if (!confirm(`Opprette kreditnotautkast som reverserer faktura ${invoice.invoiceNumber}?`)) return;
        setMessage("Oppretter kreditnotautkast…");
        const response = await fetch(`${API_BASE}/invoices/${invoice._id}/credit`, { method: "POST", headers: headers(true) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data.creditNoteId) {
            location.href = `faktura-detalj.html?id=${encodeURIComponent(data.creditNoteId)}`;
            return;
          }
          throw new Error(data.error || "Kunne ikke opprette kreditnota");
        }
        location.href = `faktura-detalj.html?id=${encodeURIComponent(data.creditNote._id)}`;
      }
    } catch (error) {
      if (element) element.disabled = false;
      setMessage(error.message || "Noe gikk galt", "error");
    }
  }

  async function load() {
    if (!invoiceId) {
      content.innerHTML = `<div class="fd-loading">Mangler faktura-ID.</div>`;
      return;
    }

    content.innerHTML = `<div class="fd-loading">Laster faktura…</div>`;
    try {
      const response = await fetch(`${API_BASE}/invoices/${invoiceId}`, { cache: "no-store", headers: headers(false) });
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Admin-tilgangen må fornyes. Last siden på nytt.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente faktura");
      render(data.invoice);

      const justIssuedKey = `invoice-issued-${invoiceId}`;
      if (sessionStorage.getItem(justIssuedKey) === "1" && data.invoice.status !== "draft") {
        sessionStorage.removeItem(justIssuedKey);
        setMessage(`Faktura ${data.invoice.invoiceNumber} er ferdig. Åpne PDF-en eller send den til kunden under «Ferdig faktura». ✓`, "success");
        setTimeout(() => content.querySelector(".invoice-final-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
    } catch (error) {
      content.innerHTML = `<div class="fd-loading">${escapeHtml(error.message || "Noe gikk galt")}</div>`;
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .invoice-final-panel{border:1px solid #3e6a55;background:#101c18;display:grid;gap:12px}
    .invoice-final-number{font-size:1.35rem;font-weight:900;color:#eef8f3}
    .invoice-final-actions{display:grid;grid-template-columns:1fr;gap:10px}
    .invoice-final-actions button{width:100%;min-height:54px}
    .invoice-auto-doc-info{border-color:#33465e;background:#111a27}
    .invoice-delivery-confirm{min-height:50px;border:1px solid #35475d;background:#172438;color:#eef4fb;border-radius:12px;padding:10px 14px;font:inherit;font-weight:800}
    @media(min-width:700px){.invoice-final-actions{grid-template-columns:2fr 1fr 1fr}}
  `;
  document.head.appendChild(style);

  load();
})();
