(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const statusMessage = document.getElementById("statusMessage");
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

  const f = {
    name: document.getElementById("custName"),
    org: document.getElementById("custOrg"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
    postal: document.getElementById("custPostal"),
    city: document.getElementById("custCity"),
  };

  let source = { sourceType: "manual", sourceRef: null, sourceId: null, customerId: null };

  function getAdminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }
  function headers() { return { "Content-Type": "application/json", "x-admin-key": getAdminKey() }; }
  function setMessage(message, type = "info") {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = type === "error" ? "#ff8a8a" : "#8fe0a8";
    if (message && type !== "error") setTimeout(() => { statusMessage.style.display = "none"; }, 3500);
  }
  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0 kr";
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(n)} kr`;
  }
  function unitLabel(unit) {
    if (unit === "hour") return "time";
    if (unit === "fixed") return "oppdrag";
    if (unit === "distance") return "km";
    if (unit === "other") return "enhet";
    return "stk";
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
    tr.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", updateTotal));
    tr.querySelector(".btn-remove-line").addEventListener("click", () => { tr.remove(); updateTotal(); });
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

  function fillCustomer(customer = {}) {
    f.name.value = customer.name || "";
    f.phone.value = customer.phone || "";
    f.email.value = customer.email || "";
    f.address.value = customer.address || "";
    f.postal.value = customer.postalCode || "";
    f.city.value = customer.city || "";
    f.org.value = customer.organizationNumber || "";
  }

  async function lookup() {
    const ref = refInput.value.trim();
    if (!ref) {
      lookupResult.innerHTML = `<span class="lookup-fail">Skriv inn et referansenummer.</span>`;
      return;
    }
    lookupResult.textContent = "Søker…";
    try {
      const res = await fetch(`${API_BASE}/invoices/lookup/${encodeURIComponent(ref)}`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Oppslag feilet");
      if (!data.found) {
        lookupResult.innerHTML = `<span class="lookup-fail">Fant ingen bestilling eller forespørsel med referanse ${esc(ref)}.</span>`;
        return;
      }

      fillCustomer(data.customer);
      source = { sourceType: data.sourceType, sourceRef: data.sourceRef, sourceId: data.sourceId, customerId: data.customerId || null };
      invoiceDescription.value = data.description || "";
      serviceDateFrom.value = data.serviceDateFrom || "";
      serviceDateTo.value = data.serviceDateTo && data.serviceDateTo !== data.serviceDateFrom ? data.serviceDateTo : "";
      serviceLocation.value = data.serviceLocation || data.customer?.address || "";
      linesBody.innerHTML = "";
      addLine(data.description || "Utført arbeid", data.amount != null ? data.amount : "");

      const sourceLabel = data.sourceType === "booking" ? "bestilling" : "forespørsel";
      lookupResult.innerHTML = `<span class="lookup-ok">✓ Hentet fra ${sourceLabel} #${esc(ref)}. Kontroller arbeidsdato og arbeidssted før utstedelse.</span>`;
    } catch (err) {
      lookupResult.innerHTML = `<span class="lookup-fail">${esc(err.message || "Noe gikk galt")}</span>`;
    }
  }

  async function save() {
    const name = f.name.value.trim();
    if (!name) { setMessage("Kundenavn er påkrevd.", "error"); f.name.focus(); return; }
    const lines = getLines();
    if (!lines.length) { setMessage("Legg til minst én fakturalinje.", "error"); return; }
    if (lines.some((line) => !(line.quantity > 0) || line.unitPrice < 0)) { setMessage("Kontroller mengde og sats på fakturalinjene.", "error"); return; }
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!(amount > 0)) { setMessage("Totalbeløpet må være større enn 0.", "error"); return; }

    saveBtn.disabled = true;
    setMessage("Lagrer fakturautkast…");
    try {
      const res = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          customerName: name,
          customerOrganizationNumber: f.org.value.trim(),
          customerPhone: f.phone.value.trim(),
          customerEmail: f.email.value.trim(),
          customerAddress: f.address.value.trim(),
          customerPostalCode: f.postal.value.trim(),
          customerCity: f.city.value.trim(),
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke lagre utkastet");
      setMessage("Fakturautkast lagret. ✓", "success");
      setTimeout(() => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(data.invoice._id)}`; }, 500);
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
      saveBtn.disabled = false;
    }
  }

  async function openRates() {
    ratesModal.classList.remove("hidden");
    try {
      const res = await fetch(`${API_BASE}/admin/rates`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente satser");
      rates = data.rates || [];
      const groups = rates.reduce((all, rate) => { (all[rate.category] ||= []).push(rate); return all; }, {});
      ratesList.innerHTML = Object.entries(groups).map(([category, items]) => `<section class="rate-category"><h4>${esc(category)}</h4><div class="rate-grid">${items.map((r) => `<button type="button" class="rate-option" data-code="${esc(r.code)}">${esc(r.name)}<span>${money(r.defaultRate)} / ${esc(r.unitLabel)}</span></button>`).join("")}</div></section>`).join("");
    } catch (err) {
      ratesList.textContent = err.message || "Kunne ikke hente satser";
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/invoices/config`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) return;
      vatRate = Number(data.vatRate) || 0;
      paymentTermsDays = Number(data.defaultDueDays) || 14;
      paymentTermsHint.textContent = `Forfallsdato settes automatisk til ${paymentTermsDays} dager etter fakturadato når fakturaen utstedes.`;
      vatHint.textContent = data.vatRegistered
        ? `MVA beregnes av serveren med sats ${vatRate} %.`
        : "Merverdiavgift beregnes ikke fordi virksomheten ikke er registrert i Merverdiavgiftsregisteret.";
      updateTotal();
    } catch (_) {}
  }

  async function loadWorkOrder(workOrderId) {
    try {
      const res = await fetch(`${API_BASE}/invoices/work-order/${encodeURIComponent(workOrderId)}`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente oppdraget");
      fillCustomer(data.customer || {});
      invoiceDescription.value = data.description || "";
      serviceDateFrom.value = data.serviceDateFrom || "";
      serviceDateTo.value = data.serviceDateTo && data.serviceDateTo !== data.serviceDateFrom ? data.serviceDateTo : "";
      serviceLocation.value = data.serviceLocation || data.customer?.address || "";
      source = { sourceType: data.sourceType, sourceRef: data.sourceRef, sourceId: data.sourceId, customerId: data.customerId || null };
      linesBody.innerHTML = "";
      (data.lines || []).forEach((line) => addLine(line.item, line.amount, line));
      if (!linesBody.children.length) addLine();
    } catch (err) {
      setMessage(err.message || "Kunne ikke hente oppdraget", "error");
      if (!linesBody.children.length) addLine();
    }
  }

  lookupBtn.addEventListener("click", lookup);
  refInput.addEventListener("keydown", (e) => { if (e.key === "Enter") lookup(); });
  addLineBtn.addEventListener("click", () => addLine());
  ratesBtn.addEventListener("click", openRates);
  closeRatesBtn.addEventListener("click", () => ratesModal.classList.add("hidden"));
  ratesList.addEventListener("click", (e) => {
    const btn = e.target.closest(".rate-option");
    if (!btn) return;
    const rate = rates.find((item) => item.code === btn.dataset.code);
    if (!rate) return;
    if (linesBody.querySelectorAll("tr").length === 1 && !getLines()[0]?.item) linesBody.innerHTML = "";
    addLine(rate.name, rate.defaultRate, { quantity: 1, unit: rate.unit, unitPrice: rate.defaultRate, rateCode: rate.code });
    ratesModal.classList.add("hidden");
  });
  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => { window.location.href = "fakturaer.html"; });

  loadConfig();
  const workOrderId = new URLSearchParams(location.search).get("workOrderId");
  if (workOrderId) loadWorkOrder(workOrderId);
  else addLine();
})();
