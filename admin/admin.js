(() => {
  'use strict';

  const LS_API_BASE = 'sorgulen_admin_api_base';
  const LS_ADMIN_KEY = 'sorgulen_admin_key';

  const $id = (id) => document.getElementById(id);

  // State
  let currentBookings = [];
  let pendingConfirm = null; // { title, text, onOk }
  let editingBookingId = null;

  // ---------- Helpers
  function normalizeBaseUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    if (!u) return '';
    // remove trailing slash
    u = u.replace(/\/+$/, '');
    return u;
  }

  function getApiBase() {
    const fromInput = $id('apiBase')?.value;
    const fromWindow = typeof window !== 'undefined' ? window.API_BASE_URL : '';
    const fromLS = localStorage.getItem(LS_API_BASE);
    return normalizeBaseUrl(fromInput || fromWindow || fromLS || '');
  }

  function getAdminKey() {
    const fromInput = $id('adminKey')?.value;
    const fromLS = localStorage.getItem(LS_ADMIN_KEY);
    return (fromInput || fromLS || '').trim();
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('ok', 'warn', 'error', 'bad', 'info');
    if (kind) el.classList.add(kind);
  }

  async function apiFetch(path, opts = {}) {
    const base = getApiBase();
    const url = `${base}${path}`;
    const headers = new Headers(opts.headers || {});
    headers.set('Accept', 'application/json');

    const adminKey = getAdminKey();
    if (adminKey) headers.set('x-admin-key', adminKey);

    // Default JSON handling for PATCH
    const method = (opts.method || 'GET').toUpperCase();
    const hasBody = opts.body !== undefined && opts.body !== null;
    if (hasBody && !(opts.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(url, {
      ...opts,
      method,
      headers,
      mode: 'cors',
      credentials: 'omit',
    });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function displayStatusLabel(status) {
    const s = (status || '').toLowerCase();
    if (s === 'done') return 'Utført';
    if (s === 'cancelled') return 'Kansellert';
    // default
    return 'Aktiv';
  }

  function displayStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'done') return 'done';
    if (s === 'cancelled') return 'cancelled';
    return 'active';
  }

  function normalizeStatus(status) {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'active') return 'pending';
    if (s === 'pending' || s === 'done' || s === 'cancelled') return s;
    return '';
  }

  function bookingSummary(b) {
    const date = b.date || '';
    const time = b.time || '';
    const service = b.serviceName || '';
    const customer = b.customerName || '';
    return `${date} ${time} – ${service} – ${customer}`.trim();
  }

  // ---------- Modal plumbing
  function showBackdrop(show) {
    const el = $id('modalBackdrop');
    if (!el) return;
    if (show) el.removeAttribute('hidden');
    else el.setAttribute('hidden', 'hidden');
  }

  function openModal(modalId) {
    const el = $id(modalId);
    if (!el) return;
    showBackdrop(true);
    el.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalId) {
    const el = $id(modalId);
    if (!el) return;
    el.setAttribute('hidden', 'hidden');
    showBackdrop(false);
    document.body.style.overflow = '';
  }

  function wireBackdropClose() {
    const backdrop = $id('modalBackdrop');
    if (!backdrop) return;
    backdrop.addEventListener('click', () => {
      // close any open modal
      closeModal('confirmModal');
      closeModal('editModal');
      pendingConfirm = null;
      editingBookingId = null;
    });
  }

  // ---------- Connection card
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

  // ---------- Bookings table
  function clearBookingsTable() {
    const table = $id('bookingsTable');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Ingen data lastet.</td></tr>';
  }

  function renderBookings(bookings) {
    const table = $id('bookingsTable');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) return;

    if (!Array.isArray(bookings) || bookings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">Ingen bookinger funnet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';

    for (const b of bookings) {
      const tr = document.createElement('tr');

      const date = b.date || '';
      const time = b.time || '';
      const service = b.serviceName || '';
      const customer = b.customerName || '';
      const contact = [b.customerEmail, b.customerPhone].filter(Boolean).join(' / ');
      const statusLabel = displayStatusLabel(b.status);
      const statusClass = displayStatusClass(b.status);

      const isCancelled = statusClass === 'cancelled';
      const isDone = statusClass === 'done';

      tr.innerHTML = `
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(service)}</td>
        <td>${escapeHtml(customer)}</td>
        <td>${escapeHtml(contact)}</td>
        <td><span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span></td>
        <td>
          <div class="actions">
            <button class="btn" data-action="edit" data-id="${escapeHtml(b._id)}" ${isCancelled ? 'disabled' : ''}>Rediger</button>
            <button class="btn" data-action="cancel" data-id="${escapeHtml(b._id)}" ${isCancelled ? 'disabled' : ''}>Kanseller</button>
            <button class="btn-primary" data-action="done" data-id="${escapeHtml(b._id)}" ${(isCancelled || isDone) ? 'disabled' : ''}>Utført</button>
          </div>
        </td>
      `.trim();

      tbody.appendChild(tr);
    }

    // Delegate click handling
    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (!action || !id) return;
        const booking = currentBookings.find((x) => String(x._id) === String(id));
        if (!booking) return;

        if (action === 'edit') {
          openEditModal(booking);
        } else if (action === 'cancel') {
          openConfirmModal({
            title: 'Bekreft kansellering',
            text: bookingSummary(booking),
            onOk: () => updateStatus(id, 'cancelled'),
          });
        } else if (action === 'done') {
          openConfirmModal({
            title: 'Bekreft utført',
            text: bookingSummary(booking),
            onOk: () => updateStatus(id, 'done'),
          });
        }
      });
    });
  }

  async function loadBookings() {
    const elStatus = $id('bookingsStatus');
    const from = $id('fromDate')?.value || '';
    const to = $id('toDate')?.value || '';
    const statusRaw = $id('statusFilter')?.value || '';
    const q = ($id('search')?.value || '').trim();

    const status = normalizeStatus(statusRaw);

    const params = new URLSearchParams();
    if (from) params.set('from', String(from));
    if (to) params.set('to', String(to));
    if (status) params.set('status', status);
    if (q) params.set('q', q);

    try {
      setStatus(elStatus, 'Laster bookinger ...', 'info');
      clearBookingsTable();

      const res = await apiFetch(`/api/admin/bookings?${params.toString()}`, { method: 'GET' });
      const text = await res.text();

      if (!res.ok) {
        if (res.status === 401) {
          setStatus(elStatus, 'Mangler admin-key. Lim inn ADMIN_KEY og trykk Lagre.', 'warn');
        } else if (res.status === 403) {
          setStatus(elStatus, 'Feil admin-key. Sjekk at ADMIN_KEY matcher Render.', 'error');
        } else {
          setStatus(elStatus, `Feil (${res.status}): ${text || res.statusText}`, 'error');
        }
        return;
      }

      let data = null;
      try { data = JSON.parse(text); } catch (_) {}

      const bookings = data?.bookings || data || [];
      currentBookings = Array.isArray(bookings) ? bookings : [];
      renderBookings(currentBookings);
      setStatus(elStatus, `Lastet ${currentBookings.length} bookinger.`, 'ok');
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
        if ($id('statusFilter')) $id('statusFilter').value = '';
        if ($id('search')) $id('search').value = '';
        clearBookingsTable();
        setStatus($id('bookingsStatus'), 'Filtre nullstilt.', 'ok');
      });
    }

    clearBookingsTable();
  }

  // ---------- Confirm modal
  function openConfirmModal({ title, text, onOk }) {
    pendingConfirm = { title, text, onOk };
    $id('confirmTitle').textContent = title;
    $id('confirmText').textContent = text;
    openModal('confirmModal');
  }

  function wireConfirmModal() {
    const btnCancel = $id('confirmCancel');
    const btnOk = $id('confirmOk');

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        pendingConfirm = null;
        closeModal('confirmModal');
      });
    }

    if (btnOk) {
      btnOk.addEventListener('click', async () => {
        if (!pendingConfirm) {
          closeModal('confirmModal');
          return;
        }
        const { onOk } = pendingConfirm;
        pendingConfirm = null;
        closeModal('confirmModal');
        if (typeof onOk === 'function') await onOk();
      });
    }
  }

  // ---------- Edit modal
  function openEditModal(booking) {
    editingBookingId = String(booking._id);

    $id('editDate').value = booking.date || '';
    $id('editTime').value = booking.time || '';
    $id('editService').value = booking.serviceName || '';
    $id('editName').value = booking.customerName || '';
    $id('editEmail').value = booking.customerEmail || '';
    $id('editPhone').value = booking.customerPhone || '';

    setStatus($id('editStatus'), '', '');
    openModal('editModal');
  }

  function wireEditModal() {
    const btnCancel = $id('editCancel');
    const form = $id('editForm');

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        editingBookingId = null;
        closeModal('editModal');
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editingBookingId) return;

        const payload = {
          date: $id('editDate').value,
          time: $id('editTime').value,
          serviceName: $id('editService').value,
          customerName: $id('editName').value,
          customerEmail: $id('editEmail').value,
          customerPhone: $id('editPhone').value,
        };

        await updateBooking(editingBookingId, payload);
      });
    }
  }

  async function updateBooking(id, payload) {
    const el = $id('editStatus');
    try {
      setStatus(el, 'Lagrer ...', 'info');

      const res = await apiFetch(`/api/admin/bookings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}

      if (!res.ok) {
        if (res.status === 409) {
          setStatus(el, 'Konflikt: Tiden er allerede booket.', 'warn');
        } else {
          setStatus(el, `Feil (${res.status}): ${data?.error || text || res.statusText}`, 'error');
        }
        return;
      }

      const updated = data?.booking || null;
      if (updated) {
        currentBookings = currentBookings.map((b) => (String(b._id) === String(id) ? updated : b));
        renderBookings(currentBookings);
      }

      setStatus(el, 'Lagret.', 'ok');
      // close after short delay feel? keep immediate
      editingBookingId = null;
      closeModal('editModal');
      setStatus($id('bookingsStatus'), 'Booking oppdatert.', 'ok');
    } catch (e) {
      setStatus(el, `Feil: ${e.message}`, 'error');
    }
  }

  async function updateStatus(id, status) {
    const elStatus = $id('bookingsStatus');
    try {
      setStatus(elStatus, 'Oppdaterer ...', 'info');

      const res = await apiFetch(`/api/admin/bookings/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}

      if (!res.ok) {
        setStatus(elStatus, `Feil (${res.status}): ${data?.error || text || res.statusText}`, 'error');
        return;
      }

      const updated = data?.booking || null;
      if (updated) {
        currentBookings = currentBookings.map((b) => (String(b._id) === String(id) ? updated : b));
        renderBookings(currentBookings);
      }

      setStatus(elStatus, 'Oppdatert.', 'ok');
    } catch (e) {
      setStatus(elStatus, `Feil: ${e.message}`, 'error');
    }
  }

  // ---------- Init
  document.addEventListener('DOMContentLoaded', () => {
    loadStoredSettingsIntoInputs();
    wireConnectionCard();
    wireBookingsCard();
    wireBackdropClose();
    wireConfirmModal();
    wireEditModal();
  });
})();
