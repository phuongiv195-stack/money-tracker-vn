import React, { useState, useMemo, useRef, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Toast/ToastProvider';
import AddTransactionModal from '../Transactions/AddTransactionModal';
import { parseQuickAdd } from '../../services/quickAdd/parseQuickAdd';
import {
  UNCATEGORIZED, ensureUncategorizedCategories, spendingTypeFor,
} from '../../services/bankImport/importer';
import useSpeech from './useSpeech';
import useQuickAddLearning from './useQuickAddLearning';

const ACCOUNT_KEY = 'quickAddAccount';
export const QUICK_ADD_FOCUS_KEY = 'quickAddFocus'; // set by the "Quick add" app shortcut

const readStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: remembered for this session only
  }
};

const formatAmount = (amount) => `${amount > 0 ? '+' : '-'}${new Intl.NumberFormat('en-US').format(Math.abs(amount))}`;

// Say or type a short note ("25 ngàn rau Street Grocer") and save it as a
// transaction. Without a category it lands in Uncategorized, i.e. To review.
const QuickAddBar = () => {
  const userId = useUserId();
  const { accountNames, accounts, categories, payeeSuggestions, payeeToCategoryMap } = useData();
  const toast = useToast();
  const { aliases, wordCategories, learnAlias } = useQuickAddLearning();

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [savedAccount, setSavedAccount] = useState(() => readStorage(ACCOUNT_KEY));
  const inputRef = useRef(null);
  const speech = useSpeech(setText, (error) => toast.error('Microphone: ' + error));

  // Per-device default account: the one chosen here, else the first cash account
  const defaultAccount = useMemo(() => {
    if (savedAccount && accountNames.includes(savedAccount)) return savedAccount;
    return accountNames.find(name => /cash|tiền mặt/i.test(name)) || accountNames[0] || '';
  }, [savedAccount, accountNames]);

  const draft = useMemo(() => {
    if (!text.trim()) return null;
    return parseQuickAdd(text, {
      accounts,
      categories,
      payees: payeeSuggestions,
      payeeToCategory: payeeToCategoryMap,
      aliases,
      wordCategories,
      defaultAccount,
    });
  }, [text, accounts, categories, payeeSuggestions, payeeToCategoryMap, aliases, wordCategories, defaultAccount]);

  // Opened from the "Quick add" app shortcut: put the cursor here. The flag
  // covers this bar mounting later (another tab was open); the event covers
  // it being on screen already.
  useEffect(() => {
    const focusIfAsked = () => {
      if (!readStorage(QUICK_ADD_FOCUS_KEY)) return;
      try {
        localStorage.removeItem(QUICK_ADD_FOCUS_KEY);
      } catch {
        // nothing to clean up
      }
      inputRef.current?.focus();
    };
    focusIfAsked();
    window.addEventListener(QUICK_ADD_FOCUS_KEY, focusIfAsked);
    return () => window.removeEventListener(QUICK_ADD_FOCUS_KEY, focusIfAsked);
  }, []);

  const chooseDefaultAccount = (name) => {
    setSavedAccount(name);
    writeStorage(ACCOUNT_KEY, name);
  };

  const save = async () => {
    if (!draft) return;
    if (draft.amount == null || !draft.account) {
      setEditing(draft); // let the form ask for what's missing
      return;
    }
    setSaving(true);
    try {
      let category = draft.category;
      if (!category) {
        await ensureUncategorizedCategories(userId, categories);
        category = UNCATEGORIZED[draft.type];
      }
      const transaction = {
        userId,
        type: draft.type,
        amount: draft.amount,
        date: draft.date,
        payee: draft.payee,
        memo: draft.memo,
        account: draft.account,
        category,
        isLoan: false,
        tag: null,
        tags: null,
        isFuture: false,
        createdAt: new Date(),
      };
      if (draft.type === 'expense') transaction.spendingType = spendingTypeFor(categories, category);
      await addDoc(collection(db, 'transactions'), transaction);
      toast.success(`Added ${formatAmount(draft.amount)} · ${draft.payee || draft.memo || category}`);
      setText('');
    } catch (error) {
      console.error('Quick add failed:', error);
      toast.error('Error: ' + error.message);
    }
    setSaving(false);
  };

  return (
    <div className="px-4 mb-4">
      <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="Quick add: 25k rau Street Grocer"
            className="flex-1 min-w-0 p-2 bg-gray-50 rounded-lg text-base focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {text && (
            <button
              type="button"
              onClick={() => { setText(''); inputRef.current?.focus(); }}
              className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              title="Clear"
            >
              ✕
            </button>
          )}
          {speech.supported && (
            <>
              <button
                type="button"
                onClick={() => speech.toggle(text)}
                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg ${
                  speech.listening ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
                title={speech.listening ? 'Stop' : 'Speak (adds to the text)'}
              >
                🎤
              </button>
              <button
                type="button"
                onClick={speech.toggleLang}
                className="w-8 shrink-0 text-xs font-semibold text-gray-500"
                title="Speech language"
              >
                {speech.lang.toUpperCase()}
              </button>
            </>
          )}
        </div>

        {draft ? (
          <div className="mt-2 px-1">
            <div className="text-sm flex flex-wrap gap-x-1.5 gap-y-0.5 items-center">
              <span className={`font-bold ${draft.amount > 0 ? 'text-emerald-600' : draft.amount ? 'text-gray-900' : 'text-red-500'}`}>
                {draft.amount ? formatAmount(draft.amount) : 'Amount?'}
              </span>
              {draft.payee && <span className="text-gray-800">· {draft.payee}</span>}
              <span className={draft.category ? 'text-gray-700' : 'text-amber-600'}>· {draft.category || 'Uncategorized'}</span>
              <span className="text-gray-500">· {draft.account || 'Account?'}</span>
              {draft.date !== new Date().toLocaleDateString('en-CA') && (
                <span className="text-gray-500">· {draft.date.slice(8)}/{draft.date.slice(5, 7)}</span>
              )}
              {draft.memo && <span className="text-gray-500 italic">· {draft.memo}</span>}
            </div>
            {draft.parts.length > 1 && (
              <div className="text-sm text-gray-600 mt-1">
                {draft.parts.map(p => new Intl.NumberFormat('en-US').format(p)).join(' + ')}
                {' = '}
                <span className="font-semibold text-gray-900">{new Intl.NumberFormat('en-US').format(Math.abs(draft.amount))}</span>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(draft)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 px-1 flex justify-between items-center text-xs text-gray-500">
            <span>Say or type amount, what, where{speech.supported ? '' : ' (use the keyboard mic)'}</span>
            <select
              value={defaultAccount}
              onChange={(e) => chooseDefaultAccount(e.target.value)}
              className="bg-transparent text-gray-600 text-right max-w-[45%]"
              title="Account used when none is said"
            >
              {accountNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      <AddTransactionModal
        isOpen={!!editing}
        prefill={editing}
        onClose={() => setEditing(null)}
        onSave={(saved) => { learnAlias(editing, saved); setEditing(null); setText(''); }}
      />
    </div>
  );
};

export default QuickAddBar;
