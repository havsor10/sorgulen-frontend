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
    if (!response.ok) throw new Error(data?.error || `API-feil ${response.status}`);
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
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("no-NO", {
      weekday: options.weekday ? "short" : undefined,
      day: "numeric",
      month: options.short ? "short" : "long",
      timeZone: "Europe/Oslo",
    }).format(date);
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
      customerMessage: "",
      materialStatus: "none",
      materialMessage: "",
      nextWorkStart: "",
      nextWorkEnd: "",
      nextWorkMode: "expected",
      showHours: true,
      showWorkHistory: true,
      showImages: true,
      images: [],
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

  function renderEditor() {
    if (!selectedWorkOrder) return;
    const portal = { ...portalDefaults(), ...(selectedPortal || {}) };
    const customer = selectedWorkOrder.customerSnapshot || {};
    const linkActive = Boolean(portal.enabled && portal.tokenHint);

    editor.classList.remove("portal-editor-empty");
    editor.innerHTML = `
      <div class="portal-editor-head">
        <div>
          <p class="section-kicker">Kundeside</p>
          <h2>${escapeHtml(customer.name || "Ukjent kunde")}</h2>
          <p>${escapeHtml(selectedWorkOrder.serviceName || "Oppdrag")}</p>
        </div>
        <span class="portal-state-pill ${linkActive ? "active" : ""}">${linkActive ? "Lenke aktiv" : "Ingen aktiv lenke"}</span>
      </div>

      <section>
        <h3>1. Kundelenke</h3>
        <p class="muted">Lenken åpner kun dette prosjektet. Den kan ikke brukes til å se andre kunder.</p>
        ${linkActive ? `<p><strong>Aktiv sikker lenke</strong> · slutter på …${escapeHtml(portal.tokenHint)}</p>` : ""}
        <div class="portal-actions">
          <button id="generatePortalLink" type="button" class="primary-btn">${linkActive ? "Lag ny lenke" : "Opprett kundelenke"}</button>
          ${linkActive ? '<button id="revokePortalLink" type="button" class="danger-btn">Deaktiver lenke</button>' : ""}
        </div>
        ${latestPortalUrl ? `<div class="portal-link-box"><strong>Ny lenke er klar</strong><input id="portalUrl" value="${escapeHtml(latestPortalUrl)}" readonly><div class="portal-actions"><button id="copyPortalLink" type="button" class="secondary-btn">Kopier lenke</button><button id="sharePortalLink" type="button" class="secondary-btn">Del via SMS / e-post</button><a class="secondary-btn" href="${escapeHtml(latestPortalUrl)}" target="_blank" rel="noopener">Åpne kundesiden</a></div><small>Hele lenken vises bare etter at den er opprettet. Lager du en ny lenke, slutter den gamle å virke.</small></div>` : ""}
      </section>

      <hr>

      <form id="portalSettingsForm">
        <h3>2. Det viktigste kunden ser</h3>
        <div class="portal-form-grid">
          <div class="portal-field">
            <label for="nextWorkStart">Fra dato</label>
            <input id="nextWorkStart" type="date" value="${escapeHtml(portal.nextWorkStart)}">
          </div>
          <div class="portal-field">
            <label for="nextWorkEnd">Til dato</label>
            <input id="nextWorkEnd" type="date" value="${escapeHtml(portal.nextWorkEnd)}">
          </div>
          <div class="portal-field">
            <label for="nextWorkMode">Hvordan skal det stå?</label>
            <select id="nextWorkMode">
              <option value="expected" ${portal.nextWorkMode !== "planned" ? "selected" : ""}>Forventet / trolig</option>
              <option value="planned" ${portal.nextWorkMode === "planned" ? "selected" : ""}>Planlagt</option>
            </select>
          </div>
          <div class="portal-field">
            <label>&nbsp;</label>
            <button id="suggestNextWork" type="button" class="secondary-btn">Foreslå neste mulighet</button>
            <small>Bruker skiftplanen og ekstra blokkerte dager. Du godkjenner alltid datoen selv.</small>
          </div>
          <div class="portal-field full">
            <label for="customerMessage">Siste oppdatering til kunden</label>
            <textarea id="customerMessage" maxlength="1500" placeholder="F.eks. Parkeringsområdet er ferdig. Neste gang fortsetter jeg langs garasjen.">${escapeHtml(portal.customerMessage)}</textarea>
          </div>
        </div>

        <h3>3. Innkjøp / materialer</h3>
        <div class="portal-form-grid">
          <div class="portal-field">
            <label for="materialStatus">Status</label>
            <select id="materialStatus">
              <option value="none" ${portal.materialStatus === "none" ? "selected" : ""}>Ikke vis noe</option>
              <option value="need_purchase" ${portal.materialStatus === "need_purchase" ? "selected" : ""}>Må kjøpes inn</option>
              <option value="ordered" ${portal.materialStatus === "ordered" ? "selected" : ""}>Bestilt</option>
              <option value="waiting_delivery" ${portal.materialStatus === "waiting_delivery" ? "selected" : ""}>Venter på levering</option>
              <option value="ready_pickup" ${portal.materialStatus === "ready_pickup" ? "selected" : ""}>Klar for henting</option>
              <option value="purchased" ${portal.materialStatus === "purchased" ? "selected" : ""}>Kjøpt / klart</option>
            </select>
          </div>
          <div class="portal-field">
            <label for="materialMessage">Kort forklaring</label>
            <input id="materialMessage" maxlength="800" value="${escapeHtml(portal.materialMessage)}" placeholder="F.eks. forventes levert før neste arbeidsøkt">
          </div>
        </div>

        <h3>4. Hva kunden får se</h3>
        <div class="portal-visibility">
          <label class="portal-check"><input id="showHours" type="checkbox" ${portal.showHours ? "checked" : ""}> Arbeidstid hittil</label>
          <label class="portal-check"><input id="showWorkHistory" type="checkbox" ${portal.showWorkHistory ? "checked" : ""}> Arbeidsdager</label>
          <label class="portal-check"><input id="showImages" type="checkbox" ${portal.showImages ? "checked" : ""}> Prosjektbilder</label>
        </div>
        <div class="portal-actions"><button id="savePortalSettings" type="submit" class="primary-btn">Lagre kundeoppdatering</button></div>
      </form>

      <hr>

      <section>
        <h3>5. Bilder kunden kan se</h3>
        <div class="portal-form-grid">
          <div class="portal-field">
            <label for="portalImage">Velg bilde</label>
            <input id="portalImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic">
          </div>
          <div class="portal-field">
            <label for="portalImageCaption">Kort bildetekst</label>
            <input id="portalImageCaption" maxlength="300" placeholder="F.eks. Området etter første rengjøring">
          </div>
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

  async function selectProject(id) {
    selectedWorkOrder = workOrders.find((order) => order._id === id) || null;
    selectedPortal = null;
    latestPortalUrl = "";
    renderProjectList();
    if (!selectedWorkOrder) return;
    setStatus("Henter kundeportalen…");
    const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(id)}`);
    selectedPortal = data.portal || null;
    renderEditor();
    setStatus("");
  }

  async function generateLink() {
    if (!selectedWorkOrder || busy) return;
    const replacing = Boolean(selectedPortal?.tokenHint && selectedPortal?.enabled);
    if (replacing && !confirm("Lage ny lenke? Den gamle kundelenken slutter å virke med en gang.")) return;
    busy = true;
    setStatus("Lager sikker kundelenke…");
    try {
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/link`, { method: "POST", body: "{}" });
      selectedPortal = data.portal;
      latestPortalUrl = `${window.location.origin}/prosjekt.html#${encodeURIComponent(data.token)}`;
      renderEditor();
      setStatus("Kundelenken er klar. Del den med kunden nå.", "success");
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
        materialStatus: document.getElementById("materialStatus").value,
        materialMessage: document.getElementById("materialMessage").value.trim(),
        showHours: document.getElementById("showHours").checked,
        showWorkHistory: document.getElementById("showWorkHistory").checked,
        showImages: document.getElementById("showImages").checked,
      };
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      selectedPortal = data.portal;
      renderEditor();
      setStatus("Kundeoppdateringen er lagret.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function suggestNextWork() {
    if (!selectedWorkOrder || busy) return;
    const from = addDays(todayOslo(), 1);
    setStatus("Ser etter neste realistiske mulighet i skiftplanen…");
    try {
      const data = await apiFetch(`/admin/customer-portal/suggest-next?from=${encodeURIComponent(from)}`);
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
    const text = `Hei${customerName ? ` ${customerName}` : ""}! Her kan du følge prosjektet ditt hos Sørgulen Industriservice. Du ser status og når jeg mest sannsynlig kommer tilbake.`;
    if (navigator.share) {
      try { await navigator.share({ title: "Følg prosjektet ditt", text, url: latestPortalUrl }); }
      catch (error) { if (error.name !== "AbortError") setStatus("Kunne ikke åpne deling.", "error"); }
    } else {
      await copyLink();
    }
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Kunne ikke lese bildet."));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage() {
    if (!selectedWorkOrder || busy) return;
    const input = document.getElementById("portalImage");
    const file = input?.files?.[0];
    if (!file) { setStatus("Velg et bilde først.", "error"); return; }
    if (file.size > 12 * 1024 * 1024) { setStatus("Bildet er for stort. Maks ca. 12 MB.", "error"); return; }

    busy = true;
    setStatus("Laster opp bildet…");
    try {
      const imageData = await fileAsDataUrl(file);
      const data = await apiFetch(`/admin/customer-portal/${encodeURIComponent(selectedWorkOrder._id)}/images`, {
        method: "POST",
        body: JSON.stringify({ imageData, caption: document.getElementById("portalImageCaption").value.trim() }),
      });
      selectedPortal = data.portal;
      renderEditor();
      setStatus("Bildet er nå synlig på kundesiden.", "success");
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
      renderEditor();
      setStatus("Bildet er fjernet fra kundesiden.", "success");
    } catch (error) { setStatus(error.message, "error"); }
    finally { busy = false; }
  }

  async function loadAvailability() {
    const from = todayOslo();
    blockDate.min = from;
    if (!blockDate.value) blockDate.value = addDays(from, 1);
    const data = await apiFetch(`/admin/customer-portal/availability?from=${encodeURIComponent(from)}&days=21`);
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
    if (event.target.id === "generatePortalLink") generateLink();
    else if (event.target.id === "revokePortalLink") revokeLink();
    else if (event.target.id === "suggestNextWork") suggestNextWork();
    else if (event.target.id === "copyPortalLink") copyLink();
    else if (event.target.id === "sharePortalLink") shareLink();
    else if (event.target.id === "uploadPortalImage") uploadImage();
    else {
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
      await Promise.all([loadProjects(), loadAvailability()]);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Kunne ikke hente kundeportalen.", "error");
    }
  });
})();
