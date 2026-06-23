(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const content = document.getElementById("statContent");
  const statusMessage = document.getElementById("statusMessage");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  // Samme auth-mønster som de andre admin-sidene
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

  // Formaterer sekunder til "2 min 5 sek" e.l.
  function formatDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + " sek";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m} min ${s} sek` : `${m} min`;
  }

  // Tegner et enkelt søylediagram som SVG (ingen eksterne bibliotek)
  function renderChart(daily) {
    const w = 860, h = 220, padL = 36, padB = 28, padT = 10, padR = 10;
    const plotW = w - padL - padR;
    const plotH = h - padB - padT;
    const max = Math.max(1, ...daily.map((d) => d.visits));
    const barW = plotW / daily.length;

    let bars = "";
    let labels = "";
    daily.forEach((d, i) => {
      const barH = (d.visits / max) * plotH;
      const x = padL + i * barW;
      const y = padT + (plotH - barH);
      bars += `<rect x="${(x + barW * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(barW * 0.7).toFixed(1)}" height="${barH.toFixed(1)}" fill="#4fc78a" rx="2"><title>${d.day}: ${d.visits} besøk</title></rect>`;
      // Vis hver 5. dato-label så det ikke blir rotete
      if (i % 5 === 0 || i === daily.length - 1) {
        const dd = d.day.slice(8, 10) + "." + d.day.slice(5, 7);
        labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 8}" fill="#7f8a9c" font-size="10" text-anchor="middle">${dd}</text>`;
      }
    });

    // Y-akse: 0 og max
    const yAxis =
      `<text x="${padL - 6}" y="${padT + 6}" fill="#7f8a9c" font-size="10" text-anchor="end">${max}</text>` +
      `<text x="${padL - 6}" y="${padT + plotH}" fill="#7f8a9c" font-size="10" text-anchor="end">0</text>`;

    return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="xMidYMid meet">
      <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="#333" stroke-width="1"/>
      ${bars}${labels}${yAxis}
    </svg>`;
  }

  function render(data) {
    const s = data.summary || {};
    const daily = Array.isArray(data.daily) ? data.daily : [];

    const html = `
      <div class="stat-grid">
        <div class="stat-card">
          <p class="stat-num">${escapeHtml(s.totalUnique || 0)}</p>
          <div class="stat-label">Unike besøkende</div>
          <div class="stat-sub">totalt</div>
        </div>
        <div class="stat-card">
          <p class="stat-num">${escapeHtml(s.totalVisits || 0)}</p>
          <div class="stat-label">Totale besøk</div>
          <div class="stat-sub">alle åpninger</div>
        </div>
        <div class="stat-card">
          <p class="stat-num">${escapeHtml(s.visitsToday || 0)}</p>
          <div class="stat-label">Besøk i dag</div>
        </div>
        <div class="stat-card">
          <p class="stat-num">${escapeHtml(s.visitsWeek || 0)}</p>
          <div class="stat-label">Siste 7 dager</div>
        </div>
        <div class="stat-card">
          <p class="stat-num">${escapeHtml(formatDuration(s.avgDurationSec))}</p>
          <div class="stat-label">Tid på siden</div>
          <div class="stat-sub">ca. i snitt</div>
        </div>
      </div>

      <div class="chart-card">
        <h3>Besøk per dag – siste 30 dager</h3>
        ${renderChart(daily)}
        <p class="stat-note">Hvert besøk telles når en besøkende klikker «Fortsett» på velkomstboksen. Tid på siden er et omtrentlig estimat.</p>
      </div>
    `;
    content.innerHTML = html;
  }

  async function load() {
    content.innerHTML = `<div class="stat-loading">Laster statistikk…</div>`;
    try {
      const res = await fetch(`${API_BASE}/stats`, { headers: headers() });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Feil admin-nøkkel. Last siden på nytt og prøv igjen.");
      }
      if (!res.ok) throw new Error("Kunne ikke hente statistikk");
      const data = await res.json();
      render(data);
    } catch (err) {
      content.innerHTML = `<div class="stat-loading">${escapeHtml(err.message || "Noe gikk galt")}</div>`;
    }
  }

  if (refreshBtn) refreshBtn.addEventListener("click", load);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(KEY_STORAGE);
      window.location.href = "login.html";
    });
  }

  load();
})();
