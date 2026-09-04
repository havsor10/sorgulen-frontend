(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const ADMIN_KEY = "sorgulen_admin_key";
  const CACHE_KEY = "sorgulen_snow_state_v1";
  const PENDING_KEY = "sorgulen_snow_pending_v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const uuid = (prefix = "snow") => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminKey = () => (localStorage.getItem(ADMIN_KEY) || "").trim();

  const state = { data: null, knownIds: new Set(), timer: null, poll: null, location: null, flushing: false, searchTimer: null };
  const els = {
    noRound: $("#noRound"), activeRound: $("#activeRound"), notice: $("#snowNotice"), connection: $("#snowConnection"),
    activeJob: $("#activeJobCard"), nextJob: $("#nextJobCard"), queue: $("#snowQueue"), deferred: $("#snowDeferred"), done: $("#snowDone"),
    deferredSection: $("#deferredSection"), sumQueued: $("#sumQueued"), sumDone: $("#sumDone"), sumRemaining: $("#sumRemaining"), queueCount: $("#queueCount"),
    modal: $("#snowModal"), modalTitle: $("#snowModalTitle"), modalEyebrow: $("#snowModalEyebrow"), modalBody: $("#snowModalBody"), subline: $("#snowSubline"),
  };

  function setConnection(online = navigator.onLine) {
    els.connection.textContent = online ? "Tilkoblet" : "Offline";
    els.connection.classList.toggle("is-offline", !online);
  }

  function showNotice(message = "", type = "info", timeout = 0) {
    els.notice.textContent = message;
    els.notice.className = `snow-notice${message ? ` is-${type}` : " hidden"}`;
    if (timeout && message) setTimeout(() => { if (els.notice.textContent === message) showNotice(""); }, timeout);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch (_) { return fallback; }
  }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function isNetworkError(error) { return Boolean(error && (error.network || error.name === "TypeError")); }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", "x-admin-key": adminKey(), ...(options.headers || {}) } });
    } catch (error) {
      error.network = true;
      throw error;
    }
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(ADMIN_KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
    return data;
  }

  function openModal(title, html, eyebrow = "Brøyting") {
    els.modalTitle.textContent = title;
    els.modalEyebrow.textContent = eyebrow;
    els.modalBody.innerHTML = html;
    els.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function closeModal() {
    els.modal.classList.add("hidden");
    els.modalBody.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  function today() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
  function formatDuration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function formatMinutes(value) {
    const minutes = Math.max(0, Math.round(Number(value) || 0));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours} t ${minutes % 60} min` : `${hours} t`;
  }
  function sourceLabel(value) { return ({ website: "Nett", phone: "Telefon", sms: "SMS", manual: "Manuell", recurring: "Fast kunde" })[value] || "Manuell"; }
  function priorityLabel(value) { return ({ urgent: "HASTER", high: "Høy", normal: "Normal", low: "Lav" })[value] || "Normal"; }
  function navigationUrl(address) {
    const target = encodeURIComponent(address || "");
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ? `https://maps.apple.com/?daddr=${target}` : `https://www.google.com/maps/dir/?api=1&destination=${target}`;
  }

  function elapsed(job) { return Math.max(0, Math.floor((Date.now() - new Date(job?.startedAt || Date.now()).getTime()) / 1000)); }
  function updateClock() {
    const node = $("#snowLiveTimer");
    if (node && state.data?.activeJob) node.textContent = formatDuration(elapsed(state.data.activeJob));
  }
  function restartClock() { clearInterval(state.timer); updateClock(); state.timer = setInterval(updateClock, 1000); }

  function badges(job) {
    return `<span class="snow-source-badge">${esc(sourceLabel(job.sourceType))}</span><span class="snow-priority-badge ${esc(job.priority)}">${esc(priorityLabel(job.priority))}</span>`;
  }
  function activeMarkup(job) {
    if (!job) return "";
    return `<div class="snow-focus-kicker"><span>PÅGÅR NÅ</span><span>${badges(job)}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}</p>${job.note ? `<div class="snow-note">${esc(job.note)}</div>` : ""}<div id="snowLiveTimer" class="snow-timer">${formatDuration(elapsed(job))}</div><div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">NAVIGASJON</a><button class="snow-primary snow-xl" type="button" data-finish-job="${esc(job._id)}">FERDIG</button></div>`;
  }
  function nextMarkup(job) {
    if (!job) return '<div class="snow-focus-kicker"><span>NESTE</span></div><h2>Køen er tom</h2><p class="snow-address">Nye nettbestillinger kommer automatisk inn her.</p>';
    const travel = job.estimatedTravelMinutes != null ? ` · ca. ${job.estimatedTravelMinutes} min kjøring` : "";
    return `<div class="snow-focus-kicker"><span>NESTE</span><span>${badges(job)}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</p>${job.note ? `<div class="snow-note">${esc(job.note)}</div>` : ""}<div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">NAVIGER</a><button class="snow-primary snow-xl" type="button" data-start-job="${esc(job._id)}">START BRØYTING</button></div>`;
  }
  function queueMarkup(job, index, total) {
    const travel = job.estimatedTravelMinutes != null ? ` · ~${job.estimatedTravelMinutes} min` : "";
    return `<article class="snow-queue-item"><span class="snow-queue-number">${index + 1}</span><div class="snow-queue-main"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><p>${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</p><div class="snow-queue-meta">${badges(job)}${job.note ? `<span class="snow-muted">${esc(job.note)}</span>` : ""}</div></div><div class="snow-queue-actions"><button class="snow-mini" type="button" data-move-up="${esc(job._id)}" ${index === 0 ? "disabled" : ""}>↑</button><button class="snow-mini" type="button" data-move-down="${esc(job._id)}" ${index === total - 1 ? "disabled" : ""}>↓</button><button class="snow-mini" type="button" data-priority-job="${esc(job._id)}">!</button><button class="snow-mini" type="button" data-defer-job="${esc(job._id)}">→</button></div></article>`;
  }

  function render(data, { fromServer = true } = {}) {
    if (!data) return;
    const previousIds = state.knownIds;
    const newWebsite = fromServer && state.data?.round ? (data.queue || []).filter((job) => job.sourceType === "website" && !previousIds.has(String(job._id))) : [];
    state.data = data;
    writeJson(CACHE_KEY, data);
    state.knownIds = new Set([...(data.queue || []), ...(data.deferred || []), ...(data.done || []), ...(data.activeJob ? [data.activeJob] : [])].map((job) => String(job._id)));
    if (newWebsite.length) showNotice(`${newWebsite.length} ny ${newWebsite.length === 1 ? "nettbestilling" : "nettbestillinger"} lagt i køen.`, "success", 7000);

    const hasRound = Boolean(data.round);
    els.noRound.classList.toggle("hidden", hasRound);
    els.activeRound.classList.toggle("hidden", !hasRound);
    if (!hasRound) { clearInterval(state.timer); els.subline.textContent = "Én kø. Ett neste steg."; return; }

    els.subline.textContent = `${data.round.title || "Brøyterunde"} · ${data.round.roundDate || ""}`;
    els.activeJob.classList.toggle("hidden", !data.activeJob);
    els.activeJob.innerHTML = activeMarkup(data.activeJob);
    els.nextJob.innerHTML = data.activeJob ? `<div class="snow-focus-kicker"><span>NESTE ETTER DENNE</span></div>${data.nextJob ? `<h2>${esc(data.nextJob.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(data.nextJob.customerSnapshot?.address || "")}</p>` : "<h2>Køen er tom</h2>"}` : nextMarkup(data.nextJob);
    els.queue.innerHTML = (data.queue || []).length ? data.queue.map(queueMarkup).join("") : '<div class="snow-empty">Ingen kunder venter.</div>';
    els.deferredSection.classList.toggle("hidden", !(data.deferred || []).length);
    els.deferred.innerHTML = (data.deferred || []).map((job) => `<article class="snow-queue-item"><span class="snow-queue-number">–</span><div class="snow-queue-main"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><p>${esc(job.customerSnapshot?.address || "")}</p></div><div class="snow-queue-actions"><button class="snow-mini" type="button" data-restore-job="${esc(job._id)}">↩</button></div></article>`).join("");
    els.done.innerHTML = (data.done || []).length ? data.done.map((job) => `<div class="snow-done-item"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><span>${job.finishedAt ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(job.finishedAt)) : "Ferdig"}</span></div>`).join("") : '<p class="snow-muted">Ingen ferdige ennå.</p>';
    els.sumQueued.textContent = data.summary?.queued ?? 0;
    els.sumDone.textContent = data.summary?.done ?? 0;
    els.sumRemaining.textContent = formatMinutes(data.summary?.estimatedMinutesRemaining || 0);
    els.queueCount.textContent = data.summary?.queued ?? 0;
    restartClock();
  }

  async function refresh({ quiet = false, includeLocation = false } = {}) {
    let suffix = "";
    if (includeLocation && state.location) suffix = `?lat=${encodeURIComponent(state.location.lat)}&lng=${encodeURIComponent(state.location.lng)}&accuracy=${encodeURIComponent(state.location.accuracy || "")}`;
    try {
      const data = await api(`/admin/snow/state${suffix}`);
      setConnection(true);
      render(data);
      if (!quiet) showNotice("");
    } catch (error) {
      if (isNetworkError(error)) {
        setConnection(false);
        const cached = readJson(CACHE_KEY, null);
        if (cached) render(cached, { fromServer: false });
        if (!quiet) showNotice("Offline – siste lagrede kø vises. Start/Ferdig synkroniseres når nettet er tilbake.", "warning");
      } else if (!quiet) showNotice(error.message, "error");
    }
  }

  async function getLocation() {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition((position) => {
      state.location = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      resolve(state.location);
    }, () => resolve(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 }));
  }

  function optimisticStart(id, startedAt) {
    const data = structuredClone(state.data || readJson(CACHE_KEY, {}));
    const job = (data.queue || []).find((item) => String(item._id) === String(id));
    if (!job) return;
    data.queue = data.queue.filter((item) => String(item._id) !== String(id));
    job.status = "active"; job.startedAt = startedAt; data.activeJob = job; data.nextJob = data.queue[0] || null;
    if (data.summary) data.summary.queued = Math.max(0, Number(data.summary.queued || 0) - 1);
    render(data, { fromServer: false });
  }
  function optimisticFinish(id, finishedAt) {
    const data = structuredClone(state.data || readJson(CACHE_KEY, {}));
    if (!data.activeJob || String(data.activeJob._id) !== String(id)) return;
    const job = data.activeJob; job.status = "done"; job.finishedAt = finishedAt;
    data.done = [job, ...(data.done || [])]; data.activeJob = null; data.nextJob = (data.queue || [])[0] || null;
    if (data.summary) data.summary.done = Number(data.summary.done || 0) + 1;
    render(data, { fromServer: false });
  }

  function queueOffline(path, body, optimistic) {
    const items = readJson(PENDING_KEY, []);
    if (!items.some((item) => item.body?.operationId === body.operationId)) items.push({ path, method: "POST", body, createdAt: new Date().toISOString() });
    writeJson(PENDING_KEY, items);
    optimistic();
    setConnection(false);
    showNotice("Lagret offline. Synkroniseres automatisk når nettet er tilbake.", "warning");
  }

  async function criticalMutation(path, body, optimistic) {
    try { render(await api(path, { method: "POST", body: JSON.stringify(body) })); return; }
    catch (error) {
      if (isNetworkError(error)) { queueOffline(path, body, optimistic); return; }
      showNotice(error.message, "error");
    }
  }

  async function flushPending() {
    if (state.flushing || !navigator.onLine) return;
    state.flushing = true;
    const items = readJson(PENDING_KEY, []);
    const remaining = [];
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        try { await api(item.path, { method: item.method, body: JSON.stringify(item.body) }); }
        catch (error) {
          if (isNetworkError(error)) { remaining.push(...items.slice(index)); break; }
          if (![400, 409].includes(error.status)) remaining.push(item);
        }
      }
      writeJson(PENDING_KEY, remaining);
      if (items.length && !remaining.length) showNotice("Offline-registreringene er synkronisert.", "success", 4000);
      await refresh({ quiet: true });
    } finally { state.flushing = false; }
  }

  async function startJob(id) {
    const clientStartedAt = new Date().toISOString();
    const body = { clientStartedAt, operationId: uuid("snow-start") };
    await criticalMutation(`/admin/snow/jobs/${encodeURIComponent(id)}/start`, body, () => optimisticStart(id, clientStartedAt));
  }
  async function finishJob(id) {
    const clientFinishedAt = new Date().toISOString();
    const body = { clientFinishedAt, operationId: uuid("snow-finish") };
    await criticalMutation(`/admin/snow/jobs/${encodeURIComponent(id)}/finish`, body, () => optimisticFinish(id, clientFinishedAt));
  }

  async function reorder(queue) {
    try { render(await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/reorder`, { method: "POST", body: JSON.stringify({ jobIds: queue.map((job) => job._id) }) })); }
    catch (error) { showNotice(error.message, "error"); await refresh({ quiet: true }); }
  }
  async function moveJob(id, delta) {
    const queue = [...(state.data?.queue || [])];
    const index = queue.findIndex((job) => String(job._id) === String(id));
    const target = index + delta;
    if (index < 0 || target < 0 || target >= queue.length) return;
    [queue[index], queue[target]] = [queue[target], queue[index]];
    await reorder(queue);
  }
  async function patchJob(id, payload) {
    try { await api(`/admin/snow/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }); await refresh({ quiet: true }); }
    catch (error) { showNotice(error.message, "error"); }
  }

  function customerSearchMarkup() {
    return '<div class="snow-field wide"><label>Søk eksisterende kunde</label><input id="snowCustomerSearch" type="search" placeholder="Navn, telefon eller adresse" autocomplete="off"><div id="snowCustomerResults" class="snow-search-results"></div></div><input name="customerId" type="hidden">';
  }

  function bindCustomerSearch(form) {
    const input = $("#snowCustomerSearch", form);
    const results = $("#snowCustomerResults", form);
    input.addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(async () => {
        const query = input.value.trim();
        if (query.length < 2) { results.innerHTML = ""; return; }
        try {
          const data = await api(`/admin/customers?q=${encodeURIComponent(query)}&limit=15`);
          results.innerHTML = (data.customers || []).map((customer) => `<button type="button" class="snow-customer-result" data-customer-id="${esc(customer._id)}" data-name="${esc(customer.name)}" data-phone="${esc(customer.phone || "")}" data-address="${esc(customer.address || "")}"><strong>${esc(customer.name)}</strong><span>${esc([customer.phone, customer.address].filter(Boolean).join(" · "))}</span></button>`).join("") || '<p class="snow-muted">Ingen eksisterende funnet.</p>';
          $$('[data-customer-id]', results).forEach((button) => button.addEventListener("click", () => {
            form.elements.customerId.value = button.dataset.customerId;
            input.value = button.dataset.name;
            results.innerHTML = "";
            if (form.elements.name) form.elements.name.value = button.dataset.name;
            if (form.elements.phone) form.elements.phone.value = button.dataset.phone;
            if (form.elements.address) form.elements.address.value = button.dataset.address;
          }));
        } catch (error) { results.innerHTML = `<p class="snow-error">${esc(error.message)}</p>`; }
      }, 220);
    });
  }

  function openQuickAdd() {
    const round = state.data?.round;
    if (!round) return;
    openModal("Ny brøyting", `<form id="quickSnowForm" class="snow-modal-grid">${customerSearchMarkup()}<label class="snow-field">Kilde<select name="sourceType"><option value="phone">Telefon</option><option value="sms">SMS</option><option value="manual">Manuell</option></select></label><label class="snow-field">Prioritet<select name="priority"><option value="normal">Normal</option><option value="high">Høy</option><option value="urgent">HASTER</option><option value="low">Lav</option></select></label><label class="snow-field">Navn<input name="name" required maxlength="160"></label><label class="snow-field">Telefon<input name="phone" inputmode="tel" maxlength="40"></label><label class="snow-field wide">Adresse<input name="address" required maxlength="220"></label><label class="snow-field">Prismodell<select name="pricingMode"><option value="hourly" ${round.defaultPricingMode === "hourly" ? "selected" : ""}>Timepris</option><option value="fixed" ${round.defaultPricingMode === "fixed" ? "selected" : ""}>Fastpris</option></select></label><label class="snow-field" data-hourly-wrap>Timepris<input name="hourlyRate" type="number" min="1" value="${esc(round.defaultHourlyRate || 850)}"></label><label class="snow-field ${round.defaultPricingMode === "fixed" ? "" : "hidden"}" data-fixed-wrap>Fastpris<input name="fixedPrice" type="number" min="1" value="${esc(round.defaultFixedPrice ?? "")}"></label><label class="snow-field">Estimert tid<input name="estimatedServiceMinutes" type="number" min="1" max="480" value="${esc(round.defaultServiceMinutes || 15)}"></label><label class="snow-field wide">Kommentar<textarea name="note" maxlength="2000" placeholder="F.eks. foran garasje, pass på bil…"></textarea></label><p id="quickSnowError" class="snow-error wide"></p><button class="snow-primary snow-xl wide" type="submit">LEGG I KØ</button></form>`);
    const form = $("#quickSnowForm", els.modalBody);
    bindCustomerSearch(form);
    const togglePrice = () => {
      const fixed = form.elements.pricingMode.value === "fixed";
      $("[data-fixed-wrap]", form).classList.toggle("hidden", !fixed);
      $("[data-hourly-wrap]", form).classList.toggle("hidden", fixed);
    };
    form.elements.pricingMode.addEventListener("change", togglePrice);
    togglePrice();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $("#quickSnowError", form);
      const button = $("button[type=submit]", form);
      error.textContent = ""; button.disabled = true;
      const payload = {
        roundId: round._id, customerId: form.elements.customerId.value || undefined,
        sourceType: form.elements.sourceType.value, priority: form.elements.priority.value,
        name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), address: form.elements.address.value.trim(),
        pricingMode: form.elements.pricingMode.value, hourlyRate: Number(form.elements.hourlyRate.value || round.defaultHourlyRate),
        fixedPrice: form.elements.fixedPrice.value ? Number(form.elements.fixedPrice.value) : null,
        estimatedServiceMinutes: Number(form.elements.estimatedServiceMinutes.value), note: form.elements.note.value.trim(),
      };
      try { await api("/admin/snow/jobs", { method: "POST", body: JSON.stringify(payload) }); closeModal(); showNotice("Kunden er lagt i brøytekøen.", "success", 3500); await refresh({ quiet: true }); }
      catch (err) { error.textContent = err.message; }
      finally { button.disabled = false; }
    });
  }

  async function openAgreements() {
    openModal("Faste brøytekunder", '<div id="snowAgreementsBody"><p class="snow-muted">Henter faste kunder…</p></div>');
    const body = $("#snowAgreementsBody", els.modalBody);
    try {
      const data = await api("/admin/snow/agreements");
      body.innerHTML = `<button id="addAgreementBtn" class="snow-primary" type="button">+ NY FAST KUNDE</button><div style="margin-top:14px">${(data.agreements || []).length ? data.agreements.map((agreement) => `<div class="snow-agreement"><div><strong>${esc(agreement.customerSnapshot?.name || "Kunde")}</strong><p>${esc(agreement.customerSnapshot?.address || "")} · ${esc(priorityLabel(agreement.priority))}${agreement.preferredWindow ? ` · ${esc(agreement.preferredWindow)}` : ""}</p></div><div class="snow-agreement-actions"><span class="snow-priority-badge ${esc(agreement.priority)}">${agreement.active ? "Aktiv" : "Av"}</span><button type="button" class="snow-mini" data-toggle-agreement="${esc(agreement._id)}" data-active="${agreement.active ? "1" : "0"}">${agreement.active ? "Av" : "På"}</button></div></div>`).join("") : '<p class="snow-muted">Ingen faste brøytekunder ennå.</p>'}</div>`;
      $("#addAgreementBtn", body).addEventListener("click", openAgreementForm);
      $$('[data-toggle-agreement]', body).forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try { await api(`/admin/snow/agreements/${encodeURIComponent(button.dataset.toggleAgreement)}`, { method: "PATCH", body: JSON.stringify({ active: button.dataset.active !== "1" }) }); await openAgreements(); }
        catch (error) { showNotice(error.message, "error"); button.disabled = false; }
      }));
    } catch (error) { body.innerHTML = `<p class="snow-error">${esc(error.message)}</p>`; }
  }

  function openAgreementForm() {
    openModal("Ny fast brøytekunde", `<form id="snowAgreementForm" class="snow-modal-grid">${customerSearchMarkup()}<label class="snow-field wide">Adresse<input name="address" required maxlength="220"></label><label class="snow-field">Prioritet<select name="priority"><option value="normal">Normal</option><option value="high">Høy</option><option value="urgent">HASTER</option><option value="low">Lav</option></select></label><label class="snow-field">Ønsket tidsrom<input name="preferredWindow" placeholder="F.eks. før 06:00"></label><label class="snow-field">Prismodell<select name="pricingMode"><option value="hourly">Timepris</option><option value="fixed">Fastpris</option></select></label><label class="snow-field">Timepris<input name="hourlyRate" type="number" min="1" value="850"></label><label class="snow-field hidden" data-agreement-fixed>Fastpris<input name="fixedPrice" type="number" min="1"></label><label class="snow-field">Estimert tid<input name="estimatedServiceMinutes" type="number" min="1" max="480" value="15"></label><label class="snow-check wide"><input name="autoQueue" type="checkbox" checked> Legg automatisk i nye brøyterunder</label><label class="snow-field wide">Notat<textarea name="notes" placeholder="Hva må huskes hos kunden?"></textarea></label><p id="agreementError" class="snow-error wide"></p><button class="snow-primary snow-xl wide" type="submit">LAGRE FAST KUNDE</button></form>`);
    const form = $("#snowAgreementForm", els.modalBody);
    bindCustomerSearch(form);
    form.elements.pricingMode.addEventListener("change", () => $("[data-agreement-fixed]", form).classList.toggle("hidden", form.elements.pricingMode.value !== "fixed"));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $("#agreementError", form);
      if (!form.elements.customerId.value) { error.textContent = "Velg kunden fra søkeresultatet."; return; }
      const button = $("button[type=submit]", form); button.disabled = true; error.textContent = "";
      const payload = {
        customerId: form.elements.customerId.value, address: form.elements.address.value.trim(), priority: form.elements.priority.value,
        preferredWindow: form.elements.preferredWindow.value.trim(), pricingMode: form.elements.pricingMode.value,
        hourlyRate: Number(form.elements.hourlyRate.value), fixedPrice: form.elements.fixedPrice.value ? Number(form.elements.fixedPrice.value) : null,
        estimatedServiceMinutes: Number(form.elements.estimatedServiceMinutes.value), autoQueue: form.elements.autoQueue.checked, notes: form.elements.notes.value.trim(),
      };
      try { await api("/admin/snow/agreements", { method: "POST", body: JSON.stringify(payload) }); showNotice("Fast brøytekunde lagret.", "success", 3500); await openAgreements(); }
      catch (err) { error.textContent = err.message; button.disabled = false; }
    });
  }

  async function optimizeRoute() {
    const button = $("#optimizeBtn"); button.disabled = true; showNotice("Finner smart rekkefølge…", "info");
    try {
      const currentLocation = await getLocation();
      const data = await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/optimize`, { method: "POST", body: JSON.stringify({ location: currentLocation }) });
      render(data); showNotice("Køen er optimalisert etter prioritet og nærhet.", "success", 4500);
    } catch (error) { showNotice(error.message, "error"); }
    finally { button.disabled = false; }
  }

  const startForm = $("#startRoundForm");
  startForm.elements.roundDate.value = today();
  startForm.elements.defaultPricingMode.addEventListener("change", () => $("#roundFixedWrap").classList.toggle("hidden", startForm.elements.defaultPricingMode.value !== "fixed"));
  startForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = $("#startRoundError"); const button = $("button[type=submit]", startForm); error.textContent = ""; button.disabled = true;
    const payload = {
      roundDate: startForm.elements.roundDate.value,
      defaultServiceMinutes: Number(startForm.elements.defaultServiceMinutes.value),
      defaultPricingMode: startForm.elements.defaultPricingMode.value,
      defaultHourlyRate: Number(startForm.elements.defaultHourlyRate.value),
      defaultFixedPrice: startForm.elements.defaultFixedPrice.value ? Number(startForm.elements.defaultFixedPrice.value) : null,
      autoQueueAgreements: startForm.elements.autoQueueAgreements.checked,
    };
    try {
      render(await api("/admin/snow/rounds", { method: "POST", body: JSON.stringify(payload) }));
      await getLocation();
      if (state.location) await refresh({ quiet: true, includeLocation: true });
      showNotice("Brøyterunden er startet.", "success", 3500);
    } catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  });

  document.addEventListener("click", async (event) => {
    const start = event.target.closest("[data-start-job]"); if (start) { start.disabled = true; await startJob(start.dataset.startJob); return; }
    const finish = event.target.closest("[data-finish-job]"); if (finish) { finish.disabled = true; await finishJob(finish.dataset.finishJob); return; }
    const up = event.target.closest("[data-move-up]"); if (up) { await moveJob(up.dataset.moveUp, -1); return; }
    const down = event.target.closest("[data-move-down]"); if (down) { await moveJob(down.dataset.moveDown, 1); return; }
    const defer = event.target.closest("[data-defer-job]"); if (defer) { await patchJob(defer.dataset.deferJob, { status: "deferred" }); return; }
    const restore = event.target.closest("[data-restore-job]"); if (restore) { await patchJob(restore.dataset.restoreJob, { status: "queued" }); return; }
    const priorityButton = event.target.closest("[data-priority-job]");
    if (priorityButton) {
      const job = (state.data?.queue || []).find((item) => String(item._id) === String(priorityButton.dataset.priorityJob));
      if (job) await patchJob(job._id, { priority: job.priority === "urgent" ? "normal" : "urgent" });
    }
  });

  $("#snowModalClose").addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
  $("#quickAddBtn").addEventListener("click", openQuickAdd);
  $("#agreementsBtn").addEventListener("click", openAgreements);
  $("#optimizeBtn").addEventListener("click", optimizeRoute);
  $("#snowRefresh").addEventListener("click", () => refresh());
  $("#finishRoundBtn").addEventListener("click", async () => {
    if (!state.data?.round) return;
    const remaining = Number(state.data.summary?.queued || 0) + Number(state.data.summary?.deferred || 0);
    if (remaining && !confirm(`${remaining} kunder står fortsatt igjen. Avslutte runden likevel?`)) return;
    try { await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/complete`, { method: "POST", body: JSON.stringify({ confirmRemaining: remaining > 0 }) }); showNotice("Brøyterunden er avsluttet.", "success", 3500); await refresh({ quiet: true }); }
    catch (error) { showNotice(error.message, "error"); }
  });

  window.addEventListener("online", () => { setConnection(true); flushPending(); });
  window.addEventListener("offline", () => { setConnection(false); showNotice("Offline – Start/Ferdig lagres på telefonen.", "warning"); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { flushPending(); refresh({ quiet: true }); } });

  if (!adminKey()) { location.href = "login.html"; return; }
  setConnection();
  const cached = readJson(CACHE_KEY, null);
  if (cached) render(cached, { fromServer: false });
  refresh({ quiet: Boolean(cached) });
  flushPending();
  state.poll = setInterval(() => { if (!document.hidden && navigator.onLine) refresh({ quiet: true }); }, 12000);
})();
