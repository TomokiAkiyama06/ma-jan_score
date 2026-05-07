const CACHE = 'mahjong-v1'
const STATIC = ['/login', '/signup', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // APIリクエストはネットワーク優先、失敗時はオフラインメッセージ
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // 静的アセットはキャッシュ優先
  if (request.destination === 'image' || request.destination === 'font') {
    e.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
        return res
      }))
    )
    return
  }

  // ナビゲーションはネットワーク優先（オフライン時はキャッシュ）
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/login') ?? Response.error())
    )
  }
})
