(function () {
  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const serviceSelect = document.getElementById("serviceSelect");
  const bookingDate = document.getElementById("bookingDate");
  const slotsWrap = document.getElementById("slotsWrap");
  const slotsEl = document.getElementById("slots");
  const formWrap = document.getElementById("formWrap");
  const successWrap = document.getElementById("successWrap");
  const messageEl = document.getElementById("message");
  const submitBtn = document.getElementById("submitBooking");
  const bookingTitle = document.getElementById("bookingTitle");

  const params = new URLSearchParams(window.location.search);
  const requestedServiceName = (params.get("service") || "").trim().toLowerCase();

  let services = [];
  let selectedService = null;
  let selectedTime = null;

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `notice ${type || ''}`.trim();
    messageEl.classList.remove('hidden');
  }
  function hideMessage() { messageEl.classList.add('hidden'); }

  function todayOslo() {
    const now = new Date();
    const oslo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year:'numeric', month:'2-digit', day:'2-digit' }).format(now);
    return oslo;
  }
  function maxDateOslo(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  }

  function setDateLimits() {
    bookingDate.min = todayOslo();
    bookingDate.max = maxDateOslo(30);
  }

  async function loadServices() {
    const res = await fetch(`${API_BASE}/services`);
    const data = await res.json();
    services = Array.isArray(data.services) ? data.services : [];
    const allowed = services.filter(s => ['brøyting','dekkskift'].includes(String(s.name).trim().toLowerCase()));
    serviceSelect.innerHTML = allowed.map(s => `<option value="${s._id}">${s.name} – ${s.priceText || ''}</option>`).join('');
    if (!allowed.length) {
      showMessage('Ingen bookbare tjenester er tilgjengelige akkurat nå.', 'error');
      return;
    }
    const pre = allowed.find(s => String(s.name).trim().toLowerCase() === requestedServiceName) || allowed[0];
    serviceSelect.value = pre._id;
    selectedService = pre;
    bookingTitle.textContent = `Bestill ${pre.name}`;
  }

  function isPastSlot(dateStr, timeStr) {
    const now = new Date();
    const osloNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }));
    const [y,m,d] = dateStr.split('-').map(Number);
    const [hh,mm] = timeStr.split(':').map(Number);
    const slot = new Date(y, m-1, d, hh, mm, 0);
    return slot < osloNow;
  }

  function renderSlots(data) {
    slotsEl.innerHTML = '';
    selectedTime = null;
    formWrap.classList.add('hidden');

    const allSlots = Array.isArray(data.allSlots) ? data.allSlots : [];
    const bookedTimes = new Set(Array.isArray(data.bookedTimes) ? data.bookedTimes : []);

    if (!allSlots.length) {
      showMessage('Ingen tider tilgjengelige for valgt dato.', 'error');
      return;
    }
    hideMessage();
    slotsWrap.classList.remove('hidden');

    const futureSlots = allSlots.filter(t => !isPastSlot(bookingDate.value, t));
    if (!futureSlots.length) {
      showMessage('Ingen ledige tider igjen i dag. Velg en annen dato.', 'error');
      return;
    }

    futureSlots.forEach(time => {
      const disabled = bookedTimes.has(time);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `slot-btn${disabled ? ' disabled' : ''}`;
      btn.textContent = time;
      if (disabled) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedTime = time;
          formWrap.classList.remove('hidden');
        });
      }
      slotsEl.appendChild(btn);
    });
  }

  async function loadAvailability() {
    if (!selectedService || !bookingDate.value) return;
    showMessage('Laster ledige tider …');
    const res = await fetch(`${API_BASE}/availability?serviceId=${encodeURIComponent(selectedService._id)}&date=${encodeURIComponent(bookingDate.value)}`);
    const data = await res.json();
    renderSlots(data);
  }

  async function submitBooking() {
    const payload = {
      serviceId: selectedService._id,
      serviceName: selectedService.name,
      date: bookingDate.value,
      time: selectedTime,
      customerName: document.getElementById('customerName').value.trim(),
      customerPhone: document.getElementById('customerPhone').value.trim(),
      customerEmail: document.getElementById('customerEmail').value.trim(),
      customerAddress: document.getElementById('customerAddress').value.trim(),
      comment: document.getElementById('comment').value.trim(),
    };

    if (!payload.customerName || !payload.customerPhone || !payload.customerEmail || !payload.customerAddress || !payload.date || !payload.time) {
      showMessage('Fyll inn navn, telefon, e-post, adresse, dato og tid.', 'error');
      return;
    }

    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      const bookingSummary = {
        serviceName: payload.serviceName,
        date: payload.date,
        time: payload.time,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        comment: payload.comment,
      };

      try {
        sessionStorage.setItem('lastBookingSummary', JSON.stringify(bookingSummary));
      } catch (_) {
        localStorage.setItem('lastBookingSummary', JSON.stringify(bookingSummary));
      }

      window.location.href = 'booking-bekreftelse.html';
      return;
    }

    if (res.status === 409) {
      showMessage('Valgt tid er opptatt. Her er neste ledige tider.', 'error');
      await loadAvailability();
      return;
    }

    showMessage(data.error || 'Kunne ikke sende booking akkurat nå.', 'error');
  }

  serviceSelect.addEventListener('change', () => {
    selectedService = services.find(s => s._id === serviceSelect.value) || null;
    bookingTitle.textContent = selectedService ? `Bestill ${selectedService.name}` : 'Bestill tjeneste';
    if (bookingDate.value) loadAvailability();
  });
  bookingDate.addEventListener('change', loadAvailability);
  submitBtn.addEventListener('click', submitBooking);

  setDateLimits();
  loadServices().catch(() => showMessage('Kunne ikke hente tjenester akkurat nå.', 'error'));
})();
