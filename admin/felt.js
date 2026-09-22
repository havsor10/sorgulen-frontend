(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY = "sorgulen_admin_key";
  const timeTools = window.SorgulenWorkOrderTime;
  const el = (id) => document.getElementById(id);

  const state = {
    home: null,
    workOrders: [],
    customers: [],
    defaultService: null,
    serverOffset: 0,
    busy: false,
    currentView: "today",
    modalType: "",
    modalContext: {},
    selectedCustomer: null,
    customerSearchTimer: null,
  };

  const STATUS_LABEL = {
    planned: "Planlagt",
    active: "Aktiv",
    paused: "Pauset",
    stopped: "Mellom økter",
    completed: "Ferdig",
    cancelled: "Avbrutt",
  };

  function adminKey() {
    return (localStorage.getItem(KEY) || "").trim();
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
        ...(options.headers || {}),
      },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (data?.serverTime) state.serverOffset = new Date(data.serverTime).getTime() - Date.now();
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY);
      location.href = "login.html";
      throw new Error("Logg inn på nytt.");
    }
    if (!response.ok) throw Object.assign(new Error(data?.error || "Kunne ikke utføre handlingen."), { status: response.status, data });
    return data;
  }

  function setStatus(text = "", type = "") {
    const node = el("fieldStatus");
    node.textContent = text;
    node.className = "field-status" + (type ? " " + type : "");
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function fmtDuration(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, "0")).join(":");
  }

  function fmtMoney(value) {
    return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(Number(value) || 0) + " kr";
  }

  function osloToday() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return get("year") + "-" + get("month") + "-" + get("day");
  }

  function currentSeconds(order) {
    if (!order) return 0;
    if (timeTools?.calculateWorkSeconds) return timeTools.calculateWorkSeconds(order, Date.now() + state.serverOffset);
    return Number(order.currentWorkSeconds || 0);
  }

  function currentSessionSeconds(order) {
    if (!order) return 0;
    if (timeTools?.calculateCurrentSessionSeconds) return timeTools.calculateCurrentSessionSeconds(order, Date.now() + state.serverOffset);
    return currentSeconds(order);
  }

  function operationId(prefix) {
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
    return (prefix + "-" + id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  }

  function uniqueOpenJobs() {
    const byId = new Map();
    const all = [
      state.home?.activeWorkOrder,
      state.home?.ongoingProject,
      ...(state.home?.ongoingProjects || []),
      ...state.workOrders.filter((o) => ["planned", "active", "paused", "stopped"].includes(o.status)),
    ].filter(Boolean);
    all.forEach((job) => byId.set(String(job._id), job));
    return [...byId.values()].sort((a, b) => {
      const weight = { active: 0, paused: 1, stopped: 2, planned: 3 };
      return (weight[a.status] ?? 9) - (weight[b.status] ?? 9)
        || String(a.jobDate || "").localeCompare(String(b.jobDate || ""));
    });
  }

  function customerName(job) {
    return job?.customerSnapshot?.name || "Ukjent kunde";
  }

  function renderPulse() {
    const node = el("fieldPulse");
    const overview = state.home?.overview;
    if (!overview) { node.hidden = true; return; }
    const booking = Number(overview.counts?.pendingBookings || 0);
    const requests = Number(overview.counts?.pendingRequests || 0);
    if (!booking && !requests) { node.hidden = true; return; }
    node.hidden = false;
    node.innerHTML =
      '<div><strong>' + booking + '</strong><span>nye bookinger</span></div>' +
      '<div><strong>' + requests + '</strong><span>prisforespørsler</span></div>';
  }

  function activeActionButtons(job) {
    if (job.status === "active") {
      return '<button class="field-action-primary" data-job-action="pause" data-id="' + esc(job._id) + '">PAUSE</button>' +
        '<button class="field-action-secondary" data-job-action="stop" data-id="' + esc(job._id) + '">AVSLUTT ØKT</button>';
    }
    if (job.status === "paused") {
      return '<button class="field-action-primary" data-job-action="resume" data-id="' + esc(job._id) + '">FORTSETT</button>' +
        '<button class="field-action-secondary" data-job-action="stop" data-id="' + esc(job._id) + '">AVSLUTT ØKT</button>';
    }
    if (job.status === "stopped") {
      return '<button class="field-action-primary" data-job-action="resume" data-id="' + esc(job._id) + '">FORTSETT ARBEID</button>' +
        '<a class="field-action-secondary" href="oppdrag.html?open=' + encodeURIComponent(job._id) + '&from=field" style="display:grid;place-items:center;text-decoration:none">DETALJER</a>';
    }
    return '<button class="field-action-primary" data-job-action="start" data-id="' + esc(job._id) + '">START OPPDRAG</button>' +
      '<a class="field-action-secondary" href="oppdrag.html?open=' + encodeURIComponent(job._id) + '&from=field" style="display:grid;place-items:center;text-decoration:none">DETALJER</a>';
  }

  function renderActive() {
    const card = el("activeJobCard");
    const job = state.home?.activeWorkOrder || state.home?.ongoingProject || state.home?.nextWorkOrder;
    if (!job) {
      card.className = "field-card field-active-card";
      card.innerHTML = '<p class="field-kicker">Akkurat nå</p><h2 style="margin:5px 0 7px">Ingen aktiv jobb</h2><p style="margin:0;color:var(--field-muted)">Når telefonen ringer kan du opprette eit oppdrag med bare kundenavn.</p><button class="field-primary-action" type="button" data-open="new-job">+ Nytt oppdrag</button>';
      bindDynamic(card);
      return;
    }

    const isRunning = job.status === "active";
    const total = currentSeconds(job);
    const session = currentSessionSeconds(job);
    const expenses = (job.additionalCosts || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    card.className = "field-card field-active-card" + (isRunning ? " is-running" : "");
    card.innerHTML =
      '<div class="field-active-top"><div><p class="field-kicker">' + (isRunning ? "Pågår nå" : job.status === "stopped" ? "Pågående prosjekt" : "Neste oppdrag") + '</p>' +
      '<h2>' + esc(customerName(job)) + '</h2><p>' + esc(job.serviceName || "Oppdrag") + '</p></div>' +
      '<span class="field-state ' + esc(job.status) + '">' + esc(STATUS_LABEL[job.status] || job.status) + '</span></div>' +
      '<div class="field-timer" data-live-job="' + esc(job._id) + '" data-mode="' + (isRunning ? "session" : "total") + '">' + fmtDuration(isRunning ? session : total) + '</div>' +
      '<div class="field-timer-label">' + (isRunning ? "Denne arbeidsøkta" : "Registrert arbeidstid") + '</div>' +
      '<div class="field-job-meta"><span>' + (job.hourlyRate ? esc(fmtMoney(job.hourlyRate)) + '/t' : "Timesats mangler") + '</span><span>' + esc(fmtMoney(expenses)) + ' utgifter</span><span>' + ((job.projectNotes || []).length) + ' notat</span></div>' +
      '<div class="field-main-actions">' + activeActionButtons(job) + '</div>' +
      '<div class="field-quick-row">' +
        '<button type="button" data-open="expense" data-job-id="' + esc(job._id) + '">+ Utgift</button>' +
        '<button type="button" data-open="job-note" data-job-id="' + esc(job._id) + '">+ Notat</button>' +
        '<button type="button" data-open="time" data-job-id="' + esc(job._id) + '">+ Tid</button>' +
        '<button type="button" data-open="material" data-job-id="' + esc(job._id) + '">+ Materiale</button>' +
      '</div>';
    bindDynamic(card);
  }

  function jobCard(job, compact = false) {
    const primaryAction = job.status === "planned" ? "start" : ["paused", "stopped"].includes(job.status) ? "resume" : "";
    const primaryLabel = job.status === "planned" ? "Start" : "Fortsett";
    const meta = [job.serviceName || "Oppdrag", job.jobDate || "", STATUS_LABEL[job.status] || job.status].filter(Boolean).join(" · ");
    return '<article class="field-job-card">' +
      '<div class="field-job-card-head"><div><h3>' + esc(customerName(job)) + '</h3><p>' + esc(meta) + '</p></div><span class="field-state ' + esc(job.status) + '">' + esc(STATUS_LABEL[job.status] || job.status) + '</span></div>' +
      (compact ? "" : '<div class="field-job-meta"><span>' + fmtDuration(currentSeconds(job)) + ' tid</span><span>' + (job.projectNotes || []).length + ' notat</span></div>') +
      '<div class="field-job-card-actions">' +
        (primaryAction ? '<button class="primary" type="button" data-job-action="' + primaryAction + '" data-id="' + esc(job._id) + '">' + primaryLabel + '</button>' : "") +
        '<button type="button" data-open="expense" data-job-id="' + esc(job._id) + '">+ Utgift</button>' +
        '<button type="button" data-open="job-note" data-job-id="' + esc(job._id) + '">+ Notat</button>' +
        '<a href="oppdrag.html?open=' + encodeURIComponent(job._id) + '&from=field">Åpne</a>' +
      '</div></article>';
  }

  function renderTodayQueue() {
    const root = el("todayQueue");
    const focus = state.home?.activeWorkOrder || state.home?.ongoingProject || state.home?.nextWorkOrder;
    const focusId = String(focus?._id || "");
    const jobs = uniqueOpenJobs().filter((job) => String(job._id) !== focusId).slice(0, 7);
    root.innerHTML = jobs.length ? jobs.map((job) => jobCard(job, true)).join("") : '<div class="field-empty">Ingen andre oppdrag i køen.</div>';
    bindDynamic(root);
  }

  function renderJobs() {
    const q = (el("jobSearch").value || "").trim().toLowerCase();
    const jobs = state.workOrders
      .filter((job) => ["planned", "active", "paused", "stopped"].includes(job.status))
      .filter((job) => !q || [customerName(job), job.serviceName, job.customerSnapshot?.address].join(" ").toLowerCase().includes(q));
    el("fieldJobs").innerHTML = jobs.length ? jobs.map((job) => jobCard(job)).join("") : '<div class="field-empty">Ingen åpne oppdrag funnet.</div>';
    bindDynamic(el("fieldJobs"));
  }

  function customerCard(customer) {
    const info = [customer.phone, customer.address].filter(Boolean).join(" · ") || "Kun navn registrert";
    return '<article class="field-customer-card">' +
      '<div class="field-customer-card-head"><div><h3>' + esc(customer.name) + '</h3><p>' + esc(info) + '</p></div></div>' +
      '<div class="field-customer-actions">' +
        '<button type="button" data-customer-note="' + esc(customer._id) + '">+ Notat</button>' +
        '<button type="button" data-customer-job="' + esc(customer._id) + '">+ Oppdrag</button>' +
        (customer.phone ? '<a href="tel:' + esc(customer.phone.replace(/\s+/g, "")) + '">Ring</a>' : "") +
        '<a href="kunde.html?id=' + encodeURIComponent(customer._id) + '&from=field">Åpne</a>' +
      '</div></article>';
  }

  function renderCustomers() {
    const root = el("fieldCustomers");
    root.innerHTML = state.customers.length ? state.customers.map(customerCard).join("") : '<div class="field-empty">Ingen kunder funnet.</div>';
    root.querySelectorAll("[data-customer-note]").forEach((button) => button.addEventListener("click", () => {
      const customer = state.customers.find((c) => String(c._id) === button.dataset.customerNote);
      openModal("customer-note", { customer });
    }));
    root.querySelectorAll("[data-customer-job]").forEach((button) => button.addEventListener("click", () => {
      const customer = state.customers.find((c) => String(c._id) === button.dataset.customerJob);
      openModal("new-job", { customer });
    }));
  }

  function renderAll() {
    renderPulse();
    renderActive();
    renderTodayQueue();
    renderJobs();
    renderCustomers();
  }

  async function loadServices() {
    try {
      const data = await api("/services?includeInactive=1");
      const services = Array.isArray(data.services) ? data.services : Array.isArray(data) ? data : [];
      state.defaultService = services.find((s) => s.key === "diverse-arbeid" && s.active !== false)
        || services.find((s) => s.active !== false)
        || null;
    } catch (_) {
      state.defaultService = null;
    }
  }

  async function loadCustomers(query = "") {
    try {
      const data = await api("/admin/customers?q=" + encodeURIComponent(query) + "&limit=30");
      state.customers = data.customers || [];
      renderCustomers();
      return state.customers;
    } catch (error) {
      if (state.currentView === "customers") setStatus(error.message, "error");
      return [];
    }
  }

  async function loadField(showStatus = true) {
    if (showStatus) setStatus("Oppdaterer feltstatus…");
    try {
      const [home, jobs] = await Promise.all([
        api("/admin/assistant/home"),
        api("/admin/work-orders?limit=100"),
      ]);
      state.home = home;
      state.workOrders = jobs.workOrders || [];
      renderAll();
      if (showStatus) setStatus("");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function setView(name) {
    state.currentView = name;
    document.querySelectorAll(".field-view").forEach((node) => {
      const active = node.dataset.view === name;
      node.hidden = !active;
      node.classList.toggle("is-active", active);
    });
    document.querySelectorAll("[data-nav]").forEach((button) => button.classList.toggle("is-active", button.dataset.nav === name));
    if (name === "customers") loadCustomers(el("customerSearch").value.trim());
    if (name === "jobs") renderJobs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showActionSheet() {
    el("fieldSheetBackdrop").hidden = false;
    requestAnimationFrame(() => {
      el("fieldActionSheet").classList.add("is-open");
      el("fieldActionSheet").setAttribute("aria-hidden", "false");
    });
  }

  function closeActionSheet() {
    el("fieldActionSheet").classList.remove("is-open");
    el("fieldActionSheet").setAttribute("aria-hidden", "true");
    setTimeout(() => { el("fieldSheetBackdrop").hidden = true; }, 180);
  }

  function jobSelect(selectedId = "") {
    const jobs = uniqueOpenJobs();
    if (!jobs.length) return '<div class="field-empty">Du har ingen åpne oppdrag. Opprett eit oppdrag først.</div>';
    const preferred = selectedId || state.home?.activeWorkOrder?._id || state.home?.ongoingProject?._id || jobs[0]._id;
    return '<label class="field-field"><span>Oppdrag</span><select class="field-select" name="jobId" required>' +
      jobs.map((job) => '<option value="' + esc(job._id) + '"' + (String(job._id) === String(preferred) ? " selected" : "") + '>' +
        esc(customerName(job) + " – " + (job.serviceName || "Oppdrag")) + '</option>').join("") +
      '</select></label>';
  }

  function customerPicker(customer = null) {
    state.selectedCustomer = customer || null;
    return '<div class="field-field"><span>Kunde</span>' +
      '<input id="modalCustomerSearch" class="field-input" name="customerName" autocomplete="off" maxlength="160" placeholder="Skriv kundenavn" value="' + esc(customer?.name || "") + '" required>' +
      '<div id="modalSelectedCustomer">' + (customer ? selectedCustomerHtml(customer) : "") + '</div>' +
      '<div id="modalCustomerSuggestions" class="field-customer-suggestions"></div></div>';
  }

  function selectedCustomerHtml(customer) {
    return '<div class="field-selected-customer"><div><strong>' + esc(customer.name) + '</strong><small style="display:block;color:var(--field-muted)">' +
      esc([customer.phone, customer.address].filter(Boolean).join(" · ") || "Eksisterende kunde") +
      '</small></div><button type="button" id="clearModalCustomer">Bytt</button></div>';
  }

  function bindCustomerPicker() {
    const input = el("modalCustomerSearch");
    if (!input) return;
    const suggestions = el("modalCustomerSuggestions");
    const selectedRoot = el("modalSelectedCustomer");

    function bindClear() {
      const clear = el("clearModalCustomer");
      if (!clear) return;
      clear.onclick = () => {
        state.selectedCustomer = null;
        selectedRoot.innerHTML = "";
        input.focus();
      };
    }
    bindClear();

    input.addEventListener("input", () => {
      if (state.selectedCustomer && input.value.trim() !== state.selectedCustomer.name) {
        state.selectedCustomer = null;
        selectedRoot.innerHTML = "";
      }
      clearTimeout(state.customerSearchTimer);
      const q = input.value.trim();
      if (q.length < 2) { suggestions.innerHTML = ""; return; }
      state.customerSearchTimer = setTimeout(async () => {
        try {
          const data = await api("/admin/customers?q=" + encodeURIComponent(q) + "&limit=8");
          const list = data.customers || [];
          suggestions.innerHTML = list.map((customer, index) =>
            '<button type="button" data-pick-index="' + index + '"><strong>' + esc(customer.name) + '</strong><span>' +
            esc([customer.phone, customer.address].filter(Boolean).join(" · ") || "Eksisterende kunde") + '</span></button>'
          ).join("");
          suggestions.querySelectorAll("[data-pick-index]").forEach((button) => {
            button.onclick = () => {
              const customer = list[Number(button.dataset.pickIndex)];
              state.selectedCustomer = customer;
              input.value = customer.name;
              selectedRoot.innerHTML = selectedCustomerHtml(customer);
              suggestions.innerHTML = "";
              bindClear();
            };
          });
        } catch (_) {}
      }, 180);
    });
  }

  function openModal(type, context = {}) {
    closeActionSheet();
    state.modalType = type;
    state.modalContext = context || {};
    state.selectedCustomer = context.customer || null;
    const body = el("fieldFormBody");
    const title = el("fieldModalTitle");
    const kicker = el("fieldModalKicker");
    const save = el("fieldFormSave");
    el("fieldFormError").textContent = "";

    if (type === "new-job") {
      kicker.textContent = "10 sekunder";
      title.textContent = "Nytt oppdrag";
      save.textContent = "Lagre i kø";
      body.innerHTML = '<div class="field-form-grid">' + customerPicker(context.customer) +
        '<label class="field-field"><span>Hva gjelder det? <small>valgfritt</small></span><input class="field-input" name="serviceName" maxlength="120" placeholder="F.eks. flytte steinheller"></label>' +
        '<label class="field-field"><span>Kort notat <small>valgfritt</small></span><textarea class="field-textarea" name="notes" maxlength="1000" placeholder="Det du vil huske etter telefonsamtalen"></textarea></label>' +
        '<p style="margin:0;color:var(--field-muted);font-size:11px">Bare kundenavn er nødvendig. Resten kan fylles inn seinere.</p></div>';
      bindCustomerPicker();
    } else if (type === "expense") {
      kicker.textContent = "Innkjøp";
      title.textContent = "Registrer utgift";
      save.textContent = "Lagre utgift";
      body.innerHTML = '<div class="field-form-grid">' + jobSelect(context.jobId) +
        '<div class="field-inline-two"><label class="field-field"><span>Beløp</span><input class="field-input" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required autofocus></label>' +
        '<label class="field-field"><span>Leverandør</span><input class="field-input" name="supplier" maxlength="160" placeholder="Valgfritt"></label></div>' +
        '<label class="field-field"><span>Hva kjøpte du?</span><input class="field-input" name="description" maxlength="500" required placeholder="F.eks. fugesand"></label>' +
        '<label class="field-field"><span>Kvittering <small>valgfritt</small></span><input class="field-input" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment"></label>' +
        '<label class="field-check"><input name="billable" type="checkbox" checked> Skal kunden belastes for dette</label></div>';
    } else if (type === "customer-note") {
      kicker.textContent = "Kundelogg";
      title.textContent = "Nytt kundenotat";
      save.textContent = "Lagre notat";
      body.innerHTML = '<div class="field-form-grid">' + customerPicker(context.customer || activeCustomer()) +
        '<label class="field-field"><span>Notat</span><textarea class="field-textarea" name="note" maxlength="2000" required autofocus placeholder="F.eks. ringte og ønsker at eg ser på porten"></textarea></label></div>';
      bindCustomerPicker();
    } else if (type === "job-note") {
      kicker.textContent = "Oppdragslogg";
      title.textContent = "Nytt jobbnotat";
      save.textContent = "Lagre notat";
      body.innerHTML = '<div class="field-form-grid">' + jobSelect(context.jobId) +
        '<label class="field-field"><span>Notat</span><textarea class="field-textarea" name="text" maxlength="2000" required autofocus placeholder="Hva skjedde eller hva må du huske?"></textarea></label></div>';
    } else if (type === "time") {
      kicker.textContent = "Tidslogg";
      title.textContent = "Legg til tid";
      save.textContent = "Lagre tid";
      body.innerHTML = '<div class="field-form-grid">' + jobSelect(context.jobId) +
        '<div class="field-inline-two"><label class="field-field"><span>Minutter</span><input class="field-input" name="minutes" type="number" min="1" max="1440" value="15" inputmode="numeric" required></label>' +
        '<label class="field-field"><span>Type</span><select class="field-select" name="category"><option value="work">Arbeid</option><option value="purchase">Innkjøp</option><option value="transport">Transport</option></select></label></div>' +
        '<label class="field-field"><span>Kommentar <small>valgfritt</small></span><input class="field-input" name="comment" maxlength="1000"></label>' +
        '<label class="field-check"><input name="billable" type="checkbox" checked> Fakturerbar tid</label></div>';
    } else if (type === "material") {
      kicker.textContent = "Forbruk";
      title.textContent = "Registrer materiale";
      save.textContent = "Lagre materiale";
      body.innerHTML = '<div class="field-form-grid">' + jobSelect(context.jobId) +
        '<label class="field-field"><span>Materiale</span><input class="field-input" name="item" maxlength="300" required autofocus placeholder="F.eks. fugesand 20 kg"></label>' +
        '<div class="field-inline-two"><label class="field-field"><span>Antall</span><input class="field-input" name="quantity" type="number" min="0.01" step="0.01" value="1" required></label>' +
        '<label class="field-field"><span>Enhet</span><input class="field-input" name="unit" value="stk" maxlength="40"></label></div>' +
        '<div class="field-inline-two"><label class="field-field"><span>Innkjøpspris/stk</span><input class="field-input" name="purchaseUnitPrice" type="number" min="0" step="0.01"></label>' +
        '<label class="field-field"><span>Kundepris/stk</span><input class="field-input" name="unitPrice" type="number" min="0" step="0.01"></label></div>' +
        '<label class="field-field"><span>Kommentar <small>valgfritt</small></span><input class="field-input" name="comment" maxlength="500"></label>' +
        '<label class="field-check"><input name="billable" type="checkbox" checked> Skal med på kundens fakturagrunnlag</label></div>';
    }

    el("fieldModal").hidden = false;
    el("fieldModal").setAttribute("aria-hidden", "false");
    setTimeout(() => body.querySelector("[autofocus]")?.focus(), 60);
  }

  function closeModal() {
    el("fieldModal").hidden = true;
    el("fieldModal").setAttribute("aria-hidden", "true");
    state.modalType = "";
    state.modalContext = {};
    state.selectedCustomer = null;
    el("fieldForm").reset();
  }

  function activeCustomer() {
    const job = state.home?.activeWorkOrder || state.home?.ongoingProject;
    if (!job?.customerId) return null;
    return {
      _id: job.customerId,
      name: job.customerSnapshot?.name || "",
      phone: job.customerSnapshot?.phone || "",
      address: job.customerSnapshot?.address || "",
    };
  }

  function fileData(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Kunne ikke lese kvitteringen."));
      reader.readAsDataURL(file);
    });
  }

  async function submitFieldForm(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const save = el("fieldFormSave");
    const errorEl = el("fieldFormError");
    errorEl.textContent = "";
    state.busy = true;
    save.disabled = true;
    const old = save.textContent;
    save.textContent = "Lagrer…";

    try {
      if (state.modalType === "new-job") {
        const name = String(data.get("customerName") || "").trim();
        if (!name) throw new Error("Skriv kundenavn.");
        const serviceName = String(data.get("serviceName") || "").trim()
          || state.defaultService?.name
          || "Diverse arbeid";
        const hourlyRate = Number(state.defaultService?.price || 650);
        let resolvedCustomer = state.selectedCustomer;
        if (!resolvedCustomer?._id) {
          const lookup = await api("/admin/customers?q=" + encodeURIComponent(name) + "&limit=8");
          const exact = (lookup.customers || []).filter((customer) =>
            String(customer.name || "").trim().toLocaleLowerCase("nb-NO") === name.toLocaleLowerCase("nb-NO")
          );
          if (exact.length === 1) resolvedCustomer = exact[0];
          if (exact.length > 1) throw new Error("Det finnes flere kunder med dette navnet. Velg riktig kunde fra forslagene.");
        }
        const payload = {
          jobDate: osloToday(),
          serviceName,
          hourlyRate: hourlyRate > 0 ? hourlyRate : 650,
          pricingMode: "hourly",
          notes: String(data.get("notes") || "").trim(),
          ...(resolvedCustomer?._id
            ? { customerId: resolvedCustomer._id }
            : { customer: { name } }),
        };
        await api("/admin/work-orders", { method: "POST", body: JSON.stringify(payload) });
        setStatus("Oppdraget er lagret i køen. Aktiv jobb blei ikkje påvirket.", "success");
      } else if (state.modalType === "expense") {
        const jobId = String(data.get("jobId") || "");
        if (!jobId) throw new Error("Velg oppdrag.");
        const receipt = form.querySelector('input[name="receipt"]')?.files?.[0];
        await api("/admin/work-orders/" + encodeURIComponent(jobId) + "/expenses", {
          method: "POST",
          body: JSON.stringify({
            operationId: operationId("expense"),
            amount: Number(data.get("amount")),
            description: String(data.get("description") || "").trim(),
            supplier: String(data.get("supplier") || "").trim(),
            billable: data.get("billable") === "on",
            receiptImage: receipt ? await fileData(receipt) : "",
          }),
        });
        setStatus("Utgiften er registrert på oppdraget.", "success");
      } else if (state.modalType === "customer-note") {
        if (!state.selectedCustomer?._id) throw new Error("Velg ein eksisterende kunde før notatet lagres.");
        await api("/admin/customers/" + encodeURIComponent(state.selectedCustomer._id), {
          method: "PATCH",
          body: JSON.stringify({ note: String(data.get("note") || "").trim() }),
        });
        setStatus("Kundenotatet er lagret.", "success");
      } else if (state.modalType === "job-note") {
        const jobId = String(data.get("jobId") || "");
        await api("/admin/work-orders/" + encodeURIComponent(jobId) + "/notes", {
          method: "POST",
          body: JSON.stringify({ operationId: operationId("note"), text: String(data.get("text") || "").trim() }),
        });
        setStatus("Notatet er lagt i oppdragsloggen.", "success");
      } else if (state.modalType === "time") {
        const jobId = String(data.get("jobId") || "");
        const minutes = Number(data.get("minutes"));
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Skriv antall minutter.");
        await api("/admin/work-orders/" + encodeURIComponent(jobId) + "/time-entries", {
          method: "POST",
          body: JSON.stringify({
            operationId: operationId("time"),
            startedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
            durationMinutes: minutes,
            category: String(data.get("category") || "work"),
            comment: String(data.get("comment") || "").trim(),
            billable: data.get("billable") === "on",
          }),
        });
        setStatus("Tiden er registrert.", "success");
      } else if (state.modalType === "material") {
        const jobId = String(data.get("jobId") || "");
        await api("/admin/work-orders/" + encodeURIComponent(jobId) + "/materials", {
          method: "POST",
          body: JSON.stringify({
            operationId: operationId("material"),
            item: String(data.get("item") || "").trim(),
            quantity: Number(data.get("quantity") || 1),
            unit: String(data.get("unit") || "stk").trim(),
            purchaseUnitPrice: data.get("purchaseUnitPrice") ? Number(data.get("purchaseUnitPrice")) : null,
            unitPrice: data.get("unitPrice") ? Number(data.get("unitPrice")) : null,
            comment: String(data.get("comment") || "").trim(),
            billable: data.get("billable") === "on",
          }),
        });
        setStatus("Materialet er registrert.", "success");
      }
      closeModal();
      await Promise.all([loadField(false), loadCustomers(el("customerSearch").value.trim())]);
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      state.busy = false;
      save.disabled = false;
      save.textContent = old;
    }
  }

  async function jobAction(id, action) {
    if (state.busy) return;
    state.busy = true;
    setStatus(action === "pause" ? "Pauser arbeid…" : action === "stop" ? "Avslutter økta…" : "Starter arbeid…");
    try {
      await api("/admin/work-orders/" + encodeURIComponent(id) + "/action", {
        method: "POST",
        body: JSON.stringify({ action, sessionType: "work" }),
      });
      await loadField(false);
      setStatus(action === "pause" ? "Arbeidet er pauset." : action === "stop" ? "Arbeidsøkta er avsluttet." : "Arbeidstida går.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      state.busy = false;
    }
  }

  function bindDynamic(root = document) {
    root.querySelectorAll("[data-open]").forEach((button) => {
      if (button.dataset.fieldBound) return;
      button.dataset.fieldBound = "1";
      button.addEventListener("click", () => openModal(button.dataset.open, { jobId: button.dataset.jobId || "" }));
    });
    root.querySelectorAll("[data-job-action]").forEach((button) => {
      if (button.dataset.fieldBound) return;
      button.dataset.fieldBound = "1";
      button.addEventListener("click", () => jobAction(button.dataset.id, button.dataset.jobAction));
    });
  }

  function updateTimers() {
    document.querySelectorAll("[data-live-job]").forEach((node) => {
      const job = uniqueOpenJobs().find((item) => String(item._id) === String(node.dataset.liveJob));
      if (!job) return;
      node.textContent = fmtDuration(node.dataset.mode === "session" ? currentSessionSeconds(job) : currentSeconds(job));
    });
  }

  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.nav)));
  el("fieldPlusBtn").addEventListener("click", showActionSheet);
  el("closeActionSheet").addEventListener("click", closeActionSheet);
  el("fieldSheetBackdrop").addEventListener("click", closeActionSheet);
  el("closeFieldModal").addEventListener("click", closeModal);
  document.querySelectorAll("[data-close-modal]").forEach((node) => node.addEventListener("click", closeModal));
  el("fieldForm").addEventListener("submit", submitFieldForm);
  el("refreshFieldBtn").addEventListener("click", () => loadField(true));
  el("jobSearch").addEventListener("input", renderJobs);
  el("customerSearch").addEventListener("input", () => {
    clearTimeout(state.customerSearchTimer);
    state.customerSearchTimer = setTimeout(() => loadCustomers(el("customerSearch").value.trim()), 220);
  });
  el("fullAdminLink").addEventListener("click", () => localStorage.setItem("sorgulen_admin_mode", "full"));

  localStorage.setItem("sorgulen_admin_mode", "field");
  bindDynamic(document);
  Promise.all([loadServices(), loadCustomers(""), loadField(true)]).catch((error) => setStatus(error.message, "error"));
  setInterval(updateTimers, 1000);
})();