// Turns raw bank notifications (bankInbox, written by the Android capture app)
// into real transactions. Runs in the browser whenever Money Tracker is open —
// there is no server-side code.
//
// Imported transactions carry a `bankImport` object:
//   { source, bank, accountKey, keys: [importKey...], refTokens, counterpartyKey,
//     description, balance, at, inboxId, autoCategorized }

import { doc, setDoc, updateDoc, runTransaction, arrayUnion, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { parseBankNotification, looksLikeTransaction, normalizeName, counterpartyNameOf } from './parsers';

export const UNCATEGORIZED = { expense: 'Uncategorized', income: 'Uncategorized Income' };
export const isUncategorized = (name) => name === UNCATEGORIZED.expense || name === UNCATEGORIZED.income;

// Two sides of a transfer between own accounts must be this close (bank times).
const PAIR_WINDOW_MS = 15 * 60 * 1000;

const inboxRef = (id) => doc(db, 'bankInbox', id);
const postedMs = (item) => item.postedAt?.toMillis?.() ?? item.capturedAt?.toMillis?.() ?? Date.now();
const transactionId = (importKey) => `bank_${importKey.replace(/[^A-Za-z0-9-]+/g, '_')}`;

// Same rules as AddTransactionModal: locked categories fix need/want.
export function spendingTypeFor(categories, categoryName) {
  const cat = categories.find(c => c.name === categoryName);
  if (cat?.spendingMode === 'need' || cat?.spendingMode === 'want') return cat.spendingMode;
  return cat?.spendingType || 'need';
}

// Normal categories, so the Categories tab and every report count them as-is.
// Deterministic ids keep two devices from creating them twice.
export async function ensureUncategorizedCategories(userId, categories) {
  for (const type of ['expense', 'income']) {
    const name = UNCATEGORIZED[type];
    if (categories.some(c => c.name === name)) continue;
    await setDoc(doc(db, 'categories', `${userId}_uncategorized_${type}`), {
      userId,
      name,
      icon: '📥',
      type,
      group: 'Uncategorized',
      spendingType: type === 'expense' ? 'need' : null,
      spendingMode: type === 'expense' ? 'both' : null,
      createdAt: new Date(),
    });
  }
}

// Import keys: "VCB|5678|2026-10-06|08:09:56|-10000|32367528"; keys from emails
// start with "E|" (Gmail script) or "G|" (email app notification) and end with
// the bank's reference. Time and balance may be empty (date-only receipts).
const KEY_SOURCES = { E: 'email', G: 'mail-notification' };
export function parseImportKey(key) {
  const parts = key.split('|');
  const source = KEY_SOURCES[parts[0]] || 'push';
  if (source !== 'push') parts.shift();
  const [bank, last4, date, time, amount, balance] = parts;
  return { source, bank, last4, date, time, amount: Number(amount), balance: balance ? Number(balance) : null };
}

export const keyTime = (k) => {
  const [y, mo, d] = k.date.split('-').map(Number);
  const [h, mi, s] = k.time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
};

// Signed amount as the bank reported it (a transfer's own amount is unsigned).
const originalAmount = (t) => (t.bankImport.keys?.[0] ? parseImportKey(t.bankImport.keys[0]).amount : Number(t.amount));

const involvesAccount = (t, name) =>
  (t.type === 'transfer' ? t.fromAccount === name || t.toAccount === name : t.account === name);

// The same bank movement already imported from the other source — a phone
// notification and an email (receipt) of one transaction. Each source's record
// of a side is used once, so two identical payments on one day still count twice.
const SAME_MOVEMENT_WINDOW_MS = 10 * 60 * 1000;
function findSameMovement(pool, parsed, accountName) {
  for (const t of pool) {
    if (!t.bankImport || !involvesAccount(t, accountName)) continue;
    const side = (t.bankImport.keys || []).map(parseImportKey)
      .filter(k => k.bank === parsed.bank && k.amount === parsed.amount);
    if (side.length === 0 || side.some(k => k.source === parsed.source)) continue;
    const k = side[0];
    if (k.date !== parsed.date) continue;
    if (k.time && parsed.time && Math.abs(keyTime(k) - parsed.at) > SAME_MOVEMENT_WINDOW_MS) continue;
    if (k.balance != null && parsed.balance != null && k.balance !== parsed.balance) continue;
    return t;
  }
  return null;
}

// What the user last decided for this sender/recipient, money moving the same
// way: { category } or { loan, loanType }. If that decision was a transfer or a
// split, there is nothing to repeat.
function learnedTarget(pool, categories, counterpartyKey, amount) {
  if (!counterpartyKey) return null;
  let latest = null;
  for (const t of pool) {
    if (t.bankImport?.counterpartyKey !== counterpartyKey) continue;
    if (Math.sign(originalAmount(t)) !== Math.sign(amount)) continue;
    if ((t.type === 'expense' || t.type === 'income') && isUncategorized(t.category)) continue; // undecided
    if (!latest || (t.bankImport.at || 0) > (latest.bankImport.at || 0)) latest = t;
  }
  if (!latest) return null;
  if (latest.type === 'loan' && latest.loan) return { loan: latest.loan, loanType: latest.loanType };
  const type = amount < 0 ? 'expense' : 'income';
  if (latest.type === type && categories.some(c => c.name === latest.category && c.type === type)) {
    return { category: latest.category };
  }
  return null;
}

// One side of a bank movement, from a fresh notification or an imported transaction.
const movementOfParsed = (parsed, accountName) => ({
  bank: parsed.bank,
  account: accountName,
  amount: parsed.amount,
  at: parsed.at,
  refTokens: parsed.refTokens,
  description: parsed.description,
  last4: String(parsed.accountNumber).slice(-4),
  cpName: parsed.counterpartyName || '',
});
const movementOf = (t) => ({
  bank: t.bankImport.bank,
  account: t.account,
  amount: Number(t.amount),
  at: t.bankImport.at || 0,
  refTokens: t.bankImport.refTokens || [],
  description: t.bankImport.description || t.memo || '',
  last4: (t.bankImport.accountKey || '').split(':')[1],
  // Imports from before counterpartyName was stored: read it from the bank text
  cpName: t.bankImport.counterpartyName
    || counterpartyNameOf(t.bankImport.description || t.memo, originalAmount(t)),
});

// How each bank is named in transfer descriptions ("...tai OCB", "chuyen tien tu Timo").
const BANK_NAMES = {
  VCB: /\bvcb\b|vietcombank/i,
  TIMO: /\btimo\b/i,
  OCB: /\bocb\b/i,
  BV: /bvbank|ban ?viet|bản việt/i,
};
const namesBank = (text, bank) => Boolean(BANK_NAMES[bank]?.test(text));

// A side naming another bank, with the account holder as the other party
// ("NGUYEN VAN A chuyen tien tu Timo" arriving in OCB). Timo and OCB
// share no codes or numbers, so this is how such transfers are recognised; the
// name keeps a friend's "from my Timo" payment from being taken for one's own.
const fromOwnAccountAtBank = (move, bank, own) => namesBank(move.description, bank) && own.names.has(move.cpName);

// Evidence that two bank movements are one transfer: a shared bank reference
// code (VCB puts its MBVCB code on both sides), one side naming the other side's
// account number ("...toi 1012345678..."), or one side naming the other side's
// bank with the account holder as sender/recipient.
function sameTransferEvidence(a, b, own) {
  const namesAccount = (text, last4) => Boolean(last4) && (text.match(/\d{6,}/g) || []).some(n => n.endsWith(last4));
  return a.refTokens.some(tok => b.refTokens.includes(tok))
    || namesAccount(a.description, b.last4) || namesAccount(b.description, a.last4)
    || (a.bank !== b.bank && (fromOwnAccountAtBank(a, b.bank, own) || fromOwnAccountAtBank(b, a.bank, own)));
}

// Money leaving one own account and arriving in another: opposite amounts,
// close in time, with evidence they're the same transfer.
function isOwnTransfer(a, b, own) {
  if (a.account === b.account || a.amount !== -b.amount) return false;
  if (Math.abs(a.at - b.at) > PAIR_WINDOW_MS) return false;
  return sameTransferEvidence(a, b, own);
}

// Full account numbers of the user's own accounts, learned from notifications.
function ownAccountNumbers(accounts) {
  const numbers = new Map();
  accounts.forEach(a => (a.bankAccountNumbers || []).forEach(n => numbers.set(n, a)));
  return numbers;
}

// What is known about the user's own accounts: full numbers, and the account
// holders' names — the name banks write right after one of those numbers
// ("CT tu 1012345678 NGUYEN VAN A", "...0031000123456789.NGUYEN VAN A.").
function ownContext(accounts, imported) {
  const numbers = ownAccountNumbers(accounts);
  const names = new Set();
  for (const t of imported) {
    for (const m of (t.bankImport?.description || '').matchAll(/(\d{8,})[ .]+([A-Z]+(?: [A-Z]+)+)/g)) {
      if (numbers.has(m[1])) names.add(normalizeName(m[2]));
    }
  }
  return { accounts, numbers, names };
}

// Only one side notified, without account numbers, but it names another bank
// where the user has exactly one account, with the user as the other party.
function namedOwnBank(move, own) {
  for (const bank of Object.keys(BANK_NAMES)) {
    if (bank === move.bank || !fromOwnAccountAtBank(move, bank, own)) continue;
    const atBank = own.accounts.filter(a => (a.bankAccountKeys || []).some(k => k.startsWith(`${bank}:`)));
    if (atBank.length === 1 && atBank[0].name !== move.account) return atBank[0];
  }
  return null;
}

// The other own account a single-sided notification names, by number or by bank.
const otherOwnAccount = (move, own) => namedOwnAccount(move.description, own.numbers, move.account) || namedOwnBank(move, own);

// Another own account whose FULL number appears in the text — e.g. VCB's
// "...091946.0031000123456789.NGUYEN VAN A" for money from own OCB.
// Banks don't always notify both sides (OCB sends nothing for money out), so
// this alone identifies a transfer. Full numbers, so a stranger's account that
// merely ends in the same digits never matches.
function namedOwnAccount(description, numbers, accountName) {
  for (const n of description.match(/\d{8,}/g) || []) {
    const other = numbers.get(n);
    if (other && other.name !== accountName) return other;
  }
  return null;
}

// Imported, and nobody has decided what it is yet (so it may become a transfer).
const isUndecidedImport = (t) => t.bankImport && (t.type === 'expense' || t.type === 'income')
  && (isUncategorized(t.category) || t.bankImport.autoCategorized) && t.clearStatus !== 'reconciled';

// The other side of a transfer between own accounts, among imported transactions.
function findTransferPair(pool, parsed, accountName, own) {
  const mine = movementOfParsed(parsed, accountName);
  let best = null;
  for (const t of pool) {
    if (!isUndecidedImport(t) || !isOwnTransfer(mine, movementOf(t), own)) continue;
    if (!best || Math.abs(t.bankImport.at - parsed.at) < Math.abs(best.bankImport.at - parsed.at)) best = t;
  }
  return best;
}

// An imported transfer this notification is the other side of — merged
// automatically or changed to a transfer by the user in the transaction form —
// whose side for this account hasn't been recorded yet.
function findCoveringTransfer(pool, parsed, accountName, own) {

  let best = null;
  for (const t of pool) {
    const bi = t.bankImport;
    if (!bi || t.type !== 'transfer' || Number(t.amount) !== Math.abs(parsed.amount)) continue;
    if ((parsed.amount < 0 ? t.fromAccount : t.toAccount) !== accountName) continue;
    const sideRecorded = (bi.keys || []).map(parseImportKey)
      .some(k => k.bank === parsed.bank && Math.sign(k.amount) === Math.sign(parsed.amount));
    if (sideRecorded) continue;
    const gap = Math.abs((bi.at || 0) - parsed.at);
    if (gap > PAIR_WINDOW_MS) continue;
    const recorded = {
      bank: bi.bank, at: bi.at || 0, refTokens: bi.refTokens || [], description: bi.description || '',
      last4: (bi.accountKey || '').split(':')[1],
      cpName: normalizeName(bi.counterpartyName || ''),
    };
    const mine = movementOfParsed(parsed, accountName);
    // A transfer typed by hand has no bank text to compare; otherwise require evidence
    if (recorded.description && !sameTransferEvidence(mine, recorded, own)) continue;
    if (!best || gap < Math.abs(best.bankImport.at - parsed.at)) best = t;
  }
  return best;
}

// --- Transactions the user typed in by hand -------------------------------

const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
export const createdMs = (t) => t.createdAt?.toMillis?.() ?? (t.createdAt instanceof Date ? t.createdAt.getTime() : 0);
// A typed transaction matches a bank message if it was entered shortly before
// the money moved (typed, then paid) or afterwards, until the message is processed.
const TYPED_LEAD_MS = 30 * 60 * 1000;
const TYPED_LAG_MS = 12 * 60 * 60 * 1000;

// Does transaction t (typed by the user) record money moving `amount` through
// `accountName` around `date`? Typed dates may be a day off the bank's.
function recordsMovement(t, accountName, amount, date) {
  if (t.bankImport || t.isFuture || dayGap(t.date, date) > 1) return false;
  if (t.type === 'transfer') {
    return Number(t.amount) === Math.abs(amount) && (amount < 0 ? t.fromAccount : t.toAccount) === accountName;
  }
  if (t.type === 'split') return t.account === accountName && Number(t.totalAmount) === amount;
  return t.account === accountName && Number(t.amount) === amount;
}

// A typed transaction for this notification, entered around the time it happened
// (not yesterday's identical coffee, nor this morning's identical transfer).
function findTypedBefore(transactions, claimed, accountName, parsed) {
  let best = null;
  for (const t of transactions) {
    if (claimed.has(t.id) || !recordsMovement(t, accountName, parsed.amount, parsed.date)) continue;
    const created = createdMs(t);
    if (created < parsed.at - TYPED_LEAD_MS || created > parsed.at + TYPED_LAG_MS) continue;
    if (!best || dayGap(t.date, parsed.date) < dayGap(best.date, parsed.date)) best = t;
  }
  return best;
}

function bankImportFor(parsed, item, extra) {
  return {
    source: { email: 'gmail', 'mail-notification': 'email-app-notification' }[parsed.source] || 'android-notification',
    bank: parsed.bank,
    accountKey: parsed.accountKey,
    keys: [parsed.importKey],
    refTokens: parsed.refTokens,
    counterpartyKey: parsed.counterpartyKey,
    counterpartyName: parsed.counterpartyName || '',
    description: parsed.description,
    balance: parsed.balance,
    at: parsed.at,
    inboxId: item.id,
    ...extra,
  };
}

/**
 * Process every inbox item with status 'new'. Returns what still needs the user:
 *   needsAccount: [{ item, parsed }]  – bank account not linked to a Money Tracker account yet
 *   unrecognized: [item]               – looks like a transaction but couldn't be parsed
 */
export async function processInbox({ userId, items, accounts, transactions, categories }) {
  const needsAccount = [];
  const unrecognized = [];
  if (!userId || items.length === 0) return { needsAccount, unrecognized };

  // Working copy (never mutate DataContext state) so items processed in this run
  // can pair/dedupe with each other.
  const pool = transactions.filter(t => t.bankImport).map(t => ({ ...t }));
  const knownKeys = new Set(pool.flatMap(t => t.bankImport.keys || []));
  const claimed = new Set(); // typed transactions matched during this run
  const own = ownContext(accounts, pool);
  let categoriesReady = false;

  for (const item of [...items].sort((a, b) => postedMs(a) - postedMs(b))) {
    if (item.isTest || item.packageName === 'test') {
      await updateDoc(inboxRef(item.id), { status: 'ignored', reason: 'test', processedAt: new Date() });
      continue;
    }

    const parsed = parseBankNotification({ ...item, postedAtMs: postedMs(item) });
    if (!parsed) {
      if (looksLikeTransaction(item)) {
        unrecognized.push(item); // stays 'new' until the user dismisses it
      } else {
        await updateDoc(inboxRef(item.id), { status: 'ignored', reason: 'not-a-transaction', processedAt: new Date() });
      }
      continue;
    }

    let account = accounts.find(a => (a.bankAccountKeys || []).includes(parsed.accountKey));
    if (!account) {
      // Timo emails carry no account number, its notifications only the last digits.
      // With one linked account at that bank, use it — for a numbered message
      // only if that account was linked from an email ("TIMO:"), and remember the number.
      const bankPrefix = `${parsed.bank}:`;
      const atBank = accounts.filter(a => (a.bankAccountKeys || []).some(k => k.startsWith(bankPrefix)));
      const linkedFromEmail = atBank.length === 1 && atBank[0].bankAccountKeys.includes(bankPrefix);
      if (atBank.length === 1 && (!parsed.accountNumber || linkedFromEmail)) {
        account = atBank[0];
        if (parsed.accountNumber) {
          await updateDoc(doc(db, 'accounts', account.id), { bankAccountKeys: arrayUnion(parsed.accountKey) });
        } else {
          parsed.accountKey = account.bankAccountKeys.find(k => k !== bankPrefix && k.startsWith(bankPrefix)) || bankPrefix;
        }
      }
    }
    if (!account) {
      needsAccount.push({ item, parsed });
      continue;
    }

    // Remember the full account number (Timo only shows the last digits)
    const fullNumber = String(parsed.accountNumber);
    if (fullNumber.length >= 8 && !own.numbers.has(fullNumber)) {
      await updateDoc(doc(db, 'accounts', account.id), { bankAccountNumbers: arrayUnion(fullNumber) });
      own.numbers.set(fullNumber, account);
    }

    if (knownKeys.has(parsed.importKey)) {
      await updateDoc(inboxRef(item.id), { status: 'duplicate', processedAt: new Date() });
      continue;
    }

    const same = findSameMovement(pool, parsed, account.name);
    if (same) {
      const absorbed = await runTransaction(db, async (tx) => {
        const inboxSnap = await tx.get(inboxRef(item.id));
        if (inboxSnap.data()?.status !== 'new') return false;
        tx.update(doc(db, 'transactions', same.id), { 'bankImport.keys': arrayUnion(parsed.importKey) });
        tx.update(inboxRef(item.id), { status: 'duplicate', transactionId: same.id, processedAt: new Date() });
        return true;
      });
      if (absorbed) same.bankImport = { ...same.bankImport, keys: [...same.bankImport.keys, parsed.importKey] };
      knownKeys.add(parsed.importKey);
      continue;
    }

    const covering = findCoveringTransfer(pool, parsed, account.name, own);
    if (covering) {
      const absorbed = await runTransaction(db, async (tx) => {
        const inboxSnap = await tx.get(inboxRef(item.id));
        if (inboxSnap.data()?.status !== 'new') return false;
        tx.update(doc(db, 'transactions', covering.id), { 'bankImport.keys': arrayUnion(parsed.importKey) });
        tx.update(inboxRef(item.id), { status: 'imported', transactionId: covering.id, processedAt: new Date() });
        return true;
      });
      if (absorbed) covering.bankImport = { ...covering.bankImport, keys: [...covering.bankImport.keys, parsed.importKey] };
      knownKeys.add(parsed.importKey);
      continue;
    }

    // Already typed in by the user: attach the bank details to it instead of
    // creating a second copy. Their category/payee/memo stay as they are.
    const typed = findTypedBefore(transactions, claimed, account.name, parsed);
    if (typed) {
      claimed.add(typed.id);
      const bankImport = bankImportFor(parsed, item, { matched: true, autoCategorized: false });
      const typedRef = doc(db, 'transactions', typed.id);
      const attached = await runTransaction(db, async (tx) => {
        const [inboxSnap, typedSnap] = await Promise.all([tx.get(inboxRef(item.id)), tx.get(typedRef)]);
        if (inboxSnap.data()?.status !== 'new') return 'handled-elsewhere';
        if (!typedSnap.exists() || typedSnap.data().bankImport) return 'gone';
        tx.update(typedRef, {
          bankImport,
          clearStatus: typed.clearStatus === 'reconciled' ? 'reconciled' : 'cleared',
        });
        tx.update(inboxRef(item.id), { status: 'imported', transactionId: typed.id, processedAt: new Date() });
        return 'attached';
      });
      if (attached !== 'gone') {
        if (attached === 'attached') pool.push({ ...typed, bankImport });
        knownKeys.add(parsed.importKey);
        continue;
      }
    }

    const pair = findTransferPair(pool, parsed, account.name, own);
    if (pair) {
      const outgoing = parsed.amount < 0;
      const transfer = {
        type: 'transfer',
        amount: Math.abs(parsed.amount),
        fromAccount: outgoing ? account.name : pair.account,
        toAccount: outgoing ? pair.account : account.name,
        account: null,
        category: null,
        payee: null,
        spendingType: null,
        isLoan: false,
        updatedAt: new Date(),
      };
      const merged = await runTransaction(db, async (tx) => {
        const [inboxSnap, pairSnap] = await Promise.all([
          tx.get(inboxRef(item.id)),
          tx.get(doc(db, 'transactions', pair.id)),
        ]);
        if (inboxSnap.data()?.status !== 'new') return 'handled-elsewhere';
        if (!pairSnap.exists() || pairSnap.data().type !== pair.type) return 'pair-changed';
        tx.update(doc(db, 'transactions', pair.id), {
          ...transfer,
          'bankImport.keys': arrayUnion(parsed.importKey),
          'bankImport.autoCategorized': false,
        });
        tx.update(inboxRef(item.id), { status: 'imported', transactionId: pair.id, processedAt: new Date() });
        return 'merged';
      });
      if (merged !== 'pair-changed') {
        Object.assign(pair, transfer, { bankImport: { ...pair.bankImport, keys: [...pair.bankImport.keys, parsed.importKey] } });
        knownKeys.add(parsed.importKey);
        continue;
      }
    }

    // Only one side notified, but it names another own account
    const otherAccount = otherOwnAccount(movementOfParsed(parsed, account.name), own);
    const type = parsed.amount < 0 ? 'expense' : 'income';
    const learned = otherAccount ? null : learnedTarget(pool, categories, parsed.counterpartyKey, parsed.amount);
    if (!otherAccount && !learned && !categoriesReady) {
      await ensureUncategorizedCategories(userId, categories);
      categoriesReady = true;
    }

    const data = {
      userId,
      amount: parsed.amount,
      date: parsed.date,
      payee: parsed.payee,
      memo: '', // the bank text is long; it's kept in bankImport.description for the review screen
      account: account.name,
      tag: null,
      tags: null,
      isFuture: false,
      createdAt: new Date(parsed.at), // keeps same-day ordering by bank time
      clearStatus: 'cleared', // the bank already confirmed it
      bankImport: bankImportFor(parsed, item, { autoCategorized: Boolean(learned) }),
    };
    if (otherAccount) {
      const outgoing = parsed.amount < 0;
      Object.assign(data, {
        type: 'transfer',
        amount: Math.abs(parsed.amount),
        fromAccount: outgoing ? account.name : otherAccount.name,
        toAccount: outgoing ? otherAccount.name : account.name,
        account: null,
        payee: null,
      });
    } else if (learned?.loan) {
      // Same shape as AddLoanTransactionModal: signed amount, money in = positive
      Object.assign(data, {
        type: 'loan',
        loan: learned.loan,
        loanType: learned.loanType,
        loanClearStatus: 'uncleared',
      });
    } else {
      const category = learned?.category || UNCATEGORIZED[type];
      Object.assign(data, { type, category, isLoan: false });
      if (type === 'expense') data.spendingType = spendingTypeFor(categories, category);
    }

    const txRef = doc(db, 'transactions', transactionId(parsed.importKey));
    const created = await runTransaction(db, async (tx) => {
      const inboxSnap = await tx.get(inboxRef(item.id));
      if (inboxSnap.data()?.status !== 'new') return false; // another device got there first
      tx.set(txRef, data);
      tx.update(inboxRef(item.id), { status: 'imported', transactionId: txRef.id, processedAt: new Date() });
      return true;
    });
    if (created) pool.push({ id: txRef.id, ...data });
    knownKeys.add(parsed.importKey);
  }

  return { needsAccount, unrecognized };
}

/**
 * Imports that turn out to be transfers between own accounts but weren't
 * recognised when they arrived (imported before a rule existed, an account was
 * linked later, or its number wasn't known yet):
 *  - two sides: keep the outgoing one as the transfer, delete the incoming copy
 *  - one side naming another own account (number, or bank + own name): turn it into the transfer
 * Returns how many were changed.
 */
export async function pairImportedTransfers(transactions, accounts) {
  const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const own = ownContext(accounts, transactions.filter(t => t.bankImport));
  const open = transactions.filter(t => isUndecidedImport(t) && (t.bankImport.at || 0) >= since);
  const used = new Set();
  let merged = 0;
  for (const out of open.filter(t => Number(t.amount) < 0)) {
    let inc = null;
    for (const t of open) {
      if (used.has(t.id) || Number(t.amount) <= 0 || !isOwnTransfer(movementOf(out), movementOf(t), own)) continue;
      if (!inc || Math.abs(t.bankImport.at - out.bankImport.at) < Math.abs(inc.bankImport.at - out.bankImport.at)) inc = t;
    }
    if (!inc) continue;
    used.add(inc.id);
    used.add(out.id);

    const batch = writeBatch(db);
    batch.update(doc(db, 'transactions', out.id), {
      type: 'transfer',
      amount: Math.abs(Number(out.amount)),
      fromAccount: out.account,
      toAccount: inc.account,
      account: null,
      category: null,
      payee: null,
      spendingType: null,
      isLoan: false,
      updatedAt: new Date(),
      'bankImport.keys': arrayUnion(...(inc.bankImport.keys || [])),
      'bankImport.autoCategorized': false,
    });
    batch.delete(doc(db, 'transactions', inc.id));
    await batch.commit();
    merged++;
  }

  for (const t of open) {
    if (used.has(t.id)) continue;
    const other = otherOwnAccount(movementOf(t), own);
    if (!other) continue;
    const outgoing = Number(t.amount) < 0;
    await updateDoc(doc(db, 'transactions', t.id), {
      type: 'transfer',
      amount: Math.abs(Number(t.amount)),
      fromAccount: outgoing ? t.account : other.name,
      toAccount: outgoing ? other.name : t.account,
      account: null,
      category: null,
      payee: null,
      spendingType: null,
      isLoan: false,
      updatedAt: new Date(),
      'bankImport.autoCategorized': false,
    });
    merged++;
  }
  return merged;
}

/**
 * The other order: a notification was imported first, then the user typed the
 * same transaction in by hand. Keep the typed one (their category, payee, memo),
 * move the bank details onto it and delete the imported copy. Only typed
 * transactions created after the bank movement count, so an identical purchase
 * typed in on an earlier day is never merged away.
 */
export async function mergeTypedDuplicates(transactions) {
  const claimed = new Set();
  const since = Date.now() - 14 * 24 * 60 * 60 * 1000; // older imports are settled
  for (const imported of transactions) {
    const bi = imported.bankImport;
    if (!bi || bi.matched || imported.clearStatus === 'reconciled' || (bi.at || 0) < since) continue;

    const typedAfter = (t) => !claimed.has(t.id) && createdMs(t) > (bi.at || Infinity);
    let typed;
    if (imported.type === 'transfer') {
      typed = transactions.find(t => typedAfter(t)
        && recordsMovement(t, imported.fromAccount, -Number(imported.amount), imported.date)
        && t.toAccount === imported.toAccount);
    } else {
      const amount = imported.type === 'split' ? Number(imported.totalAmount) : Number(imported.amount);
      typed = transactions.find(t => typedAfter(t) && recordsMovement(t, imported.account, amount, imported.date));
    }
    if (!typed) continue;

    claimed.add(typed.id);
    const batch = writeBatch(db);
    batch.update(doc(db, 'transactions', typed.id), {
      bankImport: { ...bi, matched: true, autoCategorized: false },
      clearStatus: typed.clearStatus === 'reconciled' ? 'reconciled' : 'cleared',
    });
    batch.delete(doc(db, 'transactions', imported.id));
    await batch.commit();
  }
}

export function linkBankAccount(accountId, accountKey, accountNumbers = []) {
  const update = { bankAccountKeys: arrayUnion(accountKey) };
  const full = accountNumbers.filter(n => String(n).length >= 8);
  if (full.length > 0) update.bankAccountNumbers = arrayUnion(...full);
  return updateDoc(doc(db, 'accounts', accountId), update);
}

export function dismissInboxItem(id) {
  return updateDoc(inboxRef(id), { status: 'dismissed', processedAt: new Date() });
}
