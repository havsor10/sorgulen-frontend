(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const content = document.getElementById("invContent");
  const summary = document.getElementById("invSummary");
  const statusMessage = document.getElementById("statusMessage");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const newInvoiceBtn = document.getElementById("newInvoiceBtn");

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
    if (type !== "error") setTimeout(() => { statusMessage.style.display = "none"; }, 3000);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const statusLabels = { draft: "Utkast", sent: "Sendt", paid: "Betalt", credited: "Kreditert" };

  function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–";
  }

  function renderSummary(invoices) {
    const total = invoices.length;
    const drafts = invoices.filter((i) => i.status === "draft").length;
    const unpaid = invoices.filter((i) => i.status === "sent").length;
    const paid = invoices.filter((i) => i.status === "paid").length;
    // Sum utestående (sendt, ikke betalt, ikke kreditnota)
    const outstanding = invoices
      .filter((i) => i.status === "sent" && !i.isCreditNote)
      .reduce((sum, i) => sum + (i.amount || 0), 0);

    summary.innerHTML = `
      <div class="inv-stat"><div class="num">${total}</div><div class="lbl">Fakturaer totalt</div></div>
      <div class="inv-stat"><div class="num">${drafts}</div><div class="lbl">Utkast</div></div>
      <div class="inv-stat"><div class="num">${unpaid}</div><div class="lbl">Sendt, ikke betalt</div></div>
      <div class="inv-stat"><div class="num">${outstanding} kr</div><div class="lbl">Utestående</div></div>
      <div class="inv-stat"><div class="num">${paid}</div><div class="lbl">Betalt</div></div>
    `;
  }

  function render(invoices) {
    renderSummary(invoices);

    if (!invoices.length) {
      content.innerHTML = `<div class="inv-empty">Ingen fakturaer ennå. Klikk «+ Ny faktura» for å lage den første.</div>`;
      return;
    }

    const rows = invoices.map((inv) => {
      const num = inv.invoiceNumber
        ? (inv.isCreditNote ? `Kreditnota ${inv.invoiceNumber}` : escapeHtml(inv.invoiceNumber))
        : "<span style='color:#888;'>(utkast)</span>";
      const ref = inv.sourceRef ? `#${escapeHtml(inv.sourceRef)}` : (inv.sourceType === "manual" ? "Manuell" : "–");
      return `
        <tr class="inv-row-link" data-id="${escapeHtml(inv._id)}">
          <td class="inv-num">${num}</td>
          <td>${escapeHtml(inv.customerName)}</td>
          <td>${escapeHtml(ref)}</td>
          <td>${fmtDate(inv.issuedAt || inv.createdAt)}</td>
          <td class="inv-amount">${escapeHtml(inv.amount)} kr</td>
          <td><span class="inv-badge badge-${escapeHtml(inv.status)}">${escapeHtml(statusLabels[inv.status] || inv.status)}</span></td>
        </tr>`;
    }).join("");

    content.innerHTML = `
      <table class="inv-table">
        <thead>
          <tr>
            <th>Fakturanr.</th><th>Kunde</th><th>Ref.</th><th>Dato</th><th>Beløp</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    // Klikk på rad åpner den faktiske fakturadetaljen.
    content.querySelectorAll(".inv-row-link").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        window.location.href = `faktura-detalj.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  async function load() {
    content.innerHTML = `<div class="inv-loading">Laster fakturaer…</div>`;
    try {
      const res = await fetch(`${API_BASE}/invoices`, { headers: headers() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Feil admin-nøkkel. Last siden på nytt og prøv igjen.");
      }
      if (!res.ok) throw new Error("Kunne ikke hente fakturaer");
      const data = await res.json();
      render(data.invoices || []);
    } catch (err) {
      content.innerHTML = `<div class="inv-empty">${escapeHtml(err.message || "Noe gikk galt")}</div>`;
    }
  }

  if (refreshBtn) refreshBtn.addEventListener("click", load);
  const backfillBtn = document.getElementById("backfillBtn");
  if (backfillBtn) {
    backfillBtn.addEventListener("click", async () => {
      if (!confirm("Gi referansenummer til alle gamle bestillinger og forespørsler som mangler det? Dette gjøres bare én gang.")) return;
      setMessage("Tildeler referansenumre…");
      try {
        const res = await fetch(`${API_BASE}/invoices/backfill-refs`, { method: "POST", headers: headers() });
        if (!res.ok) throw new Error("Kunne ikke tildele numre");
        const data = await res.json();
        setMessage(`Ferdig! ${data.bookingsFixed} bestillinger og ${data.requestsFixed} forespørsler fikk referansenummer.`, "success");
      } catch (err) {
        setMessage(err.message || "Noe gikk galt", "error");
      }
    });
  }
  if (newInvoiceBtn) {
    newInvoiceBtn.addEventListener("click", () => {
      window.location.href = "faktura-ny.html";
    });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(KEY_STORAGE);
      window.location.href = "login.html";
    });
  }

  load();
})();
