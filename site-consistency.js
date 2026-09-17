// Felles offentlig kontaktinformasjon for sorgulen.no.
// Endre kontaktdata her dersom telefon, e-post eller adresse endres senere.
(function () {
  "use strict";

  var SITE = Object.freeze({
    phoneDisplay: "407 30 187",
    phoneHref: "+4740730187",
    email: "sor.industri@gmail.com",
    address: "Kleiva 91 B, 6900 Florø",
    bookingWindow: "09:00–20:00"
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

  function normalizeText(root) {
    if (!root || !document.createTreeWalker) return;

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

    nodes.forEach(function (textNode) {
      var next = textNode.nodeValue;
      replacements.forEach(function (item) {
        next = next.replace(item.pattern, item.value);
      });
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
    ensureCanonical();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
