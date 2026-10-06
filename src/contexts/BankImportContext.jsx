import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserId } from './AuthContext';
import { useData } from './DataContext';
import {
  processInbox, isUncategorized, needsReview, markReviewed, linkBankAccount, dismissInboxItem, mergeTypedDuplicates,
  pairImportedTransfers,
} from '../services/bankImport/importer';
import { findBalanceMismatches } from '../services/bankImport/balanceCheck';
import useReviewBadge from '../hooks/useReviewBadge';

const DISMISSED_KEY = 'bankBalanceDismissed';

const BankImportContext = createContext(null);

// Watches bankInbox (raw notifications from the Android capture app), turns new
// items into transactions, and exposes what still needs the user's attention.
export const BankImportProvider = ({ children }) => {
  const userId = useUserId();
  const { transactions, accounts, categories, initialLoadComplete } = useData();

  const [inboxItems, setInboxItems] = useState([]);
  const [pending, setPending] = useState({ needsAccount: [], unrecognized: [] });

  useEffect(() => {
    if (!userId) {
      setInboxItems([]);
      return;
    }
    const q = query(
      collection(db, 'bankInbox'),
      where('userId', '==', userId),
      where('status', '==', 'new')
    );
    return onSnapshot(
      q,
      (snapshot) => setInboxItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
      (error) => console.error('bankInbox listener error:', error)
    );
  }, [userId]);

  // Always process with the freshest data, one run at a time.
  const latest = useRef(null);
  latest.current = { userId, items: inboxItems, accounts, transactions, categories };
  const running = useRef(false);
  const rerun = useRef(false);

  useEffect(() => {
    if (!userId || !initialLoadComplete) return;
    const run = async () => {
      if (running.current) {
        rerun.current = true;
        return;
      }
      running.current = true;
      try {
        do {
          rerun.current = false;
          setPending(await processInbox(latest.current));
          // Pair first: a transfer typed by hand then merges with the paired import.
          // After pairing, wait for fresh data before merging (the snapshot reruns this).
          const paired = await pairImportedTransfers(latest.current.transactions, latest.current.accounts);
          if (paired === 0) await mergeTypedDuplicates(latest.current.transactions);
        } while (rerun.current);
      } catch (error) {
        console.error('Bank import failed:', error);
      } finally {
        running.current = false;
      }
    };
    run();
  }, [userId, initialLoadComplete, inboxItems, accounts, categories, transactions]);

  // Bank-reported balance vs Money Tracker's, per linked account. A mismatch the
  // user dismissed stays hidden until the difference changes (per device).
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const balanceMismatches = useMemo(() => {
    if (!initialLoadComplete) return [];
    return findBalanceMismatches(accounts, transactions).filter(m => dismissed[m.account.id] !== m.diff);
  }, [initialLoadComplete, accounts, transactions, dismissed]);
  const dismissMismatch = useCallback((mismatch) => {
    setDismissed(prev => {
      const next = { ...prev, [mismatch.account.id]: mismatch.diff };
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: dismissed for this session only
      }
      return next;
    });
  }, []);

  // To review: everything the app entered that the user hasn't checked yet,
  // plus anything still without a category (newest first).
  const reviewTransactions = useMemo(() => {
    return transactions
      .filter(t => needsReview(t) || (t.type !== 'transfer' && isUncategorized(t.category)))
      .sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.bankImport?.at || 0) - (a.bankImport?.at || 0);
      });
  }, [transactions]);
  // Still waiting for a category (offered in the + form instead of typing them again)
  const waitingTransactions = useMemo(
    () => reviewTransactions.filter(t => t.type !== 'transfer' && isUncategorized(t.category)),
    [reviewTransactions]
  );

  // One entry per unlinked bank account, e.g. { accountKey: 'VCB:5678', bank: 'VCB', count: 2 }
  const unlinkedAccounts = useMemo(() => {
    const byKey = {};
    pending.needsAccount.forEach(({ parsed }) => {
      const entry = byKey[parsed.accountKey] || (byKey[parsed.accountKey] = {
        accountKey: parsed.accountKey,
        bank: parsed.bank,
        last4: String(parsed.accountNumber).slice(-4),
        accountNumbers: [],
        count: 0,
      });
      entry.count++;
      if (!entry.accountNumbers.includes(String(parsed.accountNumber))) entry.accountNumbers.push(String(parsed.accountNumber));
    });
    return Object.values(byKey);
  }, [pending.needsAccount]);

  const reviewCount = reviewTransactions.length + pending.needsAccount.length + pending.unrecognized.length
    + balanceMismatches.length;
  useReviewBadge(reviewCount, reviewTransactions, {
    unlinked: unlinkedAccounts.length,
    unrecognized: pending.unrecognized.length,
    mismatches: balanceMismatches.length,
  });

  const value = useMemo(() => ({
    reviewTransactions,
    waitingTransactions,
    unlinkedAccounts,
    unrecognized: pending.unrecognized,
    balanceMismatches,
    reviewCount,
    markReviewed,
    linkAccount: linkBankAccount,
    dismissItem: dismissInboxItem,
    dismissMismatch,
  }), [reviewTransactions, waitingTransactions, unlinkedAccounts, pending, balanceMismatches, reviewCount, dismissMismatch]);

  return (
    <BankImportContext.Provider value={value}>
      {children}
    </BankImportContext.Provider>
  );
};

// For components that may render outside the provider (returns null there).
export const useOptionalBankImport = () => useContext(BankImportContext);

export const useBankImport = () => {
  const context = useContext(BankImportContext);
  if (!context) {
    throw new Error('useBankImport must be used within a BankImportProvider');
  }
  return context;
};
