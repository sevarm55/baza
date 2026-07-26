/*
 * Service worker.
 *
 * Задача одна: чтобы экран сотрудника открылся, когда связи нет.
 * Без него офлайн-очередь бесполезна — мойщик просто увидит
 * страницу «нет интернета» и не сможет ничего записать.
 *
 * Стратегия:
 *   переходы    — сеть, при провале последняя удачная копия из кэша
 *   статика     — кэш, при промахе сеть
 *   всё прочее  — мимо (POST-запросы серверных действий не трогаем)
 */

const CACHE = 'bazis-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// при выходе кэш чистим: иначе следующий сотрудник на том же телефоне
// увидит офлайн чужую смену
self.addEventListener('message', (event) => {
  if (event.data === 'bazis:signout') {
    event.waitUntil(caches.delete(CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = (await caches.match(request)) || (await caches.match('/work'));
          if (cached) return cached;
          throw new Error('offline');
        }
      })(),
    );
    return;
  }

  // RSC-полезная нагрузка меняется каждый запрос — кэшировать её вредно
  if (url.searchParams.has('_rsc')) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
