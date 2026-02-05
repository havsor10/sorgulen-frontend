// booking.js – Håndterer bookingsiden for Sørgulen

document.addEventListener('DOMContentLoaded', () => {
  const serviceOptionsDiv = document.getElementById('service-options');
  const dateInput = document.getElementById('booking-date');
  const slotsSection = document.getElementById('slots-section');
  const timeslotsDiv = document.getElementById('timeslots');
  const formSection = document.getElementById('form-section');
  const bookingForm = document.getElementById('booking-form');
  const successSection = document.getElementById('success-section');

  let selectedServiceId = null;
  let selectedServiceName = null;
  let selectedService = null;
  let selectedSlot = null;
  let holdId = null;

  // Map for rask oppslag på tjenestene (id -> service-objekt)
  const servicesMap = {};

  // Hjelper: legg til minutter til HH:MM-streng
  function addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m + minutes;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // API-base:
  // - Produksjon (frontend og backend på samme domene): tom streng
  // - Lokal test med Live Server (typisk port 5500): bruk backend på 3001
  // - Overstyring: sett window.API_BASE_URL i HTML før dette scriptet lastes
  const API_BASE = (() => {
    // Manuell overstyring (valgfritt). Husk å ikke ha trailing slash.
    if (typeof window !== 'undefined' && window.API_BASE_URL) {
      return String(window.API_BASE_URL).trim().replace(/\/+$/, '');
    }

    // Lokal dev (valgfritt): Live Server kjører ofte på 5500.
    if (typeof window !== 'undefined' && window.location) {
      const { port } = window.location;
      if (port === '5500') return 'http://localhost:3001';
    }

    // Produksjon: bruk samme origin (/api/*). Netlify proxy'er dette via Functions.
    return '';
  })();

  function showBanner(message, kind = 'error') {
    // enkel, ikke-invasiv feilmelding på siden
    let el = document.getElementById('booking-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'booking-banner';
      el.style.padding = '10px 12px';
      el.style.margin = '12px 0';
      el.style.borderRadius = '8px';
      el.style.fontSize = '14px';
      el.style.lineHeight = '1.3';
      el.style.border = '1px solid rgba(0,0,0,0.15)';
      const container = document.querySelector('.booking-container');
      if (container) container.insertBefore(el, container.firstChild.nextSibling);
    }
    el.style.background = kind === 'ok' ? 'rgba(0, 128, 0, 0.08)' : 'rgba(220, 0, 0, 0.08)';
    el.style.color = kind === 'ok' ? '#0b4b0b' : '#7a0000';
    el.textContent = message;
  }

  async function loadServices() {
    try {
      const res = await fetch(`${API_BASE}/api/services`, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        showBanner(`Kunne ikke hente tjenester (HTTP ${res.status}). ${text ? 'Sjekk backend/proxy.' : ''}`);
        return;
      }

      const payload = await res.json();

// Støtt både array og { services: [...] }
const services = Array.isArray(payload)
  ? payload
  : (Array.isArray(payload.services) ? payload.services : []);

// Filter (valgfritt)
      const bookingServices = services.filter((s) =>
        // Vis kun aktive tjenester hvis feltet finnes
        (s.active !== false) && ["Dekkskift", "Brøyting"].includes(s.name)
      );

      if (bookingServices.length === 0) {
        showBanner('Ingen tjenester tilgjengelig. Sjekk at tjenestene finnes i backend og at navn matcher (Dekkskift/Brøyting).');
      }
      serviceOptionsDiv.innerHTML = '';
      bookingServices.forEach((s, index) => {
        // Lagre service i map for senere oppslag (pris, varighet)
        servicesMap[s._id] = s;
        const label = document.createElement('label');
        label.className = 'service-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'service';
        input.value = s._id;
        input.dataset.name = s.name;
        if (index === 0) {
          input.checked = false;
        }
        // Kopier service inn i closure for riktig binding
        const currentService = s;
        input.addEventListener('change', () => {
          selectedServiceId = currentService._id;
          selectedServiceName = currentService.name;
          selectedService = currentService;
          dateInput.disabled = false;
          resetBooking();
        });
        label.appendChild(input);
        const span = document.createElement('span');
        span.textContent = s.name;
        label.appendChild(span);
        serviceOptionsDiv.appendChild(label);
      });
    } catch (err) {
      console.error('Kunne ikke hente tjenester', err);
      showBanner('Kunne ikke hente tjenester. Mest sannsynlig nettverk/CORS/proxy.');
    }
  }

  function resetBooking() {
    slotsSection.classList.add('hidden');
    formSection.classList.add('hidden');
    successSection.classList.add('hidden');
    timeslotsDiv.innerHTML = '';
    holdId = null;
    selectedSlot = null;
  }

  dateInput.addEventListener('change', () => {
    if (!selectedServiceId || !dateInput.value) return;
    fetchAvailability();
  });

  async function fetchAvailability() {
    resetBooking();
    slotsSection.classList.remove('hidden');
    timeslotsDiv.innerHTML = '<p>Laster ledige tider …</p>';
    try {
      const res = await fetch(
        `${API_BASE}/api/availability?serviceId=${encodeURIComponent(selectedServiceId)}&date=${encodeURIComponent(
          dateInput.value
        )}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        timeslotsDiv.innerHTML = `<p>Kunne ikke hente tilgjengelighet (HTTP ${res.status}).</p>`;
        console.error('Availability HTTP error', res.status, text);
        return;
      }
      const data = await res.json();
      timeslotsDiv.innerHTML = '';
      // Hent tilgjengelige tider fra data.slots (legacy) eller data.available (backend-v2)
      const availableTimes = (data.slots && Array.isArray(data.slots)) ? data.slots : (Array.isArray(data.available) ? data.available : []);
      if (!availableTimes || availableTimes.length === 0) {
        timeslotsDiv.innerHTML = '<p>Ingen tilgjengelige tider på valgt dato.</p>';
        return;
      }
      // Lag slots med start/end/pris basert på valgt tjeneste
      const serviceObj = servicesMap[selectedServiceId] || selectedService || null;
      const durationMin = serviceObj && typeof serviceObj.duration === 'number' ? serviceObj.duration : 0;
      const priceVal = serviceObj && typeof serviceObj.price === 'number' ? serviceObj.price : null;
      const priceFromFlag = serviceObj && serviceObj.priceFrom === true;
            const allTimes = Array.isArray(data.allSlots) ? data.allSlots : availableTimes;
      const availableSet = new Set(availableTimes);
      const slots = allTimes.map((t) => {
        const endTime = durationMin ? addMinutes(t, durationMin) : '';
        const priceText = priceVal !== null ? (priceFromFlag ? `${priceVal}+` : `${priceVal} kr`) : '';
        return {
          startTime: t,
          endTime: endTime,
          available: availableSet.has(t),
          price: priceVal,
          priceText: priceText
        };
      });
      slots.forEach((slot) => {
        const card = document.createElement('div');
        card.className = 'timeslot-card';
        if (!slot.available) card.classList.add('disabled');
        card.innerHTML =
  `<span class="status">${slot.available ? 'LEDIG' : 'OPPTATT'}</span>` +
  `<span class="time">${slot.startTime}${slot.endTime ? `–${slot.endTime}` : ''}</span>` +
  `<span class="price">${slot.priceText || ''}</span>`;
        if (slot.available) {
          card.addEventListener('click', () => selectSlot(slot));
        }
        timeslotsDiv.appendChild(card);
      });
    } catch (err) {
      console.error('Kunne ikke hente tilgjengelighet', err);
      timeslotsDiv.innerHTML = '<p>Kunne ikke hente tilgjengelighet.</p>';
    }
  }

  async function selectSlot(slot) {
    // Merk valgt tidsluke og vis skjema uten å reservere i backend.
    selectedSlot = slot;
    formSection.classList.remove('hidden');
    // Scroll til form
    formSection.scrollIntoView({ behavior: 'smooth' });
  }

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Sørg for at en tid er valgt
    if (!selectedSlot) {
      alert('Du må velge en ledig tid før du kan bestille.');
      return;
    }
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    if (!name || !phone || !email) {
      alert('Fyll inn alle obligatoriske felt.');
      return;
    }
    // Konstruer bookingdata som backend forventer
    const bookingPayload = {
      serviceId: selectedServiceId,
      serviceName: selectedServiceName,
      date: dateInput.value,
      time: selectedSlot.startTime,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      comment: ''
    };
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload)
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : { ok: false, error: await res.text().catch(() => '') };

      if (!res.ok || !data.ok) {
        alert(data.error || `Noe gikk galt (HTTP ${res.status}). Prøv igjen.`);
        return;
      }
      formSection.classList.add('hidden');
      successSection.classList.remove('hidden');
      successSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('Kunne ikke bekrefte booking', err);
      alert('Kunne ikke bekrefte booking.');
    }
  });

  loadServices();
});