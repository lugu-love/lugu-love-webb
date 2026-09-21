/* 泸沽湖·心域 PWA shell cache. Dynamic media and generation APIs stay network-only. */
const CACHE_PREFIX = "lugu-pwa-shell-";
const CACHE_VERSION = "20260921-r1";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./space-bg.webp",
  "./earth.webp",
  "./seven-stars-media-resolver.js?v=20260918-r1",
  "./assets/js/lugu-music-coordinator.js?v=20260713-2",
  "./assets/icons/app-icon-v2-192.png",
  "./assets/icons/app-icon-v2-512.png",
  "./assets/icons/app-icon-v2-512-maskable.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-v2-64.png",
  "./assets/icons/lugu-logo.svg"
];

function isStaticAsset(url) {
  return CORE_ASSETS.some(function (assetPath) {
    var resolved;
    try {
      resolved = new URL(assetPath, self.registration.scope);
    } catch (e) {
      return false;
    }
    return resolved.pathname === url.pathname;
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(CORE_ASSETS.map(function (assetPath) {
        return fetch(assetPath, { cache: "reload" }).then(function (response) {
          if (response && response.ok) return cache.put(assetPath, response);
        }).catch(function () {});
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME) {
          return caches.delete(name);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  /* Never cache generation, generated MP4s, R2 media, or cross-origin traffic. */
  if (url.origin !== self.location.origin) return;
  if (/\/app-video\/|\/make-send(?:\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put("./index.html", copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match("./index.html", { ignoreSearch: true });
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      })
    );
  }
});
