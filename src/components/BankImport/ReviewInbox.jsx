import React, { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useBankImport } from '../../contexts/BankImportContext';
import { useToast } from '../Toast/ToastProvider';
import useBackHandler from '../../hooks/useBackHandler';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import { BANK_LABELS } from '../../services/bankImport/parsers';
import { isUncategorized, needsReview } from '../../services/bankImport/importer';
import { REVIEW_NOTIFY_KEY, reviewNotifySupported, reviewNotifyEnabled } from '../../hooks/useReviewBadge';

const formatCurrency = (amount) => new Intl.NumberFormat('en-US').format(Math.abs(amount));

const formatDay = (dateStr) => {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatTime = (t) => {
  if (!t.bankImport?.at) return '';
  const at = new Date(t.bankImport.at);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

// Full-screen list of the bank transactions the app entered, shown like the
// transaction list: tap one to fix it in the normal form, ✓ when it's right.
// Also: bank accounts to link, balance differences, unread bank messages.
const ReviewInbox = ({ onClose }) => {
  const { activeAccounts } = useData();
  const {
    reviewTransactions, unlinkedAccounts, unrecognized, balanceMismatches, linkAccount, dismissItem, dismissMismatch,
    markReviewed,
  } = useBankImport();
  const toast = useToast();

  const [editing, setEditing] = useState(null);
  const [showUnread, setShowUnread] = useState(false);
  const [notifyOn, setNotifyOn] = useState(reviewNotifyEnabled);

  useBackHandler(true, onClose);

  const accountOptions = useMemo(() => {
    const groupOrder = { SPENDING: 0, SAVINGS: 1, INVESTMENTS: 2, ASSETS: 3 };
    return activeAccounts
      .filter(a => a.group !== 'LOANS')
      .sort((a, b) => ((groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99)) || ((a.order ?? 999) - (b.order ?? 999)));
  }, [activeAccounts]);

  const byDay = useMemo(() => {
    const days = [];
    for (const t of reviewTransactions) {
      const last = days[days.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else days.push({ date: t.date, items: [t] });
    }
    return days;
  }, [reviewTransactions]);

  // Already has a category (or is a transfer/loan): the user only has to confirm it
  const isWaiting = (t) => t.type !== 'transfer' && t.type !== 'split' && isUncategorized(t.category);
  const confirmable = reviewTransactions.filter(t => needsReview(t) && !isWaiting(t));

  const handleConfirm = async (ids) => {
    try {
      await markReviewed(ids);
    } catch (error) {
      console.error('Error confirming transactions:', error);
      toast.error('Error: ' + error.message);
    }
  };

  const handleLink = async (accountId, unlinked) => {
    if (!accountId) return;
    try {
      await linkAccount(accountId, unlinked.accountKey, unlinked.accountNumbers);
    } catch (error) {
      console.error('Error linking bank account:', error);
      toast.error('Error: ' + error.message);
    }
  };

  const handleDismiss = async (ids) => {
    try {
      for (const id of ids) await dismissItem(id);
    } catch (error) {
      console.error('Error dismissing notification:', error);
      toast.error('Error: ' + error.message);
    }
  };

  const toggleNotify = async () => {
    try {
      if (notifyOn) {
        localStorage.removeItem(REVIEW_NOTIFY_KEY);
        setNotifyOn(false);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error("Notifications are blocked. Allow them for Money Tracker in the phone's settings.");
        return;
      }
      localStorage.setItem(REVIEW_NOTIFY_KEY, '1');
      setNotifyOn(true);
      toast.success('The number will show on the app icon when you leave the app');
    } catch (error) {
      console.error('Error switching notifications:', error);
      toast.error('Error: ' + error.message);
    }
  };

  const total = reviewTransactions.length;
  const allDone = total === 0 && unlinkedAccounts.length === 0 && unrecognized.length === 0
    && balanceMismatches.length === 0;

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col no-pull-refresh">
      <div className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
        <button onClick={onClose} className="text-gray-600 text-lg p-2 -ml-2">← Back</button>
        <div className="font-bold text-lg">Bank review{total > 0 ? ` (${total})` : ''}</div>
        <div className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">

          {reviewNotifySupported() && (
            <div className="flex items-center justify-between gap-2 text-sm bg-white rounded-lg border border-gray-100 shadow-sm p-2 px-3">
              <span className="text-gray-700">
                🔔 {notifyOn ? 'The count shows on the app icon (this phone)' : 'Show the count on the app icon?'}
              </span>
              <button
                onClick={toggleNotify}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${notifyOn ? 'border border-gray-200 text-gray-600' : 'bg-emerald-500 text-white'}`}
              >
                {notifyOn ? 'Turn off' : 'Turn on'}
              </button>
            </div>
          )}

          {unlinkedAccounts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="font-semibold text-amber-800 text-sm">Link bank accounts</div>
              <div className="text-xs text-amber-700 mb-2">
                Which Money Tracker account is each bank account? You only need to do this once.
              </div>
              {unlinkedAccounts.map(u => (
                <div key={u.accountKey} className="flex items-center gap-2 py-1">
                  <div className="flex-1 min-w-0 text-sm text-gray-800">
                    {BANK_LABELS[u.bank] || u.bank} {u.last4 ? `•••${u.last4}` : "(email)"}
                    <span className="text-xs text-gray-500"> · {u.count} waiting</span>
                  </div>
                  <select
                    value=""
                    onChange={(e) => handleLink(e.target.value, u)}
                    className="p-2 border border-gray-300 rounded-lg bg-white text-sm max-w-[55%]"
                  >
                    <option value="">Choose account…</option>
                    {accountOptions.map(a => (
                      <option key={a.id} value={a.id}>{a.icon ? `${a.icon} ` : ''}{a.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {balanceMismatches.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="font-semibold text-red-800 text-sm">Balance check</div>
              <div className="text-xs text-red-700 mb-2">
                The bank's balance doesn't match Money Tracker. A transaction may be missing.
              </div>
              <div className="space-y-3">
                {balanceMismatches.map(m => {
                  const at = new Date(m.at);
                  const when = `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
                  return (
                    <div key={m.account.id} className="bg-white rounded-lg border border-red-100 p-2">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-medium text-gray-800">{m.account.name}</span>
                        <span className="font-bold text-red-700 whitespace-nowrap">
                          {m.diff > 0 ? '+' : '-'}{formatCurrency(m.diff)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Bank ({when}): {formatCurrency(m.bankBalance)} · Money Tracker: {m.appBalance < 0 ? '-' : ''}{formatCurrency(m.appBalance)}
                      </div>
                      <div className="flex justify-between items-end gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {m.diff < 0
                            ? 'Money Tracker shows more: an expense may not be entered.'
                            : 'The bank shows more: an income may not be entered.'}
                        </span>
                        <button
                          onClick={() => dismissMismatch(m)}
                          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allDone && (
            <div className="text-center text-gray-400 mt-10">All caught up 🎉</div>
          )}

          {total > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 ml-1">
                <span className="text-xs text-gray-500">Tap one to fix it · ✓ when it's right</span>
                {confirmable.length > 1 && (
                  <button
                    onClick={() => handleConfirm(confirmable.map(t => t.id))}
                    className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-medium whitespace-nowrap"
                  >
                    ✓ All correct ({confirmable.length})
                  </button>
                )}
              </div>
              {byDay.map(({ date, items }) => (
                <div key={date}>
                  <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">{formatDay(date)}</div>
                  <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    {items.map((t, index) => {
                      const isTransfer = t.type === 'transfer';
                      const amount = Number(t.type === 'split' ? t.totalAmount : t.amount) || 0;
                      const waiting = isWaiting(t);
                      const canConfirm = !waiting && needsReview(t);
                      const time = formatTime(t);
                      const detail = waiting
                        ? <span className="text-amber-700 font-medium">Choose a category</span>
                        : t.type === 'loan' ? `🤝 ${t.loan}`
                        : t.type === 'split' ? 'Split'
                        : isTransfer ? 'Between your accounts'
                        : t.category;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setEditing(t)}
                          className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${index !== items.length - 1 ? 'border-b' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-800 truncate">
                              {isTransfer ? `Transfer: ${t.fromAccount || '?'} → ${t.toAccount || '?'}` : (t.payee || 'No Payee')}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {detail}
                              {t.memo && <span className="text-gray-400"> • {t.memo}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-bold ${!isTransfer && amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                              {isTransfer ? '' : amount > 0 ? '+' : '-'}{formatCurrency(amount)}
                            </div>
                            <div className="text-xs text-gray-400">{[isTransfer ? '' : t.account, time].filter(Boolean).join(' · ')}</div>
                          </div>
                          {canConfirm ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleConfirm([t.id]); }}
                              className="w-9 h-9 shrink-0 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600 font-bold flex items-center justify-center active:bg-emerald-100"
                              title="It's right"
                            >
                              ✓
                            </button>
                          ) : (
                            <div className="w-9 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {unrecognized.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-700">
                  📩 {unrecognized.length} bank {unrecognized.length === 1 ? 'message' : 'messages'} not read as a transaction
                </span>
                <button onClick={() => setShowUnread(v => !v)} className="text-sm text-emerald-700 underline whitespace-nowrap">
                  {showUnread ? 'Hide' : 'Show'}
                </button>
              </div>
              {showUnread && (
                <div className="mt-2 space-y-2">
                  {unrecognized.map(item => (
                    <div key={item.id} className="border-t border-gray-100 pt-2">
                      <div className="text-xs text-gray-500">{item.appName}</div>
                      <div className="text-xs text-gray-700 whitespace-pre-wrap break-all">
                        {[item.title, item.bigText || item.text].filter(Boolean).join('\n')}
                      </div>
                      <div className="text-right mt-1">
                        <button
                          onClick={() => handleDismiss([item.id])}
                          className="text-sm px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-right mt-2">
                <button
                  onClick={() => handleDismiss(unrecognized.map(item => item.id))}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Dismiss all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddTransactionModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        onSave={() => setEditing(null)}
        editTransaction={editing}
      />
    </div>
  );
};

export default ReviewInbox;
