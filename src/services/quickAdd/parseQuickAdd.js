// Turns a short spoken or typed note into a transaction draft, without AI:
//   "25 ngàn rau Street Grocer"      -> -25,000 · payee Street Grocer · memo "rau"
//   "1tr2 tiền nhà OCB"               -> -1,200,000 from the OCB account
//   "45k coffee Highlands yesterday"  -> -45,000 dated yesterday
//   "+500k lương"                     -> income 500,000
//   "rau 15k thịt 50k cá 30k"         -> -95,000 (15k + 50k + 30k)
// It also learns from the user: names heard for a payee (aliases) and which
// category memo words like "rau" usually go to (learnWordCategories).
// Pure functions (no Firebase), so they can be tested with plain Node.

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const norm = (s) => stripAccents(String(s || '')).toLowerCase();

// "Trít gờ rô sơ" -> ['trit', 'go', 'ro', 'so']: how aliases are stored and matched
export const aliasWords = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

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
    if (t.used) continue;
    // glued forms: "25k", "1tr", "1tr2", "1.5tr", "500ng"
    const glued = t.n.match(/^\+?(\d+(?:[.,]\d+)*)(k|tr|trieu|m|ng)(\d{0,3})$/);
    const plain = t.n.match(/^\+?(\d+(?:[.,]\d+)*)$/);
    if (!glued && !plain) continue;

    let value = readNumber((glued || plain)[1]);
    let unit = glued ? glued[2] : null;
    let tail = glued ? glued[3] : '';
    const used = [i];

    let j = i + 1;
    const free = (k) => tokens[k] && !tokens[k].used;
    if (!unit && free(j) && (THOUSAND.test(tokens[j].n) || MILLION.test(tokens[j].n) || HUNDRED_K.test(tokens[j].n))) {
      unit = tokens[j].n;
      used.push(j++);
    }
    // "1 triệu 2" / "1 triệu 250": the following bare digits belong to the amount
    if (unit && MILLION.test(unit) && !tail && free(j) && /^\d{1,3}$/.test(tokens[j].n)) {
      tail = tokens[j].n;
      used.push(j++);
    }
    let half = false;
    if (free(j) && HALF.test(tokens[j].n)) {
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
    // explicit: had a unit or thousands separators; a bare "3" may be a quantity
    const explicit = Boolean(unit) || value >= 1000;
    return { amount: Math.round(amount), positive: t.raw.startsWith('+'), explicit, used };
  }
  return null;
}

// Every amount said: "rau 15k thịt 50k" -> [15000, 50000]. When some amount
// has a unit, bare small numbers are quantities ("3 ổ bánh mì 45k") and stay in the memo.
function takeAmounts(tokens) {
  const amounts = [];
  let found;
  while ((found = takeAmount(tokens))) amounts.push(found);
  if (amounts.some(a => a.explicit)) {
    for (const a of amounts.filter(x => !x.explicit)) a.used.forEach(k => { tokens[k].used = false; });
    return amounts.filter(a => a.explicit);
  }
  return amounts;
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

// --- Learning from the user's own transactions ---------------------------

const STOP_WORDS = new Set([
  'tiền', 'của', 'và', 'cho', 'ở', 'tại', 'mua', 'trả', 'chi', 'tiêu', 'với', 'các', 'những', 'một', 'hai',
  'the', 'and', 'for', 'of', 'to', 'at', 'in', 'on', 'from',
]);
const memoWords = (memo) => String(memo || '').normalize('NFC').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 2 && !/^\d/.test(w) && !STOP_WORDS.has(w));

/**
 * Which category each memo word usually ends up in, per type, from categorized
 * transactions: { expense: { rau: 'Groceries' }, income: {...} }. A word counts
 * only when at least 60% of its uses share one category.
 */
export function learnWordCategories(transactions) {
  const stats = { expense: {}, income: {} };
  for (const t of transactions) {
    if ((t.type !== 'expense' && t.type !== 'income') || !t.category || /^uncategorized/i.test(t.category)) continue;
    for (const word of new Set(memoWords(t.memo))) {
      const counts = (stats[t.type][word] = stats[t.type][word] || {});
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
  }
  const learned = { expense: {}, income: {} };
  for (const type of ['expense', 'income']) {
    for (const [word, counts] of Object.entries(stats[type])) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const [category, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (count / total >= 0.6) learned[type][word] = { category, count };
    }
  }
  return learned;
}

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "... memo Dinner with Hien": everything after the memo word goes to the memo as said
const MEMO_MARKER = /(?:^|\s)(memo|mê mô|ghi chú|notes?)(?=[\s:]|$)[\s:]*/iu;

const shortAmount = (n) => (n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString('en-US'));

/**
 * @param text      what was said or typed
 * @param ctx       { accounts, categories, payees: string[], payeeToCategory: {payee: category},
 *                    aliases: {heard phrase: payee}, wordCategories (learnWordCategories),
 *                    defaultAccount: name, defaultType: 'expense' | 'income', today: Date }
 * @returns { amount (signed total), parts: [amounts], type, account, category, payee, memo, date,
 *            directionSaid, accountSaid, dateSaid } — amount is null if none was found
 */
export function parseQuickAdd(text, ctx) {
  const full = String(text || '').normalize('NFC');
  const marker = full.match(MEMO_MARKER);
  const saidMemo = marker ? full.slice(marker.index + marker[0].length).trim() : null;
  const tokens = tokenize(marker ? full.slice(0, marker.index) : full);
  const today = ctx.today || new Date();

  const amounts = takeAmounts(tokens);
  const total = amounts.reduce((sum, a) => sum + a.amount, 0);

  // Date words
  const day = new Date(today);
  const when = takePhrase(tokens, ['hom qua', 'hom kia', 'hom nay']) || (takeWords(tokens, /^yesterday$/) ? 'hom qua' : null);
  if (when === 'hom qua') day.setDate(day.getDate() - 1);
  if (when === 'hom kia') day.setDate(day.getDate() - 2);
  takeWords(tokens, /^today$/);

  // Income or expense: "+500k", or said ("nhận", "tiền về" / "chi", "trả", "tiêu"); expense by default
  const direction = takeDirection(tokens);
  const directionSaid = Boolean(amounts[0]?.positive || direction);
  const type = amounts[0]?.positive || direction === 'income' ? 'income'
    : direction === 'expense' ? 'expense'
    : ctx.defaultType || 'expense';

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
  const accountSaid = Boolean(account);
  account = account || ctx.defaultAccount || null;

  // Payee: a name the user taught (what speech recognition made of it), or a
  // known payee (longest match); then the category if it was said
  const aliasItem = takeName(tokens, Object.entries(ctx.aliases || {}).map(([name, payee]) => ({ name, payee })));
  const payeeItem = aliasItem ? { name: aliasItem.payee } : takeName(tokens, (ctx.payees || []).map(name => ({ name })));
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

  const words = tokens.filter(t => !t.used && !FILLER_WORDS.has(t.l)).map(t => t.raw).join(' ');

  // Still no category: what these memo words usually are ("rau" -> Groceries)
  if (!category && ctx.wordCategories) {
    const hits = memoWords(words)
      .map(w => ctx.wordCategories[type]?.[w])
      .filter(h => h && typedCategories.some(c => c.name === h.category))
      .sort((a, b) => b.count - a.count);
    if (hits.length) category = hits[0].category;
  }

  const memo = [
    words,
    saidMemo,
    amounts.length > 1 ? `(${amounts.map(a => shortAmount(a.amount)).join(' + ')})` : '',
  ].filter(Boolean).join(' ');

  return {
    amount: amounts.length ? (type === 'expense' ? -total : total) : null,
    parts: amounts.map(a => a.amount),
    type,
    account,
    category,
    payee,
    memo,
    date: dateStr(day),
    directionSaid,
    accountSaid,
    dateSaid: Boolean(when),
  };
}
