/**
 * Minimal service worker. For navigation requests, we must await event.preloadResponse
 * inside respondWith() so the navigation preload promise settles and the browser
 * does not cancel it (avoids "preloadResponse was cancelled" warning).
 */
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      const preload = await event.preloadResponse;
      return preload ?? fetch(event.request);
    })()
  );
});
