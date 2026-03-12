// Service Worker for browser push notifications

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'New Notification', body: event.data.text() }
  }

  const options = {
    body: payload.body || payload.message || '',
    icon: '/globe.svg',
    badge: '/globe.svg',
    tag: payload.tag || 'notification',
    data: {
      url: payload.url || '/',
      entityType: payload.entityType,
      entityId: payload.entityId,
    },
    requireInteraction: payload.priority === 'urgent' || payload.priority === 'high',
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Notification', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing window if found
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Open new window
        return self.clients.openWindow(url)
      })
  )
})
