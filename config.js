// Firebase configuration for Sørgulen Industriservice
// NOTE: These values should match your Firebase project. If you have
// customised apiKey, authDomain or projectId, update them here. Both the
// takstameter (cloud app) and the public website share the same
// configuration and APP_ACCESS_TOKEN so that they read and write to the
// same Firestore document. See cloud-norsk/config.js for details.

window.FB_CONFIG = {
  apiKey: "AIzaSyBgynh-WizjPfeZBWFOwpu_Sv6tWeM1Vqo",
  authDomain: "sorgulen-industriservice.firebaseapp.com",
  projectId: "sorgulen-industriservice"
};

// Use the same token across apps. Change this if you want separate
// environments (e.g. staging vs production).
window.APP_ACCESS_TOKEN = "sorgulen-main";

// BOOKING API (Render backend)
window.CONFIG = {
  API_BASE_URL: "https://sorgulen-backend-2.onrender.com/api"
};