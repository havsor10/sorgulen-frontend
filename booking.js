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
  const bookingModeNotice = document.getElementById("bookingModeNotice");
  const slotHeading = document.getElementById("slotHeading");
  const slotHint = document.getElementById("slotHint");
  const formTitle = document.getElementById("formTitle");
  const successTitle = document.getElementById("successTitle");
  const successText = document.getElementById("successText");
  const bookingRequestWarning = document.getElementById("bookingRequestWarning");
  const bookingFreeInfo = document.getElementById("bookingFreeInfo");
  const requestAcknowledgment = document.getElementById("bookingRequestAcknowledgment");
  const requestAcknowledged = document.getElementById("requestAcknowledged");
  const bookingChangeHint = document.getElementById("bookingChangeHint");

  const params = new URLSearchParams(window.location.search);
  const requestedServiceName = (params.get("service") || "").trim().toLowerCase();
  const requestedServiceKey = ({ "brøyting": "broyting", "broyting": "broyting", "dekkskift": "dekkskift" })[requestedServiceName] || "";

  let services = [];
  let selectedService = null;
  let selectedTime = null;
  let availabilityRequest = 0;
  let bookingPending = false;
  let bookingSucceeded = false;
  let bookingMode = "booking"; // Set only from validated backend availability.

  function osloParts(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(value);
    const get = (type) => parts.find((part) => part.type === type)?.value || "00";
    return { date: [get("year"), get("month"), get("day")].join("-"),
      minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
  }

  function getOperationId(payload) {
    const key = [payload.serviceId, payload.date, payload.time].join("|");
    let previous = null;
    try { previous = JSON.parse(sessionStorage.getItem("sorgulen_booking_retry") || "null"); } catch (_) {}
    if (previous?.key === key && /^[A-Za-z0-9_-]{16,128}$/.test(previous.id || "")) return previous.id;
    const id = window.crypto?.randomUUID?.()
      || "booking_" + Date.now().toString(36) + "_" + Array.from(window.crypto.getRandomValues(new Uint32Array(4)), v => v.toString(36)).join("");
    try { sessionStorage.setItem("sorgulen_booking_retry", JSON.stringify({ key, id })); } catch (_) {}
    return id;
  }

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = `notice ${type || ''}`.trim();
    messageEl.classList.remove('hidden');
  }
  function hideMessage() { messageEl.classList.add('hidden'); }

  function todayOslo() { return osloParts().date; }
  function maxDateOslo(days) {
    const day = todayOslo();
    return new Date(Date.parse(day + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
  }

  function setDateLimits() {
    bookingDate.min = todayOslo();
    bookingDate.max = maxDateOslo(30);
  }

  async function loadServices() {
    const res = await fetch(`${API_BASE}/services`, { cache: "no-store" });
    if (!res.ok) throw new Error("Tenestene kunne ikkje hentast.");
    const data = await res.json();
    if (!Array.isArray(data.services)) throw new Error("Ugyldig svar frå tenestelista.");
    services = data.services;
    const allowed = services.filter((service) => service.active !== false && service.bookable === true);
    serviceSelect.replaceChildren();
    // Tenestenamn er data frå serveren, aldri HTML som skal tolkast.
    for (const service of allowed) {
      const option = document.createElement("option");
      option.value = String(service._id);
      // The live service catalogue still contains incomplete snow priceText ("Fra 350 kr").
      // Show both agreed components without changing how backend pricing is calculated.
      const publicPrice = service.key === "broyting" ? "350 kr oppmøte + 650 kr/time" : (service.priceText || "");
      option.textContent = service.name + " – " + publicPrice;
      serviceSelect.appendChild(option);
    }
    if (!allowed.length) {
      serviceSelect.disabled = true;
      bookingDate.disabled = true;
      showMessage("Ingen tenester er opne for direkte bestilling. Send gjerne ei prisførespurnad i staden.", "error");
      return;
    }
    const pre = allowed.find((service) => String(service.key || "") === requestedServiceKey)
      || allowed.find((service) => String(service.name).trim().toLowerCase() === requestedServiceName)
      || allowed[0];
    serviceSelect.value = String(pre._id);
    selectedService = pre;
    bookingTitle.textContent = `Bestill ${pre.name}`;
    if (bookingDate.value) await loadAvailability();
  }

  function isPastSlot(dateStr, timeStr) {
    const now = osloParts();
    if (dateStr < now.date) return true;
    if (dateStr > now.date) return false;
    const [hh, mm] = String(timeStr).split(":").map(Number);
    return hh * 60 + mm <= now.minutes;
  }

  function renderSlots(data) {
    bookingMode = data.bookingMode === "request" ? "request" : "booking";
    const isRequest = bookingMode === "request";
    const isSnow = selectedService?.key === "broyting" || /(brøy|broy|snø|sno|plog)/i.test(selectedService?.name || "");
    // Legacy cached HTML may lack these explanatory nodes; booking still works.
    // An older backend can lack bookingMode; never falsely label a day as free.
    const modeKnown = data.bookingMode === "request" || data.bookingMode === "booking";
    if (bookingModeNotice) {
      // Preserve visible static warning markup instead of replacing it with a
      // generic status message. Legacy cached HTML gets the safe fallback.
      if (bookingRequestWarning && bookingFreeInfo) {
        bookingRequestWarning.classList.toggle("hidden", !isRequest);
        bookingFreeInfo.classList.toggle("hidden", isRequest);
      } else {
        bookingModeNotice.textContent = isRequest
          ? "VIKTIG: Dette er bare en forespørsel, IKKE en bekreftet bestilling."
          : "Denne dagen er åpen for direkte bestilling.";
      }
      bookingModeNotice.classList.toggle("hidden", !isSnow || !modeKnown);
    }
    if (requestAcknowledgment) requestAcknowledgment.classList.toggle("hidden", !isRequest);
    if (requestAcknowledged) requestAcknowledged.checked = false;
    if (bookingChangeHint) bookingChangeHint.textContent = isRequest
      ? "Forespørselen innebærer ingen reservasjon eller avtale."
      : "For å avbestille eller flytte time må du kontakte oss direkte.";
    if (slotHeading) slotHeading.textContent = isRequest ? "Når ønsker du brøyting?" : "Ledige tider";
    if (slotHint) slotHint.textContent = isRequest
      ? "Velg ønsket tidspunkt. Dette er ikke en reservert tid."
      : "Opptatte tidspunkt kan ikkje bestillast.";
    if (formTitle) formTitle.textContent = isRequest ? "Send forespørsel om brøyting" : "Fullfør bestilling";
    submitBtn.textContent = isRequest ? "Send forespørsel – ikke bestilling" : "Send bestilling";
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
    const seq = ++availabilityRequest;
    selectedTime = null;
    bookingMode = "booking";
    if (bookingModeNotice) bookingModeNotice.classList.add("hidden");
    if (requestAcknowledgment) requestAcknowledgment.classList.add("hidden");
    if (requestAcknowledged) requestAcknowledged.checked = false;
    slotsEl.replaceChildren();
    slotsWrap.classList.add("hidden");
    formWrap.classList.add("hidden");
    if (!selectedService || !bookingDate.value) { hideMessage(); return; }
    const serviceId = String(selectedService._id);
    const day = bookingDate.value;
    showMessage("Hentar ledige tider …");
    try {
      const res = await fetch(`${API_BASE}/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(day)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (seq !== availabilityRequest) return;
      if (!res.ok || !Array.isArray(data.allSlots) || !Array.isArray(data.bookedTimes)) {
        throw new Error(data.error || "Kunne ikkje hente ledige tider. Prøv igjen.");
      }
      if (!selectedService || String(selectedService._id) !== serviceId || bookingDate.value !== day) return;
      renderSlots(data);
    } catch (error) {
      if (seq !== availabilityRequest) return;
      showMessage(error.message || "Kunne ikkje hente ledige tider. Prøv igjen.", "error");
    }
  }

  async function submitBooking() {
    if (bookingPending || bookingSucceeded) return;
    if (!selectedService || !selectedTime) {
      showMessage("Vel ei teneste, dato og ledig tid først.", "error");
      return;
    }
    const isRequest = bookingMode === "request";
    if (isRequest && (!requestAcknowledged || !requestAcknowledged.checked)) {
      showMessage("Bekreft at du forstår at dette er en forespørsel, ikke en bestilling.", "error");
      requestAcknowledged?.focus?.();
      return;
    }
    const payload = {
      serviceId: selectedService._id,
      serviceName: selectedService.name,
      date: bookingDate.value,
      time: selectedTime,
      customerName: document.getElementById("customerName").value.trim(),
      customerPhone: document.getElementById("customerPhone").value.trim(),
      customerEmail: document.getElementById("customerEmail").value.trim(),
      customerAddress: document.getElementById("customerAddress").value.trim(),
      comment: document.getElementById("comment").value.trim(),
    };
    if (!payload.customerName || !payload.customerPhone || !payload.customerEmail || !payload.customerAddress || !payload.date || !payload.time) {
      showMessage("Fyll inn namn, telefon, e-post, adresse, dato og tid.", "error");
      return;
    }
    if (isRequest) payload.acknowledgedNonBinding = true;
    payload.operationId = getOperationId(payload);
    bookingPending = true;
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = isRequest ? "Sender førespurnad …" : "Sender bestilling …";
    try {
      const res = await fetch(`${API_BASE}${isRequest ? "/requests/snow" : "/bookings"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && (isRequest ? data.requestId : data.bookingId)) {
        bookingSucceeded = true;
        if (isRequest) {
          // A request must never display the confirmed booking page.
          try { sessionStorage.removeItem("sorgulen_booking_retry"); } catch (_) {}
          successTitle.textContent = "Forespørselen er mottatt – IKKE bestilt";
          successText.textContent = "Brøyting er ikke avtalt. Vi vurderer kapasiteten og gir deg en egen tilbakemelding. Du får også en e-post om at forespørselen er mottatt.";
          slotsWrap.classList.add("hidden");
          formWrap.classList.add("hidden");
          successWrap.classList.remove("hidden");
          return;
        }
        const summary = {
          serviceName: payload.serviceName, date: payload.date, time: payload.time,
          customerName: payload.customerName, customerPhone: payload.customerPhone,
          customerEmail: payload.customerEmail, comment: payload.comment,
        };
        try {
          sessionStorage.setItem("lastBookingSummary", JSON.stringify(summary));
          sessionStorage.removeItem("sorgulen_booking_retry");
        } catch (_) {
          try { localStorage.setItem("lastBookingSummary", JSON.stringify(summary)); } catch (_) {}
        }
        window.location.href = "booking-bekreftelse.html";
        return;
      }
      if (res.status === 409) {
        showMessage(data.error || "Tida er ikkje ledig lenger. Vel ei ny tid.", "error");
        await loadAvailability();
        return;
      }
      showMessage(data.error || (isRequest ? "Førespurnaden kunne ikkje sendast." : "Bestillinga kunne ikkje stadfestast. Prøv igjen."), "error");
    } catch (error) {
      // Retrying uses the *same* operationId, so an accepted request is
      // recognized instead of generating another booking and another email.
      showMessage("Nettverksfeil. Vi veit ikkje om innsendinga vart motteken. Prøv same knapp igjen – den same førespurnads-/bestillings-ID-en hindrar duplikat.", "error");
    } finally {
      bookingPending = false;
      if (!bookingSucceeded) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
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