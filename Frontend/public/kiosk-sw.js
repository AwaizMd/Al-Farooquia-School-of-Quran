// Service worker for the attendance kiosk: keeps the app's own files available so it
// opens when the network is down and can say so. It never touches the API: attendance
// is only ever decided by the server, so no answer from it is cached or replayed.
const CACHE = 'mms-kiosk-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  // Network first, so an update reaches the kiosk as soon as it can; the cached copy is only for outages.
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request)
      if (res.ok) (await caches.open(CACHE)).put(event.request, res.clone())
      return res
    } catch (err) {
      const hit = await caches.match(event.request, { ignoreSearch: url.pathname === '/kiosk.html' })
      if (hit) return hit
      throw err
    }
  })())
})
