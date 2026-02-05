/*
  Kompatibilitetsfil.
  Noen eldre versjoner av booking.html refererer til "./booking.js".
  Denne filen laster inn den faktiske implementasjonen i ./js/booking.js.
*/

(function loadRealBookingScript() {
  try {
    const existing = document.querySelector('script[data-booking-real="1"]');
    if (existing) return;

    const s = document.createElement('script');
    s.src = './js/booking.js';
    s.defer = true;
    s.setAttribute('data-booking-real', '1');
    document.head.appendChild(s);
  } catch (e) {
    console.error('Klarte ikke å laste booking-script:', e);
  }
})();
