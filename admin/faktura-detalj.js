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
  function validationParts(validation) {
    const warnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
    const blockers = Array.isArray(validation?.blockers)
      ? validation.blockers
      : (validation?.canOverride ? [] : (validation?.problems || []));
    return { blockers, warnings };
  }

  function discountMarkup(inv) {
    const type = inv.discountType || "none";
    const amount = Math.abs(Number(inv.discountAmount || 0));
    if (type === "none" || !(amount > 0)) return "";
    const gross = Number(inv.grossSubtotal ?? (Number(inv.subtotal || 0) + Number(inv.discountAmount || 0)));
    const saving = Math.abs(Number(inv.customerSavings || inv.discountAmount || 0));
    const label = inv.discountLabel || "Kunderabatt";
    const suffix = type === "percent" ? ` (${escapeHtml(inv.discountValue)} %)` : "";
    return `
      <div class="fd-discount">
        <strong>🎁 Kunden har fått rabatt</strong>
        <span>Sum før rabatt: ${money(gross)}</span>
        <span>${escapeHtml(label)}${suffix}: <b>−${money(amount)}</b></span>
        <strong>Du sparer: ${money(saving)}</strong>
      </div>`;
  }

  function fikenMarkup(inv) {
    if (inv.status === "draft") return "";
    const fiken = inv.fiken || {};
    const state = fiken.syncStatus || "not_configured";
    let tone = "fd-info";
    let title = "Ikke registrert i Fiken";
    let detail = "Bruk «Synk Fiken» når integrasjonen er koblet til.";

    if (state === "synced" && fiken.saleId) {
      tone = "fd-success";
      title = "✓ Registrert i Fiken";
      const paid = Number(fiken.totalPaidOre || 0) / 100;
      const outstanding = fiken.outstandingBalanceOre == null ? null : Number(fiken.outstandingBalanceOre) / 100;
      detail = `Salg-ID ${escapeHtml(fiken.saleId)}${paid > 0 ? ` · registrert betalt ${money(paid)}` : ""}${outstanding != null ? ` · utestående ${money(outstanding)}` : ""}.`;
    } else if (state === "error") {
      tone = "fd-warn";
      title = "Fiken trenger oppmerksomhet";
      detail = fiken.lastError || "Synkronisering med Fiken feilet.";
    } else if (state === "pending") {
      title = "Fiken-registrering pågår";
      detail = "Fakturaen venter på bekreftet registrering i Fiken.";
    } else if (state === "manual_required") {
      tone = "fd-warn";
      title = "Må kontrolleres i Fiken";
      detail = fiken.lastError || "Denne dokumenttypen krever manuell kontroll i Fiken.";
    }

    return `
      <div class="fd-section">
        <div class="fd-label">Fiken / regnskap</div>
        <div class="${tone}"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(detail)}</div>
        ${!inv.isCreditNote ? '<button class="btn-edit" type="button" data-action="fiken-sync" style="margin-top:10px">Synk Fiken</button>' : ""}
      </div>`;
  }

  function actionButtons(inv) {
    const previewLabel = inv.status === "draft" ? "📄 Forhåndsvis PDF" : "📄 Vis ferdig faktura";
    const buttons = [`<button class="btn-preview" data-action="preview">${previewLabel}</button>`];
    if (inv.status === "draft") {
      if (!inv.invoiceNumber) {
        buttons.push(`<a class="btn-edit" href="faktura-rediger.html?id=${encodeURIComponent(inv._id)}">✏️ Rediger utkast</a>`);
        if (!inv.isCreditNote) buttons.push(`<a class="btn-discount" href="faktura-rediger.html?id=${encodeURIComponent(inv._id)}#discount">🎁 ${inv.discountType && inv.discountType !== "none" ? "Endre rabatt" : "Gi rabatt"}</a>`);
      }
      buttons.push(`<button class="btn-send" data-action="issue">${inv.isCreditNote ? "Utsted kreditnota" : "Utsted faktura"}</button>`);
      if (!inv.invoiceNumber) buttons.push(`<button class="btn-delete" data-action="delete">🗑 Slett utkast</button>`);
    }
    if (inv.status === "issued") {
      buttons.push('<button class="btn-send" data-action="share">📱 Del / send på melding</button>');
      buttons.push('<button class="btn-edit" data-action="show">👁 Vis til kunden</button>');
      if (inv.customerEmail) buttons.push('<button class="btn-send" data-action="send">📧 Send på e-post</button>');
      buttons.push('<button class="btn-edit" data-action="mark-message">✓ Marker levert på melding</button>');
      if (!inv.isCreditNote) buttons.push('<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>');
    }
    if (inv.status === "sent") {
      if (!inv.isCreditNote) buttons.push('<button class="btn-paid" data-action="paid">💰 Marker betalt</button>');
      if (!inv.isCreditNote) buttons.push('<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>');
    }
    if (inv.status === "paid" && !inv.isCreditNote) {
      buttons.push('<button class="btn-delete" data-action="credit" style="background:#8a5a1f;">↩️ Krediter</button>');
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
          ${discountMarkup(inv)}
          ${inv.vatRegisteredSnapshot ? `<div class="fd-total" style="font-size:14px;color:#aab3bf">Delsum etter rabatt: ${money(inv.subtotal)} · MVA ${escapeHtml(inv.taxRate)} %: ${money(inv.taxAmount)}</div>` : `<p class="fd-info">Merverdiavgift er ikke beregnet.</p>`}
          <div class="fd-total">${inv.isCreditNote ? "Kreditert" : "Å betale"}: ${money(inv.amount)}</div>
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

        ${fikenMarkup(inv)}
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
      const { blockers, warnings } = validationParts(data);
      const issueBtn = content.querySelector('[data-action="issue"]');
      const normalLabel = inv.isCreditNote ? "Utsted kreditnota" : "Utsted faktura";

      if (blockers.length) {
        box.innerHTML = `<div class="fd-label">Kan ikke utstede ennå</div><ul class="fd-validation-list">${blockers.map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`;
        if (issueBtn) {
          issueBtn.disabled = true;
          issueBtn.textContent = normalLabel;
        }
        return;
      }

      if (warnings.length) {
        box.innerHTML = `
          <div class="fd-label">Mangler valgfri informasjon</div>
          <p class="fd-info">Du kan rette dette, eller utstede fakturaen uten opplysningene.</p>
          <ul class="fd-validation-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
        `;
        if (issueBtn) {
          issueBtn.disabled = false;
          issueBtn.textContent = inv.isCreditNote ? "Utsted kreditnota likevel" : "Utsted likevel";
        }
        return;
      }

      box.innerHTML = `<div class="fd-label">Kontroll før utstedelse</div><div class="fd-value" style="color:#8fe0a8;">✓ Klar til utstedelse. Fakturanummer tildeles først når du trykker «${normalLabel}».</div>`;
      if (issueBtn) {
        issueBtn.disabled = false;
        issueBtn.textContent = normalLabel;
      }
    } catch (err) {
      box.innerHTML = `<div class="fd-label">Kontroll før utstedelse</div><div class="fd-warn">${escapeHtml(err.message || "Kontroll feilet")}</div>`;
    }
  }

  async function getPdfFile(inv) {
    const res = await fetch(`${API_BASE}/invoices/${inv._id}/preview`, { cache: "no-store", headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Kunne ikke lage PDF");
    }
    const blob = await res.blob();
    const filename = `${inv.isCreditNote ? "kreditnota" : "faktura"}-${inv.invoiceNumber || "utkast"}.pdf`;
    return { blob, file: new File([blob], filename, { type: "application/pdf" }) };
  }

  async function preview(inv) {
    setMessage(inv.status === "draft" ? "Lager PDF…" : "Åpner ferdig faktura…");
    const { blob } = await getPdfFile(inv);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    setMessage("");
  }

  async function markDelivered(inv, method) {
    const res = await fetch(`${API_BASE}/invoices/${inv._id}/delivery`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ method }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke registrere leveringen");
    setMessage("Fakturaen er registrert som levert. ✓", "success");
    return load();
  }

  async function shareInvoice(inv, element) {
    if (!inv.invoiceNumber) throw new Error("Utsted fakturaen før den deles med kunden.");
    if (element) element.disabled = true;
    try {
      setMessage("Lager ferdig PDF for deling…");
      const { blob, file } = await getPdfFile(inv);
      const text = `Hei! Her er faktura ${inv.invoiceNumber} fra Sørgulen Industriservice. Beløp ${money(inv.amount)}${inv.dueDate ? `, forfall ${fmtDate(inv.dueDate)}` : ""}.`;
      const shareData = { title: `Faktura ${inv.invoiceNumber}`, text, files: [file] };
      const canShareFile = typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(shareData));

      if (canShareFile) {
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
        if (confirm("Ble fakturaen sendt/levert til kunden?")) {
          await markDelivered(inv, "message");
        } else {
          setMessage("PDF-en ble delt, men fakturaen er ikke markert som levert.");
        }
        return;
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      setMessage("PDF-en er åpnet. Del den via Meldinger og trykk «Marker levert på melding» etterpå.");
    } finally {
      if (element?.isConnected) element.disabled = false;
    }
  }

  async function showInvoice(inv, element) {
    if (element) element.disabled = true;
    try {
      await preview(inv);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (confirm("Har kunden fått se eller fått overlevert fakturaen?")) {
        await markDelivered(inv, "shown");
      }
    } finally {
      if (element?.isConnected) element.disabled = false;
    }
  }

  async function handleAction(action, inv, element) {
    try {
      if (action === "preview") return await preview(inv);
      if (action === "share") return await shareInvoice(inv, element);
      if (action === "show") return await showInvoice(inv, element);
      if (action === "mark-message") {
        if (!confirm("Er fakturaen faktisk sendt/levert til kunden på melding?")) return;
        return await markDelivered(inv, "message");
      }

      if (action === "issue") {
        const validationRes = await fetch(`${API_BASE}/invoices/${inv._id}/issue-validation`, { headers: headers() });
        const validation = await validationRes.json().catch(() => ({}));
        if (!validationRes.ok) throw new Error(validation.error || "Kunne ikke kontrollere fakturaen");
        const { blockers, warnings } = validationParts(validation);
        if (blockers.length) throw new Error(`Kan ikke utstede: ${blockers.join(" ")}`);

        const label = inv.isCreditNote ? "kreditnotaen" : "fakturaen";
        const warningText = warnings.length
          ? `Følgende informasjon mangler:\n\n• ${warnings.join("\n• ")}\n\nDette er valgfritt. Vil du utstede ${label} likevel?`
          : `Du er i ferd med å utstede ${label}. Fakturanummer vil bli tildelt og dokumentets økonomiske opplysninger låses.\n\nFortsette?`;
        if (!confirm(warningText)) return;

        if (element) element.disabled = true;
        setMessage(`Utsteder ${label}…`);
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/issue`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ operationId, allowWarnings: warnings.length > 0 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke utstede");
        if (data.fikenWarning) {
          setMessage(`${inv.isCreditNote ? "Kreditnota" : "Faktura"} ${data.invoice.invoiceNumber} er utstedt, men Fiken trenger oppmerksomhet: ${data.fikenWarning}`, "error");
        } else {
          setMessage(`${inv.isCreditNote ? "Kreditnota" : "Faktura"} ${data.invoice.invoiceNumber} er utstedt og ${data.accountingReady === false ? "venter på Fiken" : "klar"}. ✓`, "success");
        }
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

      if (action === "fiken-sync") {
        if (element) element.disabled = true;
        setMessage("Synkroniserer fakturaen med Fiken…");
        const res = await fetch(`${API_BASE}/admin/fiken/invoices/${inv._id}/sync`, {
          method: "POST",
          headers: headers(),
          body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Fiken-synk feilet");
        setMessage("Fiken er synkronisert. ✓", "success");
        return load();
      }

      if (action === "paid") {
        const today = new Date().toLocaleDateString("sv-SE");
        const paymentDate = prompt("Dato betalingen kom inn (ÅÅÅÅ-MM-DD):", today);
        if (paymentDate === null) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate.trim())) throw new Error("Bruk datoformat ÅÅÅÅ-MM-DD.");

        const outstanding = inv.fiken?.outstandingBalanceOre != null
          ? Number(inv.fiken.outstandingBalanceOre) / 100
          : Number(inv.amount || 0);
        const amountText = prompt("Beløp som er kommet inn:", String(outstanding > 0 ? outstanding : Number(inv.amount || 0)));
        if (amountText === null) return;
        const paymentAmount = Number(String(amountText).replace(",", "."));
        if (!(paymentAmount > 0)) throw new Error("Skriv inn et gyldig betalingsbeløp.");

        if (!confirm(`Registrere ${money(paymentAmount)} mottatt ${paymentDate} på faktura ${inv.invoiceNumber}?`)) return;
        const operationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const res = await fetch(`${API_BASE}/invoices/${inv._id}/paid`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ date: paymentDate.trim(), amount: paymentAmount, operationId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Kunne ikke registrere betalingen");
        setMessage(data.source === "fiken"
          ? (data.invoice?.status === "paid" ? "Betalingen er registrert i Fiken og fakturaen er betalt. ✓" : "Betalingen er registrert i Fiken. Det står fortsatt et restbeløp.")
          : "Faktura markert som betalt. ✓", "success");
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
