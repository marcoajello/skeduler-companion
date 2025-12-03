/**
 * Skeduler Companion Service Worker
 * Caches app shell for offline use
 */

const CACHE_NAME = 'skeduler-companion-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install - cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - cache first for assets, network first for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // API calls - network only (need fresh data)
  if (url.hostname.includes('supabase')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // App assets - cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Return cached, but also update cache in background
        fetch(event.request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response);
            });
          }
        }).catch(() => {});
        return cached;
      }
      
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
