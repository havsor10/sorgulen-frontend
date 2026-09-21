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
        : "Sommer aktiv: fremhever sommeroppdrag.";
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
    if (serviceId === '6') return openRequestPage('Diverse arbeid');

    return openRequestPage('Tjenesteforespørsel');
  });
});

/* === AI Website Studio: publisert dynamisk innhold === */
(function () {
  "use strict";

  var CONTENT_API = ((window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api") + "/website-content";

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function safeHref(value, fallback) {
    var raw = String(value || "").trim();
    if (!raw) return fallback || "#";
    if (/^(https:\/\/sorgulen\.no(?:\/|$)|https:\/\/www\.sorgulen\.no(?:\/|$)|\/|\.\.?\/|[a-z0-9_-]+\.html(?:[?#].*)?|mailto:|tel:)/i.test(raw)) return raw;
    return fallback || "#";
  }

  function priceText(item) {
    var price = item && item.price ? item.price : {};
    var amount = Number(price.amount || 0);
    if (!amount) return price.label || "Pris avtales";
    var suffix = { fixed: " kr", hour: " kr/time", day: " kr/døgn", week: " kr/uke", item: " kr/stk", custom: "" }[price.unit] || " kr";
    var text = (price.from ? "Fra " : "") + amount.toLocaleString("no-NO") + suffix;
    return price.label ? text + " · " + price.label : text;
  }

  async function fetchItems(type) {
    try {
      var response = await fetch(CONTENT_API + "?type=" + encodeURIComponent(type), { headers: { Accept: "application/json" } });
      if (!response.ok) return [];
      var data = await response.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch (_) { return []; }
  }

  async function fetchOne(slug) {
    try {
      var response = await fetch(CONTENT_API + "/" + encodeURIComponent(slug), { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      var data = await response.json();
      return data.item || null;
    } catch (_) { return null; }
  }

  function renderDynamicRentals() {
    var grid = document.querySelector(".rental-grid");
    if (!grid) return;
    fetchItems("rental").then(function (items) {
      var existing = new Set(Array.from(grid.querySelectorAll("h3")).map(function (h) { return h.textContent.trim().toLowerCase(); }));
      items.forEach(function (item) {
        if (!item.title || existing.has(String(item.title).toLowerCase())) return;
        existing.add(String(item.title).toLowerCase());
        var specs = (item.specs || []).slice(0, 3).map(function (spec) {
          return "<span>" + esc(spec.label) + ": " + esc(spec.value) + "</span>";
        }).join("");
        var image = item.media && item.media.imageUrl
          ? '<img src="' + esc(item.media.imageUrl) + '" alt="' + esc(item.media.imageAlt || item.title) + '" loading="lazy" decoding="async">'
          : '<img src="../assets/logo.png" alt="' + esc(item.title) + '" loading="lazy" decoding="async" style="object-fit:contain;padding:30px">';
        var article = document.createElement("article");
        article.className = "rental-card ai-published-card";
        article.dataset.aiContent = item.slug || "";
        article.innerHTML = '<div class="media">' + image + '<span class="price-badge">' + esc(priceText(item)) + '</span></div>' +
          '<div class="content"><h3>' + esc(item.title) + '</h3><div class="meta">' + esc(item.summary || item.description || "") + '</div>' +
          '<div class="mini-specs">' + specs + '</div><div class="actions"><a href="produkt.html?slug=' + encodeURIComponent(item.slug || "") + '" class="btn primary">Se pris og info</a></div></div>';
        grid.appendChild(article);
      });
    });
  }

  function renderDynamicServices() {
    var grid = document.getElementById("servicesGrid");
    if (!grid) return;
    fetchItems("service").then(function (items) {
      var existing = new Set(Array.from(grid.querySelectorAll("h3")).map(function (h) { return h.textContent.trim().toLowerCase(); }));
      items.forEach(function (item) {
        if (!item.title || existing.has(String(item.title).toLowerCase())) return;
        existing.add(String(item.title).toLowerCase());
        var image = item.media && item.media.imageUrl
          ? '<img src="' + esc(item.media.imageUrl) + '" alt="' + esc(item.media.imageAlt || item.title) + '" loading="lazy" decoding="async">'
          : '<img src="assets/logo.png" alt="' + esc(item.title) + '" loading="lazy" decoding="async" style="object-fit:contain;padding:28px">';
        var primaryHref = item.serviceSettings && item.serviceSettings.bookable
          ? "booking.html?service=" + encodeURIComponent(item.title)
          : "prisestimat.html?service=" + encodeURIComponent(item.title);
        var primaryLabel = item.serviceSettings && item.serviceSettings.bookable ? "Bestill" : "Få prisestimat";
        var article = document.createElement("article");
        article.className = "card ai-published-card";
        article.dataset.serviceKey = item.slug || "";
        article.innerHTML = '<div class="media">' +
          (item.badgeLabel ? '<span class="badge premium-badge">' + esc(item.badgeLabel) + " • " + esc(priceText(item)) + "</span>" : '<span class="badge">' + esc(priceText(item)) + "</span>") +
          image + '</div><div class="content"><h3>' + esc(item.title) + '</h3><div class="meta">' + esc(item.summary || item.description || "") + '</div>' +
          '<div class="actions"><a href="' + esc(primaryHref) + '" class="btn primary">' + esc(primaryLabel) + '</a>' +
          '<a href="tjenester/tjeneste.html?slug=' + encodeURIComponent(item.slug || "") + '" class="btn">Pris og info</a></div></div>';
        grid.appendChild(article);
      });
    });
  }

  function renderCampaigns() {
    if (!/\/tilbud(?:\.html)?\/?$/i.test(location.pathname)) return;
    var intro = document.querySelector("body > section");
    if (!intro) return;
    fetchItems("campaign").then(function (items) {
      if (!items.length) return;
      var section = document.createElement("section");
      section.className = "wrap ai-campaign-section";
      section.innerHTML = '<div class="section-title"><h2>Aktuelle kampanjer</h2></div><div class="ai-campaign-grid"></div>';
      var grid = section.querySelector(".ai-campaign-grid");
      items.forEach(function (item) {
        var card = document.createElement("article");
        card.className = "box ai-campaign-card";
        card.innerHTML = (item.badgeLabel ? '<span class="ai-content-badge">' + esc(item.badgeLabel) + "</span>" : "") +
          "<h3>" + esc(item.title) + "</h3><p>" + esc(item.summary || item.description || "") + "</p>" +
          '<strong class="ai-content-price">' + esc(priceText(item)) + "</strong>" +
          '<a class="btn primary" href="' + esc(safeHref(item.cta && item.cta.url, "kontakt.html")) + '">' + esc((item.cta && item.cta.label) || "Ta kontakt") + "</a>";
        grid.appendChild(card);
      });
      intro.insertAdjacentElement("afterend", section);
    });
  }

  function listHtml(title, values) {
    if (!Array.isArray(values) || !values.length) return "";
    return '<section class="ai-detail-section"><h2>' + esc(title) + "</h2><ul>" + values.map(function (value) {
      return "<li>" + esc(value) + "</li>";
    }).join("") + "</ul></section>";
  }

  function specsHtml(specs) {
    if (!Array.isArray(specs) || !specs.length) return "";
    return '<section class="ai-detail-section"><h2>Spesifikasjoner</h2><div class="ai-detail-specs">' + specs.map(function (spec) {
      return '<div><small>' + esc(spec.label) + "</small><strong>" + esc(spec.value) + "</strong></div>";
    }).join("") + "</div></section>";
  }

  function faqHtml(faq) {
    if (!Array.isArray(faq) || !faq.length) return "";
    return '<section class="ai-detail-section"><h2>Spørsmål og svar</h2>' + faq.map(function (item) {
      return '<details><summary>' + esc(item.question) + "</summary><p>" + esc(item.answer) + "</p></details>";
    }).join("") + "</section>";
  }

  function renderDetail(root, item, kind) {
    if (!root || !item) return;
    var image = item.media && item.media.imageUrl
      ? '<img class="ai-detail-image" src="' + esc(item.media.imageUrl) + '" alt="' + esc(item.media.imageAlt || item.title) + '">'
      : "";
    var specs = specsHtml(item.specs);
    var included = listHtml("Dette følger med", item.included);
    var highlights = listHtml(kind === "rental" ? "Passer godt til" : "Dette får du", item.highlights);
    var requirements = listHtml("Viktig å vite", item.requirements);
    var faq = faqHtml(item.faq);
    var fallback = kind === "rental" ? "../kontakt.html?service=Utleie" : "../prisestimat.html";
    root.innerHTML = '<div class="ai-detail-grid"><div>' + image + specs + highlights + included + requirements + faq + '</div>' +
      '<aside class="ai-detail-panel">' + (item.badgeLabel ? '<span class="ai-content-badge">' + esc(item.badgeLabel) + "</span>" : "") +
      "<h1>" + esc(item.title) + "</h1><p>" + esc(item.summary || "") + "</p>" +
      '<div class="ai-detail-price">' + esc(priceText(item)) + '</div><div class="ai-detail-description">' + esc(item.description || "") + '</div>' +
      '<a class="btn primary" href="' + esc(safeHref(item.cta && item.cta.url, fallback)) + '">' + esc((item.cta && item.cta.label) || "Send forespørsel") + "</a></aside></div>";
    document.title = (item.seo && item.seo.title) || item.title + " | Sørgulen Industriservice";
    var meta = document.querySelector('meta[name="description"]');
    if (meta && item.seo && item.seo.description) meta.setAttribute("content", item.seo.description);
  }

  function renderDetailPage() {
    var rentalRoot = document.getElementById("aiRentalDetail");
    var serviceRoot = document.getElementById("aiServiceDetail");
    var root = rentalRoot || serviceRoot;
    if (!root) return;
    var slug = new URLSearchParams(location.search).get("slug") || "";
    if (!slug) {
      root.innerHTML = '<div class="box"><h1>Innholdet finnes ikke</h1><p>Mangler produkt- eller tjeneste-id.</p></div>';
      return;
    }
    fetchOne(slug).then(function (item) {
      var expectedType = rentalRoot ? "rental" : "service";
      if (!item || item.type !== expectedType) {
        root.innerHTML = '<div class="box"><h1>Innholdet finnes ikke</h1><p>Det kan være tatt av nettsida.</p></div>';
        return;
      }
      renderDetail(root, item, expectedType);
    });
  }

  function runDynamicContent() {
    renderDynamicRentals();
    renderDynamicServices();
    renderCampaigns();
    renderDetailPage();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runDynamicContent, { once: true });
  else runDynamicContent();
}());
