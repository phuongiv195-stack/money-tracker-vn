// Turns a short spoken or typed note into a transaction draft, without AI:
//   "25 ngàn rau Street Grocer"      -> -25,000 · payee Street Grocer · memo "rau"
//   "1tr2 tiền nhà OCB"               -> -1,200,000 from the OCB account
//   "45k coffee Highlands yesterday"  -> -45,000 dated yesterday
//   "+500k lương"                     -> income 500,000
// Pure function (no Firebase), so it can be tested with plain Node.

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const norm = (s) => stripAccents(String(s || '')).toLowerCase();

// Words split for matching; numbers keep their separators ("25.000", "1,5", "1tr2").
// n: without accents, for names; l: lower case WITH accents, for Vietnamese words
// that differ only by accent ("trả" pay / "trà" tea, "tiền về" / "tiền vé").
function tokenize(text) {
  return (text.normalize('NFC').match(/[+]?[\p{L}\p{N}][\p{L}\p{N}.,]*|[+]/gu) || [])
    .map(raw => {
      const word = raw.replace(/[.,]+$/, ''); // trailing punctuation from voice typing
      return { raw: word, n: norm(word), l: word.toLowerCase(), used: false };
    })
    .filter(t => t.raw);
}

// --- Amount -------------------------------------------------------------------

const THOUSAND = /^(k|ka|ngan|nghin|thousand|thousands|ng)$/;
const MILLION = /^(tr|trieu|cu|m|million|millions|mil)$/;
const HUNDRED_K = /^(tram|hundred)$/; // "2 trăm" = 200,000 when talking money
const HALF = /^(ruoi|half)$/;

// "25.000" / "25,000" thousands, "1.5" / "1,5" decimals
function readNumber(s) {
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
}

// Finds the amount: a number, optionally a unit ("k", "ngàn", "tr", "triệu"),
// optionally the next unit's digits ("1tr2", "1 triệu 2") or "rưỡi".
function takeAmount(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // glued forms: "25k", "1tr", "1tr2", "1.5tr", "500ng"
    const glued = t.n.match(/^\+?(\d+(?:[.,]\d+)*)(k|tr|trieu|m|ng)(\d{0,3})$/);
    const plain = t.n.match(/^\+?(\d+(?:[.,]\d+)*)$/);
    if (!glued && !plain) continue;

    let value = readNumber((glued || plain)[1]);
    let unit = glued ? glued[2] : null;
    let tail = glued ? glued[3] : '';
    const used = [i];

    let j = i + 1;
    if (!unit && tokens[j] && (THOUSAND.test(tokens[j].n) || MILLION.test(tokens[j].n) || HUNDRED_K.test(tokens[j].n))) {
      unit = tokens[j].n;
      used.push(j++);
    }
    // "1 triệu 2" / "1 triệu 250": the following bare digits belong to the amount
    if (unit && MILLION.test(unit) && !tail && tokens[j] && /^\d{1,3}$/.test(tokens[j].n)) {
      tail = tokens[j].n;
      used.push(j++);
    }
    let half = false;
    if (tokens[j] && HALF.test(tokens[j].n)) {
      half = true;
      used.push(j++);
    }

    let multiplier;
    if (!unit) multiplier = value < 1000 ? 1000 : 1; // "25" alone means 25,000
    else if (THOUSAND.test(unit)) multiplier = 1000;
    else if (MILLION.test(unit)) multiplier = 1_000_000;
    else multiplier = 100_000;

    let amount = value * multiplier;
    if (tail) amount += Number(tail) * (multiplier / 10 ** tail.length); // 1tr2 -> +200,000
    if (half) amount += multiplier / 2;

    used.forEach(k => { tokens[k].used = true; });
    return { amount: Math.round(amount), positive: t.raw.startsWith('+') };
  }
  return null;
}

// --- Names (accounts, categories, payees) -----------------------------------

// Longest run of unused tokens equal to a name's words; marks them used.
function takeName(tokens, names) {
  const candidates = names
    .map(item => ({ item, words: norm(item.name).split(/[^\p{L}\p{N}]+/u).filter(Boolean) }))
    .filter(c => c.words.length > 0)
    .sort((a, b) => b.words.length - a.words.length);
  for (const { item, words } of candidates) {
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (words.every((w, k) => !tokens[i + k].used && tokens[i + k].n === w)) {
        for (let k = 0; k < words.length; k++) tokens[i + k].used = true;
        return item;
      }
    }
  }
  return null;
}

const takeWords = (tokens, re) => {
  let found = false;
  tokens.forEach(t => {
    if (!t.used && re.test(t.n)) {
      t.used = true;
      found = true;
    }
  });
  return found;
};

// Two-word phrases ("hom qua", "tien mat") checked on adjacent unused tokens.
function takePhrase(tokens, phrases) {
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of phrases) {
      const words = phrase.split(' ');
      if (words.every((w, k) => tokens[i + k] && !tokens[i + k].used && tokens[i + k].n === w)) {
        for (let k = 0; k < words.length; k++) tokens[i + k].used = true;
        return phrase;
      }
    }
  }
  return null;
}

const BANK_WORDS = { vcb: 'VCB', vietcombank: 'VCB', ocb: 'OCB', timo: 'TIMO', bv: 'BV', bvbank: 'BV' };
// Linking words left out of the memo, matched with accents ("cho" for / "chợ" market)
const FILLER_WORDS = new Set(['ở', 'tại', 'cho', 'từ', 'bằng', 'với', 'at', 'for', 'from', 'by', 'with']);

// Saying which way the money went. Vietnamese words are matched with accents.
const INCOME_PHRASES = ['tiền về', 'nhận được'];
const INCOME_VI = new Set(['nhận', 'thu', 'lương', 'hoàn']);
const INCOME_EN = /^(income|received|receive|salary|refund)$/;
const EXPENSE_VI = new Set(['chi', 'trả', 'tiêu', 'mua']);
const EXPENSE_EN = /^(paid|pay|spent|spend|bought|buy|expense)$/;

// Marks the direction words used; returns 'income', 'expense' or null if none was said.
function takeDirection(tokens) {
  let income = false;
  let expense = false;
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of INCOME_PHRASES) {
      const words = phrase.split(' ');
      if (words.every((w, k) => tokens[i + k] && !tokens[i + k].used && tokens[i + k].l === w)) {
        words.forEach((_, k) => { tokens[i + k].used = true; });
        income = true;
      }
    }
  }
  tokens.forEach(t => {
    if (t.used) return;
    if (INCOME_VI.has(t.l) || INCOME_EN.test(t.n)) {
      t.used = true;
      income = true;
    } else if (EXPENSE_VI.has(t.l) || EXPENSE_EN.test(t.n)) {
      t.used = true;
      expense = true;
    }
  });
  if (income && !expense) return 'income';
  if (expense) return 'expense';
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * @param text      what was said or typed
 * @param ctx       { accounts, categories, payees: string[], payeeToCategory: {payee: category},
 *                    defaultAccount: name, today: Date }
 * @returns { amount (signed), type, account, category, payee, memo, date } — amount is null if none was found
 */
export function parseQuickAdd(text, ctx) {
  const tokens = tokenize(text);
  const today = ctx.today || new Date();

  const found = takeAmount(tokens);

  // Date words
  const day = new Date(today);
  const when = takePhrase(tokens, ['hom qua', 'hom kia', 'hom nay']) || (takeWords(tokens, /^yesterday$/) ? 'hom qua' : null);
  if (when === 'hom qua') day.setDate(day.getDate() - 1);
  if (when === 'hom kia') day.setDate(day.getDate() - 2);
  takeWords(tokens, /^today$/);

  // Income or expense: "+500k", or said ("nhận", "tiền về" / "chi", "trả", "tiêu"); expense by default
  const direction = takeDirection(tokens);
  const type = found?.positive || direction === 'income' ? 'income' : 'expense';

  // Account: by name, by bank ("OCB" -> the account linked to OCB), or cash
  const activeAccounts = (ctx.accounts || []).filter(a => a.isActive !== false && a.group !== 'LOANS');
  let account = takeName(tokens, activeAccounts)?.name || null;
  if (!account) {
    for (const t of tokens) {
      const bank = !t.used && BANK_WORDS[t.n];
      if (!bank) continue;
      const linked = activeAccounts.find(a => (a.bankAccountKeys || []).some(k => k.startsWith(`${bank}:`)))
        || activeAccounts.find(a => norm(a.name).split(/\s+/).includes(t.n));
      if (linked) {
        t.used = true;
        account = linked.name;
        break;
      }
    }
  }
  if (!account && (takePhrase(tokens, ['tien mat']) || takeWords(tokens, /^cash$/))) {
    const isCash = (name) => /cash|tien mat/.test(norm(name));
    account = (ctx.defaultAccount && isCash(ctx.defaultAccount) ? ctx.defaultAccount : null)
      || activeAccounts.find(a => isCash(a.name))?.name || null;
  }
  account = account || ctx.defaultAccount || null;

  // Known payee first (longest match), then the category if it was said
  const payeeItem = takeName(tokens, (ctx.payees || []).map(name => ({ name })));
  const typedCategories = (ctx.categories || []).filter(c => c.type === type && !/^uncategorized/i.test(c.name));
  let category = takeName(tokens, typedCategories)?.name || null;

  // Unknown payee: words written with a capital letter (voice typing capitalises
  // names). The first word is capitalised anyway as the start of the sentence, so
  // it only counts when the next word is capitalised too ("Bún Bò Huế ...").
  let payee = payeeItem?.name || '';
  if (!payee) {
    const isCap = (t) => t && !t.used && /^\p{Lu}/u.test(t.raw) && !/^\d/.test(t.raw);
    const caps = tokens.filter((t, i) => isCap(t) && (i > 0 || isCap(tokens[1])));
    if (caps.length) {
      // the first run of consecutive capitalised words
      const start = tokens.indexOf(caps[0]);
      let end = start;
      while (tokens[end + 1] && !tokens[end + 1].used && /^\p{Lu}/u.test(tokens[end + 1].raw)) end++;
      payee = tokens.slice(start, end + 1).map(t => t.raw).join(' ');
      tokens.slice(start, end + 1).forEach(t => { t.used = true; });
    }
  }
  if (!category && payee) {
    const learned = ctx.payeeToCategory?.[payee];
    if (learned && typedCategories.some(c => c.name === learned)) category = learned;
  }

  const memo = tokens.filter(t => !t.used && !FILLER_WORDS.has(t.l)).map(t => t.raw).join(' ');

  return {
    amount: found ? (type === 'expense' ? -found.amount : found.amount) : null,
    type,
    account,
    category,
    payee,
    memo,
    date: dateStr(day),
  };
}
