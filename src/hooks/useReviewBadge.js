import { useEffect, useRef } from 'react';
import { isUncategorized } from '../services/bankImport/importer';

// Per device: show the To review count outside the app (opt-in, needs notification permission)
export const REVIEW_NOTIFY_KEY = 'bankReviewNotify';
const MAX_NOTIFICATIONS = 20;

export const reviewNotifySupported = () =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export const reviewNotifyEnabled = () => {
  try {
    return reviewNotifySupported() && Notification.permission === 'granted' && localStorage.getItem(REVIEW_NOTIFY_KEY) === '1';
  } catch {
    return false;
  }
};

const money = (n) => `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('en-US')}`;

// One notification per transaction to review (nothing else), so the phone's
// app icon shows the count: "−50,000 · Street Grocer" / "Vietcombank · 06/10 · Grocery"
function notificationsFor(transactions) {
  const items = transactions.slice(0, MAX_NOTIFICATIONS).map(t => {
    const amount = Number(t.type === 'split' ? t.totalAmount : t.amount) || 0;
    const what = t.type === 'transfer' ? `${t.fromAccount} → ${t.toAccount}` : (t.payee || 'No payee');
    const [, mm, dd] = (t.date || '').split('-');
    const kind = t.type === 'transfer' ? 'Transfer'
      : t.type === 'loan' ? t.loan
      : t.type === 'split' ? 'Split'
      : isUncategorized(t.category) ? 'Choose a category' : t.category;
    return {
      tag: `bank-review-${t.id}`,
      title: `${t.type === 'transfer' ? Math.abs(amount).toLocaleString('en-US') : money(amount)} · ${what}`,
      body: [t.type === 'transfer' ? '' : t.account, `${dd}/${mm}`, kind].filter(Boolean).join(' · '),
    };
  });
  const more = transactions.length - items.length;
  if (more > 0) items.push({ tag: 'bank-review-more', title: `+${more} more ${more === 1 ? 'transaction' : 'transactions'}`, body: '' });
  return items;
}

const tellServiceWorker = (message) => {
  navigator.serviceWorker.ready.then(reg => reg.active?.postMessage(message)).catch(() => {});
};

// Shows the To review count outside the app:
//  - the app icon badge where the browser supports it (desktop Chrome/Edge, iPhone)
//  - on Android (badge = number of notifications), when switched on for this
//    device: one silent notification per transaction while the app is in the
//    background, removed again when the app is opened
export default function useReviewBadge(count, transactions) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);

  const latest = useRef(null);
  latest.current = { transactions };

  useEffect(() => {
    if (!reviewNotifySupported()) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tellServiceWorker({ type: 'bank-review-clear' });
      } else if (reviewNotifyEnabled() && latest.current.transactions.length > 0) {
        tellServiceWorker({ type: 'bank-review-show', items: notificationsFor(latest.current.transactions) });
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
