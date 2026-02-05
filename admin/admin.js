/*
  Sørgulen – Admin (testversjon)
  ------------------------------------------------------------
  Denne admin-siden er laget for å være robust:
  - Ingen hard-crash hvis backend mangler admin-endepunkter.
  - /api/health kan testes (skal fungere nå).
  - "Hent bookinger" prøver /api/admin/bookings (må bygges i backend senere).
*/

(() => {
  'use strict';

  const LS_API_BASE = 'sorgulen_admin_api_base';
  const LS_ADMIN_KEY = 'sorgulen_admin_key';

  // --- Helpers
  const $id = (id) => document.getElementById(id);

  function normalizeBaseUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    if (!u) return '';
    // remove trailing slash
    u = u.replace(/\/+$/, '');
    return u;
  }

  function getApiBase() {
    // Priority: input -> window.API_BASE_URL -> localStorage -> empty
    const fromInput = $id('apiBase')?.value;
    const fromWindow = typeof window !== 'undefined' ? window.API_BASE_URL : '';
    const fromLS = localStorage.getItem(LS_API_BASE);
    // Tom streng betyr "bruk samme origin" (relativt /api/...) via Netlify proxy.
    return normalizeBaseUrl(fromInput || fromWindow || fromLS || '');
  }

  function getAdminKey() {
    const fromInput = $id('adminKey')?.value;
    const fromLS = localStorage.getItem(LS_ADMIN_KEY);
    return (fromInput || fromLS || '').trim();
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    // Optional styling via data-kind
    if (kind) el.setAttribute('data-kind', kind);
    else el.removeAttribute('data-kind');
  }

  async function apiFetch(path, opts = {}) {
    const base = getApiBase();
    const url = `${base}${path}`; // base kan være ''
    const headers = new Headers(opts.headers || {});

    const adminKey = getAdminKey();
    if (adminKey) headers.set('x-admin-key', adminKey);

    return fetch(url, {
      ...opts,
      headers,
      mode: 'cors',
      credentials: 'omit',
    });
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    // expect YYYY-MM-DD
    return isoDate;
  }

  // --- UI wiring
  function loadStoredSettingsIntoInputs() {
    const base = normalizeBaseUrl(localStorage.getItem(LS_API_BASE) || window.API_BASE_URL || '');
    const key = (localStorage.getItem(LS_ADMIN_KEY) || '').trim();

    const elApiBase = $id('apiBase');
    const elAdminKey = $id('adminKey');

    if (elApiBase && base) elApiBase.value = base;
    if (elAdminKey && key) elAdminKey.value = key;
  }

  function wireConnectionCard() {
    const btnSave = $id('saveSettings');
    const btnHealth = $id('checkApi');
    const elApiStatus = $id('apiStatus');

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const base = normalizeBaseUrl($id('apiBase')?.value || '');
        const key = ($id('adminKey')?.value || '').trim();

        if (base) localStorage.setItem(LS_API_BASE, base);
        else localStorage.removeItem(LS_API_BASE);

        if (key) localStorage.setItem(LS_ADMIN_KEY, key);
        else localStorage.removeItem(LS_ADMIN_KEY);

        setStatus(elApiStatus, 'Lagret.', 'ok');
      });
    }

    if (btnHealth) {
      btnHealth.addEventListener('click', async () => {
        try {
          setStatus(elApiStatus, 'Tester /api/health ...', 'info');
          const res = await apiFetch('/api/health', { method: 'GET' });
          const text = await res.text();

          if (!res.ok) {
            setStatus(elApiStatus, `Feil (${res.status}): ${text || res.statusText}`, 'error');
            return;
          }

          // Try JSON
          let payload = null;
          try { payload = JSON.parse(text); } catch (_) {}

          const okText = payload?.ok ? 'OK' : 'Svar mottatt';
          setStatus(elApiStatus, `${okText} (${res.status})`, 'ok');
        } catch (e) {
          setStatus(elApiStatus, `Kunne ikke nå backend: ${e.message}`, 'error');
        }
      });
    }
  }

  function clearBookingsTable() {
    const table = $id('bookingsTable');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Ingen data lastet.</td></tr>';
  }

  function renderBookings(bookings) {
    const table = $id('bookingsTable');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) return;

    if (!Array.isArray(bookings) || bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Ingen bookinger funnet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    for (const b of bookings) {
      const tr = document.createElement('tr');

      const date = b.date || b.bookingDate || '';
      const time = b.time || b.bookingTime || '';
      const service = b.serviceName || b.service?.name || '';
      const customer = b.customerName || b.customer?.name || '';
      const contact = [b.customerEmail || b.customer?.email, b.customerPhone || b.customer?.phone]
        .filter(Boolean)
        .join(' / ');
      const status = b.status || (b.canceled ? 'Canceled' : '');

      tr.innerHTML = `
        <td>${date}</td>
        <td>${time}</td>
        <td>${service}</td>
        <td>${customer}</td>
        <td>${contact}</td>
        <td>${status}</td>
      `.trim();

      tbody.appendChild(tr);
    }
  }

  async function loadBookings() {
    const elStatus = $id('bookingsStatus');
    const from = $id('fromDate')?.value || '';
    const to = $id('toDate')?.value || '';
    const status = $id('statusFilter')?.value || '';
    const q = ($id('search')?.value || '').trim();

    // Build querystring for future backend
    const params = new URLSearchParams();
    if (from) params.set('from', formatDate(from));
    if (to) params.set('to', formatDate(to));
    if (status && status !== 'Alle') params.set('status', status);
    if (q) params.set('q', q);

    try {
      setStatus(elStatus, 'Laster bookinger ...', 'info');
      clearBookingsTable();

      const res = await apiFetch(`/api/admin/bookings?${params.toString()}`, { method: 'GET' });
      const text = await res.text();

      // Backend ikke implementert enda -> typisk 404
      if (!res.ok) {
        setStatus(
          elStatus,
          `Backend har ikke admin-endepunkt ennå (status ${res.status}). Dette er forventet før vi bygger admin-API.`,
          'warn'
        );
        return;
      }

      let data;
      try { data = JSON.parse(text); } catch (e) { data = null; }

      const bookings = data?.bookings || data || [];
      renderBookings(bookings);
      setStatus(elStatus, `Lastet ${Array.isArray(bookings) ? bookings.length : 0} bookinger.`, 'ok');
    } catch (e) {
      setStatus(elStatus, `Feil ved henting: ${e.message}`, 'error');
    }
  }

  function wireBookingsCard() {
    const btnLoad = $id('loadBookings');
    const btnClear = $id('clearFilters');

    if (btnLoad) btnLoad.addEventListener('click', loadBookings);

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if ($id('fromDate')) $id('fromDate').value = '';
        if ($id('toDate')) $id('toDate').value = '';
        if ($id('statusFilter')) $id('statusFilter').value = 'Alle';
        if ($id('search')) $id('search').value = '';
        clearBookingsTable();
        setStatus($id('bookingsStatus'), 'Filtre nullstilt.', 'ok');
      });
    }

    // Clear initial placeholder row (keep it simple)
    clearBookingsTable();
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    loadStoredSettingsIntoInputs();
    wireConnectionCard();
    wireBookingsCard();
  });
})();
