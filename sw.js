/* Anchor service worker — offline shell + notification handling (NFR-2, NFR-4).
   Classic (non-module) worker for broad support. */

const CACHE = 'anchor-v1';
const ASSETS = [
  '.', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg',
  'js/app.js', 'js/storage.js', 'js/streak.js', 'js/dates.js', 'js/notifications.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs; keep the cache fresh in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// --- Notifications --------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const notif = event.notification;
  notif.close();

  if (action === 'snooze') {
    event.waitUntil(snooze(notif));
    return;
  }
  // Default tap or "Check in" action → open/focus the app.
  event.waitUntil(openApp(action === 'checkin' ? 'checkin' : null));
});

// One snooze max (default +60 min). Enforced by refusing a second snoozed
// notification while one is still pending.
async function snooze(notif) {
  if (!('TimestampTrigger' in self)) return;
  const pending = await getPending();
  if (pending.some((n) => n.tag && n.tag.startsWith('anchor:snoozed'))) return;

  const when = Date.now() + 60 * 60 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  await self.registration.showNotification(notif.title, {
    body: notif.body,
    tag: `anchor:snoozed:${today}`,
    requireInteraction: Boolean(notif.data && notif.data.urgent),
    icon: 'icons/icon.svg',
    badge: 'icons/icon.svg',
    data: notif.data,
    showTrigger: new TimestampTrigger(when),
    actions: [{ action: 'checkin', title: 'Check in' }],
  });
}

async function getPending() {
  try {
    return await self.registration.getNotifications({ includeTriggered: true });
  } catch {
    return [];
  }
}

async function openApp(messageType) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  let client = all.find((c) => 'focus' in c);
  if (client) {
    await client.focus();
  } else {
    client = await self.clients.openWindow('.');
  }
  if (client && messageType) client.postMessage({ type: messageType });
}
