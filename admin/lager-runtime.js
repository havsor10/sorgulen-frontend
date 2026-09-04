(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { items: [], categories: [], imageData: "", current: null, timer: null };

  const els = {
    status: $("#inventoryStatus"), list: $("#inventoryList"), meta: $("#inventoryMeta"),
    search: $("#inventorySearch"), category: $("#inventoryCategory"), lowOnly: $("#inventoryLowOnly"),
    lowSection: $("#lowStockSection"), lowText: $("#lowStockText"), modal: $("#inventoryModal"),
    modalTitle: $("#inventoryModalTitle"), modalEyebrow: $("#inventoryModalEyebrow"), modalContent: $("#inventoryModalContent"),
  };

  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const qty = (value) => new Intl.NumberFormat("no-NO", { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const money = (value) => value == null || value === "" ? "–" : new Intl.NumberFormat("no-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 2 }).format(Number(value) || 0);
  const dateTime = (value) => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" }).format(d) : "–"; };
  const uuid = (prefix = "inventory") => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminKey = () => (localStorage.getItem(KEY) || "").trim();

  function setStatus(message = "", type = "info") { els.status.textContent = message; els.status.className = `status-message${message ? ` ${type}` : ""}`; }
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", "x-admin-key": adminKey(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) { localStorage.removeItem(KEY); location.href = "login.html"; throw new Error("Logg inn på nytt"); }
    if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
    return data;
  }

  function openModal(title, html, eyebrow = "Lager") {
    els.modalTitle.textContent = title; els.modalEyebrow.textContent = eyebrow; els.modalContent.innerHTML = html;
    els.modal.classList.remove("hidden"); document.body.classList.add("modal-open");
  }
  function closeModal() { els.modal.classList.add("hidden"); els.modalContent.innerHTML = ""; document.body.classList.remove("modal-open"); state.imageData = ""; state.current = null; }
  $("#closeInventoryModal").addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modal.classList.contains("hidden")) closeModal(); });

  function isLow(item) { return item.trackStock !== false && item.lowStockThreshold != null && Number(item.stockQuantity) <= Number(item.lowStockThreshold); }
  function renderCategories() {
    const selected = els.category.value;
    els.category.innerHTML = `<option value="">Alle kategorier</option>${state.categories.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
    if (state.categories.includes(selected)) els.category.value = selected;
  }
  function renderList() {
    els.meta.textContent = `${state.items.length} ${state.items.length === 1 ? "vare" : "varer"}`;
    if (!state.items.length) { els.list.innerHTML = '<div class="admin-card empty-state"><strong>Ingen varer funnet.</strong></div>'; return; }
    els.list.innerHTML = state.items.map((item) => {
      const low = isLow(item); const empty = Number(item.stockQuantity) <= 0; const sub = [item.category, item.brand, item.partNumber].filter(Boolean).join(" · ");
      return `<button type="button" class="inventory-card${empty ? " is-empty" : low ? " is-low" : ""}" data-item-id="${esc(item._id)}">
        <span class="inventory-thumb">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="">` : "Ingen bilde"}</span>
        <span class="inventory-card-main"><strong>${esc(item.name)}</strong><p>${esc(sub || "Annet")}${item.storageLocation ? ` · ${esc(item.storageLocation)}` : ""}</p></span>
        <span class="inventory-card-stock"><strong class="inventory-stock-label"><i class="inventory-stock-dot"></i>${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</strong><span>${empty ? "Tomt" : low ? "Lavt lager" : "På lager"}</span></span>
      </button>`;
    }).join("");
    $$("[data-item-id]", els.list).forEach((button) => button.addEventListener("click", () => openDetail(button.dataset.itemId)));
  }
  async function loadSummary() {
    try { const data = await api("/admin/inventory/summary"); if (data.lowStockCount > 0) { els.lowText.textContent = `${data.lowStockCount} ${data.lowStockCount === 1 ? "vare har" : "varer har"} nådd minimumsnivå.`; els.lowSection.classList.remove("hidden"); } else els.lowSection.classList.add("hidden"); }
    catch (_) {}
  }
  async function loadItems() {
    setStatus("Henter lager…"); els.list.innerHTML = '<div class="admin-card loading-card">Henter varer…</div>';
    const params = new URLSearchParams(); if (els.search.value.trim()) params.set("q", els.search.value.trim()); if (els.category.value) params.set("category", els.category.value); if (els.lowOnly.checked) params.set("lowStock", "true"); params.set("limit", "200");
    try { const data = await api(`/admin/inventory/?${params}`); state.items = data.items || []; state.categories = data.categories || []; renderCategories(); renderList(); setStatus(""); await loadSummary(); }
    catch (error) { setStatus(error.message, "error"); els.list.innerHTML = '<div class="admin-card empty-state">Kunne ikke hente lageret.</div>'; }
  }

  async function fileToDataUri(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Velg en bildefil.");
    const original = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("Kunne ikke lese bildet.")); reader.readAsDataURL(file); });
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = original; });
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); return canvas.toDataURL("image/jpeg", 0.84);
    } catch { if (original.length > 13_000_000) throw new Error("Bildet er for stort. Velg et mindre bilde."); return original; }
  }

  function formHtml(item = null) {
    const v = (name) => esc(item?.[name] ?? ""); const threshold = item?.lowStockThreshold == null ? "" : item.lowStockThreshold;
    return `<form id="inventoryItemForm" class="inventory-form">
      <div class="inventory-image-box"><div class="inventory-image-preview" id="itemImagePreview">${item?.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="Produktbilde">` : "Ta bilde eller velg fra bilder"}</div><div><div class="inventory-image-actions"><button type="button" class="secondary-btn" id="cameraBtn">Ta bilde</button><button type="button" class="secondary-btn" id="galleryBtn">Velg bilde</button><button type="button" class="secondary-btn" id="analyzeImageBtn" disabled>AI-analyse</button></div><p class="inventory-ai-note">AI fyller inn forslag. Kontroller produktdata før lagring.</p><input id="cameraInput" type="file" accept="image/*" capture="environment" hidden><input id="galleryInput" type="file" accept="image/*" hidden></div></div><div id="aiResult"></div>
      <div class="inventory-form-grid">
        <label class="inventory-field wide">Produktnavn<input name="name" maxlength="300" value="${v("name")}" required></label>
        <label class="inventory-field">Kategori<input name="category" maxlength="120" value="${v("category")}" placeholder="Oljefilter"></label>
        <label class="inventory-field">Underkategori<input name="subcategory" maxlength="120" value="${v("subcategory")}"></label>
        <label class="inventory-field">Merke<input name="brand" maxlength="160" value="${v("brand")}"></label>
        <label class="inventory-field">Varenummer<input name="partNumber" maxlength="160" value="${v("partNumber")}"></label>
        <label class="inventory-field">Modell<input name="model" maxlength="160" value="${v("model")}"></label>
        <label class="inventory-field">EAN / strekkode<input name="ean" maxlength="80" value="${v("ean")}"></label>
        <label class="inventory-field">Enhet<select name="unit">${["stk","liter","meter","kg","pakke"].map((unit) => `<option value="${unit}" ${item?.unit === unit || (!item && unit === "stk") ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
        ${item ? "" : '<label class="inventory-field">Startbeholdning<input name="stockQuantity" type="number" min="0" step="0.001" value="0" required></label>'}
        <label class="inventory-field">Lagerplass<input name="storageLocation" maxlength="200" value="${v("storageLocation")}"></label>
        <label class="inventory-field">Innkjøpspris / enhet<input name="purchaseUnitPrice" type="number" min="0" step="0.01" value="${v("purchaseUnitPrice")}"></label>
        <label class="inventory-field">Standard kundepris / enhet<input name="defaultCustomerUnitPrice" type="number" min="0" step="0.01" value="${v("defaultCustomerUnitPrice")}"></label>
        <label class="inventory-field">Varsle ved beholdning ≤<input name="lowStockThreshold" type="number" min="0" step="0.001" value="${esc(threshold)}" placeholder="Valgfritt"></label>
        <label class="inventory-field wide">Søkeord<input name="searchTermsText" value="${esc((item?.searchTerms || []).join(", "))}" placeholder="filter, oljefilter, oc11"></label>
        <label class="inventory-field wide">Beskrivelse<textarea name="description" maxlength="2000">${v("description")}</textarea></label>
      </div><p id="inventoryFormError" class="inventory-form-error"></p><div class="inventory-form-actions"><button type="button" class="secondary-btn" data-cancel>Avbryt</button><button type="submit" class="primary-btn">${item ? "Lagre endringer" : "Legg på lager"}</button></div>
    </form>`;
  }

  function bindItemForm(item = null) {
    const form = $("#inventoryItemForm", els.modalContent); const camera = $("#cameraInput", form); const gallery = $("#galleryInput", form); const analyze = $("#analyzeImageBtn", form); const result = $("#aiResult", form);
    $("#cameraBtn", form).addEventListener("click", () => camera.click()); $("#galleryBtn", form).addEventListener("click", () => gallery.click()); $("[data-cancel]", form).addEventListener("click", item ? () => openDetail(item._id) : closeModal);
    async function picked(file) { try { state.imageData = await fileToDataUri(file); $("#itemImagePreview", form).innerHTML = `<img src="${esc(state.imageData)}" alt="Valgt produktbilde">`; analyze.disabled = false; result.innerHTML = ""; } catch (error) { result.innerHTML = `<div class="inventory-ai-result">${esc(error.message)}</div>`; } }
    camera.addEventListener("change", () => picked(camera.files?.[0])); gallery.addEventListener("change", () => picked(gallery.files?.[0]));
    analyze.addEventListener("click", async () => {
      if (!state.imageData) return; analyze.disabled = true; result.innerHTML = '<div class="inventory-ai-result">AI analyserer bildet…</div>';
      try { const data = await api("/admin/inventory/analyze-image", { method: "POST", body: JSON.stringify({ imageData: state.imageData }) }); if (!data.suggestion) { result.innerHTML = '<div class="inventory-ai-result">Ingen sikkert AI-resultat. Fyll inn data manuelt.</div>'; return; } const s = data.suggestion; ["name","category","subcategory","brand","partNumber","model","ean","description"].forEach((name) => { if (s[name] && form.elements[name]) form.elements[name].value = s[name]; }); if (Array.isArray(s.searchTerms)) form.elements.searchTermsText.value = s.searchTerms.join(", "); result.innerHTML = `<div class="inventory-ai-result"><strong>AI-forslag lagt inn.</strong> Kontroller varenummer og modell før lagring.${(s.uncertainFields || []).length ? ` Usikkert: ${esc(s.uncertainFields.join(", "))}.` : ""}</div>`; }
      catch (error) { result.innerHTML = `<div class="inventory-ai-result">${esc(error.message)} Du kan registrere varen manuelt.</div>`; }
      finally { analyze.disabled = false; }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const error = $("#inventoryFormError", form); const save = $("button[type=submit]", form); error.textContent = ""; save.disabled = true;
      const data = Object.fromEntries(new FormData(form).entries()); const payload = { name: data.name.trim(), category: data.category.trim(), subcategory: data.subcategory.trim(), brand: data.brand.trim(), partNumber: data.partNumber.trim(), model: data.model.trim(), ean: data.ean.trim(), unit: data.unit, storageLocation: data.storageLocation.trim(), description: data.description.trim(), searchTerms: data.searchTermsText.split(",").map((v) => v.trim()).filter(Boolean), purchaseUnitPrice: data.purchaseUnitPrice, defaultCustomerUnitPrice: data.defaultCustomerUnitPrice, lowStockThreshold: data.lowStockThreshold, imageData: state.imageData || undefined };
      if (!item) { payload.stockQuantity = Number(data.stockQuantity || 0); payload.operationId = uuid("inventory-create"); }
      async function saveRequest(force = false) { if (item) { if (force) payload.forceUpdate = true; return api(`/admin/inventory/${encodeURIComponent(item._id)}`, { method: "PATCH", body: JSON.stringify(payload) }); } if (force) payload.forceCreate = true; return api("/admin/inventory/", { method: "POST", body: JSON.stringify(payload) }); }
      try { await saveRequest(false); setStatus(item ? "Varen er oppdatert." : "Varen er lagt på lager.", "success"); closeModal(); await loadItems(); await window.SorgulenAdminShell?.refreshBadges?.(); }
      catch (err) { if (err.status === 409 && err.data?.possibleDuplicates?.length && confirm(`${err.message}. Vil du lagre som egen vare likevel?`)) { try { await saveRequest(true); setStatus("Varen er lagret.", "success"); closeModal(); await loadItems(); } catch (retry) { error.textContent = retry.message; } } else error.textContent = err.message; }
      finally { save.disabled = false; }
    });
  }
  function openItemForm(item = null) { state.imageData = ""; state.current = item; openModal(item ? "Rediger vare" : "Registrer vare", formHtml(item), item ? "Produkt" : "Ny lagervare"); bindItemForm(item); }

  function movementName(type) { return ({ purchase: "Innkjøp", usage: "Brukt på oppdrag", adjustment: "Lagerjustering", waste: "Skadet / kastet", return: "Returnert", correction: "Korrigering" })[type] || type; }
  async function openDetail(id) {
    openModal("Henter vare…", '<div class="loading-card">Henter lagerhistorikk…</div>');
    try {
      const data = await api(`/admin/inventory/${encodeURIComponent(id)}`); const item = data.item; state.current = item;
      els.modalTitle.textContent = item.name; els.modalEyebrow.textContent = item.category || "Lager";
      els.modalContent.innerHTML = `<div class="inventory-detail-head"><div class="inventory-detail-image">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}">` : "Ingen bilde"}</div><div class="inventory-detail-info"><strong class="inventory-detail-stock">${esc(qty(item.stockQuantity))} ${esc(item.unit || "stk")}</strong><p>${esc([item.brand, item.partNumber, item.storageLocation].filter(Boolean).join(" · ") || "Ingen ekstra produktdata")}</p><p>Innkjøp: ${esc(money(item.purchaseUnitPrice))} · Kundepris: ${esc(money(item.defaultCustomerUnitPrice))}${item.lowStockThreshold != null ? ` · Varsle ved ≤ ${esc(qty(item.lowStockThreshold))}` : ""}</p></div></div>
        <div class="inventory-detail-actions"><button class="primary-btn" data-use>Bruk på oppdrag</button><button class="secondary-btn" data-add>Legg til beholdning</button><button class="secondary-btn" data-adjust>Juster lager</button><button class="secondary-btn" data-remove>Ta ut / kast</button><button class="secondary-btn" data-edit>Rediger</button></div>
        <section class="inventory-history"><h3>Historikk</h3>${(data.movements || []).length ? (data.movements || []).map((m) => `<div class="inventory-movement"><div><strong>${esc(movementName(m.type))}</strong><p>${esc(m.reason || "")}${m.workOrderId ? " · Oppdrag" : ""}</p></div><div><strong>${Number(m.quantityChange) > 0 ? "+" : ""}${esc(qty(m.quantityChange))} ${esc(m.unit || item.unit)}</strong><span>${esc(dateTime(m.createdAt))}</span></div></div>`).join("") : '<p class="empty-state">Ingen lagerbevegelser ennå.</p>'}</section>`;
      $("[data-edit]", els.modalContent).addEventListener("click", () => openItemForm(item));
      $("[data-add]", els.modalContent).addEventListener("click", () => openStockAction(item, "add"));
      $("[data-adjust]", els.modalContent).addEventListener("click", () => openStockAction(item, "adjust"));
      $("[data-remove]", els.modalContent).addEventListener("click", () => openStockAction(item, "remove"));
      $("[data-use]", els.modalContent).addEventListener("click", () => openUseOnProject(item));
    } catch (error) { els.modalContent.innerHTML = `<p class="inventory-form-error">${esc(error.message)}</p>`; }
  }

  function openStockAction(item, mode) {
    const title = mode === "add" ? "Legg til beholdning" : mode === "adjust" ? "Juster lager" : "Ta ut av lager";
    openModal(title, `<form id="stockActionForm" class="inventory-form"><p><strong>${esc(item.name)}</strong> · ${esc(qty(item.stockQuantity))} ${esc(item.unit)} på lager</p><div class="inventory-form-grid"><label class="inventory-field">${mode === "adjust" ? "Ny beholdning" : "Antall"}<input name="quantity" type="number" min="0${mode === "adjust" ? "" : ".001"}" step="0.001" required></label>${mode === "add" ? '<label class="inventory-field">Innkjøpspris / enhet<input name="purchaseUnitPrice" type="number" min="0" step="0.01"></label>' : ""}<label class="inventory-field wide">Årsak<input name="reason" maxlength="1000" placeholder="${mode === "add" ? "Innkjøp" : mode === "remove" ? "Skadet / kastet" : "Lageropptelling"}"></label></div><p id="stockActionError" class="inventory-form-error"></p><div class="inventory-form-actions"><button type="button" class="secondary-btn" data-back>Avbryt</button><button type="submit" class="primary-btn">Lagre</button></div></form>`, "Beholdning");
    const form = $("#stockActionForm", els.modalContent); $("[data-back]", form).addEventListener("click", () => openDetail(item._id));
    form.addEventListener("submit", async (event) => { event.preventDefault(); const error = $("#stockActionError", form); const button = $("button[type=submit]", form); button.disabled = true; const value = Number(form.elements.quantity.value); const reason = form.elements.reason.value.trim(); try { const path = mode === "add" ? "add-stock" : mode === "adjust" ? "adjust" : "remove"; const payload = mode === "adjust" ? { newQuantity: value, reason, operationId: uuid("inventory-adjust") } : mode === "add" ? { quantity: value, reason, purchaseUnitPrice: form.elements.purchaseUnitPrice.value, operationId: uuid("inventory-add") } : { quantity: value, reason, type: "waste", operationId: uuid("inventory-remove") }; await api(`/admin/inventory/${encodeURIComponent(item._id)}/${path}`, { method: "POST", body: JSON.stringify(payload) }); setStatus("Lagerbeholdningen er oppdatert.", "success"); await loadItems(); await window.SorgulenAdminShell?.refreshBadges?.(); openDetail(item._id); } catch (err) { error.textContent = err.message; } finally { button.disabled = false; } });
  }

  async function openUseOnProject(item) {
    openModal("Bruk på oppdrag", '<div class="loading-card">Henter åpne oppdrag…</div>', item.name);
    try {
      const data = await api("/admin/work-orders?limit=200"); const orders = (data.workOrders || []).filter((o) => ["planned","active","paused","stopped"].includes(o.status));
      els.modalContent.innerHTML = `<form id="useItemForm" class="inventory-form"><label class="inventory-field">Søk oppdrag<input id="useOrderSearch" type="search" placeholder="Kunde eller oppdrag"></label><div id="useOrderResults" class="inventory-use-results"></div><input name="workOrderId" type="hidden" required><div class="inventory-form-grid"><label class="inventory-field">Antall<input name="quantity" type="number" min="0.001" max="${esc(item.stockQuantity)}" step="0.001" value="1" required></label><label class="inventory-field">Kundepris / enhet<input name="unitPrice" type="number" min="0" step="0.01" value="${esc(item.defaultCustomerUnitPrice ?? "")}"></label><label class="inventory-field wide">Kommentar<input name="comment" maxlength="500"></label><label class="inventory-low-toggle"><input name="billable" type="checkbox" checked><span>Fakturerbar</span></label></div><p id="useError" class="inventory-form-error"></p><div class="inventory-form-actions"><button type="button" class="secondary-btn" data-back>Avbryt</button><button type="submit" class="primary-btn">Legg til på oppdrag</button></div></form>`;
      const form = $("#useItemForm", els.modalContent), search = $("#useOrderSearch", form), results = $("#useOrderResults", form); $("[data-back]", form).addEventListener("click", () => openDetail(item._id));
      function renderOrders() { const q = search.value.toLowerCase().trim(); const filtered = orders.filter((o) => !q || `${o.customerSnapshot?.name || ""} ${o.serviceName || ""}`.toLowerCase().includes(q)); results.innerHTML = filtered.length ? filtered.map((o) => `<button type="button" class="inventory-use-order" data-order-id="${esc(o._id)}"><div><strong>${esc(o.customerSnapshot?.name || "Kunde")}</strong><p>${esc(o.serviceName)} · ${esc(o.jobDate || "")}</p></div><span>${esc(o.status)}</span></button>`).join("") : '<p class="empty-state">Ingen åpne oppdrag.</p>'; $$("[data-order-id]", results).forEach((button) => button.addEventListener("click", () => { $$(".inventory-use-order", results).forEach((b) => b.classList.remove("is-selected")); button.classList.add("is-selected"); form.elements.workOrderId.value = button.dataset.orderId; })); }
      renderOrders(); search.addEventListener("input", renderOrders);
      form.addEventListener("submit", async (event) => { event.preventDefault(); const error = $("#useError", form); if (!form.elements.workOrderId.value) { error.textContent = "Velg oppdrag."; return; } const button = $("button[type=submit]", form); button.disabled = true; const payload = { workOrderId: form.elements.workOrderId.value, quantity: Number(form.elements.quantity.value), billable: form.elements.billable.checked, comment: form.elements.comment.value.trim(), operationId: uuid("inventory-use") }; if (form.elements.unitPrice.value !== "") payload.unitPrice = Number(form.elements.unitPrice.value); try { await api(`/admin/inventory/${encodeURIComponent(item._id)}/use`, { method: "POST", body: JSON.stringify(payload) }); setStatus(`${item.name} er lagt til på oppdraget.`, "success"); closeModal(); await loadItems(); await window.SorgulenAdminShell?.refreshBadges?.(); } catch (err) { error.textContent = err.message; } finally { button.disabled = false; } });
    } catch (error) { els.modalContent.innerHTML = `<p class="inventory-form-error">${esc(error.message)}</p>`; }
  }

  $("#createItemBtn").addEventListener("click", () => openItemForm());
  $("#refreshInventoryBtn").addEventListener("click", loadItems);
  $("#showLowStockBtn").addEventListener("click", () => { els.lowOnly.checked = true; loadItems(); });
  els.search.addEventListener("input", () => { clearTimeout(state.timer); state.timer = setTimeout(loadItems, 250); });
  els.category.addEventListener("change", loadItems); els.lowOnly.addEventListener("change", loadItems);

  if (!adminKey()) location.href = "login.html"; else loadItems();
})();