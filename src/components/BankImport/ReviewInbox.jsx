import React, { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useBankImport } from '../../contexts/BankImportContext';
import { useToast } from '../Toast/ToastProvider';
import useBackHandler from '../../hooks/useBackHandler';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import { BANK_LABELS } from '../../services/bankImport/parsers';

const formatCurrency = (amount) => new Intl.NumberFormat('en-US').format(Math.abs(amount));

const formatWhen = (t) => {
  const date = new Date(`${t.date}T00:00:00`);
  const label = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${date.toLocaleDateString('en-US', { weekday: 'short' })}`;
  if (!t.bankImport?.at) return label;
  const at = new Date(t.bankImport.at);
  return `${label} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

// Full-screen list of bank transactions waiting for a category, plus bank
// accounts that still need linking to a Money Tracker account. Tapping a
// transaction opens the normal transaction form.
const ReviewInbox = ({ onClose }) => {
  const { activeAccounts } = useData();
  const {
    reviewTransactions, unlinkedAccounts, unrecognized, balanceMismatches, linkAccount, dismissItem, dismissMismatch,
  } = useBankImport();
  const toast = useToast();

  const [editing, setEditing] = useState(null);

  useBackHandler(true, onClose);

  const accountOptions = useMemo(() => {
    const groupOrder = { SPENDING: 0, SAVINGS: 1, INVESTMENTS: 2, ASSETS: 3 };
    return activeAccounts
      .filter(a => a.group !== 'LOANS')
      .sort((a, b) => ((groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99)) || ((a.order ?? 999) - (b.order ?? 999)));
  }, [activeAccounts]);

  const handleLink = async (accountId, unlinked) => {
    if (!accountId) return;
    try {
      await linkAccount(accountId, unlinked.accountKey, unlinked.accountNumbers);
    } catch (error) {
      console.error('Error linking bank account:', error);
      toast.error('Error: ' + error.message);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await dismissItem(id);
    } catch (error) {
      console.error('Error dismissing notification:', error);
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
        <div className="font-bold text-lg">To review{total > 0 ? ` (${total})` : ''}</div>
        <div className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">

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
            <div>
              <div className="text-xs text-gray-500 mb-2 ml-1">Tap a transaction to choose its category, loan or transfer.</div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                {reviewTransactions.map((t, index) => {
                  const amount = Number(t.amount) || 0;
                  const description = t.bankImport?.description || t.memo;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setEditing(t)}
                      className={`p-3 flex justify-between items-start gap-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 ${index !== reviewTransactions.length - 1 ? 'border-b border-gray-100' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500">{formatWhen(t)} · {t.account}</div>
                        <div className="font-medium text-gray-800 truncate">{t.payee || 'No Payee'}</div>
                        {description && (
                          <div className="text-xs text-gray-500 line-clamp-2 break-all">{description}</div>
                        )}
                      </div>
                      <div className={`font-bold whitespace-nowrap ${amount > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {amount > 0 ? '+' : '-'}{formatCurrency(amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {unrecognized.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase ml-1">Not recognized</div>
              <div className="space-y-2">
                {unrecognized.map(item => (
                  <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
                    <div className="text-xs text-gray-500">{item.appName}</div>
                    <div className="text-xs text-gray-700 whitespace-pre-wrap break-all">
                      {[item.title, item.bigText || item.text].filter(Boolean).join('\n')}
                    </div>
                    <div className="text-right mt-2">
                      <button
                        onClick={() => handleDismiss(item.id)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
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
