(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { items: [], categories: [], current: null, imageData: "", lowOnly: false, searchTimer: null };

  const status = $("#inventoryStatus");
  const list = $("#inventoryList");
  const meta = $("#inventoryMeta");
  const search = $("#inventorySearch");
  const category = $("#inventoryCategory");
  const lowOnly = $("#inventoryLowOnly");
  const modal = $("#inventoryModal");
  const modalTitle = $("#inventoryModalTitle");
  const modalEyebrow = $("#inventoryModalEyebrow");
  const modalContent = $("#inventoryModalContent");

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function money(value) {
    if (value === null || value === undefined || value === "") return "–";
    return new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  }
  function qty(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("no-NO", { maximumFractionDigits: 3 }).format(n);
  }
  function dateTime(value) {
    if (!value) return "–";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "–";
    return new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" }).format(d);
  }
  function uuid(prefix = "inventory") {
    return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function setStatus(message = "", type = "info") {
    status.textContent = message;
    status.className = `status-message${message ? ` ${type}` : ""}`;
  }
  function adminKey() { return (localStorage.getItem(KEY) || "").trim(); }
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "x-admin-key": adminKey(), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
    return data;
  }
  function openModal(title, body, eyebrow = "Lager") {
    modalTitle.textContent = title;
    modalEyebrow.textContent = eyebrow;
    modalContent.innerHTML = body;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function closeModal() {
    modal.classList.add("hidden");
    modalContent.innerHTML = "";
    document.body.classList.remove("modal-open");
    state.imageData = "";
    state.current = null;
  }
  $("#closeInventoryModal").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal(); });

  function isLow(item) {
    return item.trackStock !== false && item.lowStockThreshold != null && Number(item.stockQuantity) <= Number(item.lowStockThreshold);
  }
  function renderList() {
    meta.textContent = `${state.items.length} ${state.items.length === 1 ? "vare" : "varer"}`;
    if (!state.items.length) {
      list.innerHTML = `<div class="admin-card empty-state"><strong>Ingen varer funnet.</strong><p>${search.value || lowOnly.checked ? "Endre søk eller filter." : "Registrer første vare for å komme i gang."}</p></div>`;
      return;
    }
    list.innerHTML = state.items.map((item) => {
      const low = isLow(item);
      const empty = Number(item.stockQuantity) <= 0;
      const classes = ["inventory-card", empty ? "is-empty" : low ? "is-low" : ""].filter(Boolean).join(" ");
      const sub = [item.category, item.brand, item.partNumber].filter(Boolean).join(" · ");
      return `<button type="button" class="${classes}" data-item-id="${esc(item._id)}">
        <span class="inventory-thumb">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="">` : "Ingen bilde"}</span>
        <span class="inventory-card-main"><strong>${esc(item.name)}</strong><p>${esc(sub || "Annet")}${item.storageLocation ? ` · ${esc(item.storageLocation)}` : ""}</p></span>
        <span class="inventory-card-stock"><strong class="inventory-stock-label"><i class="inventory-stock-dot"></i>${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</strong><span>${empty ? "Tomt" : low ? "Lavt lager" : "På lager"}</span></span>
      </button>`;
    }).join("");
    $$("[data-item-id]", list).forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.itemId)));
  }
  function renderCategories() {
    const selected = category.value;
    category.innerHTML = `<option value="">Alle kategorier</option>${state.categories.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
    if (state.categories.includes(selected)) category.value = selected;
  }
  async function loadSummary() {
    try {
      const data = await api("/admin/inventory/summary");
      const section = $("#lowStockSection");
      if (data.lowStockCount > 0) {
        $("#lowStockText").textContent = `${data.lowStockCount} ${data.lowStockCount === 1 ? "vare har" : "varer har"} nådd varslet minimumsnivå.`;
        section.classList.remove("hidden");
      } else section.classList.add("hidden");
    } catch (_) {}
  }
  async function loadItems() {
    setStatus("Henter lager…");
    list.innerHTML = `<div class="admin-card loading-card">Henter varer…</div>`;
    const params = new URLSearchParams();
    if (search.value.trim()) params.set("q", search.value.trim());
    if (category.value) params.set("category", category.value);
    if (lowOnly.checked) params.set("lowStock", "true");
    try {
      const data = await api(`/admin/inventory/?${params}`);
      state.items = data.items || [];
      state.categories = data.categories || [];
      renderCategories();
      renderList();
      setStatus("");
      loadSummary();
    } catch (error) {
      setStatus(error.message, "error");
      list.innerHTML = `<div class="admin-card empty-state">Kunne ikke hente lageret.</div>`;
    }
  }

  function imageMarkup(currentImage = "") {
    return `<div class="inventory-image-box">
      <div class="inventory-image-preview" id="itemImagePreview">${currentImage ? `<img src="${esc(currentImage)}" alt="Produktbilde">` : "Ta bilde eller velg fra bilder"}</div>
      <div><div class="inventory-image-actions"><button type="button" class="secondary-btn" id="cameraBtn">Ta bilde</button><button type="button" class="secondary-btn" id="galleryBtn">Velg bilde</button><button type="button" class="secondary-btn" id="analyzeImageBtn" ${currentImage ? "disabled" : "disabled"}>AI-analyse</button></div>
      <p class="inventory-ai-note">AI fyller bare inn forslag. Du kontrollerer og bekrefter alltid varen før lagring.</p>
      <input id="cameraInput" type="file" accept="image/*" capture="environment" hidden><input id="galleryInput" type="file" accept="image/*" hidden></div>
    </div><div id="aiResult"></div>`;
  }
  function formMarkup(item = null) {
    const value = (name) => esc(item?.[name] ?? "");
    const threshold = item?.lowStockThreshold == null ? "" : item.lowStockThreshold;
    return `<form id="inventoryItemForm" class="inventory-form">
      ${imageMarkup(item?.imageUrl || "")}
      <div class="inventory-form-grid">
        <label class="inventory-field wide">Produktnavn<input name="name" maxlength="300" value="${value("name")}" placeholder="For eksempel MAHLE OC 11" required></label>
        <label class="inventory-field">Kategori<input name="category" maxlength="120" value="${value("category")}" placeholder="Oljefilter"></label>
        <label class="inventory-field">Underkategori<input name="subcategory" maxlength="120" value="${value("subcategory")}"></label>
        <label class="inventory-field">Merke<input name="brand" maxlength="160" value="${value("brand")}" placeholder="MAHLE"></label>
        <label class="inventory-field">Varenummer / delenummer<input name="partNumber" maxlength="160" value="${value("partNumber")}" placeholder="OC 11"></label>
        <label class="inventory-field">Modell<input name="model" maxlength="160" value="${value("model")}"></label>
        <label class="inventory-field">EAN / strekkode<input name="ean" maxlength="80" value="${value("ean")}"></label>
        <label class="inventory-field">Enhet<select name="unit"><option ${item?.unit === "stk" || !item ? "selected" : ""}>stk</option><option ${item?.unit === "liter" ? "selected" : ""}>liter</option><option ${item?.unit === "meter" ? "selected" : ""}>meter</option><option ${item?.unit === "kg" ? "selected" : ""}>kg</option><option ${item?.unit === "pakke" ? "selected" : ""}>pakke</option></select></label>
        ${item ? "" : `<label class="inventory-field">Startbeholdning<input name="stockQuantity" type="number" min="0" step="0.01" inputmode="decimal" value="0" required></label>`}
        <label class="inventory-field">Lagerplass<input name="storageLocation" maxlength="200" value="${value("storageLocation")}" placeholder="Hylle A"></label>
        <label class="inventory-field">Innkjøpspris / enhet<input name="purchaseUnitPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${value("purchaseUnitPrice")}"></label>
        <label class="inventory-field">Standard kundepris / enhet<input name="defaultCustomerUnitPrice" type="number" min="0" step="0.01" inputmode="decimal" value="${value("defaultCustomerUnitPrice")}"></label>
        <label class="inventory-field">Varsle ved beholdning ≤<input name="lowStockThreshold" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(threshold)}" placeholder="Valgfritt"></label>
        <label class="inventory-field wide">Søkeord<input name="searchTermsText" value="${esc((item?.searchTerms || []).join(", "))}" placeholder="filter, oljefilter, oc11"></label>
        <label class="inventory-field wide">Beskrivelse<textarea name="description" maxlength="2000">${value("description")}</textarea></label>
      </div>
      <p id="inventoryFormError" class="inventory-form-error" role="alert"></p>
      <div class="inventory-form-actions"><button type="button" class="secondary-btn" data-close-form>Avbryt</button><button type="submit" class="primary-btn" id="saveInventoryItem">${item ? "Lagre endringer" : "Legg på lager"}</button></div>
    </form>`;
  }

  async function fileToDataUri(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Velg en bildefil.");
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      reader.readAsDataURL(file);
    });
    try {
      const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = original; });
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      if (original.length > 13_000_000) throw new Error("Bildet er for stort. Velg et mindre bilde.");
      return original;
    }
  }
  function previewImage(dataUri) {
    state.imageData = dataUri;
    $("#itemImagePreview", modalContent).innerHTML = `<img src="${esc(dataUri)}" alt="Valgt produktbilde">`;
    $("#analyzeImageBtn", modalContent).disabled = false;
    $("#aiResult", modalContent).innerHTML = "";
  }
  function fillSuggestion(form, suggestion) {
    ["name", "category", "subcategory", "brand", "partNumber", "model", "ean", "description"].forEach((name) => {
      if (suggestion?.[name] && form.elements[name]) form.elements[name].value = suggestion[name];
    });
    if (Array.isArray(suggestion?.searchTerms)) form.elements.searchTermsText.value = suggestion.searchTerms.join(", ");
  }
  async function analyzeSelectedImage(form) {
    const result = $("#aiResult", modalContent);
    if (!state.imageData) return;
    $("#analyzeImageBtn", modalContent).disabled = true;
    result.innerHTML = `<div class="inventory-ai-result">AI analyserer bildet…</div>`;
    try {
      const data = await api("/admin/inventory/analyze-image", { method: "POST", body: JSON.stringify({ imageData: state.imageData }) });
      if (!data.aiAvailable || !data.suggestion) {
        result.innerHTML = `<div class="inventory-ai-result"><strong>Ingen sikkert AI-resultat</strong>Fyll inn produktdata manuelt. Bildet kan fortsatt lagres.</div>`;
        return;
      }
      fillSuggestion(form, data.suggestion);
      const uncertain = (data.suggestion.uncertainFields || []).join(", ");
      const dup = (data.possibleDuplicates || []).length;
      result.innerHTML = `<div class="inventory-ai-result"><strong>AI-forslag lagt inn</strong>Kontroller spesielt varenummer og modell før lagring.${uncertain ? ` Usikkert: ${esc(uncertain)}.` : ""}${dup ? ` ${dup} mulig eksisterende vare funnet.` : ""}</div>`;
    } catch (error) {
      result.innerHTML = `<div class="inventory-ai-result"><strong>AI-analyse kunne ikke fullføres</strong>${esc(error.message)} Du kan registrere varen manuelt.</div>`;
    } finally { $("#analyzeImageBtn", modalContent).disabled = false; }
  }
  function bindImageForm(form) {
    const camera = $("#cameraInput", modalContent); const gallery = $("#galleryInput", modalContent);
    $("#cameraBtn", modalContent).addEventListener("click", () => camera.click());
    $("#galleryBtn", modalContent).addEventListener("click", () => gallery.click());
    const onFile = async (event) => {
      try { previewImage(await fileToDataUri(event.target.files?.[0])); }
      catch (error) { $("#inventoryFormError", modalContent).textContent = error.message; }
      event.target.value = "";
    };
    camera.addEventListener("change", onFile); gallery.addEventListener("change", onFile);
    $("#analyzeImageBtn", modalContent).addEventListener("click", () => analyzeSelectedImage(form));
  }
  function formPayload(form) {
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.searchTerms = String(payload.searchTermsText || "").split(",").map((v) => v.trim()).filter(Boolean);
    delete payload.searchTermsText;
    ["purchaseUnitPrice", "defaultCustomerUnitPrice", "lowStockThreshold"].forEach((name) => { if (payload[name] === "") payload[name] = null; else if (payload[name] != null) payload[name] = Number(payload[name]); });
    if (payload.stockQuantity !== undefined) payload.stockQuantity = Number(payload.stockQuantity);
    if (state.imageData) payload.imageData = state.imageData;
    payload.operationId = uuid("inventory-save");
    return payload;
  }
  function duplicateMarkup(items) {
    return `<div class="inventory-ai-result"><strong>Mulig eksisterende vare</strong>Kontroller før du oppretter en dublett.<div class="inventory-duplicate-list">${(items || []).map((item) => `<div class="inventory-duplicate"><strong>${esc(item.name)}</strong><span>${esc(item.brand || "")} ${esc(item.partNumber || "")} · ${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</span></div>`).join("")}</div></div>`;
  }
  function openItemForm(item = null) {
    state.current = item;
    state.imageData = "";
    openModal(item ? "Rediger lagervare" : "Registrer ny vare", formMarkup(item), item ? "Produkt" : "Ny lagervare");
    const form = $("#inventoryItemForm", modalContent);
    bindImageForm(form);
    $("[data-close-form]", modalContent).addEventListener("click", closeModal);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $("#inventoryFormError", modalContent); const button = $("#saveInventoryItem", modalContent);
      error.textContent = ""; button.disabled = true;
      let payload = formPayload(form);
      try {
        let data;
        try {
          data = item
            ? await api(`/admin/inventory/${encodeURIComponent(item._id)}`, { method: "PATCH", body: JSON.stringify(payload) })
            : await api("/admin/inventory/", { method: "POST", body: JSON.stringify(payload) });
        } catch (first) {
          if (first.status !== 409 || !first.data?.possibleDuplicates?.length) throw first;
          const confirmCreate = confirm(`${first.message}\n\nVil du fortsette likevel?`);
          if (!confirmCreate) { error.innerHTML = duplicateMarkup(first.data.possibleDuplicates); return; }
          payload = { ...payload, [item ? "forceUpdate" : "forceCreate"]: true };
          data = item
            ? await api(`/admin/inventory/${encodeURIComponent(item._id)}`, { method: "PATCH", body: JSON.stringify(payload) })
            : await api("/admin/inventory/", { method: "POST", body: JSON.stringify(payload) });
        }
        closeModal(); setStatus(`${data.item?.name || "Varen"} er lagret.`, "success"); await loadItems(); await window.SorgulenAdminShell?.refreshBadges?.();
      } catch (err) { error.textContent = err.message; }
      finally { button.disabled = false; }
    });
  }

  const movementLabels = { purchase: "Lagt til", usage: "Brukt på oppdrag", adjustment: "Lagerjustering", waste: "Skadet / kastet", return: "Returnert", correction: "Korrigering" };
  async function openDetail(id) {
    openModal("Henter vare…", `<div class="loading-card">Henter produkt og historikk…</div>`, "Lager");
    try {
      const data = await api(`/admin/inventory/${encodeURIComponent(id)}`);
      state.current = data.item;
      renderDetail(data.item, data.movements || []);
    } catch (error) { modalContent.innerHTML = `<p class="inventory-form-error">${esc(error.message)}</p>`; }
  }
  function renderDetail(item, movements) {
    modalTitle.textContent = item.name;
    modalEyebrow.textContent = item.category || "Lagervare";
    const low = isLow(item);
    modalContent.innerHTML = `<div class="inventory-detail-top">
      <div class="inventory-detail-image">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}">` : "Ingen bilde"}</div>
      <div class="inventory-detail-title"><h3>${esc(item.name)}</h3><p>${esc([item.brand, item.partNumber].filter(Boolean).join(" · ") || item.category || "")}</p><div class="inventory-stock-number">${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</div>${low ? `<p>Lav beholdning · varselgrense ${esc(qty(item.lowStockThreshold))}</p>` : ""}</div>
    </div>
    <div class="inventory-detail-actions">
      <button class="primary-btn" id="useItemBtn" type="button" ${Number(item.stockQuantity) <= 0 ? "disabled" : ""}>Bruk på oppdrag</button>
      <button class="secondary-btn" id="addStockBtn" type="button">Legg til beholdning</button>
      <button class="secondary-btn" id="adjustStockBtn" type="button">Juster lager</button>
      <button class="secondary-btn" id="removeStockBtn" type="button" ${Number(item.stockQuantity) <= 0 ? "disabled" : ""}>Ta ut / kast</button>
      <button class="secondary-btn" id="editItemBtn" type="button">Rediger</button>
    </div>
    <div class="inventory-detail-grid">
      <div><span>Kategori</span><strong>${esc(item.category || "Annet")}</strong></div>
      <div><span>Lagerplass</span><strong>${esc(item.storageLocation || "Ikke satt")}</strong></div>
      <div><span>Innkjøpspris</span><strong>${esc(money(item.purchaseUnitPrice))}</strong></div>
      <div><span>Standard kundepris</span><strong>${esc(money(item.defaultCustomerUnitPrice))}</strong></div>
      <div><span>Merke</span><strong>${esc(item.brand || "–")}</strong></div>
      <div><span>Varenummer</span><strong>${esc(item.partNumber || "–")}</strong></div>
      <div><span>EAN</span><strong>${esc(item.ean || "–")}</strong></div>
      <div><span>Varselgrense</span><strong>${item.lowStockThreshold == null ? "Ikke satt" : `${esc(qty(item.lowStockThreshold))} ${esc(item.unit || "stk")}`}</strong></div>
    </div>
    ${item.description ? `<p>${esc(item.description)}</p>` : ""}
    <section class="inventory-history"><h3>Lagerhistorikk</h3>${movements.length ? movements.map((movement) => `<div class="inventory-movement"><span class="inventory-movement-change ${Number(movement.quantityChange) >= 0 ? "positive" : "negative"}">${Number(movement.quantityChange) >= 0 ? "+" : ""}${esc(qty(movement.quantityChange))}</span><div class="inventory-movement-main"><strong>${esc(movementLabels[movement.type] || movement.type)}</strong><p>${esc(movement.reason || "")} · ${esc(qty(movement.beforeQuantity))} → ${esc(qty(movement.afterQuantity))} ${esc(movement.unit || item.unit || "stk")}</p></div><time>${esc(dateTime(movement.createdAt))}</time></div>`).join("") : `<p class="empty-state">Ingen lagerbevegelser ennå.</p>`}</section>
    <div class="inventory-detail-actions"><button class="secondary-btn operation-danger" id="archiveItemBtn" type="button">${item.archivedAt ? "Gjenåpne vare" : "Arkiver vare"}</button></div>`;
    $("#useItemBtn", modalContent)?.addEventListener("click", () => openUseOnOrder(item));
    $("#addStockBtn", modalContent).addEventListener("click", () => openStockForm(item, "add"));
    $("#adjustStockBtn", modalContent).addEventListener("click", () => openStockForm(item, "adjust"));
    $("#removeStockBtn", modalContent)?.addEventListener("click", () => openStockForm(item, "remove"));
    $("#editItemBtn", modalContent).addEventListener("click", () => openItemForm(item));
    $("#archiveItemBtn", modalContent).addEventListener("click", async () => {
      if (!confirm(item.archivedAt ? "Gjenåpne denne lagervaren?" : "Arkivere varen? Historikken beholdes.")) return;
      try { await api(`/admin/inventory/${encodeURIComponent(item._id)}/archive`, { method: "POST", body: JSON.stringify({ archived: !item.archivedAt }) }); closeModal(); await loadItems(); }
      catch (error) { alert(error.message); }
    });
  }

  function stockFormMarkup(item, mode) {
    const title = mode === "add" ? "Legg til beholdning" : mode === "adjust" ? "Juster fysisk lager" : "Ta ut av lager";
    const field = mode === "adjust"
      ? `<label class="inventory-field">Faktisk beholdning<input name="newQuantity" type="number" min="0" step="0.01" value="${esc(item.stockQuantity)}" required></label>`
      : `<label class="inventory-field">Antall<input name="quantity" type="number" min="0.01" max="${mode === "remove" ? esc(item.stockQuantity) : "100000000"}" step="0.01" value="1" required></label>`;
    const removeType = mode === "remove" ? `<label class="inventory-field">Årsak<select name="type"><option value="waste">Skadet / kastet</option><option value="correction">Eget bruk</option><option value="adjustment">Annet uttak</option></select></label>` : "";
    return `<form id="stockForm" class="inventory-form"><p>Registrert nå: <strong>${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</strong></p><div class="inventory-form-grid">${field}${removeType}${mode === "add" ? `<label class="inventory-field">Innkjøpspris / enhet<input name="purchaseUnitPrice" type="number" min="0" step="0.01" value="${esc(item.purchaseUnitPrice ?? "")}"></label>` : ""}<label class="inventory-field wide">Kommentar / årsak<input name="reason" maxlength="1000" placeholder="${mode === "add" ? "For eksempel kjøpt hos leverandør" : "Hvorfor beholdningen endres"}"></label></div><p id="stockError" class="inventory-form-error"></p><div class="inventory-form-actions"><button type="button" class="secondary-btn" data-stock-cancel>Avbryt</button><button type="submit" class="primary-btn">${esc(title)}</button></div></form>`;
  }
  function openStockForm(item, mode) {
    openModal(mode === "add" ? "Legg til beholdning" : mode === "adjust" ? "Juster lager" : "Ta ut av lager", stockFormMarkup(item, mode), item.name);
    $("[data-stock-cancel]", modalContent).addEventListener("click", () => openDetail(item._id));
    $("#stockForm", modalContent).addEventListener("submit", async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = $("button[type=submit]", form); button.disabled = true;
      const body = Object.fromEntries(new FormData(form).entries()); body.operationId = uuid(`inventory-${mode}`);
      if (body.quantity) body.quantity = Number(body.quantity); if (body.newQuantity !== undefined) body.newQuantity = Number(body.newQuantity); if (body.purchaseUnitPrice === "") delete body.purchaseUnitPrice;
      try {
        const path = mode === "add" ? "add-stock" : mode === "adjust" ? "adjust" : "remove";
        await api(`/admin/inventory/${encodeURIComponent(item._id)}/${path}`, { method: "POST", body: JSON.stringify(body) });
        await window.SorgulenAdminShell?.refreshBadges?.(); await loadItems(); await openDetail(item._id);
      } catch (error) { $("#stockError", form).textContent = error.message; }
      finally { button.disabled = false; }
    });
  }

  async function openUseOnOrder(item) {
    openModal("Bruk på oppdrag", `<div class="loading-card">Henter åpne oppdrag…</div>`, item.name);
    try {
      const data = await api("/admin/work-orders?limit=200");
      const orders = (data.workOrders || []).filter((order) => ["planned", "active", "paused", "stopped"].includes(order.status));
      modalContent.innerHTML = `<form id="useItemForm" class="inventory-form">
        <div><label class="inventory-field">Søk oppdrag<input id="useOrderSearch" type="search" placeholder="Kunde eller oppdrag"></label><div id="useOrderResults" class="inventory-use-results"></div><input name="workOrderId" type="hidden" required></div>
        <div class="inventory-form-grid"><label class="inventory-field">Antall<input name="quantity" type="number" min="0.01" max="${esc(item.stockQuantity)}" step="0.01" value="1" required></label><label class="inventory-field">Kundepris / enhet<input name="unitPrice" type="number" min="0" step="0.01" value="${esc(item.defaultCustomerUnitPrice ?? "")}"></label><label class="inventory-field wide">Kommentar<input name="comment" maxlength="500" placeholder="Valgfritt"></label><label class="inventory-low-toggle"><input name="billable" type="checkbox" checked><span>Fakturerbar</span></label></div>
        <p id="useItemError" class="inventory-form-error"></p><div class="inventory-form-actions"><button type="button" class="secondary-btn" data-use-cancel>Avbryt</button><button type="submit" class="primary-btn">Legg til på oppdrag</button></div>
      </form>`;
      const form = $("#useItemForm", modalContent); const results = $("#useOrderResults", modalContent); const orderSearch = $("#useOrderSearch", modalContent);
      function renderOrders() {
        const q = orderSearch.value.toLowerCase().trim();
        const filtered = orders.filter((order) => !q || `${order.customerSnapshot?.name || ""} ${order.serviceName || ""}`.toLowerCase().includes(q));
        results.innerHTML = filtered.length ? filtered.map((order) => `<button type="button" class="inventory-use-order" data-order-id="${esc(order._id)}"><div><strong>${esc(order.customerSnapshot?.name || "Kunde")}</strong><p>${esc(order.serviceName)} · ${esc(order.jobDate || "")}</p></div><span>${esc(order.status === "active" ? "Pågår" : order.status === "paused" ? "Pauset" : order.status === "stopped" ? "Mellom økter" : "Planlagt")}</span></button>`).join("") : `<p class="empty-state">Ingen åpne oppdrag funnet.</p>`;
        $$("[data-order-id]", results).forEach((button) => button.addEventListener("click", () => { $$(".inventory-use-order", results).forEach((b) => b.classList.remove("is-selected")); button.classList.add("is-selected"); form.elements.workOrderId.value = button.dataset.orderId; }));
      }
      renderOrders(); orderSearch.addEventListener("input", renderOrders); $("[data-use-cancel]", form).addEventListener("click", () => openDetail(item._id));
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); const error = $("#useItemError", form); const button = $("button[type=submit]", form); error.textContent = "";
        if (!form.elements.workOrderId.value) { error.textContent = "Velg hvilket oppdrag varen brukes på."; return; }
        button.disabled = true;
        const payload = { workOrderId: form.elements.workOrderId.value, quantity: Number(form.elements.quantity.value), unitPrice: form.elements.unitPrice.value === "" ? null : Number(form.elements.unitPrice.value), billable: form.elements.billable.checked, comment: form.elements.comment.value.trim(), operationId: uuid("inventory-use") };
        try { await api(`/admin/inventory/${encodeURIComponent(item._id)}/use`, { method: "POST", body: JSON.stringify(payload) }); setStatus(`${item.name} ble lagt på oppdraget og trukket fra lager.`, "success"); await window.SorgulenAdminShell?.refreshBadges?.(); closeModal(); await loadItems(); }
        catch (err) { error.textContent = err.message; }
        finally { button.disabled = false; }
      });
    } catch (error) { modalContent.innerHTML = `<p class="inventory-form-error">${esc(error.message)}</p>`; }
  }

  $("#createItemBtn").addEventListener("click", () => openItemForm());
  $("#refreshInventoryBtn").addEventListener("click", loadItems);
  $("#showLowStockBtn").addEventListener("click", () => { lowOnly.checked = true; loadItems(); });
  search.addEventListener("input", () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(loadItems, 250); });
  category.addEventListener("change", loadItems); lowOnly.addEventListener("change", loadItems);

  if (!adminKey()) location.href = "login.html";
  else loadItems();
}());
