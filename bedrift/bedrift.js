(() => {
  "use strict";

  const menuButton = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  function setMenu(open) {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", String(open));
    mobileMenu.hidden = !open;
  }

  menuButton?.addEventListener("click", () => {
    setMenu(menuButton.getAttribute("aria-expanded") !== "true");
  });

  mobileMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("click", (event) => {
    if (!mobileMenu || mobileMenu.hidden || !menuButton) return;
    if (mobileMenu.contains(event.target) || menuButton.contains(event.target)) return;
    setMenu(false);
  });

  const sections = [...document.querySelectorAll("main section[id]")];
  const navLinks = [...document.querySelectorAll('.site-header a[href^="#"]')];

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible?.target?.id) return;
      navLinks.forEach((link) => {
        const active = link.getAttribute("href") === "#" + visible.target.id;
        link.toggleAttribute("aria-current", active);
      });
    }, { rootMargin: "-25% 0px -60% 0px", threshold: [0.1, 0.35, 0.6] });

    sections.forEach((section) => observer.observe(section));
  }
})();