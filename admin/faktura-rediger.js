(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const statusMessage = document.getElementById("statusMessage");
  const linesBody = document.getElementById("linesBody");
  const addLineBtn = document.getElementById("addLineBtn");
  const totalDisplay = document.getElementById("totalDisplay");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const invoiceDescription = document.getElementById("invoiceDescription");
  const aiLinesBtn = document.getElementById("aiLinesBtn");
  const serviceDateFrom = document.getElementById("serviceDateFrom");
  const serviceDateTo = document.getElementById("serviceDateTo");
  const serviceLocation = document.getElementById("serviceLocation");
  const paymentTermsHint = document.getElementById("paymentTermsHint");
  const vatHint = document.getElementById("vatHint");
  const backLink = document.getElementById("backLink");
  const discountType = document.getElementById("discountType");
  const discountValue = document.getElementById("discountValue");
  const discountLabel = document.getElementById("discountLabel");
  const discountPreview = document.getElementById("discountPreview");

  let vatRate = 0;
  const f = {
    name: document.getElementById("custName"),
    org: document.getElementById("custOrg"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
    postal: document.getElementById("custPostal"),
    city: document.getElementById("custCity"),
  };

  const invoiceId = new URLSearchParams(window.location.search).get("id");
  if (invoiceId && backLink) backLink.href = `faktura-detalj.html?id=${encodeURIComponent(invoiceId)}`;

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
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)} kr`;
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
      <td><input type="text" class="line-item" placeholder="Beskrivelse" value="${esc(item)}"><input type="text" class="line-description" placeholder="Detaljer (valgfritt)" value="${esc(details.description || "")}" style="margin-top:5px"></td>
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
    tr.querySelectorAll("input,select").forEach((field) => field.addEventListener("input", updateTotal));
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

  function discountFor(gross) {
    const type = discountType?.value || "none";
    const rawValue = Number(discountValue?.value || 0);
    if (type === "none" || !(rawValue > 0)) return { type: "none", value: 0, amount: 0, error: "" };
    if (type === "percent") {
      if (rawValue > 100) return { type, value: rawValue, amount: 0, error: "Prosent-rabatt kan ikke være over 100 %." };
      return { type, value: rawValue, amount: Math.round((gross * rawValue / 100 + Number.EPSILON) * 100) / 100, error: "" };
    }
    if (rawValue > gross) return { type, value: rawValue, amount: 0, error: "Fast rabatt kan ikke være større enn summen før rabatt." };
    return { type: "fixed", value: rawValue, amount: Math.round((rawValue + Number.EPSILON) * 100) / 100, error: "" };
  }

  function updateDiscountInputs() {
    if (!discountType || !discountValue) return;
    const enabled = discountType.value !== "none";
    discountValue.disabled = !enabled;
    discountLabel.disabled = !enabled;
    discountValue.placeholder = discountType.value === "percent" ? "F.eks. 10" : "F.eks. 500";
    discountValue.max = discountType.value === "percent" ? "100" : "";
    if (!enabled) discountValue.value = "0";
  }

  function updateTotal() {
    for (const tr of linesBody.querySelectorAll("tr")) {
      const q = Number(tr.querySelector(".line-quantity").value) || 0;
      const p = Number(tr.querySelector(".line-price").value) || 0;
      tr.querySelector(".line-total").textContent = money(Math.round((q * p + Number.EPSILON) * 100) / 100);
    }
    const gross = Math.round((getLines().reduce((sum, line) => sum + line.amount, 0) + Number.EPSILON) * 100) / 100;
    const discount = discountFor(gross);
    const subtotal = Math.round(((gross - discount.amount) + Number.EPSILON) * 100) / 100;
    const tax = Math.round((subtotal * vatRate / 100 + Number.EPSILON) * 100) / 100;
    const total = Math.round((subtotal + tax + Number.EPSILON) * 100) / 100;
    const saving = Math.round((discount.amount * (1 + vatRate / 100) + Number.EPSILON) * 100) / 100;

    if (discount.error) {
      discountPreview.hidden = false;
      discountPreview.classList.add("is-error");
      discountPreview.textContent = discount.error;
    } else if (discount.type !== "none" && discount.amount > 0) {
      discountPreview.hidden = false;
      discountPreview.classList.remove("is-error");
      const label = discountLabel.value.trim() || "Kunderabatt";
      const suffix = discount.type === "percent" ? ` (${discount.value} %)` : "";
      discountPreview.innerHTML = `
        <strong>🎁 Kunden får rabatt</strong>
        <span>Sum før rabatt: ${money(gross)}</span>
        <span>${esc(label)}${suffix}: −${money(discount.amount)}</span>
        <strong>Du sparer kunden ${money(saving)}</strong>`;
    } else {
      discountPreview.hidden = true;
      discountPreview.classList.remove("is-error");
      discountPreview.textContent = "";
    }

    totalDisplay.textContent = vatRate
      ? `Sum før rabatt: ${money(gross)} · Rabatt: ${money(discount.amount)} · MVA ${vatRate}%: ${money(tax)} · Total: ${money(total)}`
      : discount.amount > 0
        ? `Sum før rabatt: ${money(gross)} · Rabatt: −${money(discount.amount)} · Total: ${money(total)}`
        : `Total: ${money(total)}`;
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/invoices/config`, { headers: headers() });
      const data = await res.json();
      if (!res.ok) return;
      paymentTermsHint.textContent = `Forfallsdato settes automatisk til ${Number(data.defaultDueDays) || 14} dager etter fakturadato ved utstedelse.`;
      vatHint.textContent = data.vatRegistered
        ? `MVA beregnes av serveren med sats ${Number(data.vatRate) || 0} %.`
        : "Merverdiavgift beregnes ikke fordi virksomheten ikke er registrert i Merverdiavgiftsregisteret.";
    } catch (_) {}
  }

  async function loadInvoice() {
    if (!invoiceId) { setMessage("Mangler faktura-ID.", "error"); saveBtn.disabled = true; return; }
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente faktura");
      const inv = data.invoice;
      if (inv.status !== "draft" || inv.invoiceNumber) {
        setMessage("Denne fakturaen er utstedt og låst. Bruk kreditnota ved feil.", "error");
        saveBtn.disabled = true;
        aiLinesBtn.disabled = true;
        return;
      }

      vatRate = inv.vatRegisteredSnapshot ? Number(inv.taxRate || 0) : 0;
      f.name.value = inv.customerName || "";
      f.org.value = inv.customerOrganizationNumber || "";
      f.phone.value = inv.customerPhone || "";
      f.email.value = inv.customerEmail || "";
      f.address.value = inv.customerAddress || "";
      f.postal.value = inv.customerPostalCode || "";
      f.city.value = inv.customerCity || "";
      invoiceDescription.value = inv.description || "";
      serviceDateFrom.value = inv.serviceDateFrom || "";
      serviceDateTo.value = inv.serviceDateTo && inv.serviceDateTo !== inv.serviceDateFrom ? inv.serviceDateTo : "";
      serviceLocation.value = inv.serviceLocation || "";
      discountType.value = inv.discountType || "none";
      discountValue.value = Number(inv.discountValue || 0);
      discountLabel.value = inv.discountLabel || "Kunderabatt";
      updateDiscountInputs();

      linesBody.innerHTML = "";
      (inv.lines || []).forEach((line) => addLine(line.item, line.amount, line));
      if (!linesBody.children.length) addLine();
      updateTotal();
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
      saveBtn.disabled = true;
    }
  }

  async function save() {
    const name = f.name.value.trim();
    if (!name) { setMessage("Kundenavn er påkrevd.", "error"); f.name.focus(); return; }
    const lines = getLines();
    if (!lines.length) { setMessage("Legg til minst én fakturalinje.", "error"); return; }
    if (lines.some((line) => !(line.quantity > 0) || line.unitPrice < 0)) { setMessage("Kontroller mengde og sats på fakturalinjene.", "error"); return; }
    const gross = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!(gross > 0)) { setMessage("Totalbeløpet må være større enn 0.", "error"); return; }
    const discount = discountFor(gross);
    if (discount.error) { setMessage(discount.error, "error"); discountValue.focus(); return; }
    if (discount.type !== "none" && !(discount.value > 0)) { setMessage("Skriv inn rabatten du vil gi.", "error"); discountValue.focus(); return; }
    if (discount.amount >= gross) { setMessage("Rabatten kan ikke gjøre fakturaen til 0 kr. eller mindre.", "error"); discountValue.focus(); return; }

    saveBtn.disabled = true;
    setMessage("Lagrer endringer…");
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, {
        method: "PATCH",
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
          discountType: discount.type,
          discountValue: discount.value,
          discountLabel: discount.type === "none" ? "Kunderabatt" : (discountLabel.value.trim() || "Kunderabatt"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke lagre");
      setMessage("Endringer lagret. ✓", "success");
      setTimeout(() => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(invoiceId)}`; }, 500);
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
      saveBtn.disabled = false;
    }
  }

  discountType.addEventListener("change", () => { updateDiscountInputs(); updateTotal(); });
  discountValue.addEventListener("input", updateTotal);
  discountLabel.addEventListener("input", updateTotal);
  updateDiscountInputs();

  addLineBtn.addEventListener("click", () => addLine());
  aiLinesBtn.addEventListener("click", async () => {
    aiLinesBtn.disabled = true;
    setMessage("Lager forslag til tydeligere fakturatekst…");
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}/ai-lines`, { method: "POST", headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kunne ikke lage forslag");
      linesBody.innerHTML = "";
      (data.lines || []).forEach((line) => addLine(line.item, line.amount, line));
      if (!linesBody.children.length) addLine();
      setMessage(data.aiAvailable ? "Forslaget er satt inn. Kontroller og lagre." : "AI var ikke tilgjengelig. Eksisterende linjer er beholdt.", "success");
    } catch (error) {
      setMessage(error.message || "Kunne ikke lage forslag", "error");
    } finally {
      aiLinesBtn.disabled = false;
    }
  });
  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => { window.location.href = invoiceId ? `faktura-detalj.html?id=${encodeURIComponent(invoiceId)}` : "fakturaer.html"; });

  loadConfig();
  loadInvoice();
})();
