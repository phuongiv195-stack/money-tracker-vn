// Imported by the generated service worker (vite.config.js, workbox.importScripts).
// The page sends the bank transactions to review when it goes to the background
// (see src/hooks/useReviewBadge.js); they are shown as silent notifications so the
// phone puts the count on the app icon. Tapping one opens To review.

let generation = 0; // a newer show/clear makes an unfinished show stop

const isReviewTag = (tag) => typeof tag === 'string' && tag.startsWith('bank-review');

async function clearReviewNotifications() {
  const shown = await self.registration.getNotifications();
  shown.filter(n => isReviewTag(n.tag)).forEach(n => n.close());
}

async function showReviewNotifications(items, mine) {
  await clearReviewNotifications();
  for (const item of items) {
    if (mine !== generation) return;
    await self.registration.showNotification(item.title, {
      body: item.body,
      tag: item.tag,
      icon: '/icon-192.png',
      silent: true,
      data: { url: '/?action=review' },
    });
    // Android drops notifications posted faster than about 5 per second
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'bank-review-show') {
    event.waitUntil(showReviewNotifications(event.data.items || [], ++generation));
  } else if (type === 'bank-review-clear') {
    generation++;
    event.waitUntil(clearReviewNotifications());
  }
});

self.addEventListener('notificationclick', (event) => {
  if (!isReviewTag(event.notification.tag)) return;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => 'focus' in w);
    if (open) {
      open.postMessage({ type: 'open-bank-review' });
      return open.focus();
    }
    return self.clients.openWindow(event.notification.data?.url || '/?action=review');
  })());
});
