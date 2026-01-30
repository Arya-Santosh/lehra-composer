const CACHE_NAME = 'lehra-v3.3'; // Increment version to force update

// List EVERY file you want available offline immediately
const PRE_CACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './library.js',
  './manifest.json',
  // ADD YOUR AUDIO FILES HERE:
  './assets/audio/tanpura_drone.mp3',
  './assets/audio/teental_kirwani_madhya_santoor.mp3',
  './assets/audio/teental_yaman_madhya_santoor.mp3',
  './assets/audio/teental_charukeshi_madhya_santoor.mp3'
  // Add every other .mp3 file you have in your library
];

// 1. INSTALL: Download everything NOW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Pre-caching all audio and assets...');
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
  // Force the new service worker to take over immediately
  self.skipWaiting();
});

// 2. ACTIVATE: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. FETCH: Serve from cache first (Instant playback)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

