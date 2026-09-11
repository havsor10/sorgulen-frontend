(() => {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const projectList = document.getElementById("projectList");
  const editor = document.getElementById("portalEditor");
  const statusBox = document.getElementById("portalStatus");
  const availabilityStrip = document.getElementById("availabilityStrip");
  const blockDayForm = document.getElementById("blockDayForm");
  const blockDate = document.getElementById("blockDate");
  const blockNote = document.getElementById("blockNote");

  let workOrders = [];
  let selectedWorkOrder = null;
  let selectedPortal = null;
  let latestPortalUrl = "";
  let editingProcurementId = null;
  let busy = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function adminKey() {
    let key = localStorage.getItem(KEY_STORAGE) || "";
    if (!key) {
      key = prompt("Skriv inn admin-nøkkel:") || "";
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    }
    return key.trim();
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      throw new Error("Admin-nøkkel er feil eller mangler. Last siden på nytt og logg inn igjen.");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { data, status: response.status });
    return data;
  }

  function setStatus(message, type = "") {
    statusBox.textContent = message || "";
    statusBox.className = `portal-status-message ${type}`.trim();
  }

  function todayOslo() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function formatDate(value, options = {}) {
    if (!value) return "–";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("no-NO", {
      weekday: options.weekday ? "short" : undefined,
      day: "numeric",
      month: options.short ? "short" : "long",
      year: options.year ? "numeric" : undefined,
      hour: options.time ? "2-digit" : undefined,
      minute: options.time ? "2-digit" : undefined,
      timeZone: "Europe/Oslo",
    }).format(date);
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "–";
    return new Intl.NumberFormat("no-NO", {
      style: "currency",
      currency: "NOK",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function statusLabel(status) {
    return ({
      planned: "Planlagt",
      active: "Aktiv",
      paused: "Pauset",
      stopped: "Mellom økter",
      completed: "Ferdig",
      cancelled: "Avbrutt",
    })[status] || status;
  }

  function procurementStatusLabel(status) {
    return ({
      researching: "Henter inn produkt / pris",
      awaiting_approval: "Venter på kundens godkjenning",
      approved: "Godkjent av kunden",
      ordered: "Bestilt",
      waiting_delivery: "Venter på levering",
      ready_pickup: "Klar for henting",
      purchased: "Innkjøpt",
      cancelled: "Avbrutt",
    })[status] || status;
  }

  function buildPortalUrl(token) {
    return token ? `${window.location.origin}/prosjekt.html#${encodeURIComponent(token)}` : "";
  }

  function renderProjectList() {
    const visible = workOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
    if (!visible.length) {
      projectList.innerHTML = '<p class="muted">Ingen aktive prosjekter.</p>';
      return;
    }
    projectList.innerHTML = visible.map((order) => {
      const customer = order.customerSnapshot || {};
      return `<button type="button" class="portal-project-button ${selectedWorkOrder?._id === order._id ? "active" : ""}" data-project-id="${escapeHtml(order._id)}">
        <strong>${escapeHtml(customer.name || "Ukjent kunde")}</strong>
        <span>${escapeHtml(order.serviceName || "Oppdrag")} · ${escapeHtml(statusLabel(order.status))}</span>
      </button>`;
    }).join("");
  }

  function portalDefaults() {
    return {
      enabled: false,
      tokenHint: "",
      shareToken: "",
      customerMessage: "",
      nextWorkStart: "",
      nextWorkEnd: "",
      nextWorkMode: "expected",
      scheduleExpired: false,
      showHours: true,
      showWorkHistory: true,
      showImages: true,
      images: [],
      procurements: [],
    };
  }

  function imageCards(images) {
    if (!images?.length) return '<p class="muted">Ingen bilder delt med kunden ennå.</p>';
    return `<div class="portal-photo-admin-grid">${images.map((image) => {
      const safeUrl = /^https:\/\//i.test(image.url || "") ? image.url : "";
      if (!safeUrl) return "";
      return `<article class="portal-photo-admin">
        <img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(image.caption || "Prosjektbilde")}">
        <div>
          <p>${escapeHtml(image.caption || "Uten bildetekst")}</p>
          <button type="button" class="secondary-btn" data-delete-image="${escapeHtml(image.entryId)}">Fjern</button>
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function procurementStatusControl(procurement) {
    if (!["approved", "ordered", "waiting_delivery", "ready_pickup"].includes(procurement.status)) return "";
    return `<div class="procurement-status-control">
      <select data-procurement-status-select="${escapeHtml(procurement.entryId)}" aria-label="Innkjøpsstatus">
        <option value="approved" ${procurement.status === "approved" ? "selected" : ""}>Godkjent – ikke kjøpt ennå</option>
        <option value="ordered" ${procurement.status === "ordered" ? "selected" : ""}>Bestilt</option>
        <option value="waiting_delivery" ${procurement.status === "waiting_delivery" ? "selected" : ""}>Venter på levering</option>
        <option value="ready_pickup" ${procurement.status === "ready_pickup" ? "selected" : ""}>Klar for henting</option>
        <option value="purchased">Innkjøpt</option>
      </select>
      <button type="button" class="secondary-btn" data-set-procurement-status="${escapeHtml(procurement.entryId)}">Oppdater status</button>
    </div>`;
  }

  function procurementCards(procurements) {
    if (!procurements?.length) return '<p class="muted">Ingen innkjøp knyttet til kunden ennå. Denne delen vises ikke på kundesiden før du sender et konkret innkjøp til godkjenning.</p>';
    return `<div class="procurement-admin-list">${procurements.slice().reverse().map((procurement) => {
      const canEdit = ["researching", "awaiting_approval", "approved"].includes(procurement.status);
      const canCancel = !["purchased", "cancelled"].includes(procurement.status);
      const statusClass = ["approved", "ordered", "ready_pickup", "purchased"].includes(procurement.status)
        ? "good"
        : ["awaiting_approval", "waiting_delivery"].includes(procurement.status) ? "waiting" : "";
      return `<article class="procurement-admin-card ${statusClass}">
        <div class="procurement-admin-head">
          <div><strong>${escapeHtml(procurement.title)}</strong><span>${escapeHtml(procurementStatusLabel(procurement.status))}</span></div>
          <strong>${escapeHtml(formatCurrency(procurement.total || 0))}</strong>
        </div>
        ${procurement.supplier ? `<p>Leverandør: ${escapeHtml(procurement.supplier)}</p>` : ""}
        <p>${(procurement.items || []).length} produktlinje${(procurement.items || []).length === 1 ? "" : "r"}${procurement.customerApprovedAt ? ` · Godkjent ${escapeHtml(formatDate(procurement.customerApprovedAt, { time: true }))}` : ""}</p>
        ${procurementStatusControl(procurement)}
        <div class="portal-actions compact-actions">
          ${canEdit ? `<button type="button" class="secondary-btn" data-edit-procurement="${escapeHtml(procurement.entryId)}">Rediger</button>` : ""}
          ${canCancel ? `<button type="button" class="secondary-btn" data-cancel-procurement="${escapeHtml(procurement.entryId)}">Avbryt</button>` : ""}
        </div>
      </article>`;
    }).join("")}</div>`;
  }

  function procurementLineRow(item = {}) {
    return `<div class="procurement-item-row" data-entry-id="${escapeHtml(item.entryId || "")}">
      <div class="portal-field item-name"><label>Produkt</label><input data-procurement-field="name" maxlength="300" value="${escapeHtml(item.name || "")}" placeholder="F.eks. Fugesand"></div>
      <div class="portal-field item-url"><label>Produktlenke</label><input data-procurement-field="productUrl" type="url" maxlength="1000" value="${escapeHtml(item.productUrl || "")}" placeholder="https://..."></div>
      <div class="portal-field item-qty"><label>Mengde</label><input data-procurement-field="quantity" type="number" min="0.01" step="0.01" value="${escapeHtml(item.quantity ?? 1)}"></div>
      <div class="portal-field item-unit"><label>Enhet</label><input data-procurement-field="unit" maxlength="40" value="${escapeHtml(item.unit || "stk")}"></div>
      <div class="portal-field item-price"><label>Pris per enhet</label><input data-procurement-field="unitPrice" type="number" min="0" step="0.01" value="${escapeHtml(item.unitPrice ?? "")}" placeholder="kr"></div>
      <div class="portal-field item-note"><label>Kort merknad</label><input data-procurement-field="note" maxlength="500" value="${escapeHtml(item.note || "")}" placeholder="Valgfritt"></div>
      <button type="button" class="admin-icon-button remove-procurement-row" aria-label="Fjern produktlinje">×</button>
    </div>`;
  }

  function procurementForm(procurements) {
    const editing = procurements.find((item) => item.entryId === editingProcurementId) || null;
    if (editing && !["researching", "awaiting_approval", "approved"].includes(editing.status)) {
      editingProcurementId = null;
    }
    const activeEdit = procurements.find((item) => item.entryId === editingProcurementId) || null;
    const items = activeEdit?.items?.length ? activeEdit.items : [{}];
    return `<div class="procurement-builder">
      <div class="procurement-builder-head">
        <div><h4>${escapeHtml(activeEdit ? `Rediger innkjøp: ${activeEdit.title}` : "Nytt innkjøp")}</h4><p class="muted">Mens du bare innhenter priser er dette skjult for kunden. Først når du sender det til godkjenning blir det synlig.</p></div>
        ${activeEdit ? '<button type="button" class="secondary-btn" id="cancelProcurementEdit">Lukk redigering</button>' : ""}
      </div>
      <div class="portal-form-grid">
        <div class="portal-field"><label for="procurementTitle">Hva skal kjøpes?</label><input id="procurementTitle" maxlength="220" value="${escapeHtml(activeEdit?.title || "")}" placeholder="F.eks. Fugesand til området"></div>
        <div class="portal-field"><label for="procurementSupplier">Leverandør</label><input id="procurementSupplier" maxlength="220" value="${escapeHtml(activeEdit?.supplier || "")}" placeholder="F.eks. Byggmakker"></div>
        <div class="portal-field full"><label for="procurementNote">Forklaring kunden skal se</label><textarea id="procurementNote" maxlength="1000" placeholder="F.eks. Jeg har beregnet dette som riktig mengde for området.">${escapeHtml(activeEdit?.customerNote || "")}</textarea></div>
      </div>
      <div class="procurement-items-head"><strong>Produkter, mengde og pris</strong><button id="addProcurementRow" type="button" class="secondary-btn">+ Produktlinje</button></div>
      <div id="procurementItems">${items.map(procurementLineRow).join("")}</div>
      <div class="portal-actions procurement-save-actions">
        <button type="button" class="secondary-btn" data-save-procurement="researching">Lagre mens jeg innhenter priser</button>
        <button type="button" class="primary-btn" data-save-procurement="awaiting_approval">Send til kunden for godkjenning</button>
      </div>
    </div>`;
  }

  function renderEditor() {
    if (!selectedWorkOrder) return;
    const portal = { ...portalDefaults(), ...(selectedPortal || {}) };
    const customer = selectedWorkOrder.customerSnapshot || {};
    const linkActive = Boolean(portal.enabled && portal.tokenHint);
    latestPortalUrl = buildPortalUrl(portal.shareToken) || latestPortalUrl;

    editor.classList.remove("portal-editor-empty");
    editor.innerHTML = `
      <div class="portal-editor-head">
        <div>
          <p class="section-kicker">Kundeside</p>
          <h2>${escapeHtml(customer.name || "Ukjent kunde")}</h2>
          <p>${escapeHtml(selectedWorkOrder.serviceName || "Oppdrag")}</p>
        </div>
        <div class="portal-actions compact-actions">
          <span class="portal-state-pill ${linkActive ? "active" : ""}">${linkActive ? "Lenke aktiv" : "Ingen aktiv lenke"}</span>
          <button id="refreshSelectedPortal" type="button" class="secondary-btn">Oppdater</button>
        </div>
      </div>

      <section>
        <h3>1. Kundelenke</h3>
        <p class="muted">Denne lenken åpner kun dette prosjektet. Kunden kan bruke samme lenke gjennom hele oppdraget.</p>
        ${linkActive ? `<p><strong>Aktiv sikker lenke</strong> · slutter på …${escapeHtml(portal.tokenHint)}</p>` : ""}
        <div class="portal-actions">
          ${!linkActive ? '<button id="generatePortalLink" type="button" class="primary-btn">Opprett kundelenke</button>' : '<button id="generatePortalLink" type="button" class="secondary-btn" data-regenerate="true">Lag ny lenke</button>'}
          ${linkActive ? '<button id="revokePortalLink" type="button" class="danger-btn">Deaktiver lenke</button>' : ""}
        </div>
        ${latestPortalUrl ? `<div class="portal-link-box"><strong>Kundelenke</strong><input id="portalUrl" value="${escapeHtml(latestPortalUrl)}" readonly><div class="portal-actions"><button id="copyPortalLink" type="button" class="secondary-btn">Kopier lenke</button><button id="sharePortalLink" type="button" class="secondary-btn">Del via SMS / e-post</button><a class="secondary-btn" href="${escapeHtml(latestPortalUrl)}" target="_blank" rel="noopener">Åpne kundesiden</a></div></div>` : linkActive ? '<p class="muted">Denne eldre lenken kan ikke vises igjen. Lag ny lenke én gang, så kan den deretter kopieres når som helst.</p>' : ""}
      </section>

      <hr>

      <form id="portalSettingsForm">
        <h3>2. Det viktigste kunden ser</h3>
        ${portal.scheduleExpired ? '<div class="portal-warning"><strong>Neste arbeidsperiode er passert.</strong><span>Kunden ser ikke den gamle datoen. Sett en ny dato eller bruk «Foreslå neste mulighet».</span></div>' : ""}
        <div class="portal-form-grid">
          <div class="portal-field"><label for="nextWorkStart">Fra dato</label><input id="nextWorkStart" type="date" value="${escapeHtml(portal.nextWorkStart)}"></div>
          <div class="portal-field"><label for="nextWorkEnd">Til dato</label><input id="nextWorkEnd" type="date" value="${escapeHtml(portal.nextWorkEnd)}"></div>
          <div class="portal-field"><label for="nextWorkMode">Hvordan skal det stå?</label><select id="nextWorkMode"><option value="expected" ${portal.nextWorkMode !== "planned" ? "selected" : ""}>Forventet / trolig</option><option value="planned" ${portal.nextWorkMode === "planned" ? "selected" : ""}>Planlagt</option></select></div>
          <div class="portal-field"><label>&nbsp;</label><button id="suggestNextWork" type="button" class="secondary-btn">Foreslå neste mulighet</button><small>Tar hensyn til skiftplan, hvile, private blokkeringer og andre kundeprosjekter.</small></div>
          <div class="portal-field full"><label for="customerMessage">Siste oppdatering til kunden</label><textarea id="customerMessage" maxlength="1500" placeholder="F.eks. Parkeringsområdet er ferdig. Neste gang fortsetter jeg langs garasjen.">${escapeHtml(portal.customerMessage)}</textarea></div>
        </div>

        <h3>3. Hva kunden får se</h3>
        <p class="muted">Tomme seksjoner vises aldri. Disse bryterne bestemmer bare om informasjon som faktisk finnes kan vises.</p>
        <div class="portal-visibility">
          <label class="portal-check"><input id="showHours" type="checkbox" ${portal.showHours ? "checked" : ""}> Arbeidstid hittil</label>
          <label class="portal-check"><input id="showWorkHistory" type="checkbox" ${portal.showWorkHistory ? "checked" : ""}> Arbeidsdager</label>
          <label class="portal-check"><input id="showImages" type="checkbox" ${portal.showImages ? "checked" : ""}> Prosjektbilder</label>
        </div>
        <div class="portal-actions"><button id="savePortalSettings" type="submit" class="primary-btn">Lagre kundeoppdatering</button></div>
      </form>

      <hr>

      <section>
        <h3>4. Innkjøp kunden eventuelt skal godkjenne</h3>
        ${procurementCards(portal.procurements)}
        ${procurementForm(portal.procurements)}
      </section>

      <hr>

      <section>
        <h3>5. Bilder kunden kan se</h3>
        <div class="portal-form-grid">
          <div class="portal-field"><label for="portalImage">Velg bilde</label><input id="portalImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic"></div>
          <div class="portal-field"><label for="portalImageCaption">Kort bildetekst</label><input id="portalImageCaption" maxlength="300" placeholder="F.eks. Området etter første rengjøring"></div>
        </div>
        <div class="portal-actions"><button id="uploadPortalImage" type="button" class="secondary-btn">Last opp til kunden</button></div>
        ${imageCards(portal.images)}
      </section>`;
  }

  async function loadProjects() {
    const data = await apiFetch("/admin/work-orders?limit=200");
    workOrders = Array.isArray(data.workOrders) ? data.workOrders : [];
    renderProjectList();
  }

  async function reloadSelectedPortal(showStatus = false) {
    if (!selectedWorkOrder) return;
    if (showStatus) setStatus("Oppdaterer kundeportalen…");
    const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}`);
    selectedPortal = data.portal || null;
    latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken);
    renderEditor();
    await loadAvailability();
    if (showStatus) setStatus("Oppdatert.", "success");
  }

  async function selectProject(id) {
    selectedWorkOrder = workOrders.find((order) => order._id === id) || null;
    selectedPortal = null;
    latestPortalUrl = "";
    editingProcurementId = null;
    renderProjectList();
    if (!selectedWorkOrder) return;
    setStatus("Henter kundeportalen…");
    await reloadSelectedPortal(false);
    setStatus("");
  }

  async function generateLink(regenerate = false) {
    if (!selectedWorkOrder || busy) return;
    if (regenerate && !confirm("Lage ny lenke? Den gamle kundelenken slutter å virke med en gang.")) return;
    busy = true;
    setStatus(regenerate ? "Lager ny sikker kundelenke…" : "Lager sikker kundelenke…");
    try {
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/link`, {
        method: "POST",
        body: JSON.stringify({ regenerate }),
      });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(data.token || selectedPortal?.shareToken);
      renderEditor();
      setStatus("Kundelenken er klar og kan brukes gjennom hele prosjektet.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function revokeLink() {
    if (!selectedWorkOrder || busy) return;
    if (!confirm("Deaktivere kundelenken? Kunden mister tilgang med en gang.")) return;
    busy = true;
    try {
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/revoke`, { method: "POST", body: "{}" });
      selectedPortal = data.portal;
      latestPortalUrl = "";
      renderEditor();
      setStatus("Kundelenken er deaktivert.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!selectedWorkOrder || busy) return;
    busy = true;
    setStatus("Lagrer det kunden skal se…");
    try {
      const payload = {
        nextWorkStart: document.getElementById("nextWorkStart").value,
        nextWorkEnd: document.getElementById("nextWorkEnd").value,
        nextWorkMode: document.getElementById("nextWorkMode").value,
        customerMessage: document.getElementById("customerMessage").value.trim(),
        showHours: document.getElementById("showHours").checked,
        showWorkHistory: document.getElementById("showWorkHistory").checked,
        showImages: document.getElementById("showImages").checked,
      };
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken) || latestPortalUrl;
      renderEditor();
      await loadAvailability();
      setStatus("Kundeoppdateringen er lagret.", "success");
    } catch (error) {
      const blocked = error.data?.blockedDates;
      setStatus(blocked?.length ? `${error.message} Velg en annen periode.` : error.message, "error");
    } finally { busy = false; }
  }

  async function suggestNextWork() {
    if (!selectedWorkOrder || busy) return;
    const from = addDays(todayOslo(), 1);
    setStatus("Ser etter neste realistiske mulighet…");
    try {
      const data = await apiFetch(`/admin/customer-portal/suggest-next?from=${encodeURIComponent(from)}&workOrderId=${encodeURIComponent(selectedWorkOrder._id)}`);
      if (!data.suggestion) {
        setStatus("Fant ingen ledig periode i de neste 90 dagene.", "error");
        return;
      }
      document.getElementById("nextWorkStart").value = data.suggestion.start;
      document.getElementById("nextWorkEnd").value = data.suggestion.end;
      document.getElementById("nextWorkMode").value = "expected";
      setStatus(`Forslag: ${formatDate(data.suggestion.start)}${data.suggestion.end !== data.suggestion.start ? ` – ${formatDate(data.suggestion.end)}` : ""}. Kontroller og trykk Lagre.`, "success");
    } catch (error) { setStatus(error.message, "error"); }
  }

  function collectProcurementItems() {
    return [...editor.querySelectorAll(".procurement-item-row")].map((row) => ({
      entryId: row.dataset.entryId || undefined,
      name: row.querySelector('[data-procurement-field="name"]').value.trim(),
      productUrl: row.querySelector('[data-procurement-field="productUrl"]').value.trim(),
      quantity: row.querySelector('[data-procurement-field="quantity"]').value,
      unit: row.querySelector('[data-procurement-field="unit"]').value.trim(),
      unitPrice: row.querySelector('[data-procurement-field="unitPrice"]').value,
      note: row.querySelector('[data-procurement-field="note"]').value.trim(),
    })).filter((item) => item.name || item.productUrl || item.unitPrice);
  }

  async function saveProcurement(status) {
    if (!selectedWorkOrder || busy) return;
    const title = document.getElementById("procurementTitle")?.value.trim();
    if (!title) { setStatus("Skriv hva som skal kjøpes inn.", "error"); return; }
    busy = true;
    setStatus(status === "awaiting_approval" ? "Sender innkjøpsoversikten til kunden…" : "Lagrer prisinnhentingen…");
    try {
      const payload = {
        title,
        supplier: document.getElementById("procurementSupplier").value.trim(),
        customerNote: document.getElementById("procurementNote").value.trim(),
        items: collectProcurementItems(),
        status,
      };
      const path = editingProcurementId
        ? `/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/procurements/${encodeURIComponent(editingProcurementId)}`
        : `/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/procurements`;
      const data = await apiFetch(path, { method: editingProcurementId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken) || latestPortalUrl;
      editingProcurementId = null;
      renderEditor();
      setStatus(status === "awaiting_approval" ? "Innkjøpet er nå synlig for kunden og venter på godkjenning." : "Lagret internt. Kunden ser ikke dette ennå.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function updateProcurementStatus(entryId, status) {
    if (!selectedWorkOrder || busy) return;
    if (status === "purchased" && !confirm("Bekrefte at dette faktisk er kjøpt inn?")) return;
    if (status === "cancelled" && !confirm("Avbryte dette innkjøpet? Det forsvinner fra kundesiden.")) return;
    busy = true;
    setStatus("Oppdaterer innkjøpsstatus…");
    try {
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/procurements/${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken) || latestPortalUrl;
      editingProcurementId = null;
      renderEditor();
      setStatus(status === "cancelled" ? "Innkjøpet er avbrutt og skjult for kunden." : `Status satt til «${procurementStatusLabel(status)}».`, "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function copyLink() {
    if (!latestPortalUrl) return;
    try {
      await navigator.clipboard.writeText(latestPortalUrl);
      setStatus("Lenken er kopiert.", "success");
    } catch {
      const input = document.getElementById("portalUrl");
      input?.select();
      document.execCommand("copy");
      setStatus("Lenken er kopiert.", "success");
    }
  }

  async function shareLink() {
    if (!latestPortalUrl) return;
    const customerName = selectedWorkOrder?.customerSnapshot?.name || "";
    const text = `Hei${customerName ? ` ${customerName}` : ""}! Her kan du følge prosjektet ditt hos Sørgulen Industriservice. Du ser status, når jeg mest sannsynlig kommer tilbake, og eventuelle innkjøp som trenger godkjenning.`;
    if (navigator.share) {
      try { await navigator.share({ title: "Følg prosjektet ditt", text, url: latestPortalUrl }); }
      catch (error) { if (error.name !== "AbortError") setStatus("Kunne ikke åpne deling.", "error"); }
    } else await copyLink();
  }

  async function uploadImage() {
    if (!selectedWorkOrder || busy) return;
    const input = document.getElementById("portalImage");
    const file = input?.files?.[0];
    if (!file) { setStatus("Velg et bilde først.", "error"); return; }
    if (!window.SorgulenPortalImageUpload?.prepare) { setStatus("Bildeopplasting er ikke klar. Last siden på nytt.", "error"); return; }
    busy = true;
    setStatus("Klargjør bildet for raskere opplasting…");
    try {
      const prepared = await window.SorgulenPortalImageUpload.prepare(file);
      setStatus(prepared.compressed ? "Bildet er komprimert. Laster opp…" : "Laster opp bildet…");
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/images`, {
        method: "POST",
        body: JSON.stringify({ imageData: prepared.imageData, caption: document.getElementById("portalImageCaption").value.trim() }),
      });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken) || latestPortalUrl;
      renderEditor();
      setStatus(prepared.compressed ? "Bildet er komprimert og synlig på kundesiden." : "Bildet er nå synlig på kundesiden.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function deleteImage(entryId) {
    if (!selectedWorkOrder || busy) return;
    if (!confirm("Fjerne dette bildet fra kundesiden?")) return;
    busy = true;
    try {
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/images/${encodeURIComponent(entryId)}`, { method: "DELETE" });
      selectedPortal = data.portal;
      latestPortalUrl = buildPortalUrl(selectedPortal?.shareToken) || latestPortalUrl;
      renderEditor();
      setStatus("Bildet er fjernet fra kundesiden.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function loadAvailability() {
    const from = todayOslo();
    blockDate.min = from;
    if (!blockDate.value) blockDate.value = addDays(from, 1);
    const workOrderParam = selectedWorkOrder ? `&workOrderId=${encodeURIComponent(selectedWorkOrder._id)}` : "";
    const data = await apiFetch(`/admin/customer-portal/availability?from=${encodeURIComponent(from)}&days=21${workOrderParam}`);
    availabilityStrip.innerHTML = (data.availability || []).map((day) => `<article class="availability-day ${day.available ? "available" : "blocked"}">
      <strong>${escapeHtml(formatDate(day.date, { weekday: true, short: true }))}</strong>
      <span>${day.available ? "Ledig" : "Opptatt"}</span>
      <small>${escapeHtml(day.reason)}</small>
      ${day.reasonCode === "manual_block" ? `<button type="button" class="secondary-btn" data-unblock-date="${escapeHtml(day.date)}">Fjern blokkering</button>` : ""}
    </article>`).join("");
  }

  async function blockDay(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await apiFetch("/admin/customer-portal/availability-overrides", {
        method: "POST",
        body: JSON.stringify({ date: blockDate.value, blocked: true, note: blockNote.value.trim() }),
      });
      blockNote.value = "";
      await loadAvailability();
      setStatus("Dagen er markert som utilgjengelig.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function unblockDay(date) {
    if (busy) return;
    busy = true;
    try {
      await apiFetch("/admin/customer-portal/availability-overrides", {
        method: "POST",
        body: JSON.stringify({ date, blocked: false }),
      });
      await loadAvailability();
      setStatus("Den ekstra blokkeringen er fjernet.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  projectList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-id]");
    if (button) selectProject(button.dataset.projectId).catch((error) => setStatus(error.message, "error"));
  });

  editor.addEventListener("click", (event) => {
    if (event.target.id === "generatePortalLink") generateLink(event.target.dataset.regenerate === "true");
    else if (event.target.id === "revokePortalLink") revokeLink();
    else if (event.target.id === "refreshSelectedPortal") reloadSelectedPortal(true).catch((error) => setStatus(error.message, "error"));
    else if (event.target.id === "suggestNextWork") suggestNextWork();
    else if (event.target.id === "copyPortalLink") copyLink();
    else if (event.target.id === "sharePortalLink") shareLink();
    else if (event.target.id === "uploadPortalImage") uploadImage();
    else if (event.target.id === "addProcurementRow") document.getElementById("procurementItems")?.insertAdjacentHTML("beforeend", procurementLineRow());
    else if (event.target.id === "cancelProcurementEdit") { editingProcurementId = null; renderEditor(); }
    else if (event.target.closest(".remove-procurement-row")) {
      const row = event.target.closest(".procurement-item-row");
      if (editor.querySelectorAll(".procurement-item-row").length > 1) row?.remove();
      else row?.querySelectorAll("input").forEach((input) => {
        input.value = input.dataset.procurementField === "quantity" ? "1" : input.dataset.procurementField === "unit" ? "stk" : "";
      });
    } else {
      const save = event.target.closest("[data-save-procurement]");
      if (save) { saveProcurement(save.dataset.saveProcurement); return; }
      const edit = event.target.closest("[data-edit-procurement]");
      if (edit) {
        editingProcurementId = edit.dataset.editProcurement;
        renderEditor();
        editor.querySelector(".procurement-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const setStatusButton = event.target.closest("[data-set-procurement-status]");
      if (setStatusButton) {
        const id = setStatusButton.dataset.setProcurementStatus;
        const select = editor.querySelector(`[data-procurement-status-select="${CSS.escape(id)}"]`);
        if (select) updateProcurementStatus(id, select.value);
        return;
      }
      const cancelProcurement = event.target.closest("[data-cancel-procurement]");
      if (cancelProcurement) { updateProcurementStatus(cancelProcurement.dataset.cancelProcurement, "cancelled"); return; }
      const deleteButton = event.target.closest("[data-delete-image]");
      if (deleteButton) deleteImage(deleteButton.dataset.deleteImage);
    }
  });

  editor.addEventListener("submit", (event) => {
    if (event.target.id === "portalSettingsForm") saveSettings(event);
  });

  availabilityStrip.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unblock-date]");
    if (button) unblockDay(button.dataset.unblockDate);
  });
  blockDayForm.addEventListener("submit", blockDay);

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      setStatus("Henter prosjekter og skiftplan…");
      await loadProjects();
      const requestedId = new URLSearchParams(window.location.search).get("workOrderId");
      if (requestedId && workOrders.some((order) => order._id === requestedId)) await selectProject(requestedId);
      else await loadAvailability();
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Kunne ikke hente kundeportalen.", "error");
    }
  });
})();
