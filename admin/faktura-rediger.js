(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";

  const statusMessage = document.getElementById("statusMessage");
  const linesBody = document.getElementById("linesBody");
  const addLineBtn = document.getElementById("addLineBtn");
  const totalDisplay = document.getElementById("totalDisplay");
  const saveBtn = document.getElementById("saveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const invoiceDescription = document.getElementById("invoiceDescription");

  const f = {
    name: document.getElementById("custName"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
  };

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

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

  function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
  function addLine(item = "", amount = "", details = {}) {
    const quantity=details.quantity??1, unit=details.unit||"fixed", unitPrice=details.unitPrice??amount??"";
    const tr = document.createElement("tr");
    tr.dataset.rateCode=details.rateCode||"";
    tr.innerHTML = `
      <td><input type="text" class="line-item" placeholder="Beskrivelse" value="${esc(item)}"><input type="text" class="line-description" placeholder="Detaljer (valgfritt)" value="${esc(details.description||"")}" style="margin-top:5px"></td>
      <td><input type="number" class="line-quantity" min="0.01" step="0.01" value="${esc(quantity)}"></td>
      <td><select class="line-unit"><option value="hour" ${unit==="hour"?"selected":""}>timer</option><option value="fixed" ${unit==="fixed"?"selected":""}>oppdrag</option><option value="quantity" ${unit==="quantity"?"selected":""}>stk</option></select></td>
      <td><input type="number" class="line-price" min="0" step="0.01" value="${esc(unitPrice)}"></td><td class="line-total">0 kr</td>
      <td><button class="btn-remove-line" type="button">✕</button></td>`;
    tr.querySelectorAll("input,select").forEach((field)=>field.addEventListener("input",updateTotal));
    tr.querySelector(".btn-remove-line").addEventListener("click", () => { tr.remove(); updateTotal(); });
    linesBody.appendChild(tr);
    updateTotal();
  }
  function getLines() {
    return Array.from(linesBody.querySelectorAll("tr")).map((tr) => ({
      item: tr.querySelector(".line-item").value.trim(),
      description:tr.querySelector(".line-description").value.trim(), quantity:Number(tr.querySelector(".line-quantity").value)||0,
      unit:tr.querySelector(".line-unit").value, unitLabel:tr.querySelector(".line-unit").value==="hour"?"time":tr.querySelector(".line-unit").value==="fixed"?"oppdrag":"stk",
      unitPrice:Number(tr.querySelector(".line-price").value)||0,
      amount:Math.round(((Number(tr.querySelector(".line-quantity").value)||0)*(Number(tr.querySelector(".line-price").value)||0)+Number.EPSILON)*100)/100,
      rateCode:tr.dataset.rateCode||"",
    })).filter((l) => l.item);
  }
  function updateTotal() {
    Array.from(linesBody.querySelectorAll("tr")).forEach((tr)=>{const q=Number(tr.querySelector(".line-quantity").value)||0,p=Number(tr.querySelector(".line-price").value)||0;tr.querySelector(".line-total").textContent=`${Math.round(q*p*100)/100} kr`;});
    const total = getLines().reduce((sum, l) => sum + l.amount, 0); totalDisplay.textContent = `Total: ${Math.round(total*100)/100} kr`;
  }

  async function loadInvoice() {
    if (!invoiceId) { setMessage("Mangler faktura-ID.", "error"); return; }
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, { headers: headers() });
      if (!res.ok) throw new Error("Kunne ikke hente faktura");
      const data = await res.json();
      const inv = data.invoice;

      if (inv.status !== "draft") {
        setMessage("Denne fakturaen er sendt og kan ikke redigeres.", "error");
        saveBtn.disabled = true;
        return;
      }

      f.name.value = inv.customerName || "";
      f.phone.value = inv.customerPhone || "";
      f.email.value = inv.customerEmail || "";
      f.address.value = inv.customerAddress || "";
      invoiceDescription.value = inv.description || "";

      linesBody.innerHTML = "";
      if (inv.lines && inv.lines.length) {
        inv.lines.forEach((l) => addLine(l.item, l.amount, l));
      } else {
        addLine();
      }
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
    }
  }

  async function save() {
    const name = f.name.value.trim();
    if (!name) { setMessage("Kundenavn er påkrevd.", "error"); f.name.focus(); return; }
    const lines = getLines();
    if (!lines.length) { setMessage("Legg til minst én linje.", "error"); return; }
    const amount = lines.reduce((sum, l) => sum + l.amount, 0);
    if (amount <= 0) { setMessage("Totalbeløpet må være større enn 0.", "error"); return; }

    saveBtn.disabled = true;
    setMessage("Lagrer endringer…");
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({
          customerName: name,
          customerPhone: f.phone.value.trim(),
          customerEmail: f.email.value.trim(),
          customerAddress: f.address.value.trim(),
          description: invoiceDescription.value.trim() || lines.map((l) => l.item).join(", "),
          lines,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Kunne ikke lagre"); }
      setMessage("Endringer lagret! ✓", "success");
      setTimeout(() => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(invoiceId)}`; }, 800);
    } catch (err) {
      setMessage(err.message || "Noe gikk galt", "error");
      saveBtn.disabled = false;
    }
  }

  addLineBtn.addEventListener("click", () => addLine());
  saveBtn.addEventListener("click", save);
  saveBtn.textContent = "💾 Lagre endringer";
  cancelBtn.addEventListener("click", () => { window.location.href = `faktura-detalj.html?id=${encodeURIComponent(invoiceId)}`; });
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(KEY_STORAGE);
    window.location.href = "login.html";
  });

  loadInvoice();
})();
