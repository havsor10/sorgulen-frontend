(() => {
  "use strict";

  const API = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const STATE_KEY = "sorgulen_snow_state_v1";
  const PENDING_KEY = "sorgulen_snow_pending_v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const uuid = (prefix = "snow") => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adminKey = () => (localStorage.getItem(KEY) || "").trim();
  const state = { data: null, timer: null, poll: null, searchTimer: null, knownIds: new Set(), location: null, flushing: false };

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
  function notice(message = "", type = "info", timeout = 0) {
    els.notice.textContent = message;
    els.notice.className = `snow-notice${message ? "" : " hidden"}${message ? ` is-${type}` : ""}`;
    if (timeout && message) setTimeout(() => { if (els.notice.textContent === message) notice(""); }, timeout);
  }
  function cacheState(data) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(data)); } catch (_) {}
  }
  function cachedState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (_) { return null; }
  }
  function pending() {
    try { const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; }
  }
  function savePending(items) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(items)); } catch (_) {}
  }
  function isNetworkError(error) { return error && (error.network === true || error.name === "TypeError"); }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey(), ...(options.headers || {}) },
      });
    } catch (error) {
      error.network = true;
      throw error;
    }
    const data = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) {
      const error = Object.assign(new Error(data?.error || `API-feil ${response.status}`), { status: response.status, data });
      throw error;
    }
    return data;
  }

  function openModal(title, html, eyebrow = "Brøyting") {
    els.modalTitle.textContent = title; els.modalEyebrow.textContent = eyebrow; els.modalBody.innerHTML = html;
    els.modal.classList.remove("hidden"); document.body.classList.add("modal-open");
  }
  function closeModal() { els.modal.classList.add("hidden"); els.modalBody.innerHTML = ""; document.body.classList.remove("modal-open"); }
  $("#snowModalClose").addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modal.classList.contains("hidden")) closeModal(); });

  function today() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }
  function fmtDuration(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(value / 3600); const m = Math.floor((value % 3600) / 60); const s = value % 60;
    return h > 0 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function fmtMinutes(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value < 60) return `${value} min`;
    const h = Math.floor(value / 60); const m = value % 60;
    return m ? `${h} t ${m} min` : `${h} t`;
  }
  function priorityLabel(value) { return ({ urgent: "HASTER", high: "Høy", normal: "Normal", low: "Lav" })[value] || "Normal"; }
  function sourceLabel(value) { return ({ website: "Nett", phone: "Telefon", sms: "SMS", manual: "Manuell", recurring: "Fast kunde" })[value] || "Manuell"; }
  function navigationUrl(address) {
    const target = encodeURIComponent(address || "");
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios ? `https://maps.apple.com/?daddr=${target}` : `https://www.google.com/maps/dir/?api=1&destination=${target}`;
  }

  function activeElapsed(job) {
    const started = new Date(job?.startedAt || Date.now()).getTime();
    return Math.max(0, Math.floor((Date.now() - started) / 1000));
  }
  function startClock() {
    clearInterval(state.timer);
    const update = () => {
      const job = state.data?.activeJob; const node = $("#snowLiveTimer");
      if (job && node) node.textContent = fmtDuration(activeElapsed(job));
    };
    update(); state.timer = setInterval(update, 1000);
  }

  function focusMarkup(job, kind) {
    if (!job) {
      if (kind === "next") return `<div class="snow-focus-kicker"><span>NESTE</span></div><h2>Køen er tom</h2><p class="snow-address">Nye nettbestillinger kommer automatisk inn her.</p>`;
      return "";
    }
    const travel = job.estimatedTravelMinutes != null ? ` · ca. ${job.estimatedTravelMinutes} min kjøring` : "";
    const note = job.note ? `<div class="snow-note">${esc(job.note)}</div>` : "";
    const badges = `<span class="snow-source-badge">${esc(sourceLabel(job.sourceType))}</span><span class="snow-priority-badge ${esc(job.priority)}">${esc(priorityLabel(job.priority))}</span>`;
    if (kind === "active") {
      return `<div class="snow-focus-kicker"><span>PÅGÅR NÅ</span><span>${badges}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}</p>${note}<div id="snowLiveTimer" class="snow-timer">${fmtDuration(activeElapsed(job))}</div><div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">NAVIGASJON</a><button class="snow-primary snow-xl" type="button" data-finish-job="${esc(job._id)}">FERDIG</button></div>`;
    }
    return `<div class="snow-focus-kicker"><span>NESTE</span><span>${badges}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</p>${note}<div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">NAVIGER</a><button class="snow-primary snow-xl" type="button" data-start-job="${esc(job._id)}">START BRØYTING</button></div>`;
  }

  function queueMarkup(job, index, total) {
    const travel = job.estimatedTravelMinutes != null ? ` · ~${job.estimatedTravelMinutes} min` : "";
    return `<article class="snow-queue-item" data-queue-job="${esc(job._id)}"><span class="snow-queue-number">${index + 1}</span><div class="snow-queue-main"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><p>${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</p><div class="snow-queue-meta"><span class="snow-source-badge">${esc(sourceLabel(job.sourceType))}</span><span class="snow-priority-badge ${esc(job.priority)}">${esc(priorityLabel(job.priority))}</span>${job.note ? `<span class="snow-muted">${esc(job.note)}</span>` : ""}</div></div><div class="snow-queue-actions"><button class="snow-mini" type="button" title="Flytt opp" data-move-up="${esc(job._id)}" ${index === 0 ? "disabled" : ""}>↑</button><button class="snow-mini" type="button" title="Flytt ned" data-move-down="${esc(job._id)}" ${index === total - 1 ? "disabled" : ""}>↓</button><button class="snow-mini" type="button" title="Prioritet" data-priority-job="${esc(job._id)}">!</button><button class="snow-mini" type="button" title="Utsett" data-defer-job="${esc(job._id)}">→</button></div></article>`;
  }

  function deferredMarkup(job) {
    return `<article class="snow-queue-item"><span class="snow-queue-number">–</span><div class="snow-queue-main"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><p>${esc(job.customerSnapshot?.address || "")}</p></div><div class="snow-queue-actions"><button class="snow-mini" type="button" data-restore-job="${esc(job._id)}">↩</button></div></article>`;
  }

  function render(data, { fromServer = true } = {}) {
    if (!data) return;
    const oldIds = state.knownIds;
    const newWebsite = fromServer && state.data?.round && (data.queue || []).filter((job) => job.sourceType === "website" && !oldIds.has(String(job._id)));
    state.data = data; cacheState(data);
    state.knownIds = new Set([...(data.queue || []), ...(data.deferred || []), ...(data.done || []), ...(data.activeJob ? [data.activeJob] : [])].map((job) => String(job._id)));
    if (newWebsite?.length) notice(`${newWebsite.length} ny ${newWebsite.length === 1 ? "nettbestilling" : "nettbestillinger"} lagt i brøytekøen.`, "success", 7000);

    const active = Boolean(data.round);
    els.noRound.classList.toggle("hidden", active); els.activeRound.classList.toggle("hidden", !active);
    if (!active) { clearInterval(state.timer); els.subline.textContent = "Én kø. Ett neste steg."; return; }
    els.subline.textContent = `${data.round.title || "Brøyterunde"} · ${data.round.roundDate || ""}`;
    els.activeJob.classList.toggle("hidden", !data.activeJob);
    els.activeJob.innerHTML = focusMarkup(data.activeJob, "active");
    els.nextJob.innerHTML = data.activeJob ? `<div class="snow-focus-kicker"><span>NESTE ETTER DENNE</span></div>${data.nextJob ? `<h2>${esc(data.nextJob.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(data.nextJob.customerSnapshot?.address || "")}</p>` : `<h2>Køen er tom</h2>`}` : focusMarkup(data.nextJob, "next");
    els.queue.innerHTML = (data.queue || []).length ? data.queue.map((job, index, arr) => queueMarkup(job, index, arr.length)).join("") : '<div class="snow-empty">Ingen kunder venter.</div>';
    els.deferredSection.classList.toggle("hidden", !(data.deferred || []).length);
    els.deferred.innerHTML = (data.deferred || []).map(deferredMarkup).join("");
    els.done.innerHTML = (data.done || []).length ? data.done.map((job) => `<div class="snow-done-item"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><span>${job.finishedAt ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(job.finishedAt)) : "Ferdig"}</span></div>`).join("") : '<p class="snow-muted">Ingen ferdige ennå.</p>';
    els.sumQueued.textContent = data.summary?.queued ?? 0; els.sumDone.textContent = data.summary?.done ?? 0; els.sumRemaining.textContent = fmtMinutes(data.summary?.estimatedMinutesRemaining || 0); els.queueCount.textContent = data.summary?.queued ?? 0;
    startClock();
  }

  async function refresh({ quiet = false, useLocation = false } = {}) {
    if (!adminKey()) { location.href = "login.html"; return; }
    let qs = "";
    if (useLocation && state.location) qs = `?lat=${encodeURIComponent(state.location.lat)}&lng=${encodeURIComponent(state.location.lng)}&accuracy=${encodeURIComponent(state.location.accuracy || "")}`;
    try {
      const data = await api(`/admin/snow/state${qs}`);
      setConnection(true); render(data); if (!quiet) notice("");
    } catch (error) {
      if (isNetworkError(error)) { setConnection(false); const cached = cachedState(); if (cached) render(cached, { fromServer: false }); if (!quiet) notice("Offline – siste lagrede brøytekø vises. Start/Ferdig synkroniseres når nettet er tilbake.", "warning"); }
      else if (!quiet) notice(error.message, "error");
    }
  }

  async function getLocation() {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition((position) => {
      const result = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      state.location = result; resolve(result);
    }, () => resolve(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 }));
  }

  function optimisticStart(jobId, startedAt) {
    const data = structuredClone(state.data || cachedState() || {}); const job = (data.queue || []).find((item) => String(item._id) === String(jobId)); if (!job) return;
    data.queue = data.queue.filter((item) => String(item._id) !== String(jobId)); job.status = "active"; job.startedAt = startedAt; data.activeJob = job; data.nextJob = data.queue[0] || null; if (data.summary) data.summary.queued = Math.max(0, Number(data.summary.queued || 0) - 1); render(data, { fromServer: false });
  }
  function optimisticFinish(jobId, finishedAt) {
    const data = structuredClone(state.data || cachedState() || {}); const job = data.activeJob; if (!job || String(job._id) !== String(jobId)) return;
    job.status = "done"; job.finishedAt = finishedAt; data.done = [job, ...(data.done || [])]; data.activeJob = null; data.nextJob = (data.queue || [])[0] || null; if (data.summary) data.summary.done = Number(data.summary.done || 0) + 1; render(data, { fromServer: false });
  }

  function queueCritical(path, body, optimistic) {
    const items = pending();
    if (!items.some((item) => item.body?.operationId === body.operationId)) items.push({ path, method: "POST", body, createdAt: new Date().toISOString() });
    savePending(items); optimistic(); setConnection(false); notice("Lagret offline. Handlingen synkroniseres automatisk når nettet er tilbake.", "warning");
  }
  async function critical(path, body, optimistic) {
    try { const data = await api(path, { method: "POST", body: JSON.stringify(body) }); render(data); return true; }
    catch (error) {
      if (isNetworkError(error)) { queueCritical(path, body, optimistic); return true; }
      notice(error.message, "error"); return false;
    }
  }
  async function flushPending() {
    if (state.flushing || !navigator.onLine) return;
    state.flushing = true;
    try {
      const items = pending(); const remaining = [];
      for (const item of items) {
        try { await api(item.path, { method: item.method, body: JSON.stringify(item.body) }); }
        catch (error) { if (isNetworkError(error)) { remaining.push(item, ...items.slice(items.indexOf(item) + 1)); break; } if (![409, 400].includes(error.status)) remaining.push(item); }
      }
      savePending(remaining); if (!remaining.length && items.length) notice("Offline-registreringene er synkronisert.", "success", 4500);
      await refresh({ quiet: true });
    } finally { state.flushing = false; }
  }

  async function startJob(id) {
    const clientStartedAt = new Date().toISOString(); const body = { clientStartedAt, operationId: uuid("snow-start") };
    await critical(`/admin/snow/jobs/${encodeURIComponent(id)}/start`, body, () => optimisticStart(id, clientStartedAt));
  }
  async function finishJob(id) {
    const clientFinishedAt = new Date().toISOString(); const body = { clientFinishedAt, operationId: uuid("snow-finish") };
    await critical(`/admin/snow/jobs/${encodeURIComponent(id)}/finish`, body, () => optimisticFinish(id, clientFinishedAt));
  }

  async function reorder(queue) {
    try { const data = await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/reorder`, { method: "POST", body: JSON.stringify({ jobIds: queue.map((job) => job._id) }) }); render(data); }
    catch (error) { notice(error.message, "error"); await refresh({ quiet: true }); }
  }
  async function moveJob(id, delta) {
    const queue = [...(state.data?.queue || [])]; const index = queue.findIndex((job) => String(job._id) === String(id)); const next = index + delta; if (index < 0 || next < 0 || next >= queue.length) return;
    [queue[index], queue[next]] = [queue[next], queue[index]]; await reorder(queue);
  }
  async function patchJob(id, payload) {
    try { await api(`/admin/snow/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }); await refresh({ quiet: true }); }
    catch (error) { notice(error.message, "error"); }
  }

  function customerSearchMarkup() {
    return `<div class="snow-field wide"><label>Søk eksisterende kunde</label><input id="snowCustomerSearch" type="search" placeholder="Navn, telefon eller adresse" autocomplete="off"><div id="snowCustomerResults" class="snow-search-results"></div></div><input name="customerId" type="hidden">`;
  }
  function bindCustomerSearch(form, { requireSelection = false } = {}) {
    const input = $("#snowCustomerSearch", form); const results = $("#snowCustomerResults", form); if (!input || !results) return;
    input.addEventListener("input", () => {
      clearTimeout(state.searchTimer); state.searchTimer = setTimeout(async () => {
        const q = input.value.trim(); if (q.length < 2) { results.innerHTML = ""; return; }
        try {
          const data = await api(`/admin/customers?q=${encodeURIComponent(q)}&limit=15`);
          results.innerHTML = (data.customers || []).map((customer) => `<button type="button" class="snow-customer-result" data-customer-id="${esc(customer._id)}" data-name="${esc(customer.name)}" data-phone="${esc(customer.phone || "")}" data-email="${esc(customer.email || "")}" data-address="${esc(customer.address || "")}"><strong>${esc(customer.name)}</strong><span>${esc([customer.phone, customer.address].filter(Boolean).join(" · "))}</span></button>`).join("") || '<p class="snow-muted">Ingen eksisterende funnet.</p>';
          $$('[data-customer-id]', results).forEach((button) => button.addEventListener("click", () => {
            form.elements.customerId.value = button.dataset.customerId; input.value = button.dataset.name; results.innerHTML = "";
            if (form.elements.name) form.elements.name.value = button.dataset.name; if (form.elements.phone) form.elements.phone.value = button.dataset.phone; if (form.elements.email) form.elements.email.value = button.dataset.email; if (form.elements.address) form.elements.address.value = button.dataset.address;
            input.dataset.selected = "1";
          }));
        } catch (error) { results.innerHTML = `<p class="snow-error">${esc(error.message)}</p>`; }
      }, 220);
    });
    if (requireSelection) input.setAttribute("data-require-selection", "1");
  }

  function openQuickAdd() {
    const round = state.data?.round; if (!round) return;
    openModal("Ny brøyting", `<form id="quickSnowForm" class="snow-modal-grid">${customerSearchMarkup()}<label class="snow-field">Kilde<select name="sourceType"><option value="phone">Telefon</option><option value="sms">SMS</option><option value="manual">Manuell</option></select></label><label class="snow-field">Prioritet<select name="priority"><option value="normal">Normal</option><option value="high">Høy</option><option value="urgent">HASTER</option><option value="low">Lav</option></select></label><label class="snow-field">Navn<input name="name" required maxlength="160"></label><label class="snow-field">Telefon<input name="phone" inputmode="tel" maxlength="40"></label><label class="snow-field wide">Adresse<input name="address" required maxlength="220"></label><label class="snow-field">Pris<select name="pricingMode"><option value="hourly" ${round.defaultPricingMode === "hourly" ? "selected" : ""}>Timepris</option><option value="fixed" ${round.defaultPricingMode === "fixed" ? "selected" : ""}>Fastpris</option></select></label><label class="snow-field" data-hourly-wrap>Timepris<input name="hourlyRate" type="number" min="1" value="${esc(round.defaultHourlyRate || 850)}"></label><label class="snow-field ${round.defaultPricingMode === "fixed" ? "" : "hidden"}" data-fixed-wrap>Fastpris<input name="fixedPrice" type="number" min="1" value="${esc(round.defaultFixedPrice ?? "")}"></label><label class="snow-field">Estimert tid<input name="estimatedServiceMinutes" type="number" min="1" max="480" value="${esc(round.defaultServiceMinutes || 15)}"></label><label class="snow-field wide">Kommentar<textarea name="note" maxlength="2000" placeholder="F.eks. foran garasje, pass på bil…"></textarea></label><p id="quickSnowError" class="snow-error wide"></p><button class="snow-primary snow-xl wide" type="submit">LEGG I KØ</button></form>`);
    const form = $("#quickSnowForm", els.modalBody); bindCustomerSearch(form);
    const toggle = () => { const fixed = form.elements.pricingMode.value === "fixed"; $("[data-fixed-wrap]", form).classList.toggle("hidden", !fixed); $("[data-hourly-wrap]", form).classList.toggle("hidden", fixed); }; form.elements.pricingMode.addEventListener("change", toggle); toggle();
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const error = $("#quickSnowError", form); const button = $("button[type=submit]", form); error.textContent = ""; button.disabled = true;
      const payload = { roundId: round._id, customerId: form.elements.customerId.value || undefined, sourceType: form.elements.sourceType.value, priority: form.elements.priority.value, name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), address: form.elements.address.value.trim(), pricingMode: form.elements.pricingMode.value, hourlyRate: Number(form.elements.hourlyRate.value || round.defaultHourlyRate), fixedPrice: form.elements.fixedPrice?.value ? Number(form.elements.fixedPrice.value) : null, estimatedServiceMinutes: Number(form.elements.estimatedServiceMinutes.value), note: form.elements.note.value.trim() };
      try { await api("/admin/snow/jobs", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notice("Kunden er lagt i brøytekøen.", "success", 3500); await refresh({ quiet: true }); }
      catch (err) { error.textContent = err.message; }
      finally { button.disabled = false; }
    });
  }

  async function openAgreements() {
    openModal("Faste brøytekunder", '<div id="snowAgreementsBody"><p class="snow-muted">Henter faste kunder…</p></div>');
    const body = $("#snowAgreementsBody", els.modalBody);
    async function load() {
      try {
        const data = await api("/admin/snow/agreements");
        body.innerHTML = `<button type="button" class="snow-primary" id="addAgreementBtn">+ NY FAST KUNDE</button><div style="margin-top:14px">${(data.agreements || []).length ? data.agreements.map((a) => `<div class="snow-agreement"><div><strong>${esc(a.customerSnapshot?.name || "Kunde")}</strong><p>${esc(a.customerSnapshot?.address || "")} · ${esc(priorityLabel(a.priority))}${a.preferredWindow ? ` · ${esc(a.preferredWindow)}` : ""}</p></div><div class="snow-agreement-actions"><span class="snow-priority-badge ${esc(a.priority)}">${a.active ? "Aktiv" : "Av"}</span><button type="button" class="snow-mini" data-toggle-agreement="${esc(a._id)}" data-active="${a.active ? "1" : "0"}">${a.active ? "Av" : "På"}</button></div></div>`).join("") : '<p class="snow-muted">Ingen faste brøytekunder ennå.</p>'}</div>`;
        $("#addAgreementBtn", body).addEventListener("click", openAgreementForm);
        $$('[data-toggle-agreement]', body).forEach((button) => button.addEventListener("click", async () => { button.disabled = true; try { await api(`/admin/snow/agreements/${encodeURIComponent(button.dataset.toggleAgreement)}`, { method: "PATCH", body: JSON.stringify({ active: button.dataset.active !== "1" }) }); await load(); } catch (error) { notice(error.message, "error"); button.disabled = false; } }));
      } catch (error) { body.innerHTML = `<p class="snow-error">${esc(error.message)}</p>`; }
    }
    await load();
  }

  function openAgreementForm() {
    openModal("Ny fast brøytekunde", `<form id="snowAgreementForm" class="snow-modal-grid">${customerSearchMarkup()}<label class="snow-field wide">Adresse<input name="address" required maxlength="220"></label><label class="snow-field">Prioritet<select name="priority"><option value="normal">Normal</option><option value="high">Høy</option><option value="urgent">HASTER</option><option value="low">Lav</option></select></label><label class="snow-field">Ønsket tidsrom<input name="preferredWindow" placeholder="F.eks. før 06:00"></label><label class="snow-field">Prismodell<select name="pricingMode"><option value="hourly">Timepris</option><option value="fixed">Fastpris</option></select></label><label class="snow-field">Timepris<input name="hourlyRate" type="number" min="1" value="850"></label><label class="snow-field hidden" data-agreement-fixed>Fastpris<input name="fixedPrice" type="number" min="1"></label><label class="snow-field">Estimert tid<input name="estimatedServiceMinutes" type="number" min="1" max="480" value="15"></label><label class="snow-check wide"><input name="autoQueue" type="checkbox" checked> Legg automatisk i nye brøyterunder</label><label class="snow-field wide">Notat<textarea name="notes" placeholder="Hva må huskes hos kunden?"></textarea></label><p id="agreementError" class="snow-error wide"></p><button class="snow-primary snow-xl wide" type="submit">LAGRE FAST KUNDE</button></form>`);
    const form = $("#snowAgreementForm", els.modalBody); bindCustomerSearch(form, { requireSelection: true });
    form.elements.pricingMode.addEventListener("change", () => $("[data-agreement-fixed]", form).classList.toggle("hidden", form.elements.pricingMode.value !== "fixed"));
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); const error = $("#agreementError", form); error.textContent = ""; if (!form.elements.customerId.value) { error.textContent = "Velg kunden fra søkeresultatet."; return; }
      const payload = { customerId: form.elements.customerId.value, address: form.elements.address.value.trim(), priority: form.elements.priority.value, preferredWindow: form.elements.preferredWindow.value.trim(), pricingMode: form.elements.pricingMode.value, hourlyRate: Number(form.elements.hourlyRate.value), fixedPrice: form.elements.fixedPrice.value ? Number(form.elements.fixedPrice.value) : null, estimatedServiceMinutes: Number(form.elements.estimatedServiceMinutes.value), autoQueue: form.elements.autoQueue.checked, notes: form.elements.notes.value.trim() };
      const button = $("button[type=submit]", form); button.disabled = true; try { await api("/admin/snow/agreements", { method: "POST", body: JSON.stringify(payload) }); notice("Fast brøytekunde lagret.", "success", 3500); await openAgreements(); } catch (err) { error.textContent = err.message; button.disabled = false; }
    });
  }

  async function optimize() {
    const button = $("#optimizeBtn"); button.disabled = true; notice("Finner smart rekkefølge…", "info");
    try { const loc = await getLocation(); const data = await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/optimize`, { method: "POST", body: JSON.stringify({ location: loc }) }); render(data); notice("Brøytekøen er optimalisert etter prioritet og nærhet.", "success", 4500); }
    catch (error) { notice(error.message, "error"); }
    finally { button.disabled = false; }
  }

  $("#startRoundForm").elements.roundDate.value = today();
  $("#startRoundForm").elements.defaultPricingMode.addEventListener("change", (event) => $("#roundFixedWrap").classList.toggle("hidden", event.target.value !== "fixed"));
  $("#startRoundForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const error = $("#startRoundError"); const button = $("button[type=submit]", form); error.textContent = ""; button.disabled = true;
    const payload = { roundDate: form.elements.roundDate.value, defaultServiceMinutes: Number(form.elements.defaultServiceMinutes.value), defaultPricingMode: form.elements.defaultPricingMode.value, defaultHourlyRate: Number(form.elements.defaultHourlyRate.value), defaultFixedPrice: form.elements.defaultFixedPrice.value ? Number(form.elements.defaultFixedPrice.value) : null, autoQueueAgreements: form.elements.autoQueueAgreements.checked };
    try { const data = await api("/admin/snow/rounds", { method: "POST", body: JSON.stringify(payload) }); render(data); await getLocation(); if (state.location) await refresh({ quiet: true, useLocation: true }); notice("Brøyterunden er startet.", "success", 3500); }
    catch (err) { error.textContent = err.message; }
    finally { button.disabled = false; }
  });

  document.addEventListener("click", async (event) => {
    const start = event.target.closest("[data-start-job]"); if (start) { start.disabled = true; await startJob(start.dataset.startJob); return; }
    const finish = event.target.closest("[data-finish-job]"); if (finish) { finish.disabled = true; await finishJob(finish.dataset.finishJob); return; }
    const up = event.target.closest("[data-move-up]"); if (up) { await moveJob(up.dataset.moveUp, -1); return; }
    const down = event.target.closest("[data-move-down]"); if (down) { await moveJob(down.dataset.moveDown, 1); return; }
    const defer = event.target.closest("[data-defer-job]"); if (defer) { await patchJob(defer.dataset.deferJob, { status: "deferred" }); return; }
    const restore = event.target.closest("[data-restore-job]"); if (restore) { await patchJob(restore.dataset.restoreJob, { status: "queued" }); return; }
    const priorityBtn = event.target.closest("[data-priority-job]"); if (priorityBtn) {
      const job = state.data.queue.find((item) => String(item._id) === String(priorityBtn.dataset.priorityJob)); if (!job) return;
      const next = job.priority === "urgent" ? "normal" : "urgent"; await patchJob(job._id, { priority: next });
    }
  });

  $("#quickAddBtn").addEventListener("click", openQuickAdd);
  $("#agreementsBtn").addEventListener("click", openAgreements);
  $("#optimizeBtn").addEventListener("click", optimize);
  $("#snowRefresh").addEventListener("click", () => refresh());
  $("#finishRoundBtn").addEventListener("click", async () => {
    if (!state.data?.round) return;
    const remaining = Number(state.data.summary?.queued || 0) + Number(state.data.summary?.deferred || 0);
    if (remaining && !confirm(`${remaining} kunder står fortsatt igjen. Avslutte runden likevel?`)) return;
    try { await api(`/admin/snow/rounds/${encodeURIComponent(state.data.round._id)}/complete`, { method: "POST", body: JSON.stringify({ confirmRemaining: remaining > 0 }) }); notice("Brøyterunden er avsluttet.", "success", 3500); await refresh({ quiet: true }); }
    catch (error) { notice(error.message, "error"); }
  });

  window.addEventListener("online", () => { setConnection(true); flushPending(); });
  window.addEventListener("offline", () => { setConnection(false); notice("Offline – kritiske Start/Ferdig-handlinger lagres på telefonen.", "warning"); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { flushPending(); refresh({ quiet: true }); } });

  if (!adminKey()) { location.href = "login.html"; return; }
  setConnection(); const cached = cachedState(); if (cached) render(cached, { fromServer: false });
  refresh({ quiet: Boolean(cached) }); flushPending();
  state.poll = setInterval(() => { if (!document.hidden && navigator.onLine) refresh({ quiet: true }); }, 12000);
}());
