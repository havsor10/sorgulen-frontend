/* Isolated decorative controller; never touches booking, app state or APIs. */
(() => {
  'use strict';
  const body = document.body;
  const hero = document.querySelector('.christmas-preview .premium-hero');
  const toggle = document.querySelector('.christmas-motion-toggle');
  if (!body.classList.contains('christmas-preview') || !hero || !toggle) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let paused = reduced.matches;
  const resetParallax = () => {
    hero.style.removeProperty('--christmas-x');
    hero.style.removeProperty('--christmas-y');
  };
  const update = () => {
    const running = !paused && !reduced.matches;
    body.classList.toggle('christmas-motion', running);
    toggle.hidden = false;
    toggle.disabled = reduced.matches;
    toggle.textContent = reduced.matches ? 'Julebevegelse deaktivert' : running ? 'Sett juleeffekter på pause' : 'Start juleeffekter';
    toggle.setAttribute('aria-pressed', String(!running));
    if (!running) resetParallax();
  };
  toggle.addEventListener('click', () => {paused = !paused; update();});
  const preferenceChanged = () => {paused = reduced.matches; update();};
  if (reduced.addEventListener) reduced.addEventListener('change', preferenceChanged);
  else if (reduced.addListener) reduced.addListener(preferenceChanged);
  document.addEventListener('visibilitychange', () => {
    body.classList.toggle('christmas-hidden', document.hidden);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => body.classList.toggle('christmas-offscreen', !entry.isIntersecting)).observe(hero);
  }
  hero.addEventListener('pointermove', event => {
    if (paused || reduced.matches || !pointer.matches) return;
    const rect = hero.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(-8, Math.min(8, ((event.clientX - rect.left) / rect.width - .5) * 16));
    const y = Math.max(-6, Math.min(6, ((event.clientY - rect.top) / rect.height - .5) * 12));
    hero.style.setProperty('--christmas-x', x.toFixed(2) + 'px');
    hero.style.setProperty('--christmas-y', y.toFixed(2) + 'px');
  }, {passive:true});
  hero.addEventListener('pointerleave', resetParallax);
  update();
})();
