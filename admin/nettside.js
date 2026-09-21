(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const editor = document.getElementById("serviceEditor");
  const message = document.getElementById("websiteMessage");
  const saveAllBtn = document.getElementById("saveAllBtn");
  const refreshBtn = document.getElementById("refreshServicesBtn");

  let services = [];
  const dirty = new Set();

  function getAdminKey() {
    let key = (localStorage.getItem(KEY_STORAGE) || "").trim();
    if (!key) {
      key = (prompt("Skriv inn admin-nøkkel:") || "").trim();
      if (key) localStorage.setItem(KEY_STORAGE, key);
    }
    return key;
  }

  function headers() {
    return { "Content-Type": "application/json", "x-admin-key": getAdminKey() };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function setMessage(text, type = "info") {
    message.textContent = text || "";
    message.className = `status-message ${text ? type : ""}`.trim();
  }

  function priceText(service) {
    const suffix = service.priceUnit === "hour" ? " kr/time" : service.priceUnit === "item" ? " kr/stk" : " kr";
    return `${service.priceFrom ? "Fra " : ""}${Number(service.price || 0)}${suffix}`;
  }

  function cardState(card, state) {
    card.classList.remove("is-dirty", "is-saved");
    const text = card.querySelector(".website-state-text");
    if (state === "dirty") {
      card.classList.add("is-dirty");
      text.textContent = "Ikke lagret";
    } else if (state === "saved") {
      card.classList.add("is-saved");
      text.textContent = "Lagret";
      window.setTimeout(() => {
        if (!card.classList.contains("is-dirty")) {
          card.classList.remove("is-saved");
          text.textContent = "Synkronisert";
        }
      }, 1800);
    } else {
      text.textContent = "Synkronisert";
    }
  }

  function updateSaveAll() {
    saveAllBtn.disabled = dirty.size === 0;
    saveAllBtn.textContent = dirty.size ? `Lagre alle (${dirty.size})` : "Lagre alle";
  }

  function readCard(card) {
    const id = card.dataset.id;
    const original = services.find((s) => String(s._id) === id);
    return {
      name: card.querySelector('[data-field="name"]').value.trim(),
      shortDescription: card.querySelector('[data-field="shortDescription"]').value.trim(),
      price: Number(card.querySelector('[data-field="price"]').value || 0),
      priceFrom: card.querySelector('[data-field="priceFrom"]').checked,
      priceUnit: card.querySelector('[data-field="priceUnit"]').value,
      badgeLabel: card.querySelector('[data-field="badgeLabel"]').value.trim(),
      active: card.querySelector('[data-field="active"]').checked,
      duration: original && original.bookable ? Number(card.querySelector('[data-field="duration"]').value || 60) : undefined,
    };
  }

  function updatePreview(card) {
    const values = readCard(card);
    const previewName = card.querySelector(".website-preview-name");
    const previewPrice = card.querySelector(".website-preview-price");
    const previewText = card.querySelector(".website-preview-text");
    previewName.textContent = values.name || "Tjeneste";
    const service = { ...values };
    previewPrice.textContent = `${values.badgeLabel ? values.badgeLabel + " • " : ""}${priceText(service)}`;
    previewText.textContent = values.shortDescription || "Ingen kort beskrivelse.";
    card.classList.toggle("website-inactive", !values.active);
  }

  function markDirty(card) {
    dirty.add(card.dataset.id);
    cardState(card, "dirty");
    updatePreview(card);
    updateSaveAll();
  }

  function render() {
    if (!services.length) {
      editor.innerHTML = '<div class="admin-card empty-state">Ingen tjenester funnet.</div>';
      return;
    }

    editor.innerHTML = services.map((service) => `
      <article class="admin-card website-service-card${service.active === false ? " website-inactive" : ""}" data-id="${escapeHtml(service._id)}">
        <div class="website-service-head">
          <div>
            <p class="section-kicker">${service.bookable ? "Direkte booking" : "Forespørselstjeneste"}</p>
            <h3>${escapeHtml(service.name)}</h3>
            <span class="website-service-key">${escapeHtml(service.key || "uten-nøkkel")}</span>
          </div>
          <div class="website-state"><span class="website-state-dot"></span><span class="website-state-text">Synkronisert</span></div>
        </div>

        <div class="website-fields">
          <div class="website-field">
            <label>Navn på nettsiden</label>
            <input data-field="name" type="text" maxlength="120" value="${escapeHtml(service.name)}">
          </div>
          <div class="website-field">
            <label>Merkelapp <small>(valgfritt)</small></label>
            <input data-field="badgeLabel" type="text" maxlength="40" placeholder="F.eks. Populær" value="${escapeHtml(service.badgeLabel || "")}">
          </div>

          <div class="website-field wide">
            <label>Kort tekst på nettsiden</label>
            <textarea data-field="shortDescription" maxlength="420" rows="3">${escapeHtml(service.shortDescription || "")}</textarea>
            <small>Vises på tjenestekortet på forsiden.</small>
          </div>

          <div class="website-field">
            <label>Pris</label>
            <div class="website-price-row">
              <input data-field="price" type="number" min="0" step="1" value="${Number(service.price || 0)}">
              <select data-field="priceUnit">
                <option value="fixed"${service.priceUnit === "fixed" ? " selected" : ""}>kr</option>
                <option value="hour"${service.priceUnit === "hour" ? " selected" : ""}>kr/time</option>
                <option value="item"${service.priceUnit === "item" ? " selected" : ""}>kr/stk</option>
              </select>
            </div>
          </div>
          ${service.bookable ? `<div class="website-field"><label>Bookingvarighet</label><select data-field="duration">
            ${[30,45,60,90,120,180,240].map((m) => `<option value="${m}"${Number(service.duration) === m ? " selected" : ""}>${m} min</option>`).join("")}
          </select><small>Styrer ledige tidspunkt i booking.</small></div>` : '<div></div>'}

          <div class="website-field wide">
            <div class="website-inline-checks">
              <label><input data-field="priceFrom" type="checkbox"${service.priceFrom ? " checked" : ""}> Vis «Fra» foran prisen</label>
              <label><input data-field="active" type="checkbox"${service.active !== false ? " checked" : ""}> Aktiv på nettsiden</label>
            </div>
          </div>
        </div>

        <div class="website-preview" aria-label="Forhåndsvisning">
          <div class="website-preview-top"><strong class="website-preview-name">${escapeHtml(service.name)}</strong><span class="website-preview-price">${escapeHtml((service.badgeLabel ? service.badgeLabel + " • " : "") + service.priceText)}</span></div>
          <p class="website-preview-text">${escapeHtml(service.shortDescription || "Ingen kort beskrivelse.")}</p>
        </div>
        <div class="website-card-actions"><button class="secondary-btn website-save" type="button">Lagre tjeneste</button></div>
      </article>
    `).join("");

    editor.querySelectorAll(".website-service-card").forEach((card) => {
      card.querySelectorAll("input,select,textarea").forEach((field) => {
        field.addEventListener(field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input", () => markDirty(card));
      });
      card.querySelector(".website-save").addEventListener("click", () => saveCard(card));
      updatePreview(card);
    });
  }

  async function saveCard(card, quiet = false) {
    const id = card.dataset.id;
    const button = card.querySelector(".website-save");
    const payload = readCard(card);

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "Lagrer…";
    try {
      const res = await fetch(`${API_BASE}/services/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Admin-nøkkelen er ugyldig. Logg inn på nytt.");
      }
      if (!res.ok || !data.service) throw new Error(data.error || "Kunne ikke lagre tjenesten");

      const index = services.findIndex((s) => String(s._id) === id);
      if (index >= 0) services[index] = data.service;
      dirty.delete(id);
      cardState(card, "saved");
      updatePreview(card);
      updateSaveAll();
      if (!quiet) setMessage(`${data.service.name} er lagret og publisert.`, "success");
      return true;
    } catch (err) {
      setMessage(err.message || "Kunne ikke lagre.", "error");
      return false;
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function saveAll() {
    const cards = [...editor.querySelectorAll(".website-service-card")].filter((card) => dirty.has(card.dataset.id));
    if (!cards.length) return;
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = "Lagrer…";
    let saved = 0;
    for (const card of cards) {
      if (await saveCard(card, true)) saved += 1;
    }
    updateSaveAll();
    if (saved === cards.length) setMessage(`${saved} tjeneste${saved === 1 ? "" : "r"} er lagret og publisert.`, "success");
  }

  async function loadServices() {
    setMessage("Henter gjeldende nettsideverdier…");
    editor.innerHTML = '<div class="admin-card loading-card">Laster tjenester…</div>';
    try {
      const res = await fetch(`${API_BASE}/services/admin`, { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(KEY_STORAGE);
        throw new Error("Admin-nøkkelen er ugyldig. Logg inn på nytt.");
      }
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente tjenester");
      services = Array.isArray(data.services) ? data.services : [];
      dirty.clear();
      render();
      updateSaveAll();
      setMessage("");
    } catch (err) {
      editor.innerHTML = '<div class="admin-card empty-state">Kunne ikke laste tjenestene.</div>';
      setMessage(err.message || "Noe gikk galt.", "error");
    }
  }

  saveAllBtn.addEventListener("click", saveAll);
  refreshBtn.addEventListener("click", () => {
    if (dirty.size && !confirm("Du har ulagrede endringer. Hente verdiene på nytt likevel?")) return;
    loadServices();
  });

  loadServices();
})();
