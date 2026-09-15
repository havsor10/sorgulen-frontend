(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const content = document.getElementById("invContent");
  const summary = document.getElementById("invSummary");
  const statusMessage = document.getElementById("statusMessage");
  const refreshBtn = document.getElementById("refreshBtn");
  const newInvoiceBtn = document.getElementById("newInvoiceBtn");

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

  function headers() {
    return { "x-admin-key": getAdminKey() };
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function fmtMoney(value) {
    const amount = Number(value);
    return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  }

  function sourceLabel(invoice) {
    if (invoice.sourceType === "workOrder") return "Oppdrag";
    if (invoice.sourceType === "customer") return "Kunde";
    if (invoice.sourceType === "booking") return invoice.sourceRef ? `Bestilling #${invoice.sourceRef}` : "Bestilling";
    if (invoice.sourceType === "request") return invoice.sourceRef ? `Forespørsel #${invoice.sourceRef}` : "Forespørsel";
    return "Manuell";
  }

  function renderSummary(invoices) {
    const drafts = invoices.filter((invoice) => invoice.status === "draft").length;
    const issued = invoices.filter((invoice) => invoice.status === "issued" && !invoice.isCreditNote).length;
    const sent = invoices.filter((invoice) => invoice.status === "sent" && !invoice.isCreditNote).length;
    const paid = invoices.filter((invoice) => invoice.status === "paid" && !invoice.isCreditNote).length;
    const outstanding = invoices
      .filter((invoice) => ["issued", "sent"].includes(invoice.status) && !invoice.isCreditNote)
      .reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0);

    summary.innerHTML = `
      <div class="inv-stat"><div class="num">${drafts}</div><div class="lbl">Utkast</div></div>
      <div class="inv-stat"><div class="num">${issued}</div><div class="lbl">Ferdig, ikke levert</div></div>
      <div class="inv-stat"><div class="num">${sent}</div><div class="lbl">Levert, ikke betalt</div></div>
      <div class="inv-stat"><div class="num">${fmtMoney(outstanding)} kr</div><div class="lbl">Utestående</div></div>
      <div class="inv-stat"><div class="num">${paid}</div><div class="lbl">Betalt</div></div>`;
  }

  function render(invoices) {
    renderSummary(invoices);
    if (!invoices.length) {
      content.innerHTML = `<div class="inv-empty">Ingen fakturaer ennå. Trykk «+ Ny faktura» for å opprette den første.</div>`;
      return;
    }

    content.innerHTML = `
      <table class="inv-table">
        <thead><tr><th>Faktura</th><th>Kunde</th><th>Kilde</th><th>Dato</th><th>Beløp</th><th>Status</th></tr></thead>
        <tbody>${invoices.map((invoice) => {
          const number = invoice.invoiceNumber
            ? (invoice.isCreditNote ? `Kreditnota ${escapeHtml(invoice.invoiceNumber)}` : `Faktura ${escapeHtml(invoice.invoiceNumber)}`)
            : "<span style='color:#9aa6b8;'>Utkast</span>";
          return `
            <tr class="inv-row-link" data-id="${escapeHtml(invoice._id)}">
              <td class="inv-num">${number}</td>
              <td>${escapeHtml(invoice.customerName || "–")}</td>
              <td>${escapeHtml(sourceLabel(invoice))}</td>
              <td>${fmtDate(invoice.issuedAt || invoice.createdAt)}</td>
              <td class="inv-amount">${fmtMoney(invoice.amount)} kr</td>
              <td><span class="inv-badge badge-${escapeHtml(invoice.status)}">${escapeHtml(statusLabels[invoice.status] || invoice.status)}</span></td>
            </tr>`;
        }).join("")}</tbody>
      </table>`;

    content.querySelectorAll(".inv-row-link").forEach((row) => {
      row.addEventListener("click", () => {
        location.href = `faktura-detalj.html?id=${encodeURIComponent(row.dataset.id)}`;
      });
    });
  }

  async function load() {
    content.innerHTML = `<div class="inv-loading">Laster fakturaer…</div>`;
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/invoices`, { cache: "no-store", headers: headers() });
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Admin-tilgangen må fornyes. Last siden på nytt.");
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente fakturaer");
      render(data.invoices || []);
    } catch (error) {
      content.innerHTML = `<div class="inv-empty">${escapeHtml(error.message || "Noe gikk galt")}</div>`;
    }
  }

  refreshBtn?.addEventListener("click", load);
  newInvoiceBtn?.addEventListener("click", () => {
    location.href = "faktura-ny.html";
  });

  load();
})();
