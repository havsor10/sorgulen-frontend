(() => {
  "use strict";
  if (!location.pathname.endsWith("/faktura-detalj.html")) return;

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const content = document.getElementById("fdContent");
  const statusMessage = document.getElementById("statusMessage");
  const invoiceId = new URLSearchParams(location.search).get("id") || "";
  let syncing = false;
  let debounce = 0;

  function headers(json = false) {
    const value = { "x-admin-key": localStorage.getItem(KEY) || "" };
    if (json) value["Content-Type"] = "application/json";
    return value;
  }

  function setMessage(message, error = false) {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = error ? "#ff8a8a" : "#8fe0a8";
  }

  function money(value) {
    const n = Number(value || 0);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)} kr`;
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "";
  }

  async function getInvoice() {
    const res = await fetch(`${API}/invoices/${encodeURIComponent(invoiceId)}`, { cache: "no-store", headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke hente fakturaen");
    return data.invoice;
  }

  async function getPdfFile(invoice) {
    const res = await fetch(`${API}/invoices/${encodeURIComponent(invoiceId)}/preview`, { cache: "no-store", headers: headers() });
    if (!res.ok) throw new Error("Kunne ikke lage PDF");
    const blob = await res.blob();
    const filename = `${invoice.isCreditNote ? "kreditnota" : "faktura"}-${invoice.invoiceNumber || "utkast"}.pdf`;
    return { blob, file: new File([blob], filename, { type: "application/pdf" }) };
  }

  async function markDelivered(method) {
    const res = await fetch(`${API}/invoices/${encodeURIComponent(invoiceId)}/delivery`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ method }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Kunne ikke registrere leveringen");
    setMessage("Fakturaen er registrert som levert. ✓");
    setTimeout(() => location.reload(), 350);
  }

  async function shareInvoice(invoice, button) {
    button.disabled = true;
    try {
      setMessage("Lager PDF for deling…");
      const { blob, file } = await getPdfFile(invoice);
      const text = `Hei! Her er faktura ${invoice.invoiceNumber} fra Sørgulen Industriservice. Beløp ${money(invoice.amount)}${invoice.dueDate ? `, forfall ${formatDate(invoice.dueDate)}` : ""}.`;
      const shareData = { title: `Faktura ${invoice.invoiceNumber}`, text, files: [file] };
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
        if (confirm("Ble fakturaen sendt/levert til kunden?")) await markDelivered("message");
        return;
      }

      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      setMessage("PDF-en er åpnet. Del den via Meldinger, og bruk deretter «Marker levert på melding».");
    } finally {
      button.disabled = false;
    }
  }

  async function showInvoice(invoice, button) {
    button.disabled = true;
    try {
      setMessage("Åpner faktura…");
      const { blob } = await getPdfFile(invoice);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      setMessage("");
      setTimeout(async () => {
        if (confirm("Har kunden fått se eller fått overlevert fakturaen?")) {
          try { await markDelivered("shown"); }
          catch (error) { setMessage(error.message, true); }
        }
      }, 250);
    } finally {
      button.disabled = false;
    }
  }

  function renderPanel(invoice) {
    content.querySelector("[data-invoice-delivery-panel]")?.remove();
    const emailButton = content.querySelector('[data-action="send"]');
    if (emailButton) emailButton.textContent = "📧 Send på e-post";
    if (invoice.status !== "issued") return;

    const actions = content.querySelector(".fd-actions");
    if (!actions) return;

    const panel = document.createElement("section");
    panel.className = "fd-section invoice-delivery-panel";
    panel.dataset.invoiceDeliveryPanel = "true";
    panel.innerHTML = `
      <div class="fd-label">Hvordan skal kunden få fakturaen?</div>
      <p class="fd-info">Fakturaen er utstedt og låst. Velg bare leveringsmåten.</p>
      <div class="invoice-delivery-grid">
        <button type="button" class="btn-send" data-invoice-share>📱 Del / send på melding</button>
        <button type="button" class="btn-edit" data-invoice-show>👁 Vis til kunden</button>
      </div>
      <button type="button" class="invoice-delivery-confirm" data-invoice-mark-message>✓ Marker levert på melding</button>
      ${invoice.customerPhone ? `<p class="fd-info">Kundens telefon: ${String(invoice.customerPhone).replace(/[<>]/g, "")}</p>` : ""}
    `;
    actions.insertAdjacentElement("afterend", panel);

    panel.querySelector("[data-invoice-share]")?.addEventListener("click", (event) => {
      shareInvoice(invoice, event.currentTarget).catch((error) => setMessage(error.message || "Deling feilet", true));
    });
    panel.querySelector("[data-invoice-show]")?.addEventListener("click", (event) => {
      showInvoice(invoice, event.currentTarget).catch((error) => setMessage(error.message || "Kunne ikke vise fakturaen", true));
    });
    panel.querySelector("[data-invoice-mark-message]")?.addEventListener("click", async () => {
      if (!confirm("Er fakturaen faktisk sendt/levert til kunden på melding?")) return;
      try { await markDelivered("message"); }
      catch (error) { setMessage(error.message || "Kunne ikke registrere leveringen", true); }
    });
  }

  async function sync() {
    if (syncing || !invoiceId || content.querySelector("[data-invoice-delivery-panel]")) return;
    if (!content.querySelector(".fd-actions")) return;
    syncing = true;
    try {
      const invoice = await getInvoice();
      renderPanel(invoice);
    } catch (error) {
      console.warn("Kunne ikke bygge fakturalevering:", error.message);
    } finally {
      syncing = false;
    }
  }

  const style = document.createElement("style");
  style.textContent = `
    .invoice-delivery-panel{display:grid;gap:12px;border:1px solid #38506a}
    .invoice-delivery-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .invoice-delivery-grid button,.invoice-delivery-confirm{min-height:52px;width:100%;font:inherit;font-weight:800;border-radius:12px;padding:10px 12px}
    .invoice-delivery-confirm{border:1px solid #35475d;background:#172438;color:#eef4fb}
    @media(max-width:520px){.invoice-delivery-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(sync, 40);
  }).observe(content, { childList: true, subtree: true });
  setTimeout(sync, 100);
})();
