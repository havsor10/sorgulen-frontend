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
  const logoutBtn = document.getElementById("logoutBtn");
  const invoiceDescription = document.getElementById("invoiceDescription");
  const ratesBtn = document.getElementById("ratesBtn");
  const ratesModal = document.getElementById("ratesModal");
  const ratesList = document.getElementById("ratesList");
  const closeRatesBtn = document.getElementById("closeRatesBtn");
  let rates = [];
  let vatRate = 0;

  const f = {
    name: document.getElementById("custName"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
  };

  // Kilde-info fra oppslag (tom = manuell faktura)
  let source = { sourceType: "manual", sourceRef: null, sourceId: null, customerId: null };

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
    if (type !== "error") setTimeout(() => { statusMessage.style.display = "none"; }, 3500);
  }

  // --- Linjer ---
  function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
  function addLine(item = "", amount = "", details = {}) {
    const quantity = details.quantity ?? 1;
    const unit = details.unit || "fixed";
    const unitPrice = details.unitPrice ?? amount ?? "";
    const tr = document.createElement("tr");
    tr.dataset.rateCode = details.rateCode || "";
    tr.innerHTML = `
      <td><input type="text" class="line-item" placeholder="Arbeid/beskrivelse" value="${esc(item)}"><input type="text" class="line-description" placeholder="Detaljer (valgfritt)" value="${esc(details.description || "")}" style="margin-top:5px"></td>
      <td><input type="number" class="line-quantity" min="0.01" step="0.01" inputmode="decimal" value="${esc(quantity)}"></td>
      <td><select class="line-unit"><option value="hour" ${unit === "hour" ? "selected" : ""}>timer</option><option value="fixed" ${unit === "fixed" ? "selected" : ""}>oppdrag</option><option value="quantity" ${unit === "quantity" ? "selected" : ""}>stk</option></select></td>
      <td><input type="number" class="line-price" min="0" step="0.01" inputmode="decimal" value="${esc(unitPrice)}"></td>
      <td class="line-total">0 kr</td>
      <td><button class="btn-remove-line" type="button">✕</button></td>`;
    tr.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", updateTotal));
    tr.querySelector(".btn-remove-line").addEventListener("click", () => {
      tr.remove();
      updateTotal();
    });
    linesBody.appendChild(tr);
    updateTotal();
  }

  function getLines() {
    return Array.from(linesBody.querySelectorAll("tr")).map((tr) => ({
      item: tr.querySelector(".line-item").value.trim(),
      description: tr.querySelector(".line-description").value.trim(),
      quantity: Number(tr.querySelector(".line-quantity").value) || 0,
      unit: tr.querySelector(".line-unit").value,
      unitLabel: tr.querySelector(".line-unit").value === "hour" ? "time" : tr.querySelector(".line-unit").value === "fixed" ? "oppdrag" : "stk",
      unitPrice: Number(tr.querySelector(".line-price").value) || 0,
      amount: Math.round(((Number(tr.querySelector(".line-quantity").value) || 0) * (Number(tr.querySelector(".line-price").value) || 0) + Number.EPSILON) * 100) / 100,
      rateCode: tr.dataset.rateCode || "",
    })).filter((l) => l.item);
  }

  function updateTotal() {
    Array.from(linesBody.querySelectorAll("tr")).forEach((tr) => { const q=Number(tr.querySelector(".line-quantity").value)||0; const p=Number(tr.querySelector(".line-price").value)||0; tr.querySelector(".line-total").textContent=`${Math.round(q*p*100)/100} kr`; });
    const total = getLines().reduce((sum, l) => sum + l.amount, 0);
    const tax = Math.round(total * vatRate) / 100;
    totalDisplay.textContent = vatRate ? `Delsum: ${Math.round(total * 100) / 100} kr · MVA ${vatRate}%: ${Math.round(tax * 100) / 100} kr · Total: ${Math.round((total + tax) * 100) / 100} kr` : `Total: ${Math.round(total * 100) / 100} kr`;
  }

  // --- Oppslag via referansenummer ---
  async function lookup() {
    const ref = refInput.value.trim();
    if (!ref) { lookupResult.innerHTML = `<span class="lookup-fail">Skriv inn et referansenummer.</span>`; return; }
    lookupResult.textContent = "Søker…";
    try {
      const res = await fetch(`${API_BASE}/invoices/lookup/${encodeURIComponent(ref)}`, { headers: headers() });
      if (!res.ok) throw new Error("Oppslag feilet");
      const data = await res.json();
      if (!data.found) {
        lookupResult.innerHTML = `<span class="lookup-fail">Fant ingen bestilling eller forespørsel med referanse ${ref}.</span>`;
        return;
      }
      // Fyll feltene
      f.name.value = data.customer.name || "";
      f.phone.value = data.customer.phone || "";
      f.email.value = data.customer.email || "";
      f.address.value = data.customer.address || "";

      // Sett kilde
      source = { sourceType: data.sourceType, sourceRef: data.sourceRef, sourceId: data.sourceId, customerId: data.customerId || null };

      // Fyll en linje fra beskrivelse + foreslått beløp
      linesBody.innerHTML = "";
      invoiceDescription.value = data.description || "";
      addLine(data.description || "Utført arbeid", data.amount != null ? data.amount : "");

      const kilde = data.sourceType === "booking" ? "bestilling" : "forespørsel";
      lookupResult.innerHTML = `<span class="lookup-ok">✓ Hentet fra ${kilde} #${ref}. Sjekk og juster før du lagrer.</span>`;
    } catch (err) {
      lookupResult.innerHTML = `<span class="lookup-fail">${err.message || "Noe gikk galt"}</span>`;
    }
  }

  // --- Lagre ---
  async function save() {
    const name = f.name.value.trim();
    if (!name) { setMessage("Kundenavn er påkrevd.", "error"); f.name.focus(); return; }

    const lines = getLines();
    if (!lines.length) { setMessage("Legg til minst én linje med beskrivelse.", "error"); return; }
    const amount = lines.reduce((sum, l) => sum + l.amount, 0);
    if (amount <= 0) { setMessage("Totalbeløpet må være større enn 0.", "error"); return; }

    saveBtn.disabled = true;
    setMessage("Lagrer faktura…");
    try {
      const res = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          customerName: name,
          customerPhone: f.phone.value.trim(),
          customerEmail: f.email.value.trim(),
          customerAddress: f.address.value.trim(),
          description: invoiceDescription.value.trim() || lines.map((l) => l.item).join(", "),
          lines,
          amount,
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          sourceId: source.sourceId,
          customerId: source.customerId,
          dueDate: document.getElementById("dueDate").value || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Kunne ikke lagre");
      }
      setMessage("Faktura lagret som utkast! ✓", "success");
      setTimeout(() => { window.location.href = "fakturaer.html"; }, 900);
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
      saveBtn.disabled = false;
    }
  }

  // --- Hendelser ---
  lookupBtn.addEventListener("click", lookup);
  refInput.addEventListener("keydown", (e) => { if (e.key === "Enter") lookup(); });
  addLineBtn.addEventListener("click", () => addLine());
  async function openRates() {
    ratesModal.classList.remove("hidden");
    try {
      const res = await fetch(`${API_BASE}/admin/rates`, { headers: headers() });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Kunne ikke hente satser"); rates = data.rates || [];
      const groups = rates.reduce((all, rate) => { (all[rate.category] ||= []).push(rate); return all; }, {});
      ratesList.innerHTML = Object.entries(groups).map(([category, items]) => `<section class="rate-category"><h4>${esc(category)}</h4><div class="rate-grid">${items.map((r) => `<button type="button" class="rate-option" data-code="${esc(r.code)}">${esc(r.name)}<span>${r.defaultRate} kr / ${esc(r.unitLabel)}</span></button>`).join("")}</div></section>`).join("");
    } catch (err) { ratesList.textContent = err.message; }
  }
  ratesBtn.addEventListener("click", openRates);
  closeRatesBtn.addEventListener("click", () => ratesModal.classList.add("hidden"));
  ratesList.addEventListener("click", (e) => { const btn=e.target.closest(".rate-option"); if(!btn)return; const r=rates.find((x)=>x.code===btn.dataset.code); if(!r)return; if(linesBody.querySelectorAll("tr").length===1 && !getLines()[0]?.item) linesBody.innerHTML=""; addLine(r.name, r.defaultRate, { quantity:1, unit:r.unit, unitPrice:r.defaultRate, rateCode:r.code }); ratesModal.classList.add("hidden"); });
  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => { window.location.href = "fakturaer.html"; });
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(KEY_STORAGE);
    window.location.href = "login.html";
  });

  fetch(`${API_BASE}/invoices/config`, { headers: headers() }).then((res)=>res.json()).then((data)=>{vatRate=Number(data.vatRate)||0;updateTotal();}).catch(()=>{});
  const workOrderId = new URLSearchParams(location.search).get("workOrderId");
  if (workOrderId) fetch(`${API_BASE}/invoices/work-order/${encodeURIComponent(workOrderId)}`, { headers: headers() }).then(async(res)=>{const data=await res.json(); if(!res.ok)throw new Error(data.error); f.name.value=data.customer.name||""; f.phone.value=data.customer.phone||""; f.email.value=data.customer.email||""; f.address.value=data.customer.address||""; invoiceDescription.value=data.description||""; source={sourceType:data.sourceType,sourceRef:data.sourceRef,sourceId:data.sourceId,customerId:data.customerId||null}; linesBody.innerHTML=""; (data.lines||[]).forEach((l)=>addLine(l.item,l.amount,l)); if(!linesBody.children.length)addLine(); }).catch((err)=>setMessage(err.message,"error")); else addLine();
})();
