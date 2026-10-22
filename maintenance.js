// Offentlig bootstrap + anonym besøkssporing for Sørgulen Industriservice.
//
// Filen lastes på offentlige sider og starter site-consistency.js.
// Det finnes ikke lenger noe velkomstoverlay: besøkende skal gå rett inn på nettsiden.

(function () {
  try {
    var ownSrc = document.currentScript && document.currentScript.src;
    if (ownSrc && !document.querySelector('script[data-sorgulen-site-consistency]')) {
      var consistencyScript = document.createElement("script");
      consistencyScript.src = ownSrc.replace(/maintenance\.js(?:\?.*)?$/, "site-consistency.js");
      consistencyScript.defer = true;
      consistencyScript.setAttribute("data-sorgulen-site-consistency", "true");
      document.head.appendChild(consistencyScript);
    }
  } catch (e) {}

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
      fetch(API_BASE + "/stats/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId() }),
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerVisit, { once: true });
  } else {
    registerVisit();
  }
})();
