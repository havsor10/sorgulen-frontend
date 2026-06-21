(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const reqList = document.getElementById("reqList");
  const statusMessage = document.getElementById("statusMessage");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const tabs = Array.from(document.querySelectorAll(".tab[data-tab]"));

  let requests = [];
  let currentTab = "all";

  const statusLabels = { new: "Ny", reviewed: "Vurdert", offer: "Tilbud laget", sent: "Sendt", accepted: "Aktiv", declined: "Avslått", archived: "Arkivert" };

  // Samme auth-mønster som admin-dashboard.js
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
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message ${type}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function loadRequests() {
    setMessage("Laster forespørsler…");
    try {
      const res = await fetch(`${API_BASE}/requests`, { headers: headers() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        setMessage("Ugyldig admin-nøkkel. Last siden på nytt for å prøve igjen.", "error");
        return;
      }
      if (!res.ok) throw new Error("Kunne ikke hente forespørsler");
      const data = await res.json();
      requests = Array.isArray(data.requests) ? data.requests : [];
      setMessage("");
      render();
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
    }
  }

  function filtered() {
    if (currentTab === "all") return requests;
    return requests.filter((r) => r.status === currentTab);
  }

  function aiBlock(r) {
    if (r.aiError) {
      return `<div class="req-ai req-ai-error">
        <h4>AI-analyse feilet</h4>
        <div class="req-ai-row">${escapeHtml(r.aiError)}</div>
        <div class="req-ai-row" style="margin-top:6px;color:#b9c2d0;">Sett pris manuelt nedenfor.</div>
      </div>`;
    }
    const ai = r.aiSuggestion;
    if (!ai) {
      return `<div class="req-ai"><h4>AI-analyse</h4><div class="req-ai-row">Analyserer… oppdater om et øyeblikk.</div></div>`;
    }

    const items = Array.isArray(ai.detectedItems) && ai.detectedItems.length
      ? `<div class="req-ai-row">Gjenkjent: ${ai.detectedItems.map(escapeHtml).join(", ")}</div>` : "";
    const vol = (ai.estimatedVolumeM3 !== null && ai.estimatedVolumeM3 !== undefined)
      ? `<div class="req-ai-row">Estimert volum: ${escapeHtml(ai.estimatedVolumeM3)} m³</div>` : "";

    // Detaljert prisoppstilling (som i demoen)
    let breakdown = "";
    if (Array.isArray(ai.priceBreakdown) && ai.priceBreakdown.length) {
      breakdown = `<table style="width:100%;font-size:13px;margin:8px 0;border-collapse:collapse;">` +
        ai.priceBreakdown.map((line) =>
          `<tr><td style="padding:3px 0;color:#cdd6e3;">${escapeHtml(line.item)}</td><td style="text-align:right;padding:3px 0;color:#cdd6e3;white-space:nowrap;">${escapeHtml(line.amount)} kr</td></tr>`
        ).join("") +
        `<tr style="border-top:1px solid #333;"><td style="padding:6px 0;font-weight:700;color:#4fc78a;">Estimert total</td><td style="text-align:right;padding:6px 0;font-weight:700;color:#4fc78a;">${escapeHtml(ai.priceLow)}–${escapeHtml(ai.priceHigh)} kr</td></tr>` +
        `</table>`;
    }

    const price = (!breakdown && ai.priceLow != null && ai.priceHigh != null)
      ? `<div class="req-ai-row req-ai-price">${escapeHtml(ai.priceLow)}–${escapeHtml(ai.priceHigh)} kr</div>` : "";
    const dur = ai.durationText ? `<div class="req-ai-row">Varighet: ${escapeHtml(ai.durationText)}</div>` : "";
    const reason = ai.reasoning ? `<div class="req-ai-row" style="color:#9aa6b8;">${escapeHtml(ai.reasoning)}</div>` : "";
    const scope = ai.outOfScope ? `<span class="req-badge badge-scope">Utenfor tjenester?</span> ` : "";
    const warn = ai.warning ? `<div class="req-warn">⚠ ${escapeHtml(ai.warning)}</div>` : "";
    const conf = ai.confidence ? ` · sikkerhet: ${escapeHtml(ai.confidence)}` : "";

    return `<div class="req-ai">
      <h4>AI-forslag${conf}</h4>
      <div class="req-ai-row">${scope}<strong>${escapeHtml(ai.category || "Ukjent kategori")}</strong></div>
      ${items}${vol}${dur}${breakdown}${price}${reason}${warn}
    </div>`;
  }

  function render() {
    const list = filtered();
    if (!list.length) {
      reqList.innerHTML = `<div class="req-empty">Ingen forespørsler i denne kategorien.</div>`;
      return;
    }

    reqList.innerHTML = list.map((r) => {
      const id = escapeHtml(r._id);
      const imgs = (r.imageUrls || []).map((u) =>
        `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Bilde"></a>`
      ).join("");

      return `
      <div class="req-card" data-id="${id}">
        <div class="req-head">
          <div>
            <p class="req-customer">${escapeHtml(r.customerName)}</p>
            <div class="req-meta">
              ${escapeHtml(r.customerPhone)}${r.customerEmail ? " · " + escapeHtml(r.customerEmail) : ""}<br>
              ${formatDateTime(r.createdAt)}
            </div>
          </div>
          <span class="req-badge badge-${escapeHtml(r.status)}">${escapeHtml(statusLabels[r.status] || r.status)}</span>
        </div>

        <div class="req-desc">${escapeHtml(r.description)}</div>
        ${imgs ? `<div class="req-images">${imgs}</div>` : ""}

        ${aiBlock(r)}

        <div class="req-admin">
          <div>
            <label>Din pris fra (kr)</label>
            <input type="number" min="0" class="adminLow" value="${r.adminPriceLow ?? ""}">
          </div>
          <div>
            <label>Din pris til (kr)</label>
            <input type="number" min="0" class="adminHigh" value="${r.adminPriceHigh ?? ""}">
          </div>
        </div>
        <div style="margin-top:10px;">
          <label style="display:block;font-size:12px;color:#9aa6b8;margin-bottom:4px;">Notat</label>
          <input type="text" class="adminNote" style="width:100%;background:#161616;border:1px solid #2c2c2c;border-radius:6px;padding:8px;color:#f0f0f0;box-sizing:border-box;" value="${escapeHtml(r.adminNote || "")}">
        </div>

        ${offerBlock(r)}

        <div class="req-actions">
          <button class="btn-save" data-action="save">Lagre estimat</button>
          <button class="btn-offer" data-action="offer" style="background:#7a3fd6;">${r.offer && r.offer.message ? "Lag tilbud på nytt" : "Lag tilbud"}</button>
          <button class="btn-accept" data-action="accept" style="background:#2e8b57;">Kunde vil ha jobben</button>
          <button class="btn-decline" data-action="decline" style="background:#a0522d;">Kunde takket nei</button>
          <button class="btn-archive" data-action="archive">Arkiver</button>
        </div>
      </div>`;
    }).join("");
  }

  function offerBlock(r) {
    if (!r.offer || !r.offer.message) return "";
    const o = r.offer;
    const priceStr = o.priceLow === o.priceHigh ? `${escapeHtml(o.priceLow)} kr` : `${escapeHtml(o.priceLow)}–${escapeHtml(o.priceHigh)} kr`;
    return `
      <div style="border-left:3px solid #7a3fd6; background:#1d1530; padding:12px 14px; margin:12px 0; border-radius:0 6px 6px 0;">
        <h4 style="margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:#b794f0;">Tilbud (kan redigeres)</h4>
        <textarea class="offerMsg" style="width:100%; min-height:120px; background:#161616; border:1px solid #2c2c2c; border-radius:6px; padding:10px; color:#f0f0f0; box-sizing:border-box; font-family:inherit; font-size:14px; line-height:1.5; resize:vertical;">${escapeHtml(o.message)}</textarea>
        <div style="margin-top:8px; font-size:14px; color:#cdd6e3;">Tilbudspris: <strong style="color:#4fc78a;">${priceStr}</strong></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button class="btn-save-offer" data-action="save-offer" style="padding:8px 16px; border:none; border-radius:6px; background:#5a8b3a; color:#fff; cursor:pointer; font-size:13px;">Lagre tilbudstekst</button>
          <button class="btn-pdf" data-action="pdf" style="padding:8px 16px; border:none; border-radius:6px; background:#c0392b; color:#fff; cursor:pointer; font-size:13px;">${o.pdfUrl ? "Lag PDF på nytt" : "Forhåndsvis PDF"}</button>
          ${o.pdfUrl ? `<a href="${escapeHtml(o.pdfUrl)}" target="_blank" rel="noopener" style="padding:8px 16px; border-radius:6px; background:#2c3e50; color:#fff; text-decoration:none; font-size:13px;">Åpne PDF ↗</a>` : ""}
        </div>
        <div style="margin-top:10px;">
          <button class="btn-send" data-action="send" style="width:100%; padding:12px; border:none; border-radius:6px; background:#12c285; color:#06231a; font-weight:700; cursor:pointer; font-size:15px;">📧 Send tilbud til kunde</button>
          ${!r.customerEmail ? `<p style="color:#f0a85f; font-size:12px; margin:6px 0 0;">⚠ Kunden oppga ingen e-post – kan ikke sende automatisk.</p>` : ""}
          ${o.sentAt ? `<p style="color:#8fe0a8; font-size:12px; margin:6px 0 0;">✓ Sendt ${new Date(o.sentAt).toLocaleString("no-NO")}</p>` : ""}
        </div>`;
  }

  async function patchRequest(id, updates) {
    const res = await fetch(`${API_BASE}/requests/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Kunne ikke oppdatere");
    }
    return res.json();
  }

  // Event delegation for handlingsknappene
  reqList.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest(".req-card");
    const id = card.getAttribute("data-id");
    const action = btn.getAttribute("data-action");

    try {
      if (action === "save") {
        const low = card.querySelector(".adminLow").value;
        const high = card.querySelector(".adminHigh").value;
        const note = card.querySelector(".adminNote").value;
        const updates = { adminNote: note, status: "reviewed" };
        if (low !== "") updates.adminPriceLow = Number(low);
        if (high !== "") updates.adminPriceHigh = Number(high);
        await patchRequest(id, updates);
        setMessage("Estimat lagret.", "success");
      } else if (action === "offer") {
        setMessage("Lager tilbud med AI…");
        const res = await fetch(`${API_BASE}/requests/${id}/offer`, {
          method: "POST",
          headers: headers(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Kunne ikke lage tilbud");
        }
        setMessage("Tilbud laget. Se gjennom teksten nedenfor.", "success");
      } else if (action === "save-offer") {
        const message = card.querySelector(".offerMsg").value;
        const res = await fetch(`${API_BASE}/requests/${id}/offer`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Kunne ikke lagre tilbudstekst");
        }
        setMessage("Tilbudstekst lagret.", "success");
      } else if (action === "pdf") {
        setMessage("Genererer PDF…");
        const res = await fetch(`${API_BASE}/requests/${id}/pdf`, {
          method: "POST",
          headers: headers(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Kunne ikke lage PDF");
        }
        const data = await res.json();
        setMessage("PDF laget.", "success");
        if (data.pdfUrl) window.open(data.pdfUrl, "_blank");
      } else if (action === "send") {
        if (!confirm("Sende tilbudet til kunden på e-post nå?")) return;
        setMessage("Sender tilbud til kunde…");
        const res = await fetch(`${API_BASE}/requests/${id}/send`, {
          method: "POST",
          headers: headers(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Kunne ikke sende tilbud");
        }
        setMessage("Tilbud sendt til kunden! ✓", "success");
      } else if (action === "accept") {
        await patchRequest(id, { status: "accepted" });
        setMessage("Markert som aktiv – kunden vil ha jobben.", "success");
      } else if (action === "decline") {
        await patchRequest(id, { status: "declined" });
        setMessage("Markert som avslått.", "success");
      } else if (action === "archive") {
        await patchRequest(id, { status: "archived" });
        setMessage("Arkivert.", "success");
      }
      await loadRequests();
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.getAttribute("data-tab");
      render();
    });
  });

  if (refreshBtn) refreshBtn.addEventListener("click", loadRequests);
  if (logoutBtn) logoutBtn.addEventListener("click", () => localStorage.removeItem(KEY_STORAGE));

  loadRequests();
})();
