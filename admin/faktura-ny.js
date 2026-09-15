(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const params = new URLSearchParams(location.search);
  const selectedWorkOrderId = String(params.get("workOrderId") || "").trim();

  const statusMessage = document.getElementById("statusMessage");
  const workOrderPicker = document.getElementById("workOrderPicker");
  const refInput = document.getElementById("refInput");
  const lookupBtn = document.getElementById("lookupBtn");
  const lookupResult = document.getElementById("lookupResult");
  const linesBody = document.getElementById("linesBody");
  const addLineBtn = document.getElementById("addLineBtn");
  const totalDisplay = document.getElementById("totalDisplay");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const invoiceDescription = document.getElementById("invoiceDescription");
  const ratesBtn = document.getElementById("ratesBtn");
  const ratesModal = document.getElementById("ratesModal");
  const ratesList = document.getElementById("ratesList");
  const closeRatesBtn = document.getElementById("closeRatesBtn");
  const serviceDateFrom = document.getElementById("serviceDateFrom");
  const serviceDateTo = document.getElementById("serviceDateTo");
  const serviceLocation = document.getElementById("serviceLocation");
  const paymentTermsHint = document.getElementById("paymentTermsHint");
  const vatHint = document.getElementById("vatHint");

  let rates = [];
  let vatRate = 0;
  let paymentTermsDays = 14;
  let source = { sourceType: "manual", sourceRef: null, sourceId: null, customerId: null };

  const fields = {
    name: document.getElementById("custName"),
    org: document.getElementById("custOrg"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
    postal: document.getElementById("custPostal"),
    city: document.getElementById("custCity"),
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
    return { "Content-Type": "application/json", "x-admin-key": getAdminKey() };
  }

  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message || "";
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = type === "error" ? "#ff8a8a" : "#8fe0a8";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function money(value) {
    const number = Number(value);
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(number) ? number : 0)} kr`;
  }

  function unitLabel(unit) {
    if (unit === "hour") return "time";
    if (unit === "fixed") return "oppdrag";
    if (unit === "distance") return "km";
    if (unit === "other") return "enhet";
    return "stk";
  }

  async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: headers() });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw new Error("Admin-tilgangen må fornyes. Last siden på nytt.");
    }
    if (!response.ok) throw new Error(data.error || "Kunne ikke hente data");
    return data;
  }

  function fillCustomer(customer = {}) {
    fields.name.value = customer.name || "";
    fields.phone.value = customer.phone || "";
    fields.email.value = customer.email || "";
    fields.address.value = customer.address || "";
    fields.postal.value = customer.postalCode || "";
    fields.city.value = customer.city || "";
    fields.org.value = customer.organizationNumber || "";
  }

  function addLine(item = "", amount = "", details = {}) {
    const quantity = details.quantity ?? 1;
    const unit = details.unit || "fixed";
    const unitPrice = details.unitPrice ?? amount ?? "";
    const tr = document.createElement("tr");
    tr.dataset.rateCode = details.rateCode || "";
    tr.innerHTML = `
      <td><input type="text" class="line-item" placeholder="Arbeid/beskrivelse" value="${esc(item)}"><input type="text" class="line-description" placeholder="Detaljer (valgfritt)" value="${esc(details.description || "")}" style="margin-top:5px"></td>
      <td><input type="number" class="line-quantity" min="0.01" step="0.01" inputmode="decimal" value="${esc(quantity)}"></td>
      <td><select class="line-unit">
        <option value="hour" ${unit === "hour" ? "selected" : ""}>timer</option>
        <option value="fixed" ${unit === "fixed" ? "selected" : ""}>oppdrag</option>
        <option value="quantity" ${unit === "quantity" ? "selected" : ""}>stk</option>
        <option value="distance" ${unit === "distance" ? "selected" : ""}>km</option>
        <option value="other" ${unit === "other" ? "selected" : ""}>annet</option>
      </select></td>
      <td><input type="number" class="line-price" min="0" step="0.01" inputmode="decimal" value="${esc(unitPrice)}"></td>
      <td class="line-total">0 kr</td>
      <td><button class="btn-remove-line" type="button" aria-label="Fjern linje">✕</button></td>`;
    tr.querySelectorAll("input,select").forEach((element) => element.addEventListener("input", updateTotal));
    tr.querySelector(".btn-remove-line").addEventListener("click", () => {
      tr.remove();
      updateTotal();
    });
    linesBody.appendChild(tr);
    updateTotal();
  }

  function getLines() {
    return Array.from(linesBody.querySelectorAll("tr")).map((tr) => {
      const quantity = Number(tr.querySelector(".line-quantity").value) || 0;
      const unitPrice = Number(tr.querySelector(".line-price").value) || 0;
      const unit = tr.querySelector(".line-unit").value;
      return {
        item: tr.querySelector(".line-item").value.trim(),
        description: tr.querySelector(".line-description").value.trim(),
        quantity,
        unit,
        unitLabel: unitLabel(unit),
        unitPrice,
        amount: Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100,
        rateCode: tr.dataset.rateCode || "",
      };
    }).filter((line) => line.item);
  }

  function updateTotal() {
    for (const tr of linesBody.querySelectorAll("tr")) {
      const q = Number(tr.querySelector(".line-quantity").value) || 0;
      const p = Number(tr.querySelector(".line-price").value) || 0;
      tr.querySelector(".line-total").textContent = money(Math.round((q * p + Number.EPSILON) * 100) / 100);
    }
    const subtotal = getLines().reduce((sum, line) => sum + line.amount, 0);
    const tax = Math.round((subtotal * vatRate / 100 + Number.EPSILON) * 100) / 100;
    totalDisplay.textContent = vatRate
      ? `Delsum: ${money(subtotal)} · MVA ${vatRate}%: ${money(tax)} · Total: ${money(subtotal + tax)}`
      : `Total: ${money(subtotal)}`;
  }

  function estimatedOrderTotal(order) {
    const base = Number(order.calculatedAmount || 0);
    const expenses = (order.additionalCosts || [])
      .filter((entry) => entry.billable !== false)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const materials = (order.materials || [])
      .filter((entry) => entry.billable !== false && entry.unitPrice != null)
      .reduce((sum, entry) => sum + Number(entry.quantity || 0) * Number(entry.unitPrice || 0), 0);
    return base + expenses + materials;
  }

  async function renderWorkOrderPicker() {
    if (!workOrderPicker) return;
    if (selectedWorkOrderId) {
      workOrderPicker.innerHTML = `<div class="lookup-result">Henter valgt oppdrag…</div>`;
      return;
    }

    try {
      const data = await apiGet("/admin/work-orders?limit=200");
      const orders = (Array.isArray(data.workOrders) ? data.workOrders : [])
        .filter((order) => order.status === "completed" && !order.invoiceId)
        .sort((a, b) => new Date(b.completedAt || b.updatedAt || b.createdAt || 0) - new Date(a.completedAt || a.updatedAt || a.createdAt || 0));

      if (!orders.length) {
        workOrderPicker.innerHTML = `<p class="hint">Ingen ferdigstilte oppdrag uten faktura akkurat nå. Du kan fortsatt lage en manuell faktura under.</p>`;
        return;
      }

      workOrderPicker.innerHTML = `<div class="invoice-workorder-list">${orders.map((order) => {
        const customer = order.customerSnapshot || {};
        const amount = estimatedOrderTotal(order);
        return `<a class="invoice-workorder-row" href="faktura-ny.html?workOrderId=${encodeURIComponent(order._id)}">
          <span><strong>${esc(customer.name || "Ukjent kunde")}</strong><small>${esc(order.serviceName || "Oppdrag")} · ${esc(order.jobDate || "")}</small></span>
          <span>${amount > 0 ? esc(money(amount)) : "Åpne"} ›</span>
        </a>`;
      }).join("")}</div>`;
    } catch (error) {
      workOrderPicker.innerHTML = `<p class="lookup-fail">${esc(error.message)}</p>`;
    }
  }

  async function loadWorkOrder(workOrderId) {
    try {
      const data = await apiGet(`/invoices/work-order/${encodeURIComponent(workOrderId)}`);
      fillCustomer(data.customer || {});
      invoiceDescription.value = data.description || "";
      serviceDateFrom.value = data.serviceDateFrom || "";
      serviceDateTo.value = data.serviceDateTo && data.serviceDateTo !== data.serviceDateFrom ? data.serviceDateTo : "";
      serviceLocation.value = data.serviceLocation || data.customer?.address || "";
      source = {
        sourceType: data.sourceType,
        sourceRef: data.sourceRef,
        sourceId: data.sourceId,
        customerId: data.customerId || null,
      };
      linesBody.innerHTML = "";
      (data.lines || []).forEach((line) => addLine(line.item, line.amount, line));
      if (!linesBody.children.length) addLine();

      const total = Number(data.totals?.amount ?? data.basis?.amount ?? 0);
      workOrderPicker.innerHTML = `
        <div class="invoice-workorder-selected">
          <strong>${esc(data.customer?.name || "Kunde")}</strong>
          <span>${esc(data.description || "Utført arbeid")}</span>
          <span>${esc(data.serviceDateFrom || "")}${total > 0 ? ` · ${esc(money(total))}` : ""}</span>
        </div>
        <p class="hint">Alle feltene under er fylt fra oppdraget. Kontroller dem før du lagrer.</p>
        <div class="invoice-source-links"><a class="quiet-link" href="oppdrag.html?open=${encodeURIComponent(workOrderId)}">← Til oppdraget</a><a class="quiet-link" href="faktura-ny.html">Velg et annet oppdrag</a></div>`;
    } catch (error) {
      setMessage(error.message || "Kunne ikke hente oppdraget", "error");
      workOrderPicker.innerHTML = `<p class="lookup-fail">${esc(error.message || "Kunne ikke hente oppdraget")}</p><a class="quiet-link" href="faktura-ny.html">Velg et annet oppdrag</a>`;
      if (!linesBody.children.length) addLine();
    }
  }

  async function lookupLegacyReference() {
    const ref = refInput.value.trim();
    if (!ref) {
      lookupResult.innerHTML = `<span class="lookup-fail">Skriv inn et referansenummer.</span>`;
      return;
    }
    lookupResult.textContent = "Søker…";
    try {
      const data = await apiGet(`/invoices/lookup/${encodeURIComponent(ref)}`);
      if (!data.found) {
        lookupResult.innerHTML = `<span class="lookup-fail">Fant ingen bestilling eller forespørsel med referanse ${esc(ref)}.</span>`;
        return;
      }

      fillCustomer(data.customer || {});
      source = { sourceType: data.sourceType, sourceRef: data.sourceRef, sourceId: data.sourceId, customerId: data.customerId || null };
      invoiceDescription.value = data.description || "";
      serviceDateFrom.value = data.serviceDateFrom || "";
      serviceDateTo.value = data.serviceDateTo && data.serviceDateTo !== data.serviceDateFrom ? data.serviceDateTo : "";
      serviceLocation.value = data.serviceLocation || data.customer?.address || "";
      linesBody.innerHTML = "";
      addLine(data.description || "Utført arbeid", data.amount != null ? data.amount : "");

      const sourceName = data.sourceType === "booking" ? "bestilling" : "forespørsel";
      lookupResult.innerHTML = `<span class="lookup-ok">✓ Hentet fra ${sourceName} #${esc(ref)}.</span>`;
    } catch (error) {
      lookupResult.innerHTML = `<span class="lookup-fail">${esc(error.message || "Oppslag feilet")}</span>`;
    }
  }

  async function save() {
    const name = fields.name.value.trim();
    if (!name) {
      setMessage("Kundenavn er påkrevd.", "error");
      fields.name.focus();
      return;
    }

    const lines = getLines();
    if (!lines.length) {
      setMessage("Legg til minst én fakturalinje.", "error");
      return;
    }
    if (lines.some((line) => !(line.quantity > 0) || line.unitPrice < 0)) {
      setMessage("Kontroller mengde og sats på fakturalinjene.", "error");
      return;
    }
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!(amount > 0)) {
      setMessage("Totalbeløpet må være større enn 0.", "error");
      return;
    }

    saveBtn.disabled = true;
    setMessage("Lagrer fakturautkast…");
    try {
      const response = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          customerName: name,
          customerOrganizationNumber: fields.org.value.trim(),
          customerPhone: fields.phone.value.trim(),
          customerEmail: fields.email.value.trim(),
          customerAddress: fields.address.value.trim(),
          customerPostalCode: fields.postal.value.trim(),
          customerCity: fields.city.value.trim(),
          description: invoiceDescription.value.trim() || lines.map((line) => line.item).join(", "),
          serviceDateFrom: serviceDateFrom.value || "",
          serviceDateTo: serviceDateTo.value || serviceDateFrom.value || "",
          serviceLocation: serviceLocation.value.trim(),
          lines,
          amount,
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          sourceId: source.sourceId,
          customerId: source.customerId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke lagre utkastet");
      location.href = `faktura-detalj.html?id=${encodeURIComponent(data.invoice._id)}`;
    } catch (error) {
      setMessage(error.message || "Kunne ikke lagre fakturautkastet", "error");
      saveBtn.disabled = false;
    }
  }

  async function openRates() {
    ratesModal.classList.remove("hidden");
    ratesList.textContent = "Henter satser…";
    try {
      const data = await apiGet("/admin/rates");
      rates = data.rates || [];
      const groups = rates.reduce((all, rate) => {
        (all[rate.category] ||= []).push(rate);
        return all;
      }, {});
      ratesList.innerHTML = Object.entries(groups).map(([category, items]) => `
        <section class="rate-category"><h4>${esc(category)}</h4><div class="rate-grid">${items.map((rate) => `
          <button type="button" class="rate-option" data-code="${esc(rate.code)}">${esc(rate.name)}<span>${money(rate.defaultRate)} / ${esc(rate.unitLabel)}</span></button>`).join("")}</div></section>`).join("");
    } catch (error) {
      ratesList.textContent = error.message || "Kunne ikke hente satser";
    }
  }

  async function loadConfig() {
    try {
      const data = await apiGet("/invoices/config");
      vatRate = Number(data.vatRate) || 0;
      paymentTermsDays = Number(data.defaultDueDays) || 14;
      paymentTermsHint.textContent = `Fakturanummer og fakturadato settes ved utstedelse. Forfallsdato settes automatisk ${paymentTermsDays} dager etter fakturadato.`;
      vatHint.textContent = data.vatRegistered
        ? `MVA beregnes av serveren med sats ${vatRate} %.`
        : "Merverdiavgift beregnes ikke fordi virksomheten ikke er registrert i Merverdiavgiftsregisteret.";
      updateTotal();
    } catch (_) {
      paymentTermsHint.textContent = "Fakturanummer, fakturadato og forfallsdato settes automatisk når fakturaen utstedes.";
    }
  }

  lookupBtn.addEventListener("click", lookupLegacyReference);
  refInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") lookupLegacyReference();
  });
  addLineBtn.addEventListener("click", () => addLine());
  ratesBtn.addEventListener("click", openRates);
  closeRatesBtn.addEventListener("click", () => ratesModal.classList.add("hidden"));
  ratesList.addEventListener("click", (event) => {
    const button = event.target.closest(".rate-option");
    if (!button) return;
    const rate = rates.find((item) => item.code === button.dataset.code);
    if (!rate) return;
    if (linesBody.querySelectorAll("tr").length === 1 && !getLines()[0]?.item) linesBody.innerHTML = "";
    addLine(rate.name, rate.defaultRate, { quantity: 1, unit: rate.unit, unitPrice: rate.defaultRate, rateCode: rate.code });
    ratesModal.classList.add("hidden");
  });
  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => {
    location.href = selectedWorkOrderId ? `oppdrag.html?open=${encodeURIComponent(selectedWorkOrderId)}` : "fakturaer.html";
  });

  const style = document.createElement("style");
  style.textContent = `
    .invoice-workorder-list{display:grid;gap:8px;margin-top:12px}
    .invoice-workorder-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;border:1px solid #33465e;border-radius:14px;background:#101b2a;color:inherit!important;text-decoration:none!important}
    .invoice-workorder-row span:first-child{display:grid;gap:4px}.invoice-workorder-row small{color:#9eacbd}.invoice-workorder-row>span:last-child{white-space:nowrap;font-weight:800}
    .invoice-workorder-selected{display:grid;gap:5px;padding:14px;border:1px solid #33465e;border-radius:14px;background:#101b2a;margin:10px 0}.invoice-workorder-selected span{color:#aab7c8}
    .invoice-source-links{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between}
    .invoice-auto-doc-info{border-color:#33465e;background:#111a27}
    #legacyReferenceLookup summary{cursor:pointer;padding:4px 0}
  `;
  document.head.appendChild(style);

  loadConfig();
  if (selectedWorkOrderId) loadWorkOrder(selectedWorkOrderId);
  else {
    addLine();
    renderWorkOrderPicker();
  }
})();
