self.addEventListener("push", event => {
  event.waitUntil((async () => {
    try {
      if (!event.data) return;
      const { title, body, url, tag, badgeCount } = event.data.json();
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        tag: tag || "jet-portal",
        data: { url: url || "/" }
      });
      // Set numeric badge on app icon (Android PWA, desktop PWA, iOS 16.4+)
      if (typeof self.navigator?.setAppBadge === "function") {
        const count = typeof badgeCount === "number" && badgeCount > 0 ? badgeCount : 1;
        await self.navigator.setAppBadge(count);
      }
      // Notify any open app windows so they can refresh their notification count
      const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
      for (const c of windowClients) {
        c.postMessage({ type: "push-received", tag: tag || null });
      }
    } catch (e) {
      // Malformed push payload — fail silently
    }
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
