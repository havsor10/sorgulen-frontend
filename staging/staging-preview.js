(() => {
  "use strict";
  function paint() {
    if (!document.body) return;
    const banner = document.createElement("aside");
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-label", "Testmiljø");
    banner.style.cssText = "position:sticky;top:0;z-index:2147483647;box-sizing:border-box;width:100%;padding:11px 18px;background:#8f2c15;color:#fff;text-align:center;font:700 14px/1.5 system-ui,sans-serif;border-bottom:2px solid #ffc966;";
    banner.textContent = "TESTMILJØ – FØREBELS BERRE VISNING. Bestilling, admin, betaling og utsending er sperra til eigen testdatabase er klar.";
    document.body.insertBefore(banner, document.body.firstChild);
    document.title = "[TEST] " + document.title;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint, { once: true });
  else paint();
})();
