import { useEffect, useRef } from 'react';
import { isUncategorized } from '../services/bankImport/importer';

// Per device: show the To review count outside the app (opt-in, needs notification permission)
export const REVIEW_NOTIFY_KEY = 'bankReviewNotify';
const MAX_NOTIFICATIONS = 8;

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

// One notification per transaction to review, so the phone's app icon shows the count
function notificationsFor(transactions, others) {
  const items = transactions.slice(0, MAX_NOTIFICATIONS).map(t => {
    const amount = Number(t.type === 'split' ? t.totalAmount : t.amount) || 0;
    const what = t.type === 'transfer' ? `${t.fromAccount} → ${t.toAccount}` : (t.payee || 'No payee');
    const [, mm, dd] = (t.date || '').split('-');
    const state = t.type !== 'transfer' && isUncategorized(t.category)
      ? 'Choose a category'
      : `Entered as ${t.type === 'transfer' ? 'a transfer' : t.type === 'loan' ? t.loan : t.category || 'split'}: tap to check`;
    return {
      tag: `bank-review-${t.id}`,
      title: `🏦 ${t.type === 'transfer' ? Math.abs(amount).toLocaleString('en-US') : money(amount)} · ${what}`,
      body: `${t.account || t.fromAccount || ''} · ${dd}/${mm} · ${state}`,
    };
  });
  const more = transactions.length - items.length;
  const rest = [
    more > 0 && `${more} more ${more === 1 ? 'transaction' : 'transactions'}`,
    others.unlinked > 0 && `${others.unlinked} bank ${others.unlinked === 1 ? 'account' : 'accounts'} to link`,
    others.mismatches > 0 && `${others.mismatches} balance ${others.mismatches === 1 ? 'difference' : 'differences'}`,
    others.unrecognized > 0 && `${others.unrecognized} unread bank ${others.unrecognized === 1 ? 'message' : 'messages'}`,
  ].filter(Boolean);
  if (rest.length) items.push({ tag: 'bank-review-other', title: '🏦 Also to review', body: rest.join(' · ') });
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
export default function useReviewBadge(count, transactions, others) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);

  const latest = useRef(null);
  latest.current = { count, transactions, others };

  useEffect(() => {
    if (!reviewNotifySupported()) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tellServiceWorker({ type: 'bank-review-clear' });
      } else if (reviewNotifyEnabled() && latest.current.count > 0) {
        tellServiceWorker({ type: 'bank-review-show', items: notificationsFor(latest.current.transactions, latest.current.others) });
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
