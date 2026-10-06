import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { learnWordCategories, aliasWords } from '../../services/quickAdd/parseQuickAdd';

const NOTHING_LEARNED = { expense: {}, income: {} };

/**
 * What Quick add learns from the user, without AI:
 *  - aliases: what speech recognition heard -> the real payee ("trít gờ rô sơ" -> Street Grocer),
 *    kept in userSettings/{uid}.quickAddAliases
 *  - wordCategories: memo word -> usual category ("rau" -> Groceries), from categorized transactions
 * Only active while `enabled` (the transaction form uses it when its mic is open).
 */
export default function useQuickAddLearning(enabled = true) {
  const userId = useUserId();
  const { transactions } = useData();
  const [aliases, setAliases] = useState({});

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    return onSnapshot(
      doc(db, 'userSettings', userId),
      (snap) => setAliases(snap.data()?.quickAddAliases || {}),
      (error) => console.error('Quick add aliases listener error:', error)
    );
  }, [enabled, userId]);

  const wordCategories = useMemo(
    () => (enabled ? learnWordCategories(transactions) : NOTHING_LEARNED),
    [enabled, transactions]
  );

  // After saving with a different payee than was understood, remember what was
  // heard for it. Only phrases of 2+ words that aren't item words already linked
  // to a category, so "rau" never turns into a payee.
  const learnAlias = useCallback((heardDraft, saved) => {
    const payee = (saved?.payee || '').trim();
    if (!userId || !heardDraft || !payee || payee === heardDraft.payee) return;
    const kept = new Set(aliasWords(saved.memo));
    const itemWords = new Set(Object.keys(wordCategories[heardDraft.type] || {}).flatMap(aliasWords));
    const heard = aliasWords(`${heardDraft.payee} ${heardDraft.memo}`)
      .filter(w => !kept.has(w) && !itemWords.has(w) && !/^\d/.test(w));
    const phrase = heard.join(' ');
    if (heard.length < 2 || heard.length > 6 || phrase === aliasWords(payee).join(' ')) return;
    setDoc(doc(db, 'userSettings', userId), { quickAddAliases: { [phrase]: payee } }, { merge: true })
      .catch(error => console.error('Could not save quick add alias:', error));
  }, [userId, wordCategories]);

  return { aliases, wordCategories, learnAlias };
}
