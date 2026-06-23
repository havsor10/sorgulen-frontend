// Velkomstoverlay + anonym besøkssporing for Sørgulen Industriservice.
//
// Overlayet vises første gang en besøkende kommer inn på en av sidene.
// Når besøkende klikker "Fortsett":
//   1) Overlayet fjernes og huskes i localStorage (vises ikke igjen på enheten)
//   2) Vi registrerer ETT besøk i backend – helt anonymt.
//
// Personvern: vi lagrer ingen persondata. "visitorId" er en tilfeldig generert
// streng som kun brukes til å skille unike enheter fra gjentakende besøk.
// Ingen IP, ingen navn, ingen cookies. Derfor kreves heller ikke cookie-banner.

(function () {
  var API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";

  function getVisitorId() {
    try {
      var id = localStorage.getItem("sorgulen_visitor_id");
      if (!id) {
        id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("sorgulen_visitor_id", id);
      }
      return id;
    } catch (e) {
      return "";
    }
  }

  var visitStart = Date.now();

  function registerVisit() {
    try {
      var body = JSON.stringify({ visitorId: getVisitorId() });
      fetch(API_BASE + "/stats/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  function sendDuration() {
    try {
      var durationSec = Math.round((Date.now() - visitStart) / 1000);
      if (durationSec < 1 || durationSec > 7200) return;
      var payload = JSON.stringify({ visitorId: getVisitorId(), durationSec: durationSec });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(API_BASE + "/stats/visit", blob);
      } else {
        fetch(API_BASE + "/stats/visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {}
  }

  var durationSent = false;
  function onLeave() {
    if (durationSent) return;
    durationSent = true;
    sendDuration();
  }
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") onLeave();
  });

  if (localStorage.getItem("sorgulen_welcome_shown") === "1") return;

  function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.id = "maint-overlay";
    overlay.innerHTML =
      '<div id="maint-card">' +
        "<h1>Velkommen til Sørgulen Industriservice</h1>" +
        "<p>Nettsiden er nå klar til bruk. Vi gleder oss til å hjelpe Flor\u00f8\u2011folket med små og store oppdrag.</p>" +
        '<div id="maint-actions">' +
          '<button id="welcomeContinue" class="cta">Fortsett</button>' +
        "</div>" +
      "</div>";
    return overlay;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = buildOverlay();
    document.body.appendChild(overlay);
  });

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "welcomeContinue") {
      var overlay = document.getElementById("maint-overlay");
      if (overlay) overlay.remove();
      try { localStorage.setItem("sorgulen_welcome_shown", "1"); } catch (er) {}
      visitStart = Date.now();
      registerVisit();
    }
  });
})();
