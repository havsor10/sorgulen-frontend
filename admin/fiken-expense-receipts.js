(() => {
  "use strict";
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const byId = (id) => document.getElementById(id);
  const button = byId("receiptSyncBtn");
  const refreshButton = byId("receiptRefreshBtn");
  const summary = byId("receiptSyncSummary");
  const list = byId("receiptSyncList");
  const message = byId("receiptSyncMessage");
  if (!button || !list || !summary) return;

  const fmt = new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" });
  let entries = [];

  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": localStorage.getItem("sorgulen_admin_key") || "",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data.error || "Kunne ikkje hente kvitteringsstatus.");
    return data;
  }

  function span(text, className = "") {
    const node = document.createElement("span");
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function render(data) {
    entries = Array.isArray(data.entries) ? data.entries : [];
    const pending = entries.filter((e) => e.status === "pending" && e.hasReceipt).length;
    const missing = entries.filter((e) => e.status === "missing_receipt").length;
    const uploaded = entries.filter((e) => e.status === "uploaded").length;
    const review = entries.filter((e) => ["manual_review", "uploading"].includes(e.status)).length;
    summary.textContent = pending + " klare til sending · " + uploaded + " sendt til Fiken · "
      + missing + " manglar kvittering" + (review ? " · " + review + " må kontrollerast" : "")
      + (data.truncated ? " · Viser berre dei nyaste oppdraga" : "");
    button.disabled = pending === 0;
    list.replaceChildren();

    if (!entries.length) {
      list.append(span("Ingen utgifter registrert i dei siste oppdraga."));
      return;
    }
    const states = {
      pending: "Kan sendast",
      missing_receipt: "Mangler kvittering",
      uploaded: "I Fiken-innboksen",
      manual_review: "Må kontrollerast i Fiken",
      uploading: "Overføring pågår / må kontrollerast",
    };
    for (const row of entries.slice(0, 60)) {
      const card = document.createElement("div");
      card.className = "fiken-receipt-row";
      const left = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = row.item || "Utgift";
      left.append(title);
      const meta = document.createElement("p");
      meta.textContent = [row.customer, row.project, row.supplier, fmt.format(Number(row.amount) || 0)]
        .filter(Boolean).join(" · ");
      left.append(meta);
      const state = span(states[row.status] || "Ukjent status", "fiken-receipt-status");
      if (row.status === "manual_review" || row.status === "uploading") state.classList.add("fiken-receipt-warning");
      if (row.status === "missing_receipt") state.classList.add("fiken-receipt-missing");
      if (row.lastError) state.title = row.lastError;
      card.append(left, state);
      list.append(card);
    }
    if (entries.length > 60) list.append(span("Viser dei 60 nyaste utgiftene av " + entries.length + "."));
  }

  async function load() {
    const data = await request("/admin/fiken/expense-receipts?limit=200");
    render(data);
  }

  async function sync() {
    button.disabled = true;
    refreshButton.disabled = true;
    message.textContent = "Overfører kvitteringer til Fiken-innboksen…";
    try {
      const data = await request("/admin/fiken/expense-receipts/sync", {
        method: "POST",
        body: JSON.stringify({ limit: 5 }),
      });
      const result = data.result || {};
      message.textContent = (result.uploaded || 0) + " kvittering(ar) sendt til Fiken-innboksen."
        + ((result.errors || []).length ? " " + result.errors.length + " feil – kontroller lista før nytt forsøk." : "")
        + (result.truncated ? " Berre dei nyaste oppdraga vart kontrollert." : "");
      await load();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      refreshButton.disabled = false;
      if (!entries.some((e) => e.status === "pending" && e.hasReceipt)) button.disabled = true;
      else button.disabled = false;
    }
  }

  button.addEventListener("click", sync);
  refreshButton.addEventListener("click", () => load().catch((error) => { message.textContent = error.message; }));
  load().catch((error) => { summary.textContent = "Kunne ikkje hente kvitteringsstatus."; message.textContent = error.message; });
})();
