// Parsers for Vietnamese bank transaction messages: phone notifications captured
// by the Android "PD Rich Sync" app (see android-bank-capture/) and bank
// emails forwarded by the Gmail Apps Script (see apps-script/). Pure functions,
// no Firebase, so they can be tested with plain Node.
//
// parseBankNotification(item) returns null when the text isn't a transaction,
// otherwise:
//   { source: 'push' | 'email' | 'mail-notification', bank, accountNumber, amount, balance,
//     date: 'YYYY-MM-DD', time: 'HH:mm:ss' ('' when the message has no time),
//     at (ms), description, payee, counterpartyKey, refTokens, importKey }

const BANK_BY_PACKAGE = {
  'com.VCB': 'VCB',
  'io.lifestyle.plus': 'TIMO',
  'vn.com.ocb.awe': 'OCB',
  'com.ocb.omniextra': 'OCB',
  'vn.banvietbank.mobilebanking': 'BV',
};

export const BANK_LABELS = { VCB: 'VCB', TIMO: 'Timo', OCB: 'OCB', BV: 'BV Bank' };

const pad = (n) => String(n).padStart(2, '0');

// "1,234,567" / "1.234.567" -> 1234567 (VND has no decimals)
const toNumber = (s) => Number(String(s).replace(/[.,\s]/g, ''));

const signed = (sign, digits) => (sign === '-' ? -1 : 1) * toNumber(digits);

// ---------------------------------------------------------------------------
// Per-bank parsers: (text, postedAt ms) -> partial result or null
// ---------------------------------------------------------------------------

// Số dư TK VCB 1012345678 -500,000 VND lúc 06-10-2026 07:17:01. Số dư 32,397,528 VND. Ref MBVCB....
// The Vietnamese words between the numbers are matched loosely (\D*?) so
// spacing or accent variations can't break it.
function parseVCB(text) {
  const m = text.match(
    /TK\s+VCB\s+(\d+)\s+([+-])\s*([\d,.]+)\s*VND\D*?(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\D*?([\d,.]+)\s*VND\.?\s*(?:Ref\s*)?([\s\S]*)/
  );
  if (!m) return null;
  return {
    bank: 'VCB',
    accountNumber: m[1],
    amount: signed(m[2], m[3]),
    date: `${m[6]}-${m[5]}-${m[4]}`,
    time: `${m[7]}:${m[8]}:${m[9]}`,
    balance: toNumber(m[10]),
    description: m[11],
  };
}

// 06/10 07:17\nTài khoản: 0037...\nSố tiền: +500.000 VND\nSố dư: 1.783.327 VND\nNội dung: ...
function parseOCB(text, postedAt) {
  const when = text.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))? (\d{2}):(\d{2})(?::(\d{2}))?/);
  const acc = text.match(/Tài khoản:\s*(\d+)/);
  const amt = text.match(/Số tiền:\s*([+-])\s*([\d.,]+)/);
  const bal = text.match(/Số dư:\s*(-?[\d.,]+)/);
  if (!when || !acc || !amt) return null;
  const year = when[3] || inferYear(Number(when[2]), postedAt);
  return {
    bank: 'OCB',
    accountNumber: acc[1],
    amount: signed(amt[1], amt[2]),
    date: `${year}-${when[2]}-${when[1]}`,
    time: `${when[4]}:${when[5]}:${when[6] || '00'}`,
    balance: bal ? toNumber(bal[1]) : null,
    description: lineAfter(text, /Nội dung:\s*/),
  };
}

// Your Spend Account has been debited 290,000 on 06/10/2026 06:04 VN
// Your remaining balance is 512,000 VND / Transaction Description: ... / Account no: xxxxxxxxx1234
function parseTimo(text) {
  const m = text.match(
    /has been (debited|credited) ([\d,.]+)(?: VND)? on (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/i
  );
  if (!m) return null;
  const acc = text.match(/Account no:\s*[x*X]*(\d+)/);
  const bal = text.match(/(?:remaining|current) balance is:?\s*([\d,.]+)/i);
  return {
    bank: 'TIMO',
    accountNumber: acc ? acc[1] : '',
    amount: (m[1].toLowerCase() === 'debited' ? -1 : 1) * toNumber(m[2]),
    date: `${m[5]}-${m[4]}-${m[3]}`,
    time: `${m[6]}:${m[7]}:${m[8] || '00'}`,
    balance: bal ? toNumber(bal[1]) : null,
    description: restOfLine(text, /Transaction Description:\s*/).replace(/\.$/, ''),
  };
}

// Vietnamese version (emails and notifications):
// Tài khoản Spend Account vừa giảm 10.000 VND vào 06/10/2026 10:14. Số dư hiện tại: 607.080 VND.
function parseTimoVi(text) {
  const m = text.match(
    /vừa\s+(giảm|tăng)\s+([\d.,]+)\s*(?:VND|đ)?\s+vào\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i
  );
  if (!m) return null;
  const acc = text.match(/(?:Số tài khoản|Account no):?\s*[x*X]*(\d+)/i);
  const bal = text.match(/Số dư hiện tại:?\s*([\d.,]+)/i);
  return {
    bank: 'TIMO',
    accountNumber: acc ? acc[1] : '',
    amount: (m[1].toLowerCase() === 'giảm' ? -1 : 1) * toNumber(m[2]),
    date: `${m[5]}-${m[4]}-${m[3]}`,
    time: `${m[6]}:${m[7]}:${m[8] || '00'}`,
    balance: bal ? toNumber(bal[1]) : null,
    description: restOfLine(text, /(?:Nội dung(?: giao dịch)?|Mô tả):\s*/i).replace(/\.$/, ''),
  };
}

const parseTimoAny = (text) => parseTimo(text) || parseTimoVi(text);

// 06/10/26 07:52:07\nSố tài khoản: 1230000123456\nPhát sinh: +10,000\nSố dư: 25,000,000 VND\nNội dung: ...
function parseBV(text) {
  const when = text.match(/(\d{2})\/(\d{2})\/(\d{2,4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  const acc = text.match(/Số tài khoản:\s*(\d+)/);
  const amt = text.match(/Phát sinh:\s*([+-])\s*([\d.,]+)/);
  const bal = text.match(/Số dư:\s*(-?[\d.,]+)/);
  if (!when || !acc || !amt) return null;
  const year = when[3].length === 2 ? `20${when[3]}` : when[3];
  return {
    bank: 'BV',
    accountNumber: acc[1],
    amount: signed(amt[1], amt[2]),
    date: `${year}-${when[2]}-${when[1]}`,
    time: `${when[4]}:${when[5]}:${when[6] || '00'}`,
    balance: bal ? toNumber(bal[1]) : null,
    description: lineAfter(text, /Nội dung:\s*/),
  };
}

// --- Emails (plain-text body from Gmail). Labels are matched in English, the
// second line of each bilingual table row.

// VCB "Biên lai chuyển tiền qua tài khoản": a receipt for money sent.
// Trans. Date, Time 18:38 Thứ Bảy 26/09/2026 / Order Number 16240000002 /
// Debit Account 1012345678 / Credit Account 050114792788 / Beneficiary Name ... /
// Amount 410,000 VND / Details of Payment ...
function parseVCBEmail(text) {
  const when = text.match(/Trans\.?\s*Date,?\s*Time\s*:?\s*(\d{1,2}):(\d{2})\D+?(\d{2})\/(\d{2})\/(\d{4})/i);
  const from = text.match(/Debit Account\s*:?\s*(\d+)/i);
  const amt = text.match(/(?:^|\n)\s*Amount\s*:?\s*([\d.,]+)\s*VND/i);
  if (!when || !from || !amt) return null;
  const order = text.match(/Order Number\s*:?\s*(\d+)/i);
  const to = text.match(/Credit Account\s*:?\s*(\S+)/i);
  const name = text.match(/Beneficiary Name\s*:?\s*([^\n]+)/i);
  return {
    bank: 'VCB',
    accountNumber: from[1],
    amount: -toNumber(amt[1]),
    date: `${when[5]}-${when[4]}-${when[3]}`,
    time: `${pad(when[1])}:${when[2]}:00`,
    balance: null,
    description: restOfLine(text, /Details of Payment\s*:?\s*/i),
    extraRefs: order ? [order[1]] : [],
    counterparty: to ? { accountNumber: to[1], name: name ? name[1].trim() : '' } : null,
  };
}

// BV "Biên lai giao dịch chuyển khoản": Transaction Date 05/10/2026 (no time) /
// Transaction Number 123IOUR260000001 6278VCBCW2YNPPJE / Debit Account ... /
// Amount 370.000 VND / Beneficiary Account ... / Beneficiary Name ... / Payment Details ...
function parseBVEmail(text) {
  const when = text.match(/Transaction Date\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/i);
  const debit = text.match(/Debit Account\s*:?\s*(\d+)/i);
  const credit = text.match(/Credit Account\s*:?\s*(\d+)/i);
  const amt = text.match(/(?:^|\n)\s*Amount\s*:?\s*([\d.,]+)\s*VND/i);
  if (!when || !(debit || credit) || !amt) return null;
  const refs = text.match(/Transaction Number\s*:?\s*([A-Z0-9]{8,})(?:\s+([A-Z0-9]{8,}))?/i);
  const to = text.match(/Beneficiary Account\s*:?\s*(\S+)/i);
  const name = text.match(/Beneficiary Name\s*:?\s*([^\n]+)/i);
  return {
    bank: 'BV',
    accountNumber: (debit || credit)[1],
    amount: (debit ? -1 : 1) * toNumber(amt[1]),
    date: `${when[3]}-${when[2]}-${when[1]}`,
    time: when[4] ? `${when[4]}:${when[5]}:${when[6] || '00'}` : '',
    balance: null,
    description: restOfLine(text, /Payment Details\s*:?\s*/i),
    extraRefs: refs ? refs.slice(1).filter(Boolean) : [],
    counterparty: debit && to ? { accountNumber: to[1], name: name ? name[1].trim() : '' } : null,
  };
}

const PARSERS = { VCB: parseVCB, OCB: parseOCB, TIMO: parseTimoAny, BV: parseBV };

// Email sender (address from Gmail, or the sender name shown in an email app's
// notification) -> parser. Timo's emails read like its notifications.
const EMAIL_PARSERS = [
  [/timo/i, parseTimoAny],
  [/vietcombank|vcbdigibank/i, parseVCBEmail],
  [/bvbank|ban viet|bản việt/i, parseBVEmail],
];

// Email apps whose notifications the Android app forwards (bank senders only).
// They show the sender as the title and the start of the email as the text.
const EMAIL_APP_PACKAGES = new Set(['com.google.android.gm', 'com.samsung.android.email.provider', 'com.microsoft.office.outlook']);

// Import-key prefix per source; phone notifications from the bank apps have none.
const KEY_PREFIX = { email: 'E|', 'mail-notification': 'G|', push: '' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Everything after the label up to the next "Label:" line (or the end).
function lineAfter(text, labelRe) {
  const m = text.match(new RegExp(labelRe.source + '([\\s\\S]*?)(?:\\n[^\\n]{1,40}:\\s|$)'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// Text after the label up to the end of that line.
function restOfLine(text, labelRe) {
  const m = text.match(new RegExp(labelRe.source + '([^\n]*)', labelRe.flags.replace('g', '')));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// OCB omits the year: use the notification's year, stepping back across New Year.
function inferYear(month, postedAt) {
  const posted = new Date(postedAt || Date.now());
  const year = posted.getFullYear();
  return month > posted.getMonth() + 1 + 1 ? year - 1 : year;
}

// Long tokens with digits (bank reference codes). Two sides of one transfer
// between own accounts share them, e.g. "MBVCB.16380000001...". Account numbers
// are excluded: they repeat across every transfer from the same account.
function refTokens(description, ownAccountNumber) {
  const accountNumbers = new Set([ownAccountNumber]);
  for (const m of description.matchAll(/\b(?:tu|toi)\s+(\d{6,})/gi)) accountNumbers.add(m[1]);
  return [...new Set(
    description.split(/[^A-Za-z0-9]+/).filter(t => t.length >= 8 && /\d/.test(t) && !accountNumbers.has(t))
  )];
}

const NAME = "([A-Z][A-Z .'-]*?[A-Z])";

// Who the money went to (outgoing) or came from (incoming), from the free-text
// description. Vietnamese interbank transfers usually carry
// "CT tu <acct> <SENDER NAME> toi <acct> <RECIPIENT NAME> tai <BANK>".
function counterparty(description, amount) {
  const d = description.replace(/\s+/g, ' ');
  const to = d.match(new RegExp(`toi (\\d{6,}) ${NAME}(?: tai |$)`));
  const from = d.match(new RegExp(`CT tu (\\d{6,}) ${NAME}(?: toi | tai |$)`));
  const side = amount < 0 ? to : from;
  if (side) return { accountNumber: side[1], name: side[2] };

  // "TRAN THI B chuyen tien#SP#..." / "VCCB;123;LE VAN C transfer.CT tu ..."
  const named = d.match(new RegExp(`(?:^|[;.])\\s*${NAME} (?:chuyen tien|chuyen khoan|transfer)`, 'i'))
    || d.match(new RegExp(`Sent by ${NAME} from`, 'i')); // Timo: "Sent by NGUYEN VAN A from my Timo"
  if (named && amount > 0) return { accountNumber: '', name: named[1].toUpperCase() };

  // Short free text without codes, e.g. "Pickleball Club": treat as the name.
  if (d && d.length <= 40 && !/\d{4,}/.test(d)) return { accountNumber: '', name: d, isText: true };
  return null;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());

const stripDiacritics = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

// The other party's name from a description, normalized ('' if unknown).
export const counterpartyNameOf = (description, amount) => {
  const cp = counterparty(description || '', amount);
  return cp && !cp.isText ? normalizeName(cp.name) : '';
};

// "Nguyễn Văn A" / "NGUYEN VAN A" -> "NGUYEN VAN A"
export const normalizeName = (s) => stripDiacritics(String(s || '')).toUpperCase().replace(/\s+/g, ' ').trim();

export const accountKey = (bank, accountNumber) => `${bank}:${String(accountNumber || '').slice(-4)}`;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Bank apps may send decomposed accents (NFD) or non-breaking spaces; the
// regexes above expect composed text and plain spaces.
const clean = (s) => (s || '')
  .normalize('NFC')
  .replace(/[   ]/g, ' ')
  .replace(/[​-‍﻿]/g, '');

export function parseBankNotification(item) {
  const text = [clean(item.title), clean(item.bigText || item.text)].filter(Boolean).join('\n');
  const postedAt = item.postedAtMs || Date.now();
  const source = item.source === 'email' ? 'email'
    : EMAIL_APP_PACKAGES.has(item.packageName) ? 'mail-notification'
    : 'push';

  let candidates;
  if (source !== 'push') {
    const sender = item.from || item.title || '';
    candidates = EMAIL_PARSERS.filter(([re]) => re.test(sender)).map(([, parse]) => parse);
  } else {
    const known = BANK_BY_PACKAGE[item.packageName];
    // Try the app's own bank first, then the others (package names can change).
    const order = known ? [known, ...Object.keys(PARSERS).filter(b => b !== known)] : Object.keys(PARSERS);
    candidates = order.map(bank => PARSERS[bank]);
  }
  let parsed = null;
  for (const parse of candidates) {
    parsed = parse(text, postedAt);
    if (parsed) break;
  }
  if (!parsed || !parsed.amount) return null;

  const [y, mo, d] = parsed.date.split('-').map(Number);
  const [h, mi, s] = (parsed.time || '12:00:00').split(':').map(Number); // date-only receipts: midday
  const at = new Date(y, mo - 1, d, h, mi, s).getTime();

  // Receipts name the other party in their own fields; notifications in free text.
  const cp = parsed.counterparty?.accountNumber
    ? parsed.counterparty
    : counterparty(parsed.description, parsed.amount);
  const counterpartyKey = cp
    ? (cp.accountNumber ? `acct:${cp.accountNumber}` : `name:${stripDiacritics(cp.name).toUpperCase()}`)
    : null;

  const { extraRefs = [], counterparty: _cp, ...fields } = parsed;
  const key = [parsed.bank, String(parsed.accountNumber).slice(-4), parsed.date, parsed.time, parsed.amount, parsed.balance ?? ''].join('|');
  return {
    ...fields,
    source,
    at,
    payee: cp && !cp.isText ? titleCase(cp.name) : (cp?.name || ''),
    counterpartyName: cp && !cp.isText ? normalizeName(cp.name) : '',
    counterpartyKey,
    refTokens: [...new Set([...refTokens(parsed.description, parsed.accountNumber), ...extraRefs])],
    accountKey: accountKey(parsed.bank, parsed.accountNumber),
    // Email keys are marked by source so a notification and an email of one
    // transaction can be told apart, and carry the bank's reference (or the
    // message's own id): receipts may have no time or balance, so two identical
    // payments on one day would otherwise share a key.
    importKey: source === 'push' ? key : `${KEY_PREFIX[source]}${key}|${extraRefs[0] || item.id || ''}`,
  };
}

// Non-transaction texts (promotions, reminders) are dropped silently; texts that
// look like money movements but didn't parse are surfaced for the user.
export function looksLikeTransaction(item) {
  const text = `${clean(item.title)} ${clean(item.bigText || item.text)}`;
  return /\d[\d.,]{3,}/.test(text) && /(VND|Số dư|Phát sinh|balance|debited|credited|Số tiền)/i.test(text);
}

export const formatPostedDate = (ms) => {
  const dt = new Date(ms);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
