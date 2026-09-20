(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const money = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });
  const timeFmt = new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const dateTimeFmt = new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const state = {
    home: {},
    workOrders: [],
    invoices: [],
    bookings: [],
    requests: [],
    customers: [],
    autopilot: {},
    period: "30d",
    activeWorkOrder: null,
    lastLoadedAt: null,
  };

  const el = (id) => document.getElementById(id);
  const now = () => new Date();
  const adminKey = () => (localStorage.getItem(KEY_STORAGE) || "").trim();
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function validDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function localDayStart(value = new Date()) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function monthStart(offset = 0) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + offset);
    return d;
  }

  function isBetween(date, start, end) {
    return date && date >= start && date < end;
  }

  function durationHours(seconds) {
    const value = Math.max(0, Number(seconds) || 0) / 3600;
    return value < 10 ? decimal.format(value) : money.format(Math.round(value));
  }

  function formatDuration(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return \`\${String(hours).padStart(2, "0")}:\${String(minutes).padStart(2, "0")}:\${String(secs).padStart(2, "0")}\`;
  }

  function workSeconds(order) {
    if (window.SorgulenWorkOrderTime?.calculateWorkSeconds) {
      return window.SorgulenWorkOrderTime.calculateWorkSeconds(order);
    }
    return (order?.workIntervals || []).reduce((sum, interval) => {
      const start = validDate(interval.startedAt);
      const end = validDate(interval.endedAt) || now();
      if (!start || end < start) return sum;
      return sum + Math.floor((end - start) / 1000);
    }, 0);
  }

  function workAmount(order) {
    if (window.SorgulenWorkOrderTime?.calculateEstimatedAmount) {
      return window.SorgulenWorkOrderTime.calculateEstimatedAmount(order);
    }
    return (workSeconds(order) / 3600) * Number(order?.hourlyRate || 0);
  }

  function intervalSeconds(interval) {
    if (window.SorgulenWorkOrderTime?.intervalSeconds) {
      return window.SorgulenWorkOrderTime.intervalSeconds(interval);
    }
    const explicit = Number(interval?.durationSeconds);
    if (interval?.source === "manual" && Number.isFinite(explicit) && explicit > 0) return explicit;
    const start = validDate(interval?.startedAt);
    const end = validDate(interval?.endedAt) || now();
    return start && end >= start ? Math.floor((end - start) / 1000) : 0;
  }

  function orderCustomerKey(order) {
    return String(
      order?.customerId ||
      order?.customerSnapshot?._id ||
      order?.customerSnapshot?.email ||
      order?.customerSnapshot?.phone ||
      order?.customerSnapshot?.name ||
      ""
    ).trim().toLowerCase();
  }

  function invoiceAmount(inv) {
    const value = Math.abs(Number(inv?.amount) || 0);
    return inv?.isCreditNote ? -value : value;
  }

  function invoiceDate(inv) {
    return validDate(inv?.issuedAt || inv?.createdAt);
  }

  function paidDate(inv) {
    return validDate(inv?.paidAt || inv?.settledAt || inv?.updatedAt || inv?.issuedAt || inv?.createdAt);
  }

  function setStatus(text, kind = "") {
    const node = el("overviewStatus");
    if (!node) return;
    node.textContent = text || "";
    node.className = \`overview-status\${kind ? \` is-\${kind}\` : ""}\`;
  }

  async function api(path) {
    const key = adminKey();
    if (!key) {
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    const response = await fetch(\`\${API_BASE}\${path}\`, {
      headers: { "x-admin-key": key, "content-type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data?.error || \`API-feil \${response.status}\`);
    return data;
  }

  function resultValue(result, fallback = {}) {
    return result.status === "fulfilled" ? result.value : fallback;
  }

  function animateNumber(node, target, formatter = (value) => String(Math.round(value))) {
    if (!node) return;
    const end = Number(target) || 0;
    const start = Number(node.dataset.currentValue || 0);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || Math.abs(end - start) < 1) {
      node.textContent = formatter(end);
      node.dataset.currentValue = String(end);
      return;
    }
    const started = performance.now();
    const duration = 620;
    const tick = (time) => {
      const t = Math.min(1, (time - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = formatter(start + (end - start) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else node.dataset.currentValue = String(end);
    };
    requestAnimationFrame(tick);
  }

  function setCount(id, value) {
    animateNumber(el(id), value, (v) => money.format(Math.round(v)));
  }

  function setMoneyInside(selector, value) {
    const node = document.querySelector(selector);
    animateNumber(node, value, (v) => money.format(Math.round(v)));
  }

  function monthInvoiceStats() {
    const start = monthStart(0);
    const end = monthStart(1);
    const previousStart = monthStart(-1);

    let invoiced = 0;
    let paid = 0;
    let previousPaid = 0;
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    const today = localDayStart();

    for (const inv of state.invoices) {
      const amount = invoiceAmount(inv);
      const billedAt = invoiceDate(inv);
      const status = String(inv.status || "").toLowerCase();

      if (status !== "draft" && isBetween(billedAt, start, end)) invoiced += amount;
      if (status === "paid") {
        const paidAt = paidDate(inv);
        if (isBetween(paidAt, start, end)) paid += Math.max(0, amount);
        if (isBetween(paidAt, previousStart, start)) previousPaid += Math.max(0, amount);
      }

      if (["issued", "sent"].includes(status) && !inv.isCreditNote) {
        outstanding += Math.max(0, Number(inv.amount) || 0);
        const due = validDate(inv.dueDate);
        if (due && due < today) {
          overdue += Math.max(0, Number(inv.amount) || 0);
          overdueCount += 1;
        }
      }
    }

    return { invoiced, paid, previousPaid, outstanding, overdue, overdueCount };
  }

  function workStats() {
    const start = monthStart(0);
    const end = monthStart(1);
    let totalSeconds = 0;
    let billableSeconds = 0;

    for (const order of state.workOrders) {
      for (const interval of order.workIntervals || []) {
        const at = validDate(interval.startedAt);
        if (!isBetween(at, start, end)) continue;
        const seconds = intervalSeconds(interval);
        totalSeconds += seconds;
        if (interval.billable !== false) billableSeconds += seconds;
      }
    }

    const openStatuses = new Set(["planned", "active", "paused", "stopped"]);
    const open = state.workOrders.filter((order) => openStatuses.has(order.status));
    const active = state.workOrders.filter((order) => ["active", "paused"].includes(order.status));
    const completed = state.workOrders.filter((order) => {
      if (order.status !== "completed") return false;
      const at = validDate(order.completedAt || order.updatedAt || order.jobDate);
      return isBetween(at, start, end);
    });
    const rates = state.workOrders.map((order) => Number(order.hourlyRate)).filter((rate) => Number.isFinite(rate) && rate > 0);
    const averageRate = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0;

    return { totalSeconds, billableSeconds, open, active, completed, averageRate };
  }

  function requestStats() {
    const fresh = state.requests.filter((request) => ["new", "pending"].includes(String(request.status || "new")));
    return { fresh };
  }

  function bookingStats() {
    const todayKey = localDayStart();
    const upcoming = state.bookings.filter((booking) => {
      if (!["pending", "planned"].includes(String(booking.status || "pending"))) return false;
      const date = validDate(booking.date ? \`\${String(booking.date).slice(0, 10)}T12:00:00\` : null);
      return !date || date >= todayKey;
    });
    return { upcoming };
  }

  function customerStats(openOrders) {
    const start = monthStart(0);
    const end = monthStart(1);
    const newCustomers = state.customers.filter((customer) => isBetween(validDate(customer.createdAt), start, end)).length;

    const counts = new Map();
    for (const order of state.workOrders) {
      const key = orderCustomerKey(order);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const returning = [...counts.values()].filter((count) => count > 1).length;
    const repeatShare = counts.size ? Math.round((returning / counts.size) * 100) : 0;
    const active = new Set(openOrders.map(orderCustomerKey).filter(Boolean)).size;

    return { newCustomers, returning, repeatShare, active };
  }

  function renderMainMetrics() {
    const inv = monthInvoiceStats();
    const work = workStats();
    const req = requestStats();
    const booking = bookingStats();
    const customer = customerStats(work.open);

    setMoneyInside("#monthPaid", inv.paid);
    setMoneyInside("#monthInvoiced", inv.invoiced);
    setMoneyInside("#outstandingAmount", inv.outstanding);
    setMoneyInside("#overdueAmount [data-count-money]", inv.overdue);
    setCount("openJobs", work.open.length);
    setCount("newRequests", req.fresh.length);
    setCount("customerCount", state.customers.length);
    setCount("completedMonth", work.completed.length);
    setCount("upcomingBookings", booking.upcoming.length);
    setCount("returningCustomers", customer.returning);
    setCount("activeCustomers", customer.active);

    el("monthHours").textContent = \`\${durationHours(work.totalSeconds)} t\`;
    el("billableHours").textContent = \`\${durationHours(work.billableSeconds)} t\`;
    el("averageRate").textContent = \`\${money.format(Math.round(work.averageRate))} kr\`;
    el("overdueMeta").textContent = \`\${inv.overdueCount} faktura\${inv.overdueCount === 1 ? "" : "er"}\`;
    el("openJobsMeta").textContent = \`\${work.active.length} aktive akkurat nå\`;
    el("newRequestsMeta").textContent = req.fresh.length ? "venter på behandling" : "ingenting venter";
    el("customerMeta").textContent = \`\${customer.newCustomers} nye denne måneden\`;
    el("customerRepeatShare").textContent = \`\${customer.repeatShare} %\`;

    const trend = el("monthTrend");
    if (inv.previousPaid > 0) {
      const diff = Math.round(((inv.paid - inv.previousPaid) / inv.previousPaid) * 100);
      trend.textContent = \`\${diff >= 0 ? "+" : ""}\${diff} % mot forrige mnd\`;
      trend.className = \`trend-chip \${diff >= 0 ? "is-up" : "is-down"}\`;
    } else {
      trend.textContent = inv.paid > 0 ? "første registrerte måned" : "ingen betaling registrert";
      trend.className = "trend-chip";
    }

    const progressBase = Math.max(inv.invoiced, inv.paid, 1);
    el("revenueProgress").style.width = \`\${Math.min(100, Math.max(5, (inv.paid / progressBase) * 100))}%\`;
    el("monthPaidMeta").textContent = state.invoices.length
      ? \`\${state.invoices.filter((invoice) => invoice.status === "paid").length} betalte fakturaer ligger i systemet totalt.\`
      : "Ingen fakturaer registrert ennå.";
  }

  function activeOrder() {
    return state.home?.activeWorkOrder ||
      state.workOrders.find((order) => ["active", "paused"].includes(order.status)) ||
      null;
  }

  function renderLiveWork() {
    const card = el("liveWorkCard");
    const order = activeOrder();
    state.activeWorkOrder = order;

    if (order) {
      const customer = order.customerSnapshot?.name || "Ukjent kunde";
      const service = order.serviceName || order.description || "Oppdrag";
      const paused = order.status === "paused";
      card.className = "overview-panel live-work-panel is-active";
      card.innerHTML = \`
        <div class="panel-topline">
          <div><p class="overview-kicker">Aktivt oppdrag</p><h2>\${esc(paused ? "Pauset – tiden står" : "Arbeid pågår")}</h2></div>
          <span class="state-pill">\${paused ? "PAUSET" : "● LIVE"}</span>
        </div>
        <div class="live-customer">\${esc(customer)}</div>
        <div class="live-service">\${esc(service)}</div>
        <div class="live-timer" data-live-timer>\${formatDuration(workSeconds(order))}</div>
        <div class="live-money"><span>Verdi hittil · \${money.format(Number(order.hourlyRate || 0))} kr/t</span><strong data-live-money>\${money.format(workAmount(order))} kr</strong></div>
        <a class="live-open-link" href="oppdrag.html?open=\${encodeURIComponent(order._id)}">Åpne oppdrag</a>
      \`;
      return;
    }

    const next = state.home?.nextWorkOrder;
    if (next) {
      card.className = "overview-panel live-work-panel";
      card.innerHTML = \`
        <div class="panel-topline">
          <div><p class="overview-kicker">Neste oppdrag</p><h2>\${esc(next.customerSnapshot?.name || "Ukjent kunde")}</h2></div>
          <span class="state-pill">PLANLAGT</span>
        </div>
        <div class="live-customer">\${esc(next.serviceName || "Oppdrag")}</div>
        <div class="live-service">\${esc(next.jobDate ? new Date(next.jobDate).toLocaleDateString("nb-NO") : "Dato ikke satt")}</div>
        <a class="live-open-link" href="oppdrag.html?open=\${encodeURIComponent(next._id)}">Åpne neste oppdrag</a>
      \`;
      return;
    }

    const booking = state.home?.nextBooking;
    if (booking) {
      card.className = "overview-panel live-work-panel";
      card.innerHTML = \`
        <div class="panel-topline">
          <div><p class="overview-kicker">Neste booking</p><h2>\${esc(booking.customerName || "Ukjent kunde")}</h2></div>
          <span class="state-pill">BOOKING</span>
        </div>
        <div class="live-customer">\${esc(booking.serviceName || "Oppdrag")}</div>
        <div class="live-service">\${esc(booking.date || "Dato ikke satt")} \${esc(booking.time || "")}</div>
        <a class="live-open-link" href="oppdrag.html?bookingId=\${encodeURIComponent(booking._id)}">Klargjør oppdrag</a>
      \`;
      return;
    }

    card.className = "overview-panel live-work-panel";
    card.innerHTML = \`
      <div class="panel-topline">
        <div><p class="overview-kicker">Drift akkurat nå</p><h2>Ingen aktive oppdrag</h2></div>
        <span class="state-pill">ROLIG</span>
      </div>
      <p class="panel-muted">Systemet finner heller ingen kommende oppdrag akkurat nå.</p>
      <a class="live-open-link" href="oppdrag.html">Åpne oppdrag</a>
    \`;
  }

  function serviceMix() {
    const counts = new Map();
    for (const order of state.workOrders) {
      const service = String(order.serviceName || "Annet").trim() || "Annet";
      counts.set(service, (counts.get(service) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }

  function renderWorkMix() {
    const mix = serviceMix();
    const target = el("workMix");
    if (!mix.length) {
      target.innerHTML = '<div class="attention-empty">Ingen oppdrag å analysere ennå.</div>';
      return;
    }
    const max = Math.max(...mix.map(([, count]) => count), 1);
    target.innerHTML = mix.map(([name, count]) => \`
      <div class="mix-row">
        <span>\${esc(name)}</span>
        <div class="mix-track"><i style="--mix:\${Math.max(7, (count / max) * 100)}%"></i></div>
        <strong>\${count}</strong>
      </div>
    \`).join("");
  }

  function buildAttention() {
    const items = [];
    const inv = monthInvoiceStats();
    const req = requestStats();
    const unbilled = state.workOrders.filter((order) => order.status === "completed" && !order.invoiceId);

    if (inv.overdueCount) {
      items.push({
        severity: "high",
        title: \`\${inv.overdueCount} forfalt faktura\${inv.overdueCount === 1 ? "" : "er"}\`,
        detail: \`\${money.format(inv.overdue)} kr bør følges opp.\`,
        href: "fakturaer.html",
      });
    }
    if (unbilled.length) {
      items.push({
        severity: "medium",
        title: \`\${unbilled.length} ferdigstilte oppdrag uten faktura\`,
        detail: "Fakturagrunnlaget er klart til kontroll.",
        href: "oppdrag.html",
      });
    }
    if (req.fresh.length) {
      items.push({
        severity: "medium",
        title: \`\${req.fresh.length} nye forespørsler\`,
        detail: "Venter på behandling.",
        href: "foresporsler.html",
      });
    }

    const autoCounts = state.autopilot?.inbox?.counts || {};
    const autoCount = Math.max(0, Number(autoCounts.pending) || 0) + Math.max(0, Number(autoCounts.revisionRequested) || 0);
    if (autoCount) {
      items.push({
        severity: "medium",
        title: \`\${autoCount} saker i Autopilot\`,
        detail: "AI venter på et valg fra deg.",
        href: "autopilot.html",
      });
    }

    for (const task of state.home?.overview?.tasks || []) {
      const title = task.title || "";
      if (!title) continue;
      if (items.some((item) => item.title === title)) continue;
      items.push({
        severity: task.priority === "high" ? "high" : "medium",
        title,
        detail: task.detail || "",
        href: task.href || "hjem.html",
      });
    }
    return items.slice(0, 7);
  }

  function renderAttention() {
    const items = buildAttention();
    el("attentionCount").textContent = String(items.length);
    const target = el("attentionList");
    if (!items.length) {
      target.innerHTML = '<div class="attention-empty">Ingen ting krever handling akkurat nå.</div>';
      return;
    }
    target.innerHTML = items.map((item) => \`
      <a class="attention-item is-\${esc(item.severity)}" href="\${esc(item.href)}">
        <span class="attention-severity"></span>
        <div><strong>\${esc(item.title)}</strong><p>\${esc(item.detail)}</p></div>
        <span aria-hidden="true">›</span>
      </a>
    \`).join("");
  }

  function renderInsights() {
    const inv = monthInvoiceStats();
    const work = workStats();
    const customer = customerStats(work.open);
    const insights = [];

    if (inv.previousPaid > 0) {
      const diff = Math.round(((inv.paid - inv.previousPaid) / inv.previousPaid) * 100);
      insights.push({
        kind: diff >= 0 ? "good" : "warning",
        icon: diff >= 0 ? "↗" : "↘",
        title: diff >= 0 ? "Mer betalt inn enn forrige måned" : "Lavere innbetaling enn forrige måned",
        text: \`\${Math.abs(diff)} % \${diff >= 0 ? "over" : "under"} forrige måned så langt.\`,
      });
    }

    const unbilled = state.workOrders.filter((order) => order.status === "completed" && !order.invoiceId).length;
    if (unbilled) {
      insights.push({
        kind: "warning",
        icon: "!",
        title: "Penger kan ligge igjen i ferdige oppdrag",
        text: \`\${unbilled} oppdrag er ferdigstilt uten faktura koblet til.\`,
      });
    }

    if (customer.returning) {
      insights.push({
        kind: "good",
        icon: "↻",
        title: "Tilbakevendende kunder",
        text: \`\${customer.returning} kunder har mer enn ett registrert oppdrag.\`,
      });
    }

    if (work.billableSeconds > 0) {
      insights.push({
        kind: "good",
        icon: "◷",
        title: "Fakturerbar tid denne måneden",
        text: \`\${durationHours(work.billableSeconds)} timer er merket fakturerbar.\`,
      });
    }

    if (!insights.length) {
      insights.push({
        kind: "good",
        icon: "✓",
        title: "Ingen tydelige avvik",
        text: "Det er foreløpig for lite data til å trekke flere nyttige mønstre.",
      });
    }

    el("insightList").innerHTML = insights.slice(0, 4).map((item) => \`
      <div class="insight-card is-\${item.kind}">
        <i>\${item.icon}</i>
        <div><strong>\${esc(item.title)}</strong><p>\${esc(item.text)}</p></div>
      </div>
    \`).join("");
  }

  function activityItems() {
    const items = [];
    for (const invoice of state.invoices) {
      const at = validDate(invoice.updatedAt || invoice.issuedAt || invoice.createdAt);
      if (!at) continue;
      const label = invoice.status === "paid"
        ? "Faktura registrert som betalt"
        : invoice.status === "sent"
          ? "Faktura sendt"
          : invoice.status === "draft"
            ? "Fakturautkast opprettet"
            : "Faktura oppdatert";
      items.push({ at, icon: "▤", title: label, detail: \`\${invoice.customerName || "Kunde"} · \${money.format(Math.abs(Number(invoice.amount) || 0))} kr\` });
    }
    for (const order of state.workOrders) {
      const at = validDate(order.updatedAt || order.completedAt || order.createdAt || order.jobDate);
      if (!at) continue;
      items.push({
        at,
        icon: "◷",
        title: order.status === "completed" ? "Oppdrag ferdigstilt" : order.status === "active" ? "Oppdrag aktivt" : "Oppdrag oppdatert",
        detail: \`\${order.customerSnapshot?.name || "Kunde"} · \${order.serviceName || "Oppdrag"}\`,
      });
    }
    for (const booking of state.bookings.slice(0, 30)) {
      const at = validDate(booking.updatedAt || booking.createdAt);
      if (!at) continue;
      items.push({ at, icon: "＋", title: "Booking registrert", detail: \`\${booking.customerName || "Kunde"} · \${booking.serviceName || "Tjeneste"}\` });
    }
    for (const request of state.requests.slice(0, 30)) {
      const at = validDate(request.updatedAt || request.createdAt);
      if (!at) continue;
      items.push({ at, icon: "◎", title: "Forespørsel oppdatert", detail: request.customerName || request.name || "Ny forespørsel" });
    }
    return items.sort((a, b) => b.at - a.at).slice(0, 9);
  }

  function renderActivity() {
    const items = activityItems();
    const target = el("activityFeed");
    if (!items.length) {
      target.innerHTML = '<div class="attention-empty">Ingen aktivitet å vise ennå.</div>';
      return;
    }
    target.innerHTML = items.map((item, index) => \`
      <div class="activity-item" style="animation-delay:\${Math.min(index * 35, 220)}ms">
        <span class="activity-mark">\${item.icon}</span>
        <div><strong>\${esc(item.title)}</strong><p>\${esc(item.detail)}</p><time>\${esc(dateTimeFmt.format(item.at))}</time></div>
      </div>
    \`).join("");
  }

  function makeBuckets(period) {
    const buckets = [];
    const today = localDayStart();

    if (period === "7d") {
      for (let i = 6; i >= 0; i -= 1) {
        const start = new Date(today);
        start.setDate(start.getDate() - i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        buckets.push({ start, end, label: \`\${start.getDate()}.\${start.getMonth() + 1}\` });
      }
      return buckets;
    }

    if (period === "30d") {
      const first = new Date(today);
      first.setDate(first.getDate() - 29);
      for (let i = 0; i < 10; i += 1) {
        const start = new Date(first);
        start.setDate(start.getDate() + i * 3);
        const end = new Date(start);
        end.setDate(end.getDate() + 3);
        buckets.push({ start, end, label: \`\${start.getDate()}.\${start.getMonth() + 1}\` });
      }
      return buckets;
    }

    if (period === "3m") {
      const first = new Date(today);
      first.setDate(first.getDate() - 90);
      for (let i = 0; i < 13; i += 1) {
        const start = new Date(first);
        start.setDate(start.getDate() + i * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        buckets.push({ start, end, label: \`\${start.getDate()}.\${start.getMonth() + 1}\` });
      }
      return buckets;
    }

    for (let i = 11; i >= 0; i -= 1) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const label = start.toLocaleDateString("nb-NO", { month: "short" }).replace(".", "");
      buckets.push({ start, end, label });
    }
    return buckets;
  }

  function chartData(period) {
    const buckets = makeBuckets(period).map((bucket) => ({ ...bucket, invoiced: 0, paid: 0 }));
    for (const invoice of state.invoices) {
      const status = String(invoice.status || "").toLowerCase();
      const amount = invoiceAmount(invoice);
      const billedAt = invoiceDate(invoice);
      if (status !== "draft" && billedAt) {
        const bucket = buckets.find((item) => isBetween(billedAt, item.start, item.end));
        if (bucket) bucket.invoiced += amount;
      }
      if (status === "paid") {
        const at = paidDate(invoice);
        const bucket = buckets.find((item) => isBetween(at, item.start, item.end));
        if (bucket) bucket.paid += Math.max(0, amount);
      }
    }
    return buckets;
  }

  function renderChart() {
    const target = el("revenueChart");
    const buckets = chartData(state.period);
    const max = Math.max(0, ...buckets.flatMap((bucket) => [bucket.invoiced, bucket.paid]));
    if (!max) {
      target.innerHTML = '<div class="chart-empty">Ingen fakturadata i denne perioden.</div>';
      return;
    }
    target.innerHTML = buckets.map((bucket) => {
      const invoiced = Math.max(0, bucket.invoiced);
      const paid = Math.max(0, bucket.paid);
      const invHeight = Math.max(2, (invoiced / max) * 100);
      const paidHeight = Math.max(2, (paid / max) * 100);
      return \`
        <div class="chart-column" data-chart-label="\${esc(bucket.label)}" data-chart-invoiced="\${invoiced}" data-chart-paid="\${paid}">
          <div class="chart-bars">
            <span class="chart-bar invoiced" style="--bar-height:\${invHeight}%"></span>
            <span class="chart-bar paid" style="--bar-height:\${paidHeight}%"></span>
          </div>
          <span class="chart-label">\${esc(bucket.label)}</span>
        </div>
      \`;
    }).join("");
  }

  function showChartTooltip(column) {
    document.querySelector(".chart-tooltip")?.remove();
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.innerHTML = \`<strong>\${esc(column.dataset.chartLabel)}</strong> · Fakturert \${money.format(Number(column.dataset.chartInvoiced) || 0)} kr · Betalt \${money.format(Number(column.dataset.chartPaid) || 0)} kr\`;
    el("revenueChart").appendChild(tooltip);
    const box = column.getBoundingClientRect();
    const parent = el("revenueChart").getBoundingClientRect();
    tooltip.style.left = \`\${box.left - parent.left + box.width / 2}px\`;
    tooltip.style.top = \`\${Math.max(32, box.top - parent.top + 20)}px\`;
  }

  function renderAll() {
    renderMainMetrics();
    renderLiveWork();
    renderWorkMix();
    renderInsights();
    renderAttention();
    renderActivity();
    renderChart();
    el("overviewSubtitle").textContent = state.lastLoadedAt
      ? \`Oppdatert \${timeFmt.format(state.lastLoadedAt)} · live drift fra systemet\`
      : "Live drift fra systemet";
  }

  async function load(showMessage = true) {
    if (el("overviewRefresh").classList.contains("is-loading")) return;
    el("overviewRefresh").classList.add("is-loading");
    el("overviewRefresh").disabled = true;
    if (showMessage) setStatus("Henter hele driften…");

    const results = await Promise.allSettled([
      api("/admin/assistant/home"),
      api("/admin/work-orders?limit=200"),
      api("/invoices"),
      api("/admin/bookings?limit=300"),
      api("/requests"),
      api("/admin/customers?q="),
      api("/admin/autopilot/inbox/summary"),
    ]);

    const home = resultValue(results[0], {});
    const jobs = resultValue(results[1], {});
    const invoices = resultValue(results[2], {});
    const bookings = resultValue(results[3], {});
    const requests = resultValue(results[4], {});
    const customers = resultValue(results[5], {});
    const autopilot = resultValue(results[6], {});

    state.home = home || {};
    state.workOrders = Array.isArray(jobs.workOrders) ? jobs.workOrders : [];
    state.invoices = Array.isArray(invoices.invoices) ? invoices.invoices : [];
    state.bookings = Array.isArray(bookings.bookings) ? bookings.bookings : [];
    state.requests = Array.isArray(requests.requests) ? requests.requests : [];
    state.customers = Array.isArray(customers.customers) ? customers.customers : [];
    state.autopilot = autopilot || {};
    state.lastLoadedAt = new Date();

    renderAll();
    window.SorgulenAdminShell?.refreshBadges?.();

    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed) setStatus(\`Oversikten er lastet, men \${failed} datakilde\${failed === 1 ? "" : "r"} svarte ikke.\`, "error");
    else if (showMessage) setStatus("Alt er oppdatert.", "ok");
    else setStatus("");

    el("overviewRefresh").classList.remove("is-loading");
    el("overviewRefresh").disabled = false;
  }

  function updateLiveElements() {
    el("overviewClock").textContent = timeFmt.format(new Date());
    if (!state.activeWorkOrder) return;
    const timer = document.querySelector("[data-live-timer]");
    const amount = document.querySelector("[data-live-money]");
    if (timer) timer.textContent = formatDuration(workSeconds(state.activeWorkOrder));
    if (amount) amount.textContent = \`\${money.format(workAmount(state.activeWorkOrder))} kr\`;
  }

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      state.period = button.dataset.period;
      document.querySelectorAll("[data-period]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      renderChart();
    });
  });

  el("revenueChart").addEventListener("pointerover", (event) => {
    const column = event.target.closest(".chart-column");
    if (column) showChartTooltip(column);
  });
  el("revenueChart").addEventListener("pointerleave", () => document.querySelector(".chart-tooltip")?.remove());
  el("overviewRefresh").addEventListener("click", () => load(true));

  updateLiveElements();
  setInterval(updateLiveElements, 1000);
  setInterval(() => {
    if (document.visibilityState === "visible") load(false).catch(() => {});
  }, 60_000);

  load(true).catch((error) => {
    setStatus(error.message || "Kunne ikke laste oversikten.", "error");
    el("overviewRefresh").classList.remove("is-loading");
    el("overviewRefresh").disabled = false;
  });
})();