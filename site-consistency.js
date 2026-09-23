// Felles offentlig informasjon og dynamisk tjenestekatalog for sorgulen.no.
// HTML-verdiene er fallback dersom Render er utilgjengelig. Når API-et svarer,
// er MongoDB-katalogen (redigert fra Admin > Nettside) fasiten.
(function () {
  "use strict";

  var PRICES = Object.freeze({
    snowPlowingFrom: 350,
    tireChange: 450,
    otherWorkHourlyFrom: 650,
    gutterCleaningFrom: 500,
    binWashFrom: 250
  });

  var SITE = Object.freeze({
    phoneDisplay: "407 30 187",
    phoneHref: "+4740730187",
    email: "sor.industri@gmail.com",
    address: "Kleiva 91B, 6906 Florø",
    bookingWindow: "09:00–20:00",
    apiBaseUrl: "https://sorgulen-backend-2.onrender.com/api",
    prices: PRICES
  });

  var DEFAULT_NAMES = {
    broyting: "Brøyting",
    dekkskift: "Dekkskift",
    "diverse-arbeid": "Diverse arbeid",
    takrennevask: "Takrennevask og rens",
    dunkvask: "Vask av søppeldunker"
  };

  window.SORGULEN_SITE = SITE;

  var replacements = [
    { pattern: /972(?:\s|\u00a0)*58(?:\s|\u00a0)*679/g, value: SITE.phoneDisplay },
    { pattern: /Du får bekreftelse på e-post eller SMS innen 60 minutter i åpningstid\./g, value: "Vi bekrefter forespørselen så snart vi kan." },
    { pattern: /Vi bekrefter din forespørsel innen 60 minutter i åpningstid\./g, value: "Vi bekrefter forespørselen så snart vi kan." },
    { pattern: /Vi svarer innen 60 minutter i åpningstid\./g, value: "Vi svarer så snart vi kan." }
  ];

  function textNodes(root) {
    if (!root || !document.createTreeWalker) return [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    var nodes = [];
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent) continue;
      var tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "NOSCRIPT") continue;
      nodes.push(node);
    }
    return nodes;
  }

  function normalizeText(root) {
    textNodes(root).forEach(function (textNode) {
      var next = textNode.nodeValue;
      replacements.forEach(function (item) { next = next.replace(item.pattern, item.value); });
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function replaceVisibleText(pattern, replacement) {
    textNodes(document.body).forEach(function (textNode) {
      var next = textNode.nodeValue.replace(pattern, replacement);
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function normalizeLinks() {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
      if (/972\D*58\D*679/.test(link.getAttribute("href") || "")) {
        link.setAttribute("href", "tel:" + SITE.phoneHref);
      }
    });
  }

  function fillSiteData() {
    document.querySelectorAll("[data-site-phone]").forEach(function (el) {
      el.textContent = SITE.phoneDisplay;
      if (el.tagName === "A") el.setAttribute("href", "tel:" + SITE.phoneHref);
    });
    document.querySelectorAll("[data-site-email]").forEach(function (el) {
      el.textContent = SITE.email;
      if (el.tagName === "A") el.setAttribute("href", "mailto:" + SITE.email);
    });
    document.querySelectorAll("[data-site-address]").forEach(function (el) {
      el.textContent = SITE.address;
    });
  }

  function findServiceCard(service) {
    if (service.key) {
      var byKey = document.querySelector('#servicesGrid .card[data-service-key="' + service.key + '"]');
      if (byKey) return byKey;
    }
    var expected = DEFAULT_NAMES[service.key] || service.name;
    var headings = document.querySelectorAll("#servicesGrid .card h3");
    for (var i = 0; i < headings.length; i += 1) {
      var value = headings[i].textContent.trim().toLowerCase();
      if (value === String(expected || "").toLowerCase() || value === String(service.name || "").toLowerCase()) {
        return headings[i].closest(".card");
      }
    }
    return null;
  }

  function publicPriceText(service) {
    if (service.priceText) return String(service.priceText);
    var suffix = service.priceUnit === "hour" ? " kr/time" : service.priceUnit === "item" ? " kr/stk" : " kr";
    return (service.priceFrom ? "Fra " : "") + Number(service.price || 0) + suffix;
  }

  function badgeText(service) {
    var price = publicPriceText(service);
    return service.badgeLabel ? String(service.badgeLabel) + " • " + price : price;
  }

  function setFallbackCard(name, badge) {
    var card = findServiceCard({ name: name, key: Object.keys(DEFAULT_NAMES).find(function (key) { return DEFAULT_NAMES[key] === name; }) });
    var el = card && card.querySelector(".badge");
    if (el) el.textContent = badge;
  }

  function applyFallbackPrices() {
    setFallbackCard("Brøyting", "Populær • Fra " + PRICES.snowPlowingFrom + " kr");
    setFallbackCard("Dekkskift", PRICES.tireChange + " kr");
    setFallbackCard("Diverse arbeid", "Fra " + PRICES.otherWorkHourlyFrom + " kr/time");
    setFallbackCard("Takrennevask og rens", "Fra " + PRICES.gutterCleaningFrom + " kr");
    setFallbackCard("Vask av søppeldunker", "Fra " + PRICES.binWashFrom + " kr");

    var heroTitle = document.querySelector(".hero-panel h2");
    if (heroTitle && /brøyting/i.test(heroTitle.textContent)) {
      heroTitle.textContent = "Brøyting fra " + PRICES.snowPlowingFrom + " kr";
    }
    var heroCopy = document.querySelector(".hero-panel p");
    if (heroCopy && /dekkskift/i.test(heroCopy.textContent)) {
      heroCopy.textContent = "Dekkskift " + PRICES.tireChange + " kr. Velg tidspunkt, send bestilling og få bekreftelse på e-post.";
    }
  }

  function applyDetailPagePrice(service) {
    var path = location.pathname.toLowerCase();
    var price = publicPriceText(service);
    if (service.key === "broyting" && path.indexOf("broyting") !== -1) {
      replaceVisibleText(/fra(?:\s|\u00a0)*350(?:\s|\u00a0)*kr/gi, price);
    }
    if (service.key === "dekkskift" && path.indexOf("dekkskift-pris-info") !== -1) {
      replaceVisibleText(/450(?:\s|\u00a0)*kr/g, price);
    }
    if (service.key === "diverse-arbeid" && path.indexOf("diverse-pris-info") !== -1) {
      replaceVisibleText(/(?:fra(?:\s|\u00a0)*)?650(?:\s|\u00a0)*kr(?:\/time| per time)?/gi, price);
    }
    if (service.key === "takrennevask" && path.indexOf("takrennevask-pris-info") !== -1) {
      replaceVisibleText(/(?:fra(?:\s|\u00a0)*)?500(?:\s|\u00a0)*kr/gi, price);
    }
    if (service.key === "dunkvask" && path.indexOf("dunkvask-pris-info") !== -1) {
      replaceVisibleText(/(?:fra(?:\s|\u00a0)*)?250(?:\s|\u00a0)*kr/gi, price);
    }
  }

  function applyService(service) {
    var card = findServiceCard(service);
    if (card) {
      card.setAttribute("data-service-key", service.key || "");
      card.style.display = service.active === false ? "none" : "";
      if (service.active !== false) {
        var title = card.querySelector("h3");
        var badge = card.querySelector(".badge");
        var meta = card.querySelector(".meta");
        if (title && service.name) title.textContent = service.name;
        if (badge) badge.textContent = badgeText(service);
        if (meta && service.shortDescription) meta.textContent = service.shortDescription;
      }
    }

    if (service.active === false) return;

    var price = publicPriceText(service);
    if (service.key === "broyting") {
      var heroTitle = document.querySelector(".hero-panel h2");
      if (heroTitle) heroTitle.textContent = service.name + " " + price.toLowerCase();
    }
    if (service.key === "dekkskift") {
      var heroCopy = document.querySelector(".hero-panel p");
      if (heroCopy && /dekkskift/i.test(heroCopy.textContent)) {
        heroCopy.textContent = service.name + " " + price + ". Velg tidspunkt, send bestilling og få bekreftelse på e-post.";
      }
      replaceVisibleText(/dekkskift til(?:\s|\u00a0)*450(?:\s|\u00a0)*kr/gi, service.name.toLowerCase() + " til " + price);
    }
    if (service.key === "diverse-arbeid") {
      replaceVisibleText(/650(?:\s|\u00a0)*kr\/time/g, price.replace(/^Fra\s+/i, ""));
      replaceVisibleText(/650(?:\s|\u00a0)*kr per time/g, price.replace(/^Fra\s+/i, "").replace("/time", " per time"));
    }
    applyDetailPagePrice(service);
  }

  function syncServices() {
    if (typeof fetch !== "function") return;
    var apiBase = (window.CONFIG && window.CONFIG.API_BASE_URL) || SITE.apiBaseUrl;
    fetch(apiBase + "/services?includeInactive=1", { headers: { "Accept": "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Kunne ikke hente tjenestekatalog");
        return response.json();
      })
      .then(function (data) {
        var services = Array.isArray(data.services) ? data.services : [];
        services.forEach(applyService);
        window.dispatchEvent(new CustomEvent("sorgulen:services", { detail: { services: services } }));
      })
      .catch(function () {
        // Fallbackverdiene i HTML står igjen dersom Render er utilgjengelig.
      });
  }

  function ensureCanonical() {
    if (document.querySelector('link[rel="canonical"]')) return;
    if (location.hostname !== "sorgulen.no" && location.hostname !== "www.sorgulen.no") return;
    if (/^\/(admin|login|prosjekt)(\/|\.html|$)/.test(location.pathname)) return;
    var canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = "https://sorgulen.no" + location.pathname;
    document.head.appendChild(canonical);
  }

  function run() {
    normalizeText(document.body);
    normalizeLinks();
    fillSiteData();
    applyFallbackPrices();
    syncServices();
    ensureCanonical();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
})();
