const CACHE_NAME = "final-exam-practice-v3";
const BASE_PATH = new URL(self.registration.scope).pathname;
const CORE_ASSETS = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icon.svg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" || url.pathname === BASE_PATH || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok && shouldCache(url)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => Response.error());
    }),
  );
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() =>
      caches
        .match(request)
        .then((fallback) => fallback || caches.match(`${BASE_PATH}index.html`))
        .then((fallback) => fallback || caches.match(BASE_PATH))
        .then((fallback) => fallback || Response.error()),
    );
}

function shouldCache(url) {
  return /\.(js|css|json|svg|png|webp|ico)$/i.test(url.pathname) || url.pathname.endsWith("/");
}
