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

  let nextMeterTap = 0;
  const state = { data: null, knownIds: new Set(), timer: null, poll: null, location: null, flushing: false, searchTimer: null };
  const els = {
    noRound: $("#noRound"), activeRound: $("#activeRound"), notice: $("#snowNotice"), connection: $("#snowConnection"),
    inbox: $("#snowInbox"), inboxCount: $("#snowInboxCount"), inboxHint: $("#snowInboxHint"),
    inboxList: $("#snowInboxList"), inboxMore: $("#snowInboxMore"),
    prepareRound: $("#snowPrepareRoundBtn"), prepareHelp: $("#snowPrepareHelp"),
    activeJob: $("#activeJobCard"), nextJob: $("#nextJobCard"), queue: $("#snowQueue"), deferred: $("#snowDeferred"), done: $("#snowDone"),
    queueSection: $("#queueSection"), deferredSection: $("#deferredSection"), sumQueued: $("#sumQueued"), sumDone: $("#sumDone"), sumRemaining: $("#sumRemaining"), queueCount: $("#queueCount"),
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
    if (response.ok && (!data || typeof data !== "object")) {
      throw Object.assign(new Error("Svaret kunne ikkje lesast. Registreringa må stadfestast av serveren."),{network:true});
    }
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
  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "–";
    return `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: Number.isInteger(number) ? 0 : 2, maximumFractionDigits: 2 }).format(number)} kr`;
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
    const job = state.data?.activeJob;
    if (node && job) {
      const seconds = elapsed(job);
      node.textContent = formatDuration(seconds);
      const amount = job.pricingMode === "fixed" ? Number(job.fixedPrice)
        : Number(job.fixedPrice || 0) + seconds / 3600 * Number(job.hourlyRate);
      $("#snowLivePrice").textContent = formatMoney(Math.round(amount * 100) / 100);
    }
  }
  function restartClock() { clearInterval(state.timer); updateClock(); state.timer = setInterval(updateClock, 1000); }

  function timeWishLabel(pref) {
    const words = { before: "Før kl.", around: "Omtrent kl.", after: "Etter kl." };
    if (!pref || !words[pref.kind] || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(pref.time || "")) return "";
    return words[pref.kind] + " " + pref.time;
  }
  function timeWishMarkup(pref) {
    const label = timeWishLabel(pref);
    return label ? `<span class="snow-time-wish-badge">TIDSØNSKE · ${esc(label)} (ikkje garantert)</span>` : "";
  }
  function badges(job) {
    return `<span class="snow-source-badge">${esc(sourceLabel(job.sourceType))}</span><span class="snow-priority-badge ${esc(job.priority)}">${esc(priorityLabel(job.priority))}</span>`;
  }
  function moveButton(id) {
    return id ? '<button type="button" class="snow-secondary" data-move-booking="'+esc(id)+'">Flytt til annan dag</button>' : "";
  }
  function cancelButton(job) {
    return '<button type="button" class="snow-secondary" data-cancel-job="' + esc(job._id) + '">Avbestill oppdrag</button>' + moveButton(job.bookingId);
  }
  function notesMarkup(job) {
    const notes = (job.customerNotes || []).map(note => '<p>' + esc(note.text) + '</p>').join("");
    return (job.note ? '<div class="snow-note"><strong>Kommentar til oppdraget</strong><p>' + esc(job.note) + '</p></div>' : "")
      + (notes ? '<div class="snow-note"><strong>Interne kundenotat</strong>' + notes + '</div>' : "")
      + (job.internalNotes || []).map(n=>'<div class="snow-note"><strong>Internt oppdragsnotat</strong><p>'+esc(n.text)+'</p></div>').join("")
      + '<button type="button" class="snow-secondary" data-job-note="'+esc(job._id)+'">Notat for dette oppdraget</button>'
      + (job.customerId ? '<button type="button" class="snow-secondary" data-add-note="' + esc(job.customerId) + '">Nytt internt kundenotat</button>' : "");
  }
  function fieldComments(job) {
    const comment = job.note ? '<div class="snow-note"><strong>Kundekommentar</strong><p>' + esc(job.note) + '</p></div>' : "";
    const notes = [...(job.customerNotes || []), ...(job.internalNotes || [])];
    return comment + (notes.length ? '<div class="snow-note"><strong>Interne notat</strong>' +
      notes.map(n=>'<p>'+esc(n.text)+'</p>').join("")+'</div>' : "");
  }
  function jobDetailsButton(job) {
    return '<button type="button" class="snow-secondary" data-field-details="'+esc(job._id)+'">Opne oppdrag ›</button>';
  }
  function renderFieldDock(active, next) {
    const dock = $("#fieldDock");
    const job = active || next;
    dock.hidden = !job;
    if (!job) { dock.replaceChildren(); return; }
    const attr = active ? "data-finish-job" : "data-start-job";
    const label = active ? "Stopp og fullfør" : "Start brøyting";
    const existing = dock.firstElementChild;
    if (existing?.getAttribute(attr) === String(job._id) &&
        existing.querySelector("span")?.textContent === (job.customerSnapshot?.name || "Kunde")) return;
    dock.innerHTML = '<button class="snow-primary" type="button" '+attr+'="'+esc(job._id)+'">'+label+'<span>'+esc(job.customerSnapshot?.name || "Kunde")+'</span></button>';
  }
  function activeMarkup(job) {
    if (!job) return "";
    return `<div class="snow-focus-kicker"><span>Brøyting pågår</span><span>${badges(job)}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}</p>${timeWishMarkup(job.snowTimePreference)}${fieldComments(job)}<div id="snowLiveTimer" class="snow-timer">${formatDuration(elapsed(job))}</div><strong id="snowLivePrice"></strong><div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">Vis veg til kunden</a><button class="snow-primary snow-xl" type="button" data-finish-job="${esc(job._id)}">Stopp og fullfør</button>${jobDetailsButton(job)}</div>`;
  }
  function nextMarkup(job) {
    if (!job) return '<div class="snow-focus-kicker"><span>Neste kunde</span></div><h2>Ingen i denne runda</h2><p class="snow-address">Bestillingar for andre datoar blir viste under «Nye brøytebestillingar».</p>';
    const travel = job.estimatedTravelMinutes != null ? ` · ca. ${job.estimatedTravelMinutes} min kjøring` : "";
    return `<div class="snow-focus-kicker"><span>Neste kunde</span><span>${badges(job)}</span></div><h2>${esc(job.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</p>${timeWishMarkup(job.snowTimePreference)}${fieldComments(job)}<div class="snow-focus-actions"><a class="snow-secondary" href="${navigationUrl(job.customerSnapshot?.address)}" target="_blank" rel="noopener">Vis veg til kunden</a><button class="snow-primary snow-xl" type="button" data-start-job="${esc(job._id)}">Start brøyting</button>${jobDetailsButton(job)}</div>`;
  }
  function queueMarkup(job, index) {
    const travel = job.estimatedTravelMinutes != null ? ` · ca. ${job.estimatedTravelMinutes} min kjøring` : "";
    return `<button class="snow-queue-item snow-queue-open" type="button" data-manage-job="${esc(job._id)}">
      <span class="snow-queue-number">${index + 2}</span>
      <span class="snow-queue-main">
        <strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong>
        <span class="snow-queue-address">${esc(job.customerSnapshot?.address || "Adresse mangler")}${esc(travel)}</span>
        <span class="snow-queue-meta">${badges(job)}${timeWishMarkup(job.snowTimePreference)}${job.note ? `<span class="snow-muted">${esc(job.note)}</span>` : ""}</span>
      </span>
      <span class="snow-queue-manage">Opne ›</span>
    </button>`;
  }

  function openQueueJobMenu(id) {
    const queue = state.data?.queue || [];
    const job = queue.find((item) => String(item._id) === String(id));
    if (!job) return;
    const index = queue.findIndex((item) => String(item._id) === String(id));
    openModal("Kunde i kø", `
      <div class="snow-manage-job">
        <div class="snow-manage-customer">
          <strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong>
          <span>${esc(job.customerSnapshot?.address || "Adresse mangler")}</span>
          ${timeWishMarkup(job.snowTimePreference)}
          ${job.note ? `<p>${esc(job.note)}</p>` : ""}
        </div>
        <div class="snow-manage-actions">${cancelButton(job)}
          <button class="snow-secondary" type="button" data-queue-action="up" data-job-id="${esc(job._id)}" ${index <= 0 ? "disabled" : ""}>Flytt én plass opp</button>
          <button class="snow-secondary" type="button" data-queue-action="down" data-job-id="${esc(job._id)}" ${index >= queue.length - 1 ? "disabled" : ""}>Flytt én plass ned</button>
          <button class="snow-secondary" type="button" data-queue-action="priority" data-job-id="${esc(job._id)}">${job.priority === "urgent" ? "Fjern HASTER" : "Merk HASTER"}</button>
          <button class="snow-secondary" type="button" data-queue-action="defer" data-job-id="${esc(job._id)}">Utsett til senere</button>
        </div>
      </div>
    `, "Kø");
  }

  function formatDate(value) {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : String(value || "");
  }

  function renderInbox(data) {
    const total = Number(data?.unassignedBookings?.total || 0);
    const items = Array.isArray(data?.unassignedBookings?.items) ? data.unassignedBookings.items : [];
    els.inbox.classList.toggle("hidden", total === 0);
    if (!total) { els.prepareRound.classList.add("hidden"); els.prepareRound.dataset.date = ""; return; }

    els.inboxCount.textContent = String(total);
    els.inboxHint.textContent = "Desse bestillingane er lagra, men ligg ikkje i ei brøyterunde enno. Dei blir ikkje borte sjølv om den aktive runda har ein annan dato.";
    els.inboxList.innerHTML = items.map((booking) => {
      const safePhone = String(booking.customerPhone || "").replace(/[^+0-9]/g, "");
      return `<article class="snow-inbox-item">
        <div>
          <strong>${esc(booking.customerName || "Kunde")}</strong>
          <span>${esc(booking.customerAddress || "Adresse manglar")}</span>
          ${timeWishMarkup(booking.snowTimePreference)}
          ${moveButton(booking._id)}
          <button type="button" class="snow-secondary" data-cancel-booking="${esc(booking._id)}">Avbestill</button>
          ${booking.comment ? `<span class="snow-inbox-note">${esc(booking.comment)}</span>` : ""}
          ${safePhone ? `<a href="tel:${esc(safePhone)}">Ring kunden: ${esc(booking.customerPhone)}</a>` : ""}
        </div>
        <time datetime="${esc(booking.date)}">${booking.bookingMode === "day" ? `Brøyting ${esc(formatDate(booking.date))} · i løpet av dagen` : `Bestilt ${esc(formatDate(booking.date))} kl. ${esc(booking.time || "–")}`}</time>
      </article>`;
    }).join("");
    els.inboxMore.classList.toggle("hidden", total <= items.length);
    els.inboxMore.textContent = total > items.length ? `Viser ${items.length} av ${total}. Alle er lagra i systemet.` : "";

    const dates = items.map((booking) => booking.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today()).sort();
    const target = dates[0] || "";
    const round = data.round;
    const hasWork = Boolean(data.activeJob) || Number(data.summary?.queued || 0) > 0 || Number(data.summary?.deferred || 0) > 0;
    const canPrepare = Boolean(target) && !hasWork && (!round || round.roundDate <= target);
    els.prepareRound.classList.toggle("hidden", !canPrepare);
    els.prepareRound.dataset.date = canPrepare ? target : "";
    els.prepareRound.textContent = canPrepare ? `KLARGJER BRØYTERUNDE FOR ${formatDate(target)}` : "GJER KLAR BRØYTERUNDE";

    if (!target) els.prepareHelp.textContent = "Bestillingane gjeld tidlegare datoar. Kontroller dei før du opprettar ei ny runde.";
    else if (hasWork) els.prepareHelp.textContent = "Ei anna brøyterunde har uferdige kundar. Desse nye bestillingane blir ståande synlege til runda er avslutta.";
    else if (round?.roundDate > target) els.prepareHelp.textContent = "Ei aktiv runde har ein seinare dato. Kontroller datoane før du byter runde.";
    else if (round && round.roundDate !== target) els.prepareHelp.textContent = `Runda frå ${formatDate(round.roundDate)} blir avslutta, men alle ferdige oppdrag og fakturagrunnlag blir bevarte.`;
    else els.prepareHelp.textContent = "Bestillingane blir lagde i køen for vald dato. Ingen faktura blir sendt.";
  }

  function render(data, { fromServer = true } = {}) {
    if (!data) return;
    const previousIds = state.knownIds;
    const newWebsite = fromServer && state.data?.round ? (data.queue || []).filter((job) => job.sourceType === "website" && !previousIds.has(String(job._id))) : [];

    state.data = data;
    writeJson(CACHE_KEY, data);
    renderInbox(data);
    state.knownIds = new Set([...(data.queue || []), ...(data.deferred || []), ...(data.done || []), ...(data.activeJob ? [data.activeJob] : [])].map((job) => String(job._id)));
    if (newWebsite.length) showNotice(`${newWebsite.length} ny ${newWebsite.length === 1 ? "nettbestilling" : "nettbestillinger"} lagt i køen.`, "success", 7000);

    const messageAlert = $("#snowMessageAlert");
    messageAlert.classList.toggle("hidden", !data.messageAlerts);
    messageAlert.textContent = (data.messageAlerts || 0) + " meldingar manglar kontaktinformasjon eller lenke. Sjå detaljar.";
    messageAlert.onclick = () => { $("#bookingDayDate").value = data.round.roundDate; loadDayBookings(); $("#snowMessages").click(); };
    const hasRound = Boolean(data.round);
    els.noRound.classList.toggle("hidden", hasRound);
    renderFieldDock(data.activeJob, data.nextJob);
    els.activeRound.classList.toggle("hidden", !hasRound);
    if (!hasRound) { clearInterval(state.timer); els.subline.textContent = "Vel dato for å sjå bestillingane."; return; }

    els.subline.textContent = `${data.round.title || "Brøyterunde"} · ${data.round.roundDate || ""}`;
    els.activeJob.classList.toggle("hidden", !data.activeJob);
    els.activeJob.innerHTML = activeMarkup(data.activeJob);
    els.nextJob.innerHTML = data.activeJob ? `<div class="snow-focus-kicker"><span>Neste kunde</span></div>${data.nextJob ? `<h2>${esc(data.nextJob.customerSnapshot?.name || "Kunde")}</h2><p class="snow-address">${esc(data.nextJob.customerSnapshot?.address || "")}</p>${timeWishMarkup(data.nextJob.snowTimePreference)}${fieldComments(data.nextJob)}${jobDetailsButton(data.nextJob)}` : "<h2>Køen er tom</h2>"}` : nextMarkup(data.nextJob);

    const nextId = data.nextJob?._id ? String(data.nextJob._id) : "";
    const laterQueue = (data.queue || []).filter((job) => String(job._id) !== nextId);
    els.queueSection.classList.toggle("hidden", laterQueue.length === 0);
    els.queue.innerHTML = laterQueue.map(queueMarkup).join("");
    els.deferredSection.classList.toggle("hidden", !(data.deferred || []).length);
    els.deferred.innerHTML = (data.deferred || []).map((job) => `<article class="snow-queue-item"><span class="snow-queue-number">–</span><div class="snow-queue-main"><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><p>${esc(job.customerSnapshot?.address || "")}</p></div><div class="snow-queue-actions"><button class="snow-mini" type="button" data-restore-job="${esc(job._id)}">↩</button></div></article>`).join("");
    els.done.innerHTML = (data.done || []).length ? data.done.map((job) => `<div class="snow-done-item">
      <div><strong>${esc(job.customerSnapshot?.name || "Kunde")}</strong><span>${job.finishedAt ? new Intl.DateTimeFormat("no-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(job.finishedAt)) : "Ferdig"}</span></div>
      ${job.workOrderId ? `<button class="snow-done-billing" type="button" data-billing-job="${esc(job._id)}">Pris / faktura</button>` : ""}
    </div>`).join("") : '<p class="snow-muted">Ingen ferdige ennå.</p>';
    els.sumQueued.textContent = data.summary?.queued ?? 0;
    $("#sumIncome").textContent = formatMoney((data.done || []).reduce((sum, job) => sum + Number(job.amount || 0), 0));
    els.sumDone.textContent = data.summary?.done ?? 0;
    els.sumRemaining.textContent = formatMinutes(data.summary?.estimatedMinutesRemaining || 0);
    els.queueCount.textContent = laterQueue.length;
    restartClock();
  }

  async function refresh({ quiet = false, includeLocation = false } = {}) {
    let suffix = "";
    if (includeLocation && state.location) suffix = `?lat=${encodeURIComponent(state.location.lat)}&lng=${encodeURIComponent(state.location.lng)}&accuracy=${encodeURIComponent(state.location.accuracy || "")}`;
    try {
      const data = await api(`/admin/snow/state${suffix}`, { cache: "no-store" });
      if (readJson(PENDING_KEY, []).length) { await flushPending(); return; }
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

  function savePending(items) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  }

  async function criticalMutation(path, body, optimistic) {
    const items = readJson(PENDING_KEY, []);
    try {
      savePending([...items, { path, method:"POST", body, createdAt: new Date().toISOString() }]);
    } catch (error) {
      showNotice("Telefonen kunne ikkje lagre registreringa. Frigjer lagringsplass og prøv igjen.", "error");
      return { error };
    }
    optimistic();
    const result = await flushPending();
    if (!result?.data) {
      if (!result?.error) showNotice("Lagra på telefonen. Ventar på synkronisering.", "warning");
      return { offline: !result?.error, error: result?.error };
    }
    return result;
  }

  async function flushPending() {
    if (state.flushing || !navigator.onLine) return;
    state.flushing = true;
    let data;
    try {
      let item;
      while ((item = readJson(PENDING_KEY, [])[0])) {
        data = await api(item.path, { method:item.method, body:JSON.stringify(item.body) });
        // Read again after the network call. A stop can be recorded while start is in flight.
        savePending(readJson(PENDING_KEY, []).filter(entry => entry.body.operationId !== item.body.operationId));
      }
      if (data) { render(data); setConnection(true); showNotice("Registreringa er synkronisert.", "success", 3500); }
      return {data};
    } catch (error) {
      showNotice("Ikkje synkronisert. Ingenting er sletta. " + error.message, "warning");
      return isNetworkError(error) ? {offline:true} : {error};
    } finally { state.flushing = false; }
  }

  async function startJob(id) {
    const clientStartedAt = new Date().toISOString();
    const body = { clientStartedAt, operationId: uuid("snow-start") };
    const result = await criticalMutation(`/admin/snow/jobs/${encodeURIComponent(id)}/start`, body, () => optimisticStart(id, clientStartedAt));
    if (result?.error) await refresh({ quiet: true });
  }
  function showMissingSnowFee(job, draftInvoiceId = "") {
    openModal("Oppmøtegebyr manglar", `
      <div class="snow-billing-summary">
        <p class="snow-billing-warning"><strong>Feil pris:</strong> Dette eldre brøyteoppdraget er rekna etter feil sats. Riktig standardpris er 350 kr i oppmøte + 650 kr/time for faktisk arbeidstid. ${draftInvoiceId ? "Det eksisterande fakturautkastet blir retta utan å bli utstedt." : "Korrigeringa endrar ikkje timeregistreringa."}</p>
        <button class="snow-primary snow-xl" type="button" data-apply-snow-fee="${esc(job._id)}">KORRIGER TIL 350 KR + 650 KR/TIME</button>
        ${draftInvoiceId ? `<a class="snow-secondary" href="faktura-detalj.html?id=${encodeURIComponent(draftInvoiceId)}&from=snow">Vis fakturautkast</a>` : ""}
        <button class="snow-secondary" type="button" data-close-snow-billing>Seinare</button>
      </div>
    `, "Prisretting");
  }

  async function openBillingSummary(job) {
    const workOrderId = job?.workOrderId;
    if (!workOrderId) {
      showNotice("Oppdraget mangler fakturakobling.", "error", 4500);
      return;
    }

    openModal("Pris etter brøyting", '<div class="snow-billing-loading">Regner ut endelig pris…</div>', "Ferdig");
    try {
      const preview = await api(`/invoices/work-order/${encodeURIComponent(workOrderId)}`);
      if ((job.pricingMode === "hourly" && !(Number(job.fixedPrice) > 0) || (job.pricingMode === "hybrid" && Number(job.hourlyRate) === 850 && job.sourceType !== "recurring"))) {
        showMissingSnowFee(job);
        return;
      }
      const total = Number(preview.totals?.amount);
      const beforeRounding = Number(preview.totals?.amountBeforeRounding);
      const customer = preview.customer?.name || job.customerSnapshot?.name || "Kunde";
      const lineSummary = (preview.lines || []).slice(0, 4).map((line) =>
        `<div class="snow-billing-line"><span>${esc(line.item || "Arbeid")}</span><strong>${formatMoney(line.amount)}</strong></div>`
      ).join("");
      const rounding = Number(preview.totals?.roundingAdjustment || 0);

      openModal("Ferdig hos " + customer, `
        <div class="snow-billing-summary">
          <p class="snow-billing-label">KUNDEN SKAL BETALE</p>
          <div class="snow-billing-total">${formatMoney(total)}</div>
          ${Number.isFinite(beforeRounding) && Math.abs(rounding) >= 0.01 ? `<p class="snow-billing-rounding">Før øreavrunding: ${formatMoney(beforeRounding)} · avrunding ${formatMoney(rounding)}</p>` : ""}
          <div class="snow-billing-lines">${lineSummary || '<p class="snow-muted">Fakturagrunnlaget er klart.</p>'}</div>
          <p class="snow-billing-help">Hvis kunden vil betale med en gang, er dette beløpet du oppgir. Betalingen registreres etter at fakturaen er opprettet og levert.</p>
          <div class="snow-billing-actions">
            <a class="snow-primary snow-xl" href="faktura-ny.html?workOrderId=${encodeURIComponent(workOrderId)}&from=snow">OPPRETT FAKTURA</a>
            <button class="snow-secondary" type="button" data-close-snow-billing>Fakturer senere</button>
          </div>
        </div>
      `, "Ferdig");
    } catch (error) {
      const invoiceId = error.data?.invoiceId;
      if (invoiceId) {
        if ((job.pricingMode === "hourly" && !(Number(job.fixedPrice) > 0) || (job.pricingMode === "hybrid" && Number(job.hourlyRate) === 850 && job.sourceType !== "recurring"))) {
          try {
            const invoiceData = await api(`/invoices/${encodeURIComponent(invoiceId)}`);
            if (invoiceData.invoice?.status === "draft" && !invoiceData.invoice?.invoiceNumber) {
              showMissingSnowFee(job, invoiceId);
              return;
            }
          } catch (_) { /* If draft read fails, keep the normal invoice link. */ }
        }
        openModal("Faktura finnes", `
          <div class="snow-billing-summary">
            <p>Denne brøytingen er allerede koblet til en faktura.</p>
            <a class="snow-primary snow-xl" href="faktura-detalj.html?id=${encodeURIComponent(invoiceId)}&from=snow">ÅPNE FAKTURA</a>
            <button class="snow-secondary" type="button" data-close-snow-billing>Lukk</button>
          </div>
        `, "Ferdig");
        return;
      }
      openModal("Kunne ikke hente pris", `<div class="snow-billing-summary"><p class="snow-error">${esc(error.message)}</p><a class="snow-secondary" href="oppdrag.html?from=field">Åpne oppdrag</a></div>`, "Ferdig");
    }
  }

  async function finishJob(id) {
    const activeJob = state.data?.activeJob && String(state.data.activeJob._id) === String(id)
      ? structuredClone(state.data.activeJob)
      : null;
    const clientFinishedAt = new Date().toISOString();
    const body = { clientFinishedAt, operationId: uuid("snow-finish") };
    const result = await criticalMutation(`/admin/snow/jobs/${encodeURIComponent(id)}/finish`, body, () => optimisticFinish(id, clientFinishedAt));
    if (result?.offline) {
      showNotice("Ferdig lagret offline. Pris og faktura blir tilgjengelig når registreringen er synkronisert.", "warning", 6500);
      return;
    }
    if (!result?.data) {
      if (result?.error) await refresh({ quiet: true });
      return;
    }
    const finishedJob = (result.data.done || []).find((job) => String(job._id) === String(id)) || activeJob;
    if (finishedJob) showNotice("Oppdrag fullført · " + (finishedJob.customerSnapshot?.name || "Kunde"), "success", 6500);
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
    openModal("Ny brøyting", `<form id="quickSnowForm" class="snow-modal-grid">${customerSearchMarkup()}<label class="snow-field">Kilde<select name="sourceType"><option value="phone">Telefon</option><option value="sms">SMS</option><option value="manual">Manuell</option></select></label><label class="snow-field">Prioritet<select name="priority"><option value="normal">Normal</option><option value="high">Høy</option><option value="urgent">HASTER</option><option value="low">Lav</option></select></label><label class="snow-field">Navn<input name="name" required maxlength="160"></label><label class="snow-field">Telefon<input name="phone" inputmode="tel" maxlength="40"></label><label class="snow-field wide">Adresse<input name="address" required maxlength="220"></label><label class="snow-field">Prismodell<select name="pricingMode"><option value="hybrid" ${round.defaultPricingMode !== "fixed" ? "selected" : ""}>350 kr oppmøte + timepris</option><option value="fixed" ${round.defaultPricingMode === "fixed" ? "selected" : ""}>Avtalt fastpris utan tillegg</option></select></label><label class="snow-field" data-hourly-wrap>Timepris<input name="hourlyRate" type="number" min="1" value="${esc(Number(round.defaultHourlyRate) === 850 ? 650 : (round.defaultHourlyRate || 650))}"></label><label class="snow-field ${round.defaultPricingMode === "fixed" ? "" : "hidden"}" data-fixed-wrap>Fastpris<input name="fixedPrice" type="number" min="1" value="${esc(round.defaultPricingMode === "fixed" ? (round.defaultFixedPrice ?? "") : "")}"></label><label class="snow-field">Estimert tid<input name="estimatedServiceMinutes" type="number" min="1" max="480" value="${esc(round.defaultServiceMinutes || 15)}"></label><label class="snow-field wide">Kommentar<textarea name="note" maxlength="2000" placeholder="F.eks. foran garasje, pass på bil…"></textarea></label><p id="quickSnowError" class="snow-error wide"></p><button class="snow-primary snow-xl wide" type="submit">LEGG I KØ</button><button type="submit" class="snow-secondary wide" value="start" ${state.data?.activeJob ? "disabled" : ""}>Start med ein gong</button></form>`);
    const form = $("#quickSnowForm", els.modalBody);
    const creationId = crypto.randomUUID();
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
      if (form.dataset.saving) return;
      form.dataset.saving = "1";
      error.textContent = ""; button.disabled = true;
      const payload = {
        operationId:creationId, roundId: round._id, customerId: form.elements.customerId.value || undefined,
        sourceType: form.elements.sourceType.value, priority: form.elements.priority.value,
        name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), address: form.elements.address.value.trim(),
        pricingMode: form.elements.pricingMode.value, hourlyRate: Number(form.elements.hourlyRate.value || round.defaultHourlyRate),
        fixedPrice: form.elements.fixedPrice.value ? Number(form.elements.fixedPrice.value) : null,
        estimatedServiceMinutes: Number(form.elements.estimatedServiceMinutes.value), note: form.elements.note.value.trim(),
      };
      try {
        const created = await api("/admin/snow/jobs", { method: "POST", body: JSON.stringify(payload) });
        const start = event.submitter?.value === "start";
        closeModal();
        await refresh({ quiet: true });
        if (start) await startJob(created.job._id);
        else showNotice("Kunden er lagt i brøytekøen.", "success", 3500);
      }
      catch (err) { error.textContent = err.message; }
      finally { delete form.dataset.saving; button.disabled = false; }
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
      autoQueueAgreements: false,
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
    const detail = event.target.closest("[data-field-details]");
    if (detail) {
      const job = [state.data?.activeJob, state.data?.nextJob].find(j=>j && String(j._id)===detail.dataset.fieldDetails);
      if (job) openModal(job.customerSnapshot?.name || "Oppdrag", '<p>'+esc(job.customerSnapshot?.address)+'</p>' +
        timeWishMarkup(job.snowTimePreference) + notesMarkup(job) +
        (job.status === "queued" ? '<div class="field-management"><button type="button" class="snow-secondary" id="fieldEdit">Rediger oppdrag</button>'+cancelButton(job)+'</div>' : ""));
      const edit = $("#fieldEdit");
      if (edit) edit.onclick = ()=>editDayEntry({j:job,b:job.bookingId ? {_id:job.bookingId,bookingMode:"day"} : null});
      return;
    }
    const decision = event.target.closest("[data-cancel-booking],[data-move-booking]");
    if (decision) {
      const id = decision.dataset.cancelBooking || decision.dataset.moveBooking;
      const cancel = Boolean(decision.dataset.cancelBooking);
      openModal(cancel ? "Avbestill oppdraget" : "Flytt bestillinga",
        '<form id="snowDecision" class="snow-modal-grid">' + (cancel ? '' :
        '<label class="snow-field">Ny dato<input name="date" type="date" required min="' + today() + '"></label>') +
        '<label class="snow-field">Årsak (valfritt)<input name="reason" maxlength="500"></label>' +
        '<button class="snow-primary">Stadfest</button></form>');
      $("#snowDecision").onsubmit = async e => {
        e.preventDefault();
        const submit = e.target.querySelector("button");
        if (submit.disabled) return;
        submit.disabled = true;
        const data = Object.fromEntries(new FormData(e.target));
        try {
          await api("/admin/snow/bookings/"+encodeURIComponent(id)+"/decision",{method:"POST",body:JSON.stringify({...data,action:cancel?"cancel":"move"})});
          closeModal(); await Promise.all([refresh({quiet:true}),loadDayBookings()]);
        } catch(error) {submit.disabled=false; let alert=e.target.querySelector("[role=alert]"); if (!alert) {alert=document.createElement("p");alert.setAttribute("role","alert");e.target.append(alert);} alert.textContent=error.message;}
      };
      return;
    }
    const cancel = event.target.closest("[data-cancel-job]");
    if (cancel) {
      const reason = prompt("Avbestill dette oppdraget? Skriv eventuell årsak og trykk OK for å stadfeste.");
      if (reason === null) return;
      try {
        await api("/admin/snow/jobs/" + encodeURIComponent(cancel.dataset.cancelJob) + "/cancel", {method:"POST",body:JSON.stringify({reason})});
        closeModal(); await Promise.all([refresh({quiet:true}),loadDayBookings()]);
      } catch(error) { showNotice(error.message,"error"); }
      return;
    }
    const noteButton = event.target.closest("[data-add-note],[data-job-note]");
    if (noteButton) {
      const text = prompt("Internt notat – berre synleg i admin");
      if (!text?.trim()) return;
      try {
        const path = noteButton.dataset.jobNote ? "/admin/snow/jobs/" + encodeURIComponent(noteButton.dataset.jobNote) + "/internal-notes" : "/admin/customers/" + encodeURIComponent(noteButton.dataset.addNote) + "/notes";
        await api(path, { method: "POST", body: JSON.stringify({ text, operationId: uuid() }) });
        await refresh({ quiet: true });
      } catch (error) { showNotice(error.message, "error"); }
      return;
    }
    const meterButton = event.target.closest("[data-start-job],[data-finish-job]");
    if (meterButton) {
      const starting = Boolean(meterButton.dataset.startJob);
      const job = starting ? state.data?.nextJob : state.data?.activeJob;
      const targetId = meterButton.dataset.startJob || meterButton.dataset.finishJob;
      if (String(job?._id) !== targetId || (starting && state.data.activeJob)) return;
      // The same thumb position changes from start to stop. Ignore a second tap.
      if (performance.now() < nextMeterTap) return;
      nextMeterTap = performance.now() + 900;
      if (meterButton.closest("#snowModal")) closeModal();
      if (starting) await startJob(targetId);
      else await finishJob(targetId);
      return;
    }

    const applyFee = event.target.closest("[data-apply-snow-fee]");
    if (applyFee) {
      const id = applyFee.dataset.applySnowFee;
      const job = (state.data?.done || []).find((item) => String(item._id) === String(id));
      if (!job) return showNotice("Oppdraget blei ikkje funne. Oppdater sida.", "error");
      applyFee.disabled = true;
      try {
        const correction = await api(`/admin/snow/jobs/${encodeURIComponent(id)}/apply-callout-fee`, { method: "POST", body: "{}" });
        closeModal();
        await refresh({ quiet: true });
        if (correction.draftInvoiceId) {
          const refreshed = await api(`/invoices/${encodeURIComponent(correction.draftInvoiceId)}`);
          const draft = refreshed.invoice;
          openModal("Pris korrigert i fakturautkast", `
            <div class="snow-billing-summary">
              <p class="snow-billing-label">OPPMØTE 350 KR + 650 KR/TIME</p>
              <div class="snow-billing-total">${formatMoney(draft.amount)}</div>
              <p class="snow-billing-help">Eksisterande fakturautkast er oppdatert. Det er framleis eit utkast – ingenting er sendt til kunden.</p>
              <a class="snow-primary snow-xl" href="faktura-detalj.html?id=${encodeURIComponent(correction.draftInvoiceId)}&from=snow">OPNE KORRIGERT FAKTURAUTKAST</a>
              <button class="snow-secondary" type="button" data-close-snow-billing>Lukk</button>
            </div>
          `, "Prisretting");
        } else {
          const updatedJob = (state.data?.done || []).find((item) => String(item._id) === String(id)) || { ...job, pricingMode: "hybrid", fixedPrice: 350, hourlyRate: 650 };
          await openBillingSummary(updatedJob);
        }
      } catch (error) {
        showNotice(`Prisretting stoppa: ${error.message}. Ingen pris er endra.`, "error");
        applyFee.disabled = false;
      }
      return;
    }

    const billing = event.target.closest("[data-billing-job]");
    if (billing) {
      const job = (state.data?.done || []).find((item) => String(item._id) === String(billing.dataset.billingJob));
      if (job) await openBillingSummary(job);
      return;
    }

    const closeBilling = event.target.closest("[data-close-snow-billing]");
    if (closeBilling) { closeModal(); return; }

    const manage = event.target.closest("[data-manage-job]");
    if (manage) { openQueueJobMenu(manage.dataset.manageJob); return; }

    const queueAction = event.target.closest("[data-queue-action]");
    if (queueAction) {
      const id = queueAction.dataset.jobId;
      const action = queueAction.dataset.queueAction;
      closeModal();
      if (action === "up") await moveJob(id, -1);
      else if (action === "down") await moveJob(id, 1);
      else if (action === "defer") await patchJob(id, { status: "deferred" });
      else if (action === "priority") {
        const job = (state.data?.queue || []).find((item) => String(item._id) === String(id));
        if (job) await patchJob(id, { priority: job.priority === "urgent" ? "normal" : "urgent" });
      }
      return;
    }

    const restore = event.target.closest("[data-restore-job]"); if (restore) { await patchJob(restore.dataset.restoreJob, { status: "queued" }); return; }
  });

  $("#snowModalClose").addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
  $("#quickAddBtn").addEventListener("click", openQuickAdd);
  async function reviewDay(date) {
    const {rows} = await api("/admin/snow/review/" + encodeURIComponent(date));
    const done = rows.filter(row => row.status === "done");
    const drafts = done.filter(row => row.invoice?.status === "draft" && !row.invoice.snowSimulatedAt);
    const pending = done.filter(row => row.workOrderId && !row.invoiceId);
    openModal("Dagsoversikt " + formatDate(date),
      '<p>' + done.length + ' ferdige · ' + (rows.length - done.length) + ' uferdige · ' +
      formatDuration(done.reduce((n,r)=>n + (r.workSeconds || 0),0)) + ' · ' +
      formatMoney(done.reduce((n,r)=>n+(r.amount || 0),0)) + ' før avrunding</p>' +
      rows.map(row => '<article class="snow-note"><strong>' + esc(row.customerSnapshot?.name) + '</strong><p>' +
        (row.status === "done" ? formatDuration(row.workSeconds) + ' · ' + formatMoney(row.invoice?.amount ?? row.amount) :
        'Uferdig oppdrag') + '</p>' + (row.invoice ? '<a href="faktura-detalj.html?id=' + encodeURIComponent(row.invoiceId) +
        '">' + (row.invoice.snowSimulatedAt ? 'Sending simulert' : 'Kontroller faktura') + '</a>' :
        row.status === "done" ? '<button type="button" class="snow-secondary" data-correct="' + esc(row._id) + '">Korriger</button>' : '') +
        '</article>').join("") +
      '<button class="snow-primary" id="approveDay" ' + (pending.length ? '' : 'disabled') + '>Godkjenn alle – opprett utkast</button> ' +
      '<button class="snow-secondary" id="sendDay" ' + (drafts.length && !pending.length ? '' : 'disabled') + '>Send alle (simulert)</button>');
    for (const btn of $$("[data-correct]",els.modalBody)) btn.onclick = async () => {
      const row = done.find(r=>r._id===btn.dataset.correct);
      const sec = prompt("Arbeidstid i sekund", String(row.workSeconds)); if (sec===null) return;
      const price = prompt("Avtalt totalpris. La stå tomt for berekna pris.",""); if(price===null) return;
      const comment = prompt("Årsak til korrigering",""); if(comment===null) return;
      try {
        await api("/admin/snow/jobs/"+row._id+"/correction",{method:"PATCH",body:JSON.stringify({
          seconds:Number(sec),price:price.trim() ? Number(price.replace(",",".")) : null,comment})});
        await reviewDay(date);
      } catch(error) { showNotice(error.message,"error"); }
    };
    async function applyAll(send) {
      if (send && !confirm("Simuler sending av " + drafts.length + " kontrollerte utkast?")) return;
      $("#approveDay").disabled = true; $("#sendDay").disabled = true;
      let count = 0;
      try {
        for (const row of send ? drafts : pending) {
          if (send) await api("/admin/snow/jobs/"+row._id+"/simulate-invoice", {method:"POST",
            body:JSON.stringify({amount:row.invoice.amount,updatedAt:row.invoice.updatedAt})});
          else await api("/invoices",{method:"POST",body:JSON.stringify({sourceType:"workOrder",sourceId:row.workOrderId,customerName:row.customerSnapshot.name})});
          count++;
        }
        await reviewDay(date);
        showNotice(count + (send ? " sendingar simulerte." : " utkast oppretta."),"success");
      } catch(error) {
        await reviewDay(date);
        showNotice("Stoppa etter " + count + ". Kontroller attståande oppdrag. " + error.message,"error");
      }
    }
    $("#approveDay").onclick = ()=>applyAll(false);
    $("#sendDay").onclick = ()=>applyAll(true);
  }
  $("#reviewDay").onclick = () => reviewDay($("#bookingDayDate").value || today()).catch(error=>showNotice(error.message,"error"));
  $("#snowMessages").addEventListener("click", async () => {
    try {
      const date = $("#bookingDayDate").value || today();
      const data = await api("/admin/snow/messages/" + encodeURIComponent(date));
      openModal("Testmeldingar " + date, '<button class="snow-secondary" id="smsToggle">' +
        (data.enabled ? "Slå av SMS" : "Slå på SMS") + '</button>' + data.messages.map(m =>
        '<p><strong>' + esc(m.channel.toUpperCase() + " · " + ({simulated:"Simulert",disabled:"Avslått",missing_contact:"Manglar kontaktinformasjon",missing_link:"Manglar lenke"}[m.status] || m.status)) +
        '</strong><br>' + esc(m.text) + '</p>').join(""));
      $("#smsToggle").onclick = async () => {
        try { await api("/admin/snow/sms", {method:"PATCH",body:JSON.stringify({enabled: !data.enabled})}); $("#snowMessages").click(); }
        catch(error) { showNotice(error.message,"error"); }
      };
    } catch(error) { showNotice(error.message,"error"); }
  });
  const dayPicker = $("#bookingDayDate");
  const dayList = $("#dateBookingList");
  const statusNames = {pending:"Ny", planned:"Planlagd", queued:"I kø", active:"Pågår", deferred:"Utsett", done:"Fullført", cancelled:"Avbestilt", failed:"Avvik"};
  let dayVersion = 0;
  async function bookingsForDay(date) {
    const bookings = [];
    for (let skip = 0; ; skip += 500) {
      const page = await api("/admin/bookings?from="+date+"&to="+date+"&status=all&limit=500&skip="+skip);
      bookings.push(...page.bookings.filter(b => b.bookingMode === "day" || /brøy|broy|plog/i.test(b.serviceName)));
      if (page.bookings.length < 500) return bookings;
    }
  }
  async function loadDayBookings() {
    const version = ++dayVersion;
    const date = dayPicker.value;
    dayList.textContent = date ? "Hentar bestillingar …" : "Vel ein dato.";
    if (!date) return;
    try {
      const [bookings, review] = await Promise.all([bookingsForDay(date), api("/admin/snow/review/"+date)]);
      if (version !== dayVersion) return;
      const byBooking = new Map(review.rows.filter(j=>j._id && j.bookingId).map(j=>[j.bookingId,j]));
      const entries = bookings.map(b=>({b,j:byBooking.get(b._id)}));
      entries.push(...review.rows.filter(j=>j._id && !j.bookingId).map(j=>({j})));
      dayList.replaceChildren();
      if (!entries.length) dayList.textContent = "Ingen brøytebestillingar denne dagen.";
      for (const entry of entries) {
        const {b,j} = entry;
        const status = j?.status || b?.status || "pending";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "snow-secondary field-date-row";
        button.style.cssText = "width:100%;display:grid;gap:.25rem;text-align:left;margin:.25rem 0;overflow-wrap:anywhere";
        button.innerHTML = "<strong>"+esc(b?.customerName || j.customerSnapshot.name)+"</strong><span>"+esc(b?.customerAddress || j?.customerSnapshot?.address)+"</span><small>"+esc(statusNames[status] || status)+"</small>";
        button.onclick = ()=>openDayEntry(entry);
        dayList.append(button);
      }
    } catch(error) {
      if (version !== dayVersion) return;
      dayList.textContent = "Klarte ikkje hente bestillingane. ";
      const retry = document.createElement("button");
      retry.textContent = "Prøv igjen"; retry.onclick = loadDayBookings;
      dayList.append(retry);
    }
  }
  function openDayEntry(entry) {
    const {b,j} = entry;
    const status = j?.status || b.status;
    const editable = ["queued","deferred","planned","pending"].includes(status) && !j?.workOrderId;
    const line = (label,value)=>value ? "<p><strong>"+label+"</strong><br>"+esc(value)+"</p>" : "";
    const details = line("Adresse",b?.customerAddress || j?.customerSnapshot?.address)
      + line("Telefon",b?.customerPhone || j?.customerSnapshot?.phone)
      + line("E-post",b?.customerEmail || j?.customerSnapshot?.email)
      + line("Ønskt tidspunkt",timeWishLabel(b?.snowTimePreference || j?.snowTimePreference) || "Ingen tidsønske")
      + line("Kundekommentar",b?.comment || "Ingen kommentar")
      + (j?.note && j.note !== b?.comment ? line("Oppdragsmerknad",j.note) : "")
      + line("Interne oppdragsnotat",j?.internalNotes?.map(n=>n.text).join(" · "))
      + line("Interne kundenotat",j?.customerNotes?.map(n=>n.text).join(" · "))
      + line("Årsak til avbestilling",b?.snowChanges?.filter(x=>x.action==="cancel").at(-1)?.reason || j?.cancelReason);
    const active = state.data?.activeJob;
    const target = active || state.data?.nextJob;
    const meter = j && target && String(j._id) === String(target._id)
      ? '<button type="button" class="snow-primary field-detail-meter" ' + (active ? 'data-finish-job' : 'data-start-job') +
        '="'+esc(j._id)+'">'+(active ? 'Stopp og fullfør' : 'Start brøyting')+'</button>' : "";
    openModal(b?.customerName || j.customerSnapshot.name,details + meter + (editable ?
      '<button id="editDayEntry" class="snow-primary">Rediger oppdrag</button> ' +
      (b?.bookingMode==="day" ? '<button class="snow-secondary" data-cancel-booking="'+esc(b._id)+'">Avbestill oppdrag</button>' : j ? cancelButton(j) : '') : '') +
      (status==="done" ? '<button id="daySettlement" class="snow-secondary">Opne dagsoppgjer</button>' : ''),
      formatDate(dayPicker.value)+" · "+(statusNames[status] || status));
    if ($("#daySettlement")) $("#daySettlement").onclick=()=>$("#reviewDay").click();
    if (editable) $("#editDayEntry").onclick=()=>editDayEntry(entry);
    if (b?.customerId && !j?.customerNotes) {
      const notes = document.createElement("div");
      els.modalBody.append(notes);
      api("/admin/customers/"+encodeURIComponent(b.customerId)).then(data=>{
        notes.innerHTML=line("Interne kundenotat",data.customer?.notes?.map(n=>n.text).join(" · "));
      }).catch(()=>{notes.textContent="Klarte ikkje hente kundenotata.";});
    }
  }
  function editDayEntry({b,j}) {
    const field = (label,name,value,type="text",limits="")=>'<label class="snow-field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+limits+'></label>';
    const formFields = j ?
      field("Estimert arbeidstid i minutt","estimatedServiceMinutes",j.estimatedServiceMinutes,"number",'required min="1" max="480"')
      + '<label class="snow-field">Oppdragsmerknad<textarea name="note" maxlength="2000">'+esc(j.note)+'</textarea></label>' :
      field("Namn","customerName",b.customerName,"text",'required maxlength="120"')
      + field("Telefon","customerPhone",b.customerPhone,"tel",b.manualSnow?"":"required")
      + field("E-post","customerEmail",b.customerEmail,"email",b.manualSnow?"":"required")
      + '<label class="snow-field">Kundekommentar<textarea name="comment" maxlength="1000">'+esc(b.comment)+'</textarea></label>';
    openModal("Rediger oppdrag",'<form id="dayEntryForm" class="snow-modal-grid">'+formFields+'<p role="alert"></p><button class="snow-primary">Lagre endringar</button></form>'+
      (b?.bookingMode==="day"?moveButton(b._id):""));
    $("#dayEntryForm").onsubmit = async event=>{
      event.preventDefault();
      const form = event.currentTarget, button=form.querySelector("button");
      if (button.disabled) return;
      button.disabled=true;
      const changes = Object.fromEntries(new FormData(form));
      for (const key of Object.keys(changes)) if (String((j || b)[key] ?? "")===changes[key]) delete changes[key];
      try {
        if (Object.keys(changes).length) await api(j?"/admin/snow/jobs/"+j._id:"/admin/bookings/"+b._id,{method:"PATCH",body:JSON.stringify(changes)});
        closeModal(); await Promise.all([loadDayBookings(),refresh({quiet:true})]);
        showNotice("Endringane er lagra.","success",3000);
      } catch(error) {form.querySelector('[role="alert"]').textContent=error.message;button.disabled=false;}
    };
  }
  dayPicker.value=today();
  dayPicker.onchange=loadDayBookings;
  loadDayBookings();

  for (const button of $$("[data-day-closed]")) button.addEventListener("click", async () => {
    const date = $("#bookingDayDate").value;
    if (!date) return showNotice("Vel dato først.", "error");
    try {
      const day = await api("/admin/snow/days/" + encodeURIComponent(date), { method: "PATCH", body: JSON.stringify({ closed: button.dataset.dayClosed === "true" }) });
      showNotice(day.date + (day.closed ? " er stengd for nye bestillingar." : " er open for bestilling."), "success");
    } catch (error) { showNotice(error.message, "error"); }
  });
  $("#optimizeBtn").addEventListener("click", optimizeRoute);
  els.prepareRound.addEventListener("click", async () => {
    const date = els.prepareRound.dataset.date;
    if (!date) return;
    const offlinePending = readJson(PENDING_KEY, []);
    if (offlinePending.length) {
      showNotice("Synkroniser offline-registreringane før du byter brøyterunde. Ingenting blir sletta.", "error");
      return;
    }
    const round = state.data?.round;
    if (round && round.roundDate !== date && !confirm(`Avslutte runda frå ${formatDate(round.roundDate)} og lage ny runde for ${formatDate(date)}? Ferdige oppdrag og fakturagrunnlag blir bevarte.`)) return;
    els.prepareRound.disabled = true;
    try {
      const result = await api("/admin/snow/rounds/rollover", {
        method: "POST", body: JSON.stringify({ roundDate: date }),
      });
      render(result);
      showNotice(`Brøyterunde for ${formatDate(date)} er klar. Nye bestillingar er lagde i køen.`, "success", 6500);
    } catch (error) {
      showNotice(`Kunne ikkje starte ny runde: ${error.message}. Bestillingane ligg framleis lagra.`, "error");
      await refresh({ quiet: true });
    } finally { els.prepareRound.disabled = false; }
  });
  $("#snowRefresh").addEventListener("click", () => {refresh();loadDayBookings();});
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


// A narrow scope leaves the admin push worker in control of the other pages.
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("snow-offline-sw.js", {scope:"./broyting.html"}).catch(() => {
    const notice = document.getElementById("snowNotice");
    if (notice) {
      notice.className = "snow-notice is-warning";
      notice.textContent = "Offline-opning er ikkje klar. Hald brøytesida open når dekninga er dårleg.";
    }
  });
}


