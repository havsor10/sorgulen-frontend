// Hamburger
const hamb = document.getElementById("hamburger");
const panel = document.getElementById("menuPanel");
if (hamb && panel) {
  hamb.addEventListener("click", () => {
    const open = panel.style.display === "block";
    panel.style.display = open ? "none" : "block";
    hamb.setAttribute("aria-expanded", String(!open));
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !hamb.contains(e.target)) {
      panel.style.display = "none";
      hamb.setAttribute("aria-expanded", "false");
    }
  });
}

// Sesongfilter
const toggle = document.getElementById("seasonToggle");
const seasonNote = document.getElementById("seasonNote");
const cards = Array.from(document.querySelectorAll("#servicesGrid .card"));

// Base URL for API calls (FastAPI backend on Render). Update this constant when changing backend deployment.
// NOTE: Updated to match the deployed backend (ukl7). All API calls throughout
// the site should reference this constant rather than hard‑coding their own
// domain. See other scripts for similar substitutions.
const BACKEND_URL = (window.CONFIG && window.CONFIG.API_BASE_URL) || 'https://sorgulen-backend-2.onrender.com/api';
if (toggle && seasonNote) {
  toggle.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    toggle.querySelectorAll("button").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    e.target.classList.add("active");
    e.target.setAttribute("aria-selected", "true");
    const season = e.target.dataset.season;
    seasonNote.textContent =
      season === "vinter"
        ? "Vinter aktiv: fremhever brøyting og vinteroppdrag."
        : "Sommer aktiv: fremhever plenklipp og sommertjenester.";
    cards.forEach((c) => {
      const tags = c.getAttribute("data-tags") || "";
      const on = tags.includes(season) || tags === "";
      c.style.opacity = on ? "1" : "0.35";
      c.style.transform = on ? "scale(1)" : "scale(0.98)";
    });
  });
}

// Før/etter glider
const cmp = document.getElementById("compare");
const range = document.getElementById("cmpRange");
if (cmp && range) {
  const afterImg = cmp.querySelector(".after");
  range.addEventListener("input", () => {
    const v = range.value; // 0..100
    afterImg.style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
  });
}

// Send bestilling fra forsiden
// Frontpage order form now posts directly to the unified API /orders endpoint.
// The form collects name, service, address, phone, date and optional info. We also require
// an email field (epost) to meet backend validation requirements. A helper mapping
// converts the selected Norwegian service name to the corresponding service slug used by
// the API. Zip code and city are parsed from the address if present (format 1234 City).
const bestillingForm = document.getElementById("bestillingForm");
if (bestillingForm) {
  bestillingForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(bestillingForm);
    // Honeypot: dersom feltet er fylt ut, ignoreres innsendelsen
    if (formData.get("bot-field")) return;
    const serviceMap = {
      'Brøyting': 'broeyting',
      'Takvask': 'diverse',
      'Takrennevask og rens': 'diverse',
      'Vask av søppeldunker': 'diverse',
      'Diverse arbeid': 'diverse'
    };
    const selectedService = formData.get('tjeneste');
    const slug = serviceMap[selectedService] || 'diverse';
    const addressValue = formData.get('adresse') || '';
    let zip = '';
    let city = '';
    const zipMatch = addressValue.match(/\b(\d{4})\b/);
    if (zipMatch) zip = zipMatch[1];
    const cityMatch = addressValue.match(/\b\d{4}\s*([A-Za-zÆØÅæøå\- ]+)/);
    if (cityMatch) city = cityMatch[1].trim();
    const order = {
      service: slug,
      customer: {
        name: formData.get('navn'),
        email: formData.get('epost') || '',
        phone: formData.get('telefon'),
        address: addressValue,
        zip: zip,
        city: city
      },
      details: [
        formData.get('dato') ? `Dato: ${formData.get('dato')}` : '',
        formData.get('info') ? `Tilleggsinfo: ${formData.get('info')}` : ''
      ].filter(Boolean).join('\n'),
      consent: true,
      sourcePage: window.location.pathname,
      priceEstimate: null
    };
    fetch(`${BACKEND_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    })
      .then((res) => {
        if (!res.ok) throw new Error('Feil ved lagring av bestilling');
        return res.json();
      })
      .then(() => {
        alert('Takk for bestillingen! Vi tar kontakt innen kort tid i åpningstid.');
        bestillingForm.reset();
      })
      .catch(() => {
        alert('Kunne ikke sende bestillingen. Vennligst prøv igjen senere eller kontakt oss.');
        bestillingForm.reset();
      });
  });
}

// Chat
const chatFab = document.getElementById("chatFab");
const chatPanel = document.getElementById("chatPanel");
if (chatFab && chatPanel) {
  chatFab.addEventListener("click", () => {
    const open = chatPanel.style.display === "block";
    chatPanel.style.display = open ? "none" : "block";
    chatFab.setAttribute("aria-expanded", String(!open));
  });
  document.addEventListener("click", (e) => {
    if (!chatPanel.contains(e.target) && !chatFab.contains(e.target)) {
      chatPanel.style.display = "none";
      chatFab.setAttribute("aria-expanded", "false");
    }
  });
}

// Dynamisk kontaktknapp
//
// Legger til en vertikal «Kontakt oss»-knapp som fester seg på høyre side av
// skjermen. Når brukeren skroller nedover skyves knappen ut av synet og en
// liten pil glir inn. Pil‑ikonet kan klikkes for å trekke ut knappen igjen.
// Dersom en slik knapp allerede finnes i dokumentet (for eksempel lagt til av
// andre skript), opprettes den ikke på nytt.
document.addEventListener('DOMContentLoaded', () => {
  // Ikke opprett knappen i adminpaneler eller hvis den allerede finnes
  // Legg kun til knappen på hovedsiden (forsiden) – på andre sider skal den ikke vises.
  const path = window.location.pathname || '';
  const onFrontpage = (path === '/' || path === '' || path.endsWith('index.html'));
  if (document.querySelector('.floating-contact') || window.location.pathname.startsWith('/admin') || !onFrontpage) return;
  // Opprett den vertikale kontaktknappen
  const contactBtn = document.createElement('a');
  // Kontaktknappen skal nå gå til den vanlige kontaktsiden.
  contactBtn.href = 'kontakt.html';
  contactBtn.className = 'floating-contact';
  contactBtn.textContent = 'Kontakt oss';
  contactBtn.setAttribute('aria-label', 'Kontakt oss');
  document.body.appendChild(contactBtn);

  // Standard lenke til kontaktsiden brukes, så egen klikklogikk er ikke nødvendig.
  // Opprett en liten pil/ikon som erstatter knappen når den skjules
  const contactToggle = document.createElement('div');
  contactToggle.className = 'contact-toggle';
  contactToggle.setAttribute('aria-label', 'Åpne kontakt');
  document.body.appendChild(contactToggle);
  // Når man klikker på pilen, vises kontaktknappen igjen og pilen skjules
  contactToggle.addEventListener('click', () => {
    contactBtn.style.transform = 'translateX(0)';
    contactToggle.style.transform = 'translateX(100%)';
  });
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const current = window.pageYOffset || document.documentElement.scrollTop;
    if (current > lastScroll + 10) {
      // Skroll nedover – skjul kontaktknappen og vis pilen
      contactBtn.style.transform = 'translateX(100%)';
      contactToggle.style.transform = 'translateX(0)';
    } else {
      // Skroll oppover – vis kontaktknappen og skjul pilen
      contactBtn.style.transform = 'translateX(0)';
      contactToggle.style.transform = 'translateX(100%)';
    }
    lastScroll = current <= 0 ? 0 : current;
  });
});
// Tilbakemelding (feedback) handling
const feedbackForm = document.getElementById('feedbackForm');
if (feedbackForm) {
  const anonCheckbox = document.getElementById('anonCheckbox');
  const nameRow = feedbackForm.querySelector('.name-row');
  const nameInput = document.getElementById('feedbackName');
  const ratingSelect = document.getElementById('feedbackRating');
  const messageField = document.getElementById('feedbackMessage');
  const statusEl = document.getElementById('feedbackStatus');

  // Toggle name field based on anonymity
  anonCheckbox.addEventListener('change', () => {
    nameRow.style.display = anonCheckbox.checked ? 'none' : 'block';
  });

  feedbackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      name: nameInput.value.trim(),
      rating: parseInt(ratingSelect.value, 10),
      message: messageField.value.trim(),
      anonymous: anonCheckbox.checked
    };
    // If anonymous or name empty, remove name from payload
    if (payload.anonymous || !payload.name) {
      delete payload.name;
    }
    // Send feedback to backend
    fetch(`${BACKEND_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((res) => {
        if (!res.ok) throw new Error('Feil ved sending av tilbakemelding');
        return res.json();
      })
      .then(() => {
        statusEl.textContent = 'Takk for tilbakemeldingen!';
        statusEl.style.display = 'block';
        feedbackForm.reset();
        nameRow.style.display = 'block';
      })
      .catch(() => {
        statusEl.textContent = 'Kunne ikke sende tilbakemeldingen. Prøv igjen senere.';
        statusEl.style.display = 'block';
      });
  });
}


function openServiceBooking(serviceName) {
  const url = `booking.html?service=${encodeURIComponent(serviceName)}`;
  window.location.href = url;
}

function openRequestPage(serviceName) {
  const url = `kontakt.html?service=${encodeURIComponent(serviceName)}`;
  window.location.href = url;
}

document.querySelectorAll('.book-service-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const serviceId = String(btn.dataset.service || '').trim();

    if (serviceId === '2') return openServiceBooking('Brøyting');
    if (serviceId === '11') return openServiceBooking('Dekkskift');
    if (serviceId === '5') return openRequestPage('Diverse arbeid');
    if (serviceId === '6') return openRequestPage('Takvask');

    return openRequestPage('Tjenesteforespørsel');
  });
});