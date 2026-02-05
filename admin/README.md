# Admin-side (frontend)

Denne admin-siden er en ferdig UI for å administrere bookinger.

## URL

- Netlify: `/admin/` (dvs. `https://<ditt-domene>/admin/`)

## Hvordan den kobler til backend

Admin-siden bruker samme mekanisme som booking-siden:

- Hvis `window.API_BASE_URL` er satt før `admin.js` lastes, brukes den.
- Ellers brukes tom streng (`""`) som passer når frontend og backend er på samme domene.

Eksempel (kan legges i `admin/index.html` rett før `admin.js`):

```html
<script>window.API_BASE_URL = "https://sorgulen-backend-2.onrender.com";</script>
```

## Admin-nøkkel (midlertidig)

UI lar deg lagre en "Admin Key" som sendes som header `x-admin-key`.

**Viktig:** Dette er ikke ekte sikkerhet på en statisk side.
Endelig sikkerhet må løses i backend (auth/roller), ellers kan hvem som helst som finner URL-en kalle admin-endepunktene.

## Backend-kontrakt (det UI forventer)

UI prøver følgende endepunkter:

- `GET /api/health` (finnes allerede)
- `GET /api/admin/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&q=...&status=...`
  - Returnerer enten en liste (array) eller `{ bookings: [...] }`
- `PATCH /api/admin/bookings/:id` body: `{ status: "confirmed"|"cancelled"|... }`
- `DELETE /api/admin/bookings/:id`

Hvis admin-endepunktene ikke finnes enda, vil UI vise en forklaring i stedet for å feile.
