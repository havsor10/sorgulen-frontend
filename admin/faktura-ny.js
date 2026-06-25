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

  const f = {
    name: document.getElementById("custName"),
    phone: document.getElementById("custPhone"),
    email: document.getElementById("custEmail"),
    address: document.getElementById("custAddress"),
  };

  // Kilde-info fra oppslag (tom = manuell faktura)
  let source = { sourceType: "manual", sourceRef: null, sourceId: null };

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
  function addLine(item = "", amount = "") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="line-item" placeholder="Beskrivelse" value="${String(item).replace(/"/g, "&quot;")}"></td>
      <td><input type="number" class="line-amount" placeholder="kr" inputmode="numeric" value="${amount}"></td>
      <td><button class="btn-remove-line" type="button">✕</button></td>`;
    tr.querySelector(".line-amount").addEventListener("input", updateTotal);
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
      amount: Number(tr.querySelector(".line-amount").value) || 0,
    })).filter((l) => l.item);
  }

  function updateTotal() {
    const total = getLines().reduce((sum, l) => sum + l.amount, 0);
    totalDisplay.textContent = `Total: ${total} kr`;
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
      source = { sourceType: data.sourceType, sourceRef: data.sourceRef, sourceId: data.sourceId };

      // Fyll en linje fra beskrivelse + foreslått beløp
      linesBody.innerHTML = "";
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
          description: lines.map((l) => l.item).join(", "),
          lines,
          amount,
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          sourceId: source.sourceId,
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
  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => { window.location.href = "fakturaer.html"; });
  if (logoutBtn) logoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem(KEY_STORAGE);
    window.location.href = "login.html";
  });

  // Start med én tom linje
  addLine();
})();
