// Felles offentlig informasjon for sorgulen.no.
// Endre kontaktdata og fallback-priser her dersom de endres senere.
// Brøyting og dekkskift synkroniseres i tillegg mot /api/services, som er
// samme datagrunnlag som bookingsiden bruker. HTML-prisene er kun fallback.
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
    address: "Kleiva 91 B, 6900 Florø",
    bookingWindow: "09:00–20:00",
    apiBaseUrl: "https://sorgulen-backend-2.onrender.com/api",
    prices: PRICES
  });

  window.SORGULEN_SITE = SITE;

  var replacements = [
    {
      pattern: /972(?:\s|\u00a0)*58(?:\s|\u00a0)*679/g,
      value: SITE.phoneDisplay
    },
    {
      pattern: /Du får bekreftelse på e-post eller SMS innen 60 minutter i åpningstid\./g,
      value: "Vi bekrefter forespørselen så snart vi kan."
    },
    {
      pattern: /Vi bekrefter din forespørsel innen 60 minutter i åpningstid\./g,
      value: "Vi bekrefter forespørselen så snart vi kan."
    },
    {
      pattern: /Vi svarer innen 60 minutter i åpningstid\./g,
      value: "Vi svarer så snart vi kan."
    }
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
      replacements.forEach(function (item) {
        next = next.replace(item.pattern, item.value);
      });
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

  function findServiceCard(name) {
    var headings = document.querySelectorAll("#servicesGrid .card h3");
    for (var i = 0; i < headings.length; i += 1) {
      if (headings[i].textContent.trim().toLowerCase() === name.toLowerCase()) {
        return headings[i].closest(".card");
      }
    }
    return null;
  }

  function setCardBadge(name, text) {
    var card = findServiceCard(name);
    var badge = card && card.querySelector(".badge");
    if (badge) badge.textContent = text;
  }

  function lowerFirst(text) {
    if (!text) return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  function applyFallbackPrices() {
    setCardBadge("Brøyting", "Populær • Fra " + PRICES.snowPlowingFrom + " kr");
    setCardBadge("Dekkskift", PRICES.tireChange + " kr");
    setCardBadge("Diverse arbeid", "Fra " + PRICES.otherWorkHourlyFrom + " kr/time");
    setCardBadge("Takrennevask og rens", "Fra " + PRICES.gutterCleaningFrom + " kr");
    setCardBadge("Vask av søppeldunker", "Fra " + PRICES.binWashFrom + " kr");

    var heroTitle = document.querySelector(".hero-panel h2");
    if (heroTitle && /brøyting/i.test(heroTitle.textContent)) {
      heroTitle.textContent = "Brøyting fra " + PRICES.snowPlowingFrom + " kr";
    }

    var heroCopy = document.querySelector(".hero-panel p");
    if (heroCopy && /dekkskift/i.test(heroCopy.textContent)) {
      heroCopy.textContent = "Dekkskift " + PRICES.tireChange + " kr. Velg tidspunkt, send bestilling og få bekreftelse på e-post.";
    }

    replaceVisibleText(/650(?:\s|\u00a0)*kr\/time/g, PRICES.otherWorkHourlyFrom + " kr/time");
    replaceVisibleText(/650(?:\s|\u00a0)*kr per time/g, PRICES.otherWorkHourlyFrom + " kr per time");

    var path = location.pathname.toLowerCase();
    if (path.indexOf("takrennevask-pris-info") !== -1) {
      replaceVisibleText(/500(?:\s|\u00a0)*kr/g, PRICES.gutterCleaningFrom + " kr");
    }
    if (path.indexOf("dunkvask-pris-info") !== -1) {
      replaceVisibleText(/250(?:\s|\u00a0)*kr/g, PRICES.binWashFrom + " kr");
    }
  }

  function applyBookablePrice(serviceName, priceText) {
    if (!priceText) return;

    var name = String(serviceName || "").trim().toLowerCase();
    var cleanPrice = String(priceText).trim();
    var path = location.pathname.toLowerCase();

    if (name === "brøyting") {
      setCardBadge("Brøyting", "Populær • " + cleanPrice);

      var heroTitle = document.querySelector(".hero-panel h2");
      if (heroTitle && /brøyting/i.test(heroTitle.textContent)) {
        heroTitle.textContent = "Brøyting " + lowerFirst(cleanPrice);
      }

      if (path.indexOf("broyting-pris-info") !== -1) {
        replaceVisibleText(/fra(?:\s|\u00a0)*350(?:\s|\u00a0)*kr/gi, function (match) {
          return /^[F]/.test(match) ? cleanPrice : lowerFirst(cleanPrice);
        });
      }
    }

    if (name === "dekkskift") {
      setCardBadge("Dekkskift", cleanPrice);

      var heroCopy = document.querySelector(".hero-panel p");
      if (heroCopy && /dekkskift/i.test(heroCopy.textContent)) {
        heroCopy.textContent = "Dekkskift " + cleanPrice + ". Velg tidspunkt, send bestilling og få bekreftelse på e-post.";
      }

      replaceVisibleText(/dekkskift til(?:\s|\u00a0)*450(?:\s|\u00a0)*kr/gi, "dekkskift til " + cleanPrice);

      if (path.indexOf("dekkskift-pris-info") !== -1) {
        replaceVisibleText(/450(?:\s|\u00a0)*kr/g, cleanPrice);
      }
    }
  }

  function shouldSyncBookablePrices() {
    var path = location.pathname.toLowerCase();
    return path === "/" || path === "/index.html" ||
      path.indexOf("broyting-pris-info") !== -1 ||
      path.indexOf("dekkskift-pris-info") !== -1;
  }

  function syncBookablePrices() {
    if (!shouldSyncBookablePrices() || typeof fetch !== "function") return;

    var apiBase = (window.CONFIG && window.CONFIG.API_BASE_URL) || SITE.apiBaseUrl;
    fetch(apiBase + "/services", { headers: { "Accept": "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("Kunne ikke hente tjenestepriser");
        return response.json();
      })
      .then(function (data) {
        var services = Array.isArray(data.services) ? data.services : [];
        services.forEach(function (service) {
          if (service && service.active !== false) {
            applyBookablePrice(service.name, service.priceText);
          }
        });
      })
      .catch(function () {
        // Behold fallback-prisene dersom API-et er midlertidig utilgjengelig.
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
    syncBookablePrices();
    ensureCanonical();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
