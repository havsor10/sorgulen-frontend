(() => {
  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  let current = null;
  let discovery = null;

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
    if (!response.ok) throw Object.assign(new Error(data?.error || "Fiken-kallet feilet"), { data, status: response.status });
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
  el("refreshBtn").addEventListener("click", load);

  load().catch((error) => message(error.message, true));
})();
