self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {}
  const title   = data.title   || 'Betfluencer'
  const options = {
    body:    data.body    || 'New tip available',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
    actions: [
      { action: 'view', title: 'View tip' },
      { action: 'close', title: 'Dismiss' },
    ],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'close') return
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
