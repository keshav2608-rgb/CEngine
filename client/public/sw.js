/*
 * CEngine service worker.
 *
 * - Offline: caches the app shell (pages, hashed build assets, icons) so the app opens
 *   without a connection. Message data never touches this cache: API and file requests go
 *   to another origin and are passed straight through.
 * - Updates: registered as /sw.js?v=<build id>, so each deploy installs a new worker. It
 *   waits until the page asks it to take over (the "Update available" prompt).
 * - Push: shows a notification for new messages. Messages are end-to-end encrypted, so the
 *   push only says who wrote, never what they wrote.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `cengine-shell-${VERSION}`;
const ASSET_CACHE = `cengine-assets-${VERSION}`;
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
  // Don't call skipWaiting here: the page decides when to switch (see 'message' below)
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('cengine-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match('/chat')) ||
      (await cache.match(OFFLINE_URL));
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only same-origin app files. API, uploads (encrypted blobs) and sockets pass through.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  } else if (/\.(png|svg|ico|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ------------------------------------------------------------------ push
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'CEngine', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CEngine';
  event.waitUntil(
    (async () => {
      // Skip the system notification if the app is open and focused on that chat
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.focused)) return;
      await self.registration.showNotification(title, {
        body: data.body || 'New message',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: data.roomId || 'cengine',
        renotify: true,
        data: { url: data.url || '/chat', roomId: data.roomId },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, roomId } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-room', roomId });
        return;
      }
      await self.clients.openWindow(url || '/chat');
    })()
  );
});
