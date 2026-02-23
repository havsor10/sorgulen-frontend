// js/firebase-config.js
// Sett inn Firebase Web App config (Project settings -> Your apps -> Config).
// Viktig: Dette er kun for klient-innlogging (Auth). Backend verifiserer ID-token med service account.
//
// Eksempel:
// window.FB_CONFIG = { apiKey: "...", authDomain: "...", projectId: "..." };
window.FB_CONFIG = window.FB_CONFIG || {
  apiKey: "AIzaSyBgynh-WizjPfeZBWFOwpu_Sv6tWeM1Vqo",
  authDomain:  "sorgulen-industriservice.firebaseapp.com",
  projectId: "sorgulen-industriservice",
};