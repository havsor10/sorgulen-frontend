// js/firebase-config.js
// Sett inn Firebase Web App config (Project settings -> Your apps -> Config).
// Viktig: Dette er kun for klient-innlogging (Auth). Backend verifiserer ID-token med service account.
//
// Eksempel:
// window.FB_CONFIG = { apiKey: "...", authDomain: "...", projectId: "..." };
window.FB_CONFIG = window.FB_CONFIG || {
  apiKey: "SETT_INN_API_KEY",
  authDomain: "SETT_INN_AUTH_DOMAIN",
  projectId: "SETT_INN_PROJECT_ID",
};