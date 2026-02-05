# Testprotokoll – booking/admin (Netlify + Render)

## 0) Forutsetninger
- Netlify deploy av denne frontenden.
- Render backend er oppe og svarer.
- I Netlify: sett miljøvariabel `BACKEND_BASE_URL` til Render-URL (uten trailing slash), f.eks:
  - `https://sorgulen-backend-2.onrender.com`

---

## 1) Smoke test – API-proxy (i nettleser)
Åpne booking-siden og kjør disse i DevTools Console:

1. **Tjenester**
   - Kommando:
     - `fetch('/api/services').then(r => ({status:r.status, ct:r.headers.get('content-type')})).then(console.log)`
   - Forventet:
     - `status: 200` og content-type inkluderer `application/json`.
   - Feilbilder:
     - `404` => `netlify.toml` mangler/ikke deployet.
     - `502/504` => Render nede/feil URL i BACKEND_BASE_URL.

2. **Availability**
   - Kommando (erstatt id + dato):
     - `fetch('/api/availability?serviceId=TEST&date=2026-02-03').then(r=>r.status).then(console.log)`
   - Forventet:
     - `200` (selv om payload kan være tom).

---

## 2) Funksjonell test – bookingflyt (UI)
1. Gå til `/booking.html`.
2. Verifiser at tjenester vises (radio-valg).
   - Forventet: minst "Dekkskift" og/eller "Brøyting" dersom de finnes i DB.
3. Velg tjeneste.
4. Velg dato.
5. Verifiser at ledige tider lastes.
   - Forventet: kort med "LEDIG".
6. Velg en ledig tid.
   - Forventet: skjema vises.
7. Fyll inn navn/telefon/e-post og send.
   - Forventet: suksess-seksjon vises.

**Statuskoder/feil**
- 409 fra backend (konflikt): forventet feilmelding til bruker.
- 400 (validering): forventet feilmelding.
- 500: forventet feilmelding.

---

## 3) Funksjonell test – admin
1. Gå til `/admin/`.
2. La "API base URL" stå tom.
3. Klikk "Test API health".
   - Forventet: OK (forutsatt backend har health-endepunkt eller at admin peker på eksisterende endpoint).
4. Hent bestillinger / tjenester (avhengig av UI).

---

## 4) Produksjonsverifisering (Netlify + Render)
- Netlify:
  - Sjekk Deploy log: at `netlify.toml` og `netlify/functions/api.js` er med.
  - Under Site settings → Functions: se at function "api" er deployet.
- Render:
  - Sjekk logs ved booking: at request kommer inn på `/api/services`, `/api/availability`, `/api/bookings`.

