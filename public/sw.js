/* EasyNotes Service Worker — Offline-App-Shell + Cache */
'use strict';

const CACHE = 'easynotes-v10';

// App-Shell (statisch, wird offline gecacht)
const SHELL = [
  '/',
  '/index.html',
  '/style.css?v=10',
  '/core.js?v=10',
  '/app.js?v=10',
  '/tree.js?v=10',
  '/editor.js?v=10',
  '/ai.js?v=10',
  '/settings.js?v=10',
  '/marked.min.js?v=10',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png'
];

// Install: Shell vorcachen
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Aktivieren: alte Caches aufräumen
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first für App-Shell, network-first für API/Notizen
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API-/Datei-Anfragen: nicht offline zwischenspeichern (frische Daten)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) {
    return;
  }

  // Navigation (Seitenaufrufe): Cache-first mit Netz-Fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then((cached) => {
        return cached || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        });
      })
    );
    return;
  }

  // Statische Ressourcen: Cache-first, dann Netz + cache
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
