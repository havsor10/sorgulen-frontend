(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const el = (id) => document.getElementById(id);
  const dashboard = el("ecoDashboard");
  const setup = el("ecoSetup");
  const refresh = el("ecoRefresh");
  const forceRefresh = el("ecoForceRefresh");
  const syncInvoices = el("ecoSyncInvoices");
  let status = null;
  let economy = null;
  let busy = false;

  function key() {
    return (localStorage.getItem(KEY_STORAGE) || "").trim();
  }

  function headers(json = false) {
    const value = { "x-admin-key": key() };
    if (json) value["Content-Type"] = "application/json";
    return value;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers(options.body !== undefined), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw new Error("Admin-innloggingen er utløpt. Logg inn på nytt.");
    }
    if (!response.ok) throw new Error(data.error || `Forespørselen feilet (${response.status})`);
    return data;
  }

  function nok(value, decimals = 0) {
    const n = Number(value);
    return `${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(n) ? n : 0)} kr`;
  }

  function pct(value) {
    const n = Number(value);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n * 100 : 0)} %`;
  }

  function dateTime(value) {
    if (!value) return "–";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return date.toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function setConnection(kind, title, text) {
    const dot = el("ecoLiveDot");
    dot.className = `eco-live-dot ${kind ? `is-${kind}` : ""}`.trim();
    el("ecoConnectionTitle").textContent = title;
    el("ecoConnectionText").textContent = text;
  }

  function envRow(name, ok, hint) {
    const row = document.createElement("div");
    row.className = "eco-env-row";
    const copy = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = name;
    copy.appendChild(code);
    if (hint) {
      const small = document.createElement("div");
      small.style.marginTop = "4px";
      small.style.color = "#8f887d";
      small.style.fontSize = "11px";
      small.textContent = hint;
      copy.appendChild(small);
    }
    const state = document.createElement("span");
    state.className = `eco-env-state${ok ? " is-ok" : ""}`;
    state.textContent = ok ? "Klar" : "Mangler";
    row.append(copy, state);
    return row;
  }

  async function renderSetup() {
    if (!status) return;
    const needsAnything = !status.configured || !status.invoicingReady;
    setup.hidden = !needsAnything;
    if (!needsAnything) return;
    setup.replaceChildren();
    const h2 = document.createElement("h2");
    h2.textContent = status.configured ? "Fiken er koblet – fakturering mangler ett valg" : "Klar for Fiken-nøkkelen";
    const p = document.createElement("p");
    p.textContent = status.configured
      ? "Økonomitall kan leses allerede. Før Sørgulen kan opprette fakturaer i Fiken må inntektskontoen settes i Render."
      : "Koden er ferdig rigget. Legg miljøvariablene i Render når du er klar – API-nøkkelen skal aldri inn i frontend eller GitHub.";
    const list = document.createElement("div");
    list.className = "eco-env-list";
    list.append(
      envRow("FIKEN_API_TOKEN", status.tokenStoredServerSide, "Personlig API-nøkkel fra Fiken"),
      envRow("FIKEN_COMPANY_SLUG", Boolean(status.company?.slug), "Valgfri hvis systemet finner riktig foretak automatisk"),
      envRow("FIKEN_INCOME_ACCOUNT", Boolean(status.incomeAccount), "Påkrevd før faktura kan opprettes")
    );
    const note = document.createElement("p");
    note.className = "eco-setup-note";
    note.textContent = "Valgfritt: FIKEN_SEND_METHOD (standard email) og FIKEN_TAX_RESERVE_RATE (standard 0.40). MVA-status leses fra Fiken og skal ikke hardkodes.";
    setup.append(h2, p, list, note);

    if (status.configured && !status.incomeAccount) {
      try {
        const data = await api("/admin/fiken/income-accounts");
        if (Array.isArray(data.accounts) && data.accounts.length) {
          const intro = document.createElement("p");
          intro.textContent = "Tilgjengelige 3xxx-kontoer i Fiken (velg riktig konto – systemet velger ikke regnskapskonto for deg):";
          const accounts = document.createElement("div");
          accounts.className = "eco-accounts";
          data.accounts.slice(0, 12).forEach((account) => {
            const item = document.createElement("div");
            item.className = "eco-account";
            const code = document.createElement("strong");
            code.textContent = account.code;
            const name = document.createElement("span");
            name.textContent = account.name || "";
            item.append(code, name);
            accounts.appendChild(item);
          });
          setup.append(intro, accounts);
        }
      } catch (_) { /* valgfri hjelp – økonomisiden skal fortsatt virke */ }
    }
  }

  function renderEconomy() {
    if (!economy?.available) {
      dashboard.hidden = true;
      return;
    }
    dashboard.hidden = false;
    const ytd = economy.yearToDate || {};
    const receivables = economy.receivables || {};
    const vat = economy.vatWatch || {};

    el("ecoResult").textContent = nok(ytd.simplifiedOperatingResult);
    el("ecoTaxReserve").textContent = nok(ytd.suggestedTaxReserve);
    el("ecoTaxFoot").textContent = `${pct(ytd.taxReserveRate)} av positivt forenklet resultat · styringsreserve`;
    el("ecoOutstanding").textContent = nok(receivables.outstanding);
    el("ecoOutstandingFoot").textContent = `${receivables.unpaidCount || 0} ubetalt${Number(receivables.unpaidCount) === 1 ? " faktura" : "e fakturaer"}`;
    el("ecoOverdue").textContent = nok(receivables.overdueAmount);
    el("ecoOverdueFoot").textContent = `${receivables.overdueCount || 0} forfalt${Number(receivables.overdueCount) === 1 ? " faktura" : "e fakturaer"}`;
    el("ecoOverdueCard").classList.toggle("is-danger", Number(receivables.overdueCount) > 0);

    el("ecoSalesNet").textContent = nok(ytd.salesNet);
    el("ecoSalesGross").textContent = nok(ytd.salesGross);
    el("ecoPurchaseCost").textContent = nok(ytd.simplifiedPurchaseCost);
    el("ecoOperatingResult").textContent = nok(ytd.simplifiedOperatingResult);
    el("ecoUnpaidCount").textContent = String(receivables.unpaidCount || 0);
    el("ecoOutstandingDetail").textContent = nok(receivables.outstanding);
    el("ecoOverdueCount").textContent = String(receivables.overdueCount || 0);
    el("ecoOverdueDetail").textContent = nok(receivables.overdueAmount);

    const threshold = Number(vat.thresholdNok) || 50000;
    const sales = Number(vat.rolling12MonthsSalesNet) || 0;
    const progress = Math.max(0, Math.min(100, threshold > 0 ? (sales / threshold) * 100 : 0));
    el("ecoVatSales").textContent = nok(sales);
    el("ecoVatRemaining").textContent = vat.thresholdExceeded ? "Grensen passert" : `${nok(vat.remainingToThreshold)} igjen`;
    const track = el("ecoVatProgress");
    track.setAttribute("aria-valuenow", String(Math.min(threshold, Math.max(0, sales))));
    track.classList.toggle("is-near", progress >= 75 && !vat.thresholdExceeded);
    track.classList.toggle("is-over", Boolean(vat.thresholdExceeded));
    el("ecoVatProgressFill").style.width = `${vat.thresholdExceeded ? 100 : progress}%`;

    const state = el("ecoVatState");
    state.className = "eco-pill";
    if (vat.registeredInFiken) {
      state.textContent = "MVA-registrert i Fiken";
      state.classList.add("is-good");
    } else if (vat.thresholdExceeded) {
      state.textContent = "Krever kontroll";
      state.classList.add("is-danger");
    } else if (progress >= 75) {
      state.textContent = "Nærmer seg";
      state.classList.add("is-warn");
    } else {
      state.textContent = "Under varselgrensen";
      state.classList.add("is-good");
    }
    el("ecoVatNote").textContent = vat.basisNote || "MVA-vakten er et styringssignal, ikke en juridisk registreringsavgjørelse.";
    el("ecoLastSync").textContent = `Fiken ${dateTime(economy.generatedAt)}`;
  }

  function openAi(question) {
    const tryOpen = (attempt = 0) => {
      const launcher = document.getElementById("sorgulenAiLauncher");
      const input = document.getElementById("saiInput");
      const form = document.getElementById("saiForm");
      if (!launcher || !input || !form) {
        if (attempt < 12) window.setTimeout(() => tryOpen(attempt + 1), 120);
        return;
      }
      if (launcher.getAttribute("aria-expanded") !== "true") launcher.click();
      window.setTimeout(() => {
        input.value = question;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }, 100);
    };
    tryOpen();
  }

  async function load({ force = false } = {}) {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    setConnection("loading", "Kontrollerer Fiken…", "Henter siste registrerte økonomidata.");
    try {
      if (!key()) {
        setConnection("error", "Ikke innlogget", "Logg inn i admin på nytt.");
        window.location.href = "login.html";
        return;
      }
      status = (await api("/admin/fiken/status")).configured === undefined
        ? null
        : await api("/admin/fiken/status");
      // Status kalles kun én gang i normal flyt; guard over gjør gamle cache-responser ufarlige.
      if (!status) status = await api("/admin/fiken/status");
      await renderSetup();

      if (!status.configured) {
        economy = null;
        dashboard.hidden = true;
        setConnection("warn", "Fiken venter på API-nøkkel", "Legg FIKEN_API_TOKEN i Render. Resten av admin fungerer som før.");
        return;
      }

      const data = force
        ? await api("/admin/fiken/economy/refresh", { method: "POST", body: "{}" })
        : await api("/admin/fiken/economy");
      economy = data.economy || null;
      renderEconomy();
      const companyName = economy?.company?.name || status.company?.name || "Fiken";
      if (economy?.available) {
        setConnection(
          status.invoicingReady ? "live" : "warn",
          status.invoicingReady ? `Live fra ${companyName}` : `${companyName} er koblet`,
          status.invoicingReady ? "Fiken er regnskapskilden. Fakturering og økonomitall er klare." : "Økonomitall virker. Sett inntektskonto før fakturering fra admin."
        );
      }
    } catch (error) {
      dashboard.hidden = true;
      setConnection("error", "Fiken kunne ikke leses", error.message || "Ukjent feil");
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }

  async function syncOpen() {
    if (busy) return;
    busy = true;
    syncInvoices.disabled = true;
    const result = el("ecoSyncResult");
    result.className = "eco-sync-result";
    result.textContent = "Kontrollerer åpne Fiken-fakturaer…";
    try {
      const data = await api("/admin/fiken/invoices/sync-open", { method: "POST", body: "{}" });
      result.textContent = `${data.synced || 0} synkronisert · ${data.paid || 0} nye betalinger funnet${data.errors?.length ? ` · ${data.errors.length} feil` : ""}`;
      await load({ force: true });
    } catch (error) {
      result.classList.add("is-error");
      result.textContent = error.message || "Synk feilet";
    } finally {
      busy = false;
      syncInvoices.disabled = false;
    }
  }

  refresh?.addEventListener("click", () => load({ force: true }));
  forceRefresh?.addEventListener("click", () => load({ force: true }));
  syncInvoices?.addEventListener("click", syncOpen);
  document.querySelectorAll("[data-eco-ai]").forEach((button) => {
    button.addEventListener("click", () => openAi(button.dataset.ecoAi || "Gi meg en økonomisjekk."));
  });

  load();
})();
