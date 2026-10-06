// Compares the balance each bank reported in its latest message with the balance
// Money Tracker computes for that account at the same moment. A difference
// usually means a missing transaction — e.g. an OCB payment, which OCB never
// notifies, that wasn't entered by hand.

import { parseImportKey, keyTime, createdMs } from './importer';

// Does an import key ("OCB|6789|...", or "E|TIMO||..." without account digits) belong to this account?
function belongsTo(account, k) {
  const keys = account.bankAccountKeys || [];
  return keys.includes(`${k.bank}:${k.last4}`) || (!k.last4 && keys.some(x => x.startsWith(`${k.bank}:`)));
}

// Signed effect of a transaction on an account's balance (same rules as AccountDetail).
function effectOn(t, accountName) {
  if (t.isFuture) return 0;
  if (t.type === 'transfer') {
    if (t.fromAccount === accountName) return -Number(t.amount) || 0;
    if (t.toAccount === accountName) return Number(t.amount) || 0;
    return 0;
  }
  if (t.type === 'split') {
    let amount = t.account === accountName ? Number(t.totalAmount) || 0 : 0;
    (t.splits || []).forEach(s => {
      if (s.isTransfer && s.transferAccount === accountName) {
        amount += (t.splitType === 'income' ? -1 : 1) * Math.abs(Number(s.amount) || 0);
      }
    });
    return amount;
  }
  return t.account === accountName ? Number(t.amount) || 0 : 0;
}

/**
 * For each linked bank account: the latest bank-reported balance and Money
 * Tracker's balance at that moment. Returns only the accounts that differ:
 *   [{ account, bankBalance, appBalance, diff (bank - app), at }]
 */
export function findBalanceMismatches(accounts, transactions) {
  const mismatches = [];
  for (const account of accounts) {
    if (account.isActive === false || !(account.bankAccountKeys || []).length) continue;

    let latest = null;
    for (const t of transactions) {
      for (const key of t.bankImport?.keys || []) {
        const k = parseImportKey(key);
        if (k.balance == null || !k.time || !belongsTo(account, k)) continue;
        const at = keyTime(k);
        if (!latest || at > latest.at) latest = { at, date: k.date, balance: k.balance };
      }
    }
    if (!latest) continue;

    // Everything up to that message. Imports know their time. A transaction typed
    // in on that day after the message is ambiguous: it may be a later purchase,
    // or the missing one entered after seeing this warning — so the balances with
    // and without those are both accepted.
    let before = Number(account.startingBalance) || 0;
    let typedAfter = 0;
    for (const t of transactions) {
      const amount = effectOn(t, account.name);
      if (!amount || !t.date || t.date > latest.date) continue;
      if (t.date === latest.date) {
        if (t.bankImport?.at > latest.at + 60_000) continue;
        if (!t.bankImport && createdMs(t) > latest.at) {
          typedAfter += amount;
          continue;
        }
      }
      before += amount;
    }

    const appBalance = before + typedAfter;
    const diff = latest.balance - appBalance;
    if (Math.abs(diff) >= 1 && Math.abs(latest.balance - before) >= 1) {
      mismatches.push({ account, bankBalance: latest.balance, appBalance, diff, at: latest.at });
    }
  }
  return mismatches;
}
