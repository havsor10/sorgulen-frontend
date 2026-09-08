(() => {
  "use strict";

  const API_BASE = (window.CONFIG && window.CONFIG.API_BASE_URL) || "https://sorgulen-backend-2.onrender.com/api";
  const KEY_STORAGE = "sorgulen_admin_key";
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const statusTitle = document.getElementById("pushStatusTitle");
  const statusText = document.getElementById("pushStatusText");
  const statusBadge = document.getElementById("pushStatusBadge");
  const message = document.getElementById("pushMessage");
  const installHelp = document.getElementById("installHelp");
  const enableBtn = document.getElementById("enablePushBtn");
  const testBtn = document.getElementById("testPushBtn");
  const disableBtn = document.getElementById("disablePushBtn");
  const refreshBtn = document.getElementById("refreshPushBtn");
  const devicesNode = document.getElementById("pushDevices");
  const prefInputs = [...document.querySelectorAll("[data-push-pref]")];

  let config = null;
  let registration = null;
  let browserSubscription = null;
  let backendSubscription = null;
  let busy = false;

  function adminKey() { return (localStorage.getItem(KEY_STORAGE) || "").trim(); }

  function setMessage(text, kind = "") {
    message.textContent = text || "";
    message.className = `status-message${kind ? ` ${kind}` : ""}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}/admin/push${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": adminKey(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(KEY_STORAGE);
      window.location.href = "login.html";
      throw new Error("Logg inn på nytt");
    }
    if (!response.ok) throw new Error(data.error || `Feil ${response.status}`);
    return data;
  }

  function base64UrlToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  }

  async function ensureRegistration() {
    if (!supported) throw new Error("Denne nettleseren støtter ikke push-varsler");
    if (!registration) {
      registration = await navigator.serviceWorker.register("push-sw.js", { scope: "./" });
      await navigator.serviceWorker.ready;
    }
    return registration;
  }

  function subscriptionPayload(subscription) {
    const json = subscription.toJSON ? subscription.toJSON() : subscription;
    return {
      endpoint: json.endpoint,
      expirationTime: json.expirationTime || null,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    };
  }

  function currentPreferences() {
    return Object.fromEntries(prefInputs.map((input) => [input.dataset.pushPref, input.checked]));
  }

  function applyPreferences(preferences = {}) {
    prefInputs.forEach((input) => {
      const key = input.dataset.pushPref;
      if (typeof preferences[key] === "boolean") input.checked = preferences[key];
      input.disabled = !browserSubscription;
    });
  }

  function setStatusBadge(text, mode = "") {
    statusBadge.textContent = text;
    statusBadge.className = `push-status-badge${mode ? ` ${mode}` : ""}`;
  }

  function renderState() {
    installHelp.hidden = !(isIOS && !isStandalone);

    // iOS viser Web Push for webapper som er lagt til på Hjem-skjermen. I en
    // vanlig Safari-fane kan PushManager mangle helt, så dette steget må vises
    // før vi konkluderer med at nettleseren ikke støtter push.
    if (isIOS && !isStandalone) {
      statusTitle.textContent = "Legg admin på Hjem-skjermen";
      statusText.textContent = "iPhone gir push til installerte webapper. Følg de tre stegene under.";
      setStatusBadge("1 steg igjen", "is-warn");
      enableBtn.textContent = "Vis hvordan eg gjør det";
      enableBtn.disabled = false;
      testBtn.disabled = true;
      disableBtn.hidden = true;
      applyPreferences({});
      return;
    }

    if (!supported) {
      statusTitle.textContent = "Push støttes ikke her";
      statusText.textContent = "Bruk en nyere nettleser på iPhone, iPad, Mac, Android eller PC.";
      setStatusBadge("Ikke støttet", "is-warn");
      enableBtn.disabled = true;
      testBtn.disabled = true;
      disableBtn.hidden = true;
      applyPreferences({});
      return;
    }

    const permission = Notification.permission;

    if (!config?.configured || !config?.vapidPublicKey) {
      statusTitle.textContent = "Backend mangler push-konfigurasjon";
      statusText.textContent = "Varslingssiden er klar, men servernøklene er ikke aktive ennå.";
      setStatusBadge("Ikke klar", "is-warn");
      enableBtn.disabled = true;
      testBtn.disabled = true;
      disableBtn.hidden = true;
      applyPreferences({});
      return;
    }

    if (permission === "denied") {
      statusTitle.textContent = "Varsler er blokkert på iPhone";
      statusText.textContent = "Åpne Innstillinger → Varslinger → Sørgulen Admin og slå på varsler.";
      setStatusBadge("Blokkert", "is-warn");
      enableBtn.textContent = "Varsler blokkert";
      enableBtn.disabled = true;
      testBtn.disabled = true;
      disableBtn.hidden = !browserSubscription;
      applyPreferences(backendSubscription?.preferences || config.defaultPreferences);
      return;
    }

    if (browserSubscription && backendSubscription?.active !== false) {
      statusTitle.textContent = "Varslinger er på";
      statusText.textContent = "Denne enheten kan motta Sørgulen-varsler selv når admin er lukket.";
      setStatusBadge("På", "is-on");
      enableBtn.textContent = "Varslinger er aktivert";
      enableBtn.disabled = true;
      testBtn.disabled = false;
      disableBtn.hidden = false;
      applyPreferences(backendSubscription?.preferences || config.defaultPreferences);
      return;
    }

    statusTitle.textContent = "Slå på varslinger på denne enheten";
    statusText.textContent = "Du bestemmer selv hvilke hendelser som får sende push.";
    setStatusBadge(permission === "granted" ? "Klar" : "Av");
    enableBtn.textContent = "Slå på varsler";
    enableBtn.disabled = false;
    testBtn.disabled = true;
    disableBtn.hidden = true;
    applyPreferences(config?.defaultPreferences || {});
  }

  async function syncExistingSubscription() {
    if (!supported) return;
    const reg = await ensureRegistration();
    browserSubscription = await reg.pushManager.getSubscription();
    if (!browserSubscription) {
      backendSubscription = null;
      return;
    }
    const payload = subscriptionPayload(browserSubscription);
    const status = await api("/subscription/status", {
      method: "POST",
      body: JSON.stringify({ endpoint: payload.endpoint }),
    });
    backendSubscription = status.subscription;
    if (!status.subscribed && Notification.permission === "granted" && config?.configured) {
      const result = await api("/subscription", {
        method: "POST",
        body: JSON.stringify({ subscription: payload, deviceLabel: isIOS ? "iPhone" : "Nettleser" }),
      });
      backendSubscription = result.subscription;
    }
  }

  async function enablePush() {
    if (busy) return;
    if (isIOS && !isStandalone) {
      installHelp.hidden = false;
      installHelp.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    busy = true;
    enableBtn.disabled = true;
    setMessage("");
    try {
      const reg = await ensureRegistration();
      let permission = Notification.permission;
      if (permission !== "granted") permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("iPhone ga ikke tillatelse til varsler");

      browserSubscription = await reg.pushManager.getSubscription();
      if (!browserSubscription) {
        browserSubscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
        });
      }
      const result = await api("/subscription", {
        method: "POST",
        body: JSON.stringify({
          subscription: subscriptionPayload(browserSubscription),
          deviceLabel: isIOS ? "iPhone" : "Nettleser",
          preferences: currentPreferences(),
        }),
      });
      backendSubscription = result.subscription;
      setMessage("Varslinger er aktivert på denne enheten.", "success");
      await loadDevices();
    } catch (error) {
      setMessage(error.message || "Kunne ikke slå på varslinger", "error");
    } finally {
      busy = false;
      renderState();
    }
  }

  async function disablePush() {
    if (busy || !browserSubscription) return;
    busy = true;
    setMessage("");
    try {
      const payload = subscriptionPayload(browserSubscription);
      try {
        await api("/subscription", { method: "DELETE", body: JSON.stringify({ endpoint: payload.endpoint }) });
      } finally {
        await browserSubscription.unsubscribe();
      }
      browserSubscription = null;
      backendSubscription = null;
      setMessage("Varslinger er slått av på denne enheten.", "success");
      await loadDevices();
    } catch (error) {
      setMessage(error.message || "Kunne ikke slå av varslinger", "error");
    } finally {
      busy = false;
      renderState();
    }
  }

  async function sendTest() {
    if (busy || !browserSubscription) return;
    busy = true;
    testBtn.disabled = true;
    setMessage("Sender testvarsel…");
    try {
      await api("/test", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscriptionPayload(browserSubscription).endpoint }),
      });
      setMessage("Testvarsel sendt. Det skal dukke opp som et vanlig iPhone-varsel.", "success");
    } catch (error) {
      setMessage(error.message || "Testvarsel feilet", "error");
    } finally {
      busy = false;
      renderState();
    }
  }

  async function savePreferences() {
    if (!browserSubscription || busy) return;
    busy = true;
    prefInputs.forEach((input) => { input.disabled = true; });
    try {
      const result = await api("/subscription/preferences", {
        method: "PATCH",
        body: JSON.stringify({ endpoint: subscriptionPayload(browserSubscription).endpoint, preferences: currentPreferences() }),
      });
      backendSubscription = result.subscription;
      setMessage("Varslingsvalg lagret.", "success");
    } catch (error) {
      setMessage(error.message || "Kunne ikke lagre varslingsvalg", "error");
      applyPreferences(backendSubscription?.preferences || config?.defaultPreferences || {});
    } finally {
      busy = false;
      renderState();
    }
  }

  function fmtDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  async function loadDevices() {
    try {
      const data = await api("/devices");
      devicesNode.replaceChildren();
      if (!data.devices?.length) {
        const empty = document.createElement("p");
        empty.className = "push-empty";
        empty.textContent = "Ingen aktive enheter ennå.";
        devicesNode.appendChild(empty);
        return;
      }
      data.devices.forEach((device) => {
        const row = document.createElement("div");
        row.className = "push-device";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = device.deviceLabel || "Enhet";
        const small = document.createElement("small");
        small.textContent = device.lastSuccessAt ? `Sist mottatt: ${fmtDate(device.lastSuccessAt)}` : `Aktiv siden ${fmtDate(device.createdAt)}`;
        copy.append(title, small);
        const state = document.createElement("span");
        state.className = "push-device-state";
        state.textContent = "Aktiv";
        row.append(copy, state);
        devicesNode.appendChild(row);
      });
    } catch (error) {
      devicesNode.textContent = error.message || "Kunne ikke hente enheter";
    }
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    setMessage("");
    try {
      config = await api("/config");
      if (supported) await syncExistingSubscription();
      await loadDevices();
    } catch (error) {
      setMessage(error.message || "Kunne ikke hente varslingsstatus", "error");
    } finally {
      busy = false;
      renderState();
    }
  }

  enableBtn.addEventListener("click", enablePush);
  disableBtn.addEventListener("click", disablePush);
  testBtn.addEventListener("click", sendTest);
  refreshBtn.addEventListener("click", refresh);
  prefInputs.forEach((input) => input.addEventListener("change", savePreferences));

  refresh();
})();