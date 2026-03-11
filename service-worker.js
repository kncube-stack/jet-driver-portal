self.addEventListener("push", event => {
  event.waitUntil((async () => {
    try {
      if (!event.data) return;
      const { title, body, url, tag } = event.data.json();
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: tag || "jet-portal",
        data: { url: url || "/" }
      });
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
