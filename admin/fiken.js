(() => {
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  let current = null;
  let discovery = null;
  let bankCurrent = null;
  let bankSyncTimer = null;

  const el = (id) => document.getElementById(id);
  const statusMessage = el("statusMessage");

  function headers() {
    return { "Content-Type": "application/json", "x-admin-key": localStorage.getItem(KEY) || "" };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || "Kallet feilet"), { data, status: response.status });
    return data;
  }

  function message(text, error = false) {
    statusMessage.textContent = text || "";
    statusMessage.style.display = text ? "block" : "none";
    statusMessage.style.color = error ? "#ff9e98" : "#92deb0";
  }

  function fmtDate(value) {
    if (!value) return "Aldri";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Ukjent";
    return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function fillSelect(select, items, value, label, emptyText) {
    select.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyText;
    select.appendChild(empty);
    for (const item of items) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      option.dataset.meta = JSON.stringify(item.meta || {});
      if (String(item.value) === String(value || "")) option.selected = true;
      select.appendChild(option);
    }
  }

  function render(data) {
    current = data;
    const settings = data.settings || {};
    const ready = settings.readyForInvoices && settings.readyForPayments;
    const token = settings.tokenConfigured;

    el("connectionBadge").className = `fiken-badge ${ready ? "ok" : token ? "warn" : "error"}`;
    el("connectionBadge").textContent = ready ? "Klar" : token ? "Mangler oppsett" : "Ikke koblet";
    el("connectionTitle").textContent = ready
      ? `Koblet til ${settings.companyName || "Fiken"}`
      : token ? "API-nøkkel funnet – fullfør oppsettet" : "Fiken API-nøkkel mangler";
    el("connectionText").textContent = ready
      ? `Foretak: ${settings.companyName || settings.companySlug}. Nye fakturaer kan registreres i Fiken.`
      : token
        ? "Trykk «Test tilkobling» for å finne foretak, bankkonto og kontoer."
        : "Når API-nøkkelen er lagt inn på Render, kan resten av koblingen fullføres her.";

    el("autoRegister").checked = settings.autoRegisterInvoices !== false;
    el("autoPayments").checked = settings.autoSyncPayments !== false;
    el("enabled").checked = settings.enabled === true;

    el("linkedCount").textContent = data.linkedInvoices ?? 0;
    el("pendingCount").textContent = data.pendingInvoices ?? 0;
    el("errorCount").textContent = data.syncErrors ?? 0;
    el("unsettledCount").textContent = data.unsettledInvoices ?? 0;
    el("lastSyncText").textContent = `Siste betaling-/Fiken-synk: ${fmtDate(settings.lastSyncAt)}${settings.lastError ? ` · Feil: ${settings.lastError}` : ""}`;

    if (!discovery) {
      fillSelect(el("companySelect"),
        settings.companySlug ? [{ value: settings.companySlug, label: settings.companyName || settings.companySlug, meta: { organizationNumber: settings.organizationNumber } }] : [],
        settings.companySlug, "company", "Test tilkoblingen først");
      fillSelect(el("bankSelect"),
        settings.bankAccountCode ? [{ value: settings.bankAccountCode, label: settings.bankAccountNumber || settings.bankAccountCode, meta: { bankAccountNumber: settings.bankAccountNumber } }] : [],
        settings.bankAccountCode, "bank", "Velg bankkonto");
      fillSelect(el("incomeSelect"),
        settings.incomeAccount ? [{ value: settings.incomeAccount, label: settings.incomeAccount, meta: {} }] : [],
        settings.incomeAccount, "income", "Velg inntektskonto");
    }
  }

  function renderDiscovery(data) {
    discovery = data.discovery || {};
    const settings = data.settings || current?.settings || {};

    fillSelect(
      el("companySelect"),
      (discovery.companies || []).map((company) => ({
        value: company.slug,
        label: `${company.name} · org.nr. ${company.organizationNumber || "ukjent"}`,
        meta: company,
      })),
      settings.companySlug || discovery.selectedCompany?.slug,
      "company",
      "Velg foretak"
    );

    fillSelect(
      el("bankSelect"),
      (discovery.bankAccounts || []).map((account) => ({
        value: account.accountCode,
        label: `${account.name || "Bankkonto"} · ${account.bankAccountNumber || account.accountCode}`,
        meta: account,
      })),
      settings.bankAccountCode || discovery.suggestedBankAccountCode,
      "bank",
      "Velg bankkonto"
    );

    fillSelect(
      el("incomeSelect"),
      (discovery.incomeAccounts || []).map((account) => ({
        value: account.code,
        label: `${account.code} · ${account.name || "Inntektskonto"}`,
        meta: account,
      })),
      settings.incomeAccount,
      "income",
      "Velg inntektskonto"
    );
  }


  function fmtMinor(value, signed = false) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "–";
    const amount = n / 100;
    const prefix = signed && amount > 0 ? "+" : "";
    return `${prefix}${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} kr`;
  }

  function maskIban(value) {
    const text = String(value || "").replace(/\s+/g, "");
    if (!text) return "–";
    return text.length > 4 ? `•••• ${text.slice(-4)}` : text;
  }

  function isStoredRateLimit(settings = {}) {
    return settings.lastErrorCode === "rate_limited"
      || /429|too many requests|rate.?limit/i.test(String(settings.lastError || ""));
  }

  function relativeWait(target) {
    const ms = new Date(target || 0).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const minutes = Math.max(1, Math.ceil(ms / 60_000));
    if (minutes < 60) return minutes === 1 ? "1 min" : minutes + " min";
    const hours = Math.ceil(minutes / 60);
    return hours === 1 ? "1 time" : hours + " timer";
  }

  function updateBankSyncButton(settings = {}) {
    const button = el("bankSyncBtn");
    if (!button) return;
    if (bankSyncTimer) {
      clearInterval(bankSyncTimer);
      bankSyncTimer = null;
    }

    const refresh = () => {
      const connected = Boolean(settings.credentialsConfigured && settings.accountId);
      const retryAt = settings.nextSyncAllowedAt ? new Date(settings.nextSyncAllowedAt).getTime() : 0;
      const waiting = Number.isFinite(retryAt) && retryAt > Date.now();

      if (settings.syncInProgress) {
        button.disabled = true;
        button.textContent = "Synk pågår…";
        return;
      }
      if (waiting) {
        button.disabled = true;
        button.textContent = "Kan synkes om " + relativeWait(settings.nextSyncAllowedAt);
        return;
      }
      if (!connected || settings.autoSync === false) {
        button.disabled = true;
        button.textContent = "Banksynk ikke klar";
        return;
      }
      button.disabled = false;
      button.textContent = "Synk bank nå";
    };

    refresh();
    if (settings.nextSyncAllowedAt) {
      bankSyncTimer = setInterval(refresh, 30_000);
    }
  }

  function bankTransactionLabel(tx) {
    return tx.counterpartyName || tx.remittanceInformation || tx.note || "Banktransaksjon";
  }

  function renderBankTransactions(items = []) {
    const root = el("bankTransactions");
    root.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "bank-empty";
      empty.textContent = "Ingen banktransaksjoner importert ennå.";
      root.appendChild(empty);
      return;
    }

    for (const tx of items.slice(0, 12)) {
      const row = document.createElement("div");
      row.className = `bank-transaction ${tx.direction === "credit" ? "is-credit" : "is-debit"}`;

      const main = document.createElement("div");
      main.className = "bank-transaction-main";
      const title = document.createElement("strong");
      title.textContent = bankTransactionLabel(tx);
      const meta = document.createElement("span");
      const parts = [tx.bookingDate || tx.valueDate || "", tx.remittanceInformation || tx.referenceNumber || ""].filter(Boolean);
      meta.textContent = parts.join(" · ");
      main.append(title, meta);

      const side = document.createElement("div");
      side.className = "bank-transaction-side";
      const amount = document.createElement("strong");
      amount.textContent = fmtMinor(tx.amountMinor, true);
      const state = document.createElement("span");
      state.textContent = tx.matchStatus === "candidate"
        ? "Mulig fakturabetaling"
        : tx.matchStatus === "auto_matched" || tx.matchStatus === "manual_matched"
          ? "Matchet"
          : tx.direction === "credit" ? "Inn" : "Ut";
      side.append(amount, state);
      row.append(main, side);
      root.appendChild(row);
    }
  }

  function renderBank(data) {
    bankCurrent = data;
    const settings = data.settings || {};
    const connected = Boolean(settings.credentialsConfigured && settings.accountId);
    const warning = settings.lastError || "";
    const rateLimited = isStoredRateLimit(settings);
    const rateLimitActive = settings.rateLimited === true;
    const syncing = settings.syncInProgress === true;
    const healthy = connected && !warning;

    el("bankBadge").className = `fiken-badge ${syncing ? "syncing" : rateLimitActive ? "waiting" : healthy ? "ok" : connected ? "warn" : "error"}`;
    el("bankBadge").textContent = syncing ? "Synker" : rateLimitActive ? "Venter" : healthy ? "Live" : connected ? "Varsel" : "Ikke koblet";
    el("bankTitle").textContent = settings.bankName || "Open Banking";
    el("bankText").textContent = connected
      ? "Bedriftskontoen leses automatisk via open-banking.io."
      : settings.credentialsConfigured
        ? "Credentials er funnet, men bankkontoen er ikke valgt ennå."
        : "Open Banking-credentials mangler på serveren.";

    el("bankBalance").textContent = fmtMinor(settings.lastBalanceMinor);
    el("bankIncome").textContent = fmtMinor(data.month?.incomeMinor);
    el("bankExpense").textContent = fmtMinor(data.month?.expenseMinor);
    el("bankNet").textContent = fmtMinor(data.month?.netMinor, true);
    el("bankAccountText").textContent = `Konto: ${settings.accountName || "Bedriftskonto"} · ${maskIban(settings.accountIban)}`;
    el("bankSyncText").textContent = `Sist synkronisert: ${fmtDate(settings.lastSuccessfulSyncAt)}`;

    const warningEl = el("bankWarning");
    warningEl.classList.toggle("is-rate-limit", rateLimited);
    warningEl.hidden = !warning;
    if (!warning) {
      warningEl.textContent = "";
    } else if (rateLimited) {
      const wait = relativeWait(settings.nextSyncAllowedAt);
      warningEl.textContent = rateLimitActive && wait
        ? `Banken begrenser synk midlertidig. Siste bankdata er fortsatt tilgjengelig. Ny synk kan prøves om ${wait}.`
        : "Forrige banksynk ble midlertidig begrenset av banken. Siste bankdata er beholdt, og du kan prøve igjen nå.";
    } else {
      warningEl.textContent = `Banken ga et synkvarsel: ${warning}. Siste importerte data beholdes.`;
    }
    updateBankSyncButton(settings);

    const candidates = Array.isArray(data.candidates) ? data.candidates.length : 0;
    el("bankCandidateCount").textContent = candidates ? `${candidates} mulig fakturabetaling${candidates === 1 ? "" : "er"}` : "";
    el("bankMatchMode").textContent = settings.autoMatchPayments
      ? "Betalingsmatching: automatisk"
      : "Betalingsmatching: testmodus – automatikk av";
    renderBankTransactions(data.recent || []);
  }

  async function loadBank() {
    try {
      const data = await api("/admin/open-banking/status");
      renderBank(data);
    } catch (error) {
      el("bankBadge").className = "fiken-badge error";
      el("bankBadge").textContent = "Feil";
      el("bankText").textContent = error.message;
      el("bankTransactions").textContent = "";
    }
  }

  async function syncBank() {
    const button = el("bankSyncBtn");
    button.disabled = true;
    button.textContent = "Synkroniserer…";
    try {
      const data = await api("/admin/open-banking/sync", { method: "POST", body: "{}" });
      renderBank(data);
      const result = data.result || {};
      if (result.reason === "rate_limited") {
        const wait = relativeWait(result.retryAt || data.settings?.nextSyncAllowedAt);
        message(wait
          ? `Banken begrenser synk akkurat no. Siste data er beholdt. Nytt forsøk er mulig om ${wait}.`
          : "Banken begrenser synk akkurat no. Siste data er beholdt.");
      } else if (result.reason === "sync_in_progress") {
        message("Banksynk pågår allerede. Du trenger ikkje starte ein ny.");
      } else if (result.reason === "recently_synced") {
        const wait = relativeWait(result.retryAt || data.settings?.nextSyncAllowedAt);
        message(wait
          ? `Banken blei nettopp synkronisert. Ny manuell synk er mulig om ${wait}.`
          : "Banken blei nettopp synkronisert.");
      } else if (result.reason === "disabled" || result.reason === "credentials_missing") {
        message("Banksynk er ikkje klar ennå.", true);
      } else {
        const imported = Number(result.imported || 0);
        message(`Banksynk ferdig. ${imported} transaksjoner kontrollert.`);
      }
    } catch (error) {
      message(error.message, true);
    } finally {
      if (bankCurrent?.settings) updateBankSyncButton(bankCurrent.settings);
      else {
        button.disabled = false;
        button.textContent = "Synk bank nå";
      }
    }
  }

  async function load() {
    message("");
    const data = await api("/admin/fiken/status");
    render(data);
  }

  async function testConnection() {
    const button = el("testBtn");
    button.disabled = true;
    message("Tester Fiken-tilkoblingen…");
    try {
      const data = await api("/admin/fiken/test", { method: "POST", body: "{}" });
      current = { ...(current || {}), settings: data.settings };
      render(current);
      renderDiscovery(data);
      message(data.discovery?.selectedCompany
        ? `Tilkoblingen virker. Fant ${data.discovery.selectedCompany.name}.`
        : "Tilkoblingen virker, men riktig foretak må velges.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    message("Lagrer Fiken-oppsett…");
    try {
      const companyOption = el("companySelect").selectedOptions[0];
      const bankOption = el("bankSelect").selectedOptions[0];
      const companyMeta = companyOption?.dataset.meta ? JSON.parse(companyOption.dataset.meta) : {};
      const bankMeta = bankOption?.dataset.meta ? JSON.parse(bankOption.dataset.meta) : {};

      const payload = {
        companySlug: el("companySelect").value,
        companyName: companyMeta.name || current?.settings?.companyName || "",
        organizationNumber: companyMeta.organizationNumber || current?.settings?.organizationNumber || "",
        bankAccountCode: el("bankSelect").value,
        bankAccountNumber: bankMeta.bankAccountNumber || current?.settings?.bankAccountNumber || "",
        incomeAccount: el("incomeSelect").value,
        autoRegisterInvoices: el("autoRegister").checked,
        autoSyncPayments: el("autoPayments").checked,
        enabled: el("enabled").checked,
      };
      const data = await api("/admin/fiken/settings", { method: "PATCH", body: JSON.stringify(payload) });
      render(data);
      if (discovery) renderDiscovery({ discovery, settings: data.settings });
      message("Fiken-oppsettet er lagret.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function sync() {
    const button = el("syncBtn");
    button.disabled = true;
    message("Synkroniserer betalinger fra Fiken…");
    try {
      const data = await api("/admin/fiken/sync", { method: "POST", body: JSON.stringify({ limit: 150 }) });
      render(data);
      message(`Synk ferdig. Kontrollerte ${data.result?.checked || 0} fakturaer. ${data.result?.paid || 0} ble oppdatert til betalt.`);
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  el("settingsForm").addEventListener("submit", saveSettings);
  el("testBtn").addEventListener("click", testConnection);
  el("syncBtn").addEventListener("click", sync);
  el("bankSyncBtn").addEventListener("click", syncBank);
  el("refreshBtn").addEventListener("click", () => Promise.all([load(), loadBank()]));

  Promise.all([load(), loadBank()]).catch((error) => message(error.message, true));
})();
