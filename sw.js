// VETRA Service Worker v27 — SÓ NOTIFICAÇÕES PUSH.
// SEM cache de página e SEM interceptar requisições: o navegador busca o site
// direto do servidor em todo carregamento — a versão nova SEMPRE aparece.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Apaga qualquer cache deixado por versões antigas
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

// ── NOTIFICAÇÕES PUSH ──
// IMPORTANTE (iOS): todo push DEVE exibir notificação visível dentro de event.waitUntil,
// senão o iOS cancela a inscrição após 3 pushes "silenciosos".
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const tasks = [
    self.registration.showNotification(data.title || 'VETRA', {
      body: data.body || 'Nova mensagem recebida',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'vetra',
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
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const phone = event.notification.data && event.notification.data.phone;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'open-chat', phone }); return c.focus(); }
      }
      return clients.openWindow(phone ? '/?phone=' + encodeURIComponent(phone) : '/');
    })
  );
});
