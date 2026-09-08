"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function safeAdminUrl(value) {
  try {
    const url = new URL(String(value || "/admin/hjem.html"), self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/admin/")) return new URL("/admin/hjem.html", self.location.origin).toString();
    return url.toString();
  } catch (_) {
    return new URL("/admin/hjem.html", self.location.origin).toString();
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { title: "Sørgulen Admin", body: event.data ? event.data.text() : "Nytt varsel" }; }

  const title = String(data.title || "Sørgulen Admin").slice(0, 90);
  const body = String(data.body || "").slice(0, 220);
  const tag = String(data.tag || data.category || "sorgulen-admin").slice(0, 80);
  const targetUrl = safeAdminUrl(data.url);

  event.waitUntil((async () => {
    if (typeof self.registration.setAppBadge === "function") {
      try { await self.registration.setAppBadge(Math.max(1, Number(data.badgeCount) || 1)); } catch (_) { /* badge er best effort */ }
    }
    await self.registration.showNotification(title, {
      body,
      icon: "/assets/logo.png",
      badge: "/assets/logo.png",
      tag,
      renotify: true,
      data: { url: targetUrl },
      timestamp: Number(data.timestamp) || Date.now(),
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeAdminUrl(event.notification?.data?.url);
  event.waitUntil((async () => {
    if (typeof self.registration.clearAppBadge === "function") {
      try { await self.registration.clearAppBadge(); } catch (_) { /* best effort */ }
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOrigin = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch (_) { return false; }
    });
    if (sameOrigin) {
      try { if (typeof sameOrigin.navigate === "function") await sameOrigin.navigate(targetUrl); } catch (_) { /* fokuser likevel */ }
      return sameOrigin.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
