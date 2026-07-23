// VETRA Service Worker — PWA
// v5: renova o cache para trazer as correções de navegação/telas (força atualização)
const CACHE_NAME = 'vetra-v26';

// ── NOTIFICAÇÕES PUSH ──
// IMPORTANTE (iOS): todo push DEVE exibir notificação visível dentro de event.waitUntil,
// senão o iOS cancela a inscrição após 3 pushes "silenciosos".
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const tasks = [
    self.registration.showNotification(data.title || 'VETRA', {
      body: data.body || 'Nova mensagem recebida',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'meucrm',
      data: { phone: data.phone || null },
    })
  ];
  // Número de não lidas no ícone do app (iOS 16.4+ / Android)
  if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) {
    tasks.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks));
});

// Clique na notificação: foca o app (abrindo a conversa) ou abre uma janela nova
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const phone = event.notification.data && event.notification.data.phone;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'open-chat', phone }); return c.focus(); }
      }
      return clients.openWindow(phone ? '/?phone=' + encodeURIComponent(phone) : '/');
    })
  );
});

// Recursos estáticos para cache offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instala e faz cache dos recursos estáticos
// Cacheia um a um: se um arquivo faltar (404), a instalação NÃO aborta.
// (cache.addAll falha em bloco — era isso que impedia o SW de ativar e travava o push)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(STATIC_ASSETS.map(u => cache.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

// Limpa caches antigos ao ativar
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Estratégia: Network First para chamadas de API, Cache First para estáticos
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Chamadas para o backend (Railway/Supabase/Meta) — o service worker NÃO
  // intercepta: o navegador faz a chamada diretamente. (Interceptar aqui fazia
  // um service worker travado derrubar TODAS as chamadas com "Failed to fetch".)
  if (
    url.hostname.includes('railway.app') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('graph.facebook.com') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // sem respondWith = requisição segue o caminho normal do navegador
  }

  // Navegação (index.html): Network First — garante que atualizações do CRM cheguem
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Recursos estáticos: Cache First (com fallback para rede)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cacheia apenas respostas OK de recursos estáticos
        if (
          response.ok &&
          event.request.method === 'GET' &&
          !url.pathname.startsWith('/webhook')
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline: retorna index.html para navegação
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
