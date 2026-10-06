// Turns a short spoken or typed note into a transaction draft, without AI:
//   "25 ngàn rau Street Grocer"      -> -25,000 · payee Street Grocer · memo "rau"
//   "1tr2 tiền nhà OCB"               -> -1,200,000 from the OCB account
//   "45k coffee Highlands yesterday"  -> -45,000 dated yesterday
//   "+500k lương"                     -> income 500,000
//   "rau 15k thịt 50k cá 30k"         -> -95,000 (15k + 50k + 30k)
// It also learns from the user: names heard for a payee (aliases) and which
// category memo words like "rau" usually go to (learnWordCategories).
// Pure functions (no Firebase), so they can be tested with plain Node.

import { translateMemo } from './viEnDictionary';

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
    .filter(t => t.raw)
    .map((t, i) => ({ ...t, i }));
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
    const explicit = Boolean(unit) || value >= 1000 || /[.,]/.test((glued || plain)[1]);
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
const FILLER_WORDS = new Set(['ở', 'tại', 'cho', 'từ', 'bằng', 'at', 'for', 'from', 'by']);

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

// Words too common to say anything about the category ("đi" in "đi học" is not "Đi chợ")
const STOP_WORDS = new Set([
  'tiền', 'của', 'và', 'cho', 'ở', 'tại', 'mua', 'trả', 'chi', 'tiêu', 'với', 'các', 'những', 'một', 'hai',
  'đi', 'về', 'là', 'có', 'được', 'đã', 'sẽ', 'này', 'kia', 'nhé', 'luôn', 'thêm', 'lại',
  'the', 'and', 'for', 'of', 'to', 'at', 'in', 'on', 'from', 'with', 'my', 'a', 'an',
]);
const memoWords = (memo) => String(memo || '').normalize('NFC').toLowerCase()
  .split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 2 && !/^\d/.test(w) && !STOP_WORDS.has(w));

// A memo's words in English, without amounts: "rau 30k, thịt 15k" -> ['vegetables', 'meat']
const englishWords = (memo) => [...new Set(memoWords(translateMemo(memo).text))];
// When a transaction was entered, comparable as text (Firestore Timestamp, Date or ISO string)
const createdTime = (t) => {
  const c = t.createdAt;
  const ms = c?.toMillis?.() ?? (c instanceof Date ? c.getTime() : Date.parse(c) || 0);
  return String(ms).padStart(15, '0');
};

/**
 * Learned from categorized transactions, per type (expense / income):
 *   [type][word]          how often a payee or memo word went with each category
 *                         { gas: { counts: { 'Bike Gas': 25, 'House Upgrade': 1 }, total: 26 } }
 *   payees[type][word]    how often a memo word went with each payee ("cá" -> Fish Stand)
 *   categoryPayees[type]  each category's usual payee lately (Grocery -> Street Grocer)
 *   payeeCategories[type] each payee's usual category (Fish Stand BTX -> Grocery)
 *   savedMemos[type]      the payee and category last saved with each memo, by its English
 *                         words (['gas'] -> Ha Giang Gas Station, Bike Gas)
 *   memoWords[type]       words seen in memos (item words)
 */
export function learnWordCategories(transactions, now = Date.now()) {
  const learned = {
    expense: {}, income: {},
    payees: { expense: {}, income: {} },
    categoryPayees: { expense: {}, income: {} },
    payeeCategories: { expense: {}, income: {} },
    savedMemos: { expense: [], income: [] },
    memoWords: { expense: [], income: [] },
  };
  const payeeTotals = { expense: {}, income: {} };
  const memoSeen = { expense: new Set(), income: new Set() };
  const savedMemos = { expense: {}, income: {} };
  const recentFrom = dateStr(new Date(now - 120 * 24 * 60 * 60 * 1000));
  const recentPayees = { expense: {}, income: {} };
  const tally = (table, key, value) => {
    const entry = (table[key] = table[key] || { counts: {}, total: 0 });
    entry.counts[value] = (entry.counts[value] || 0) + 1;
    entry.total++;
  };

  for (const t of transactions) {
    if ((t.type !== 'expense' && t.type !== 'income') || !t.category || /^uncategorized/i.test(t.category)) continue;
    const memo = memoWords(t.memo);
    const payee = (t.payee || '').trim();
    memo.forEach(w => memoSeen[t.type].add(w));
    for (const word of new Set([...memo, ...memoWords(payee)])) tally(learned[t.type], word, t.category);
    if (payee) {
      tally(payeeTotals[t.type], payee, t.category);
      const words = englishWords(t.memo);
      const key = [...words].sort().join(' ');
      const last = savedMemos[t.type][key];
      const when = `${t.date || ''} ${createdTime(t)}`;
      if (key && (!last || when > last.when)) savedMemos[t.type][key] = { words, payee, category: t.category, when };
      for (const word of new Set(memo)) tally(learned.payees[t.type], word, payee);
      if ((t.date || '') >= recentFrom) tally(recentPayees[t.type], t.category, payee);
    }
  }

  for (const type of ['expense', 'income']) {
    // A category's usual payee: used 3+ times lately and twice as often as any other
    for (const [category, entry] of Object.entries(recentPayees[type])) {
      const [[payee, count], second] = Object.entries(entry.counts).sort((a, b) => b[1] - a[1]);
      if (count >= 3 && count >= 2 * (second?.[1] || 0)) learned.categoryPayees[type][category] = payee;
    }
    for (const [payee, entry] of Object.entries(payeeTotals[type])) {
      learned.payeeCategories[type][payee] = Object.entries(entry.counts).sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  learned.memoWords = { expense: [...memoSeen.expense], income: [...memoSeen.income] };
  learned.savedMemos = { expense: Object.values(savedMemos.expense), income: Object.values(savedMemos.income) };
  return learned;
}

// The saved memo most like what was said: more than half of the words of both
// together in common ("rau thịt" ~ "vegetables 30k, meat 15k, fish 80k"; "cá" alone
// or "gas" ~ "boxes gas" is not). Equally alike: the latest save wins.
function similarSaved(words, saved) {
  if (!words.length) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of saved || []) {
    const common = entry.words.filter(w => words.includes(w)).length;
    const score = common / (words.length + entry.words.length - common);
    if (score > 0.5 && (score > bestScore || (score === bestScore && entry.when > best.when))) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

// Highest score wins if it is clear: at least 0.6 and no tie.
function pickBest(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 0.6) return null;
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return null;
  return ranked[0][0];
}

// One vote per thing said (a group of words, e.g. "cá" + "fish"): its share of
// past uses for each option. Weighted by evidence when asked — a word seen once
// or twice then counts for less than one seen many times.
function vote(groups, table, weighted = true) {
  const scores = {};
  for (const group of groups) {
    const best = {};
    for (const word of group) {
      const entry = table?.[word];
      if (!entry) continue;
      const weight = weighted ? Math.min(1, entry.total / 3) : 1;
      for (const [option, count] of Object.entries(entry.counts)) {
        best[option] = Math.max(best[option] || 0, (count / entry.total) * weight);
      }
    }
    for (const [option, score] of Object.entries(best)) scores[option] = (scores[option] || 0) + score;
  }
  return scores;
}

// The payee when none was said and no saved memo is like it (the user's rule:
// rather blank than a guess):
//  - several things bought ("rau, thịt, cá"): the category's usual payee (Street Grocer)
//  - otherwise what was saved before with these words ("cá" -> Fish Stand),
//    and for market food the usual payee ("rau" -> Street Grocer)
function inferPayee(groups, category, type, learned, severalThings, grocery) {
  const usual = category && learned?.categoryPayees?.[type]?.[category];
  if (severalThings && usual) return usual;
  // Only payees of this category: "xăng thơm" bought at a hardware store doesn't
  // make the hardware store a gas station
  const scores = vote(groups, learned?.payees?.[type], false);
  const fits = Object.entries(scores)
    .filter(([payee]) => !category || learned?.payeeCategories?.[type]?.[payee] === category);
  return pickBest(Object.fromEntries(fits)) || (grocery && usual) || null;
}

// Several amounts: each with the words said next to it, in English
// ("30,000 rau, 15,000 thịt, 80k cá" -> "vegetables 30k, meat 15k, fish 80k").
function itemize(leftover, amounts) {
  const starts = amounts.map(a => Math.min(...a.used));
  const amountFirst = leftover.length > 0 && starts[0] < leftover[0].i;
  const groups = amounts.map(() => []);
  for (const t of leftover) {
    let k = amountFirst
      ? starts.filter(start => start < t.i).length - 1 // the amount said before the word
      : starts.findIndex(start => start > t.i); // the amount said after it
    if (k === -1 && !amountFirst) k = amounts.length - 1;
    groups[Math.max(0, k)].push(t.raw);
  }
  return amounts
    .map((a, k) => [translateMemo(groups[k].join(' ')).text, shortAmount(a.amount)].filter(Boolean).join(' '))
    .join(', ');
}

const titleWords = (s) => s.replace(/(^|\s)(\p{Ll})/gu, (_, space, c) => space + c.toUpperCase());

// The category the said words point to: each thing said votes (see vote), a
// category whose name contains a said word gets a full extra vote ("gas" +
// "bike" -> Bike Gas), and market food votes for the grocery category.
function inferCategory(groups, categories, learned, groceryVotes) {
  const scores = vote(groups, learned);
  for (const group of groups) {
    for (const c of categories) {
      const nameWords = memoWords(c.name);
      if (group.some(w => nameWords.includes(w))) scores[c.name] = (scores[c.name] || 0) + 1;
    }
  }
  if (groceryVotes) {
    const groceries = categories.filter(c => /grocer|chợ|market/i.test(c.name));
    if (groceries.length === 1) scores[groceries[0].name] = (scores[groceries[0].name] || 0) + groceryVotes;
  }
  return pickBest(Object.fromEntries(Object.entries(scores).filter(([name]) => categories.some(c => c.name === name))));
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

  // Account: by name, by bank ("OCB" -> the account linked to OCB), or cash.
  // Only accounts money is paid from: an asset account named "Car" must not
  // swallow the "car" of "50k gas car".
  const activeAccounts = (ctx.accounts || []).filter(a => a.isActive !== false
    && (!a.group || a.group === 'SPENDING' || a.group === 'SAVINGS'));
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
    const companion = (i) => i > 0 && /^(với|with)$/.test(tokens[i - 1].l); // "ăn tối với Hiền"
    const caps = tokens.filter((t, i) => isCap(t) && !companion(i) && (i > 0 || isCap(tokens[1])));
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

  const leftover = tokens.filter(t => !t.used && !FILLER_WORDS.has(t.l));
  const words = leftover.map(t => t.raw).join(' ');
  const wordsEn = translateMemo(words);
  const saidMemoEn = saidMemo !== null ? translateMemo(saidMemo) : null;
  // Each thing said votes once, with its Vietnamese and English words
  // (the user's memos are mostly English)
  const chunks = [...wordsEn.chunks, ...(saidMemoEn?.chunks || [])];
  const groups = [
    ...chunks.map(c => memoWords(`${c.source} ${c.en}`)),
    memoWords(payee),
  ].filter(g => g.length);

  // Said like a saved transaction ("40k xăng xe" ~ memo "gas"): same payee and category
  const remembered = !payee
    ? similarSaved(englishWords([wordsEn.text, saidMemoEn?.text].filter(Boolean).join(' ')), ctx.wordCategories?.savedMemos?.[type])
    : null;
  if (!category && remembered && typedCategories.some(c => c.name === remembered.category)) category = remembered.category;

  // Still no category: what the said things usually go with ("rau" -> Groceries)
  if (!category) {
    category = inferCategory(groups, typedCategories, ctx.wordCategories?.[type], chunks.filter(c => c.grocery).length);
  }

  // With "memo …" said for one amount, the other leftover words name the payee
  // ("50000 gas memo black bike")
  let items = wordsEn.text;
  if (saidMemo !== null && !payee && words && amounts.length <= 1) {
    payee = titleWords(words);
    items = '';
  }
  const groceryCount = chunks.filter(c => c.grocery).length;
  const severalThings = amounts.length >= 2 || groceryCount >= 2;
  if (!payee && remembered && remembered.category === category) payee = remembered.payee;
  if (!payee) payee = inferPayee(groups, category, type, ctx.wordCategories, severalThings, groceryCount > 0) || '';
  if (!category && payee) {
    const learned = ctx.payeeToCategory?.[payee];
    if (learned && typedCategories.some(c => c.name === learned)) category = learned;
  }
  if (amounts.length > 1) items = itemize(leftover, amounts);

  const memo = [items, saidMemoEn?.text].filter(Boolean).join(' ');

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
