# Release notes – Booking/Admin (Netlify)

## Bakgrunn
Booking-siden lastet HTML/CSS, men tjenesteliste og bookingflyt fungerte ikke i produksjon.

## Rotårsak
1. Frontend forsøkte å kalle backend direkte på Render fra nettleseren, som gav CORS/"Failed to fetch" og/eller 404 når API_BASE ble tom.
2. Flere parallelle JS-entrypoints (root `booking.js` som injectet `/js/booking.js`) gjorde feilsøking unødvendig kompleks.

## Endringer i denne leveransen
- Innført Netlify Functions-proxy for alle `/api/*` kall (server-side forward til Render) via:
  - `netlify.toml`
  - `netlify/functions/api.js`
- Standardisert booking-siden til å laste **én** scriptfil: `./js/booking.js`.
- Oppdatert booking-logikk:
  - Prod bruker same-origin `/api/...` (proxy) som default.
  - Bedre feilhåndtering (HTTP-status/tekst, tydelig banner).
  - Støtte for både `{ services: [...] }` og array i `/api/services` respons.
- Oppdatert admin-side:
  - Default API base URL = tom streng (same origin via proxy).
  - Hjelpetekst oppdatert.

## Antakelser
- Render-backend eksponerer endepunkter under `/api/*`.
- Netlify site har Functions aktivert.
- BACKEND_BASE_URL kan settes i Netlify miljøvariabler (anbefalt).
