// Vietnamese -> English for spoken memos, so both partners can read them.
// No translation service: a fixed word list. Longest phrase wins; words not
// listed stay as they are. `grocery: true` marks food bought at a market.

const GROCERY = [
  ['rau', 'vegetables'], ['rau củ', 'vegetables'], ['rau muống', 'morning glory'], ['rau thơm', 'herbs'],
  ['cải', 'greens'], ['xà lách', 'lettuce'], ['bắp cải', 'cabbage'], ['bông cải', 'broccoli'],
  ['thịt', 'meat'], ['thịt heo', 'pork'], ['thịt lợn', 'pork'], ['thịt bò', 'beef'], ['thịt gà', 'chicken'],
  ['gà', 'chicken'], ['vịt', 'duck'], ['sườn', 'ribs'], ['ba chỉ', 'pork belly'], ['xúc xích', 'sausage'],
  ['cá', 'fish'], ['cá hồi', 'salmon'], ['cá ngừ', 'tuna'], ['tôm', 'shrimp'], ['tép', 'small shrimp'],
  ['mực', 'squid'], ['cua', 'crab'], ['nghêu', 'clams'], ['sò', 'shellfish'], ['ốc', 'snails'], ['hải sản', 'seafood'],
  ['trứng', 'eggs'], ['trứng gà', 'eggs'], ['trứng vịt', 'duck eggs'], ['đậu hũ', 'tofu'], ['đậu phụ', 'tofu'],
  ['trái cây', 'fruit'], ['hoa quả', 'fruit'], ['chuối', 'bananas'], ['cam', 'oranges'], ['táo', 'apples'],
  ['xoài', 'mango'], ['dưa hấu', 'watermelon'], ['bơ', 'avocado'], ['nho', 'grapes'], ['dứa', 'pineapple'],
  ['thơm', 'pineapple'], ['ổi', 'guava'], ['đu đủ', 'papaya'], ['thanh long', 'dragon fruit'], ['mít', 'jackfruit'],
  ['sầu riêng', 'durian'], ['chanh', 'lime'], ['dừa', 'coconut'],
  ['gạo', 'rice'], ['bún', 'rice noodles'], ['mì', 'noodles'], ['mỳ', 'noodles'], ['miến', 'glass noodles'],
  ['bánh mì', 'bread'], ['bánh', 'cake'], ['sữa', 'milk'], ['sữa chua', 'yogurt'], ['phô mai', 'cheese'],
  ['đường', 'sugar'], ['muối', 'salt'], ['nước mắm', 'fish sauce'], ['nước tương', 'soy sauce'], ['dầu ăn', 'cooking oil'],
  ['tiêu', 'pepper'], ['tỏi', 'garlic'], ['hành', 'onions'], ['hành tây', 'onions'], ['gừng', 'ginger'], ['ớt', 'chili'],
  ['khoai tây', 'potatoes'], ['khoai lang', 'sweet potatoes'], ['cà chua', 'tomatoes'], ['cà rốt', 'carrots'],
  ['dưa leo', 'cucumber'], ['dưa chuột', 'cucumber'], ['bí', 'squash'], ['bầu', 'gourd'], ['mướp đắng', 'bitter melon'],
  ['khổ qua', 'bitter melon'], ['bắp', 'corn'], ['ngô', 'corn'], ['nấm', 'mushrooms'], ['đậu', 'beans'],
  ['gia vị', 'spices'], ['đồ khô', 'dry goods'], ['kẹo', 'candy'], ['bánh kẹo', 'snacks'], ['đồ ăn vặt', 'snacks'],
  ['nước', 'water'], ['nước suối', 'bottled water'], ['nước ngọt', 'soft drinks'], ['bia', 'beer'], ['rượu', 'wine'],
  ['đá', 'ice'],
].map(([vi, en]) => [vi, en, true]);

const OTHER = [
  ['ăn sáng', 'breakfast'], ['ăn trưa', 'lunch'], ['ăn tối', 'dinner'], ['ăn vặt', 'snacks'], ['ăn uống', 'food'],
  ['bữa ăn', 'meal'], ['cơm', 'rice meal'], ['phở', 'pho'], ['cà phê', 'coffee'], ['cafe', 'coffee'], ['trà', 'tea'],
  ['trà sữa', 'milk tea'], ['sinh tố', 'smoothie'], ['nước ép', 'juice'],
  ['xăng', 'gas'], ['đổ xăng', 'gas'], ['xăng xe', 'gas'], ['gửi xe', 'parking'], ['giữ xe', 'parking'], ['rửa xe', 'car wash'],
  ['sửa xe', 'vehicle repair'], ['thay nhớt', 'oil change'], ['vá xe', 'tire repair'], ['taxi', 'taxi'], ['xe ôm', 'motorbike taxi'],
  ['tiền điện', 'electricity'], ['điện', 'electricity'], ['tiền nước', 'water bill'], ['tiền nhà', 'rent'],
  ['tiền mạng', 'internet'], ['điện thoại', 'phone'], ['thẻ điện thoại', 'phone card'], ['nạp tiền', 'top-up'],
  ['thuốc', 'medicine'], ['khám bệnh', 'doctor visit'], ['bệnh viện', 'hospital'], ['nha khoa', 'dentist'],
  ['quần áo', 'clothes'], ['áo', 'shirt'], ['quần', 'pants'], ['giày', 'shoes'], ['dép', 'sandals'],
  ['cắt tóc', 'haircut'], ['gội đầu', 'hair wash'], ['học phí', 'tuition'], ['sách', 'books'], ['vở', 'notebooks'],
  ['quà', 'gift'], ['sinh nhật', 'birthday'], ['đám cưới', 'wedding'], ['tiền mừng', 'gift money'], ['lì xì', 'lucky money'],
  ['bảo hiểm', 'insurance'], ['phí', 'fee'], ['vé', 'ticket'], ['xem phim', 'movie'], ['đồ chơi', 'toys'],
  ['cây', 'plants'], ['hoa', 'flowers'], ['xà phòng', 'soap'], ['dầu gội', 'shampoo'], ['kem đánh răng', 'toothpaste'],
  ['giấy vệ sinh', 'toilet paper'], ['nước giặt', 'laundry detergent'], ['nước rửa chén', 'dish soap'], ['đồ dùng', 'supplies'],
  ['đi chợ', 'market'], ['chợ', 'market'], ['siêu thị', 'supermarket'], ['tiền chợ', 'market'],
  ['tiền vé', 'ticket'], ['tiền ăn', 'food'], ['tiền học', 'tuition'], ['tiền xăng', 'gas'], ['tiền xe', 'transport'],
  ['tiền điện thoại', 'phone bill'], ['tiền thuốc', 'medicine'], ['tiền', 'money'],
  ['bán đồ cũ', 'sold used items'], ['bán', 'sold'], ['đồ cũ', 'used items'], ['mượn', 'borrowed'], ['trả nợ', 'debt repayment'],
  ['với', 'with'], ['và', 'and'], ['cho', 'for'], ['của', 'of'],
  ['ký', 'kg'], ['kí', 'kg'], ['hộp', 'box'], ['gói', 'pack'], ['chai', 'bottle'], ['lon', 'can'], ['bó', 'bunch'],
].map(([vi, en]) => [vi, en, false]);

// Longest phrases first so "thịt bò" beats "thịt"
const ENTRIES = [...GROCERY, ...OTHER]
  .map(([vi, en, grocery]) => ({ words: vi.split(' '), en, grocery }))
  .sort((a, b) => b.words.length - a.words.length);

/**
 * "rau thịt bò" -> { text: 'vegetables beef', grocery: true,
 *                   chunks: [{ source: 'rau', en: 'vegetables', grocery: true }, { source: 'thịt bò', ... }] }
 * Matches whole words, with accents ("cá" fish, but not "ca"). Each chunk is one
 * thing said, so its Vietnamese and English words count once when guessing.
 */
export function translateMemo(text) {
  const raw = String(text || '').normalize('NFC').split(/\s+/).filter(Boolean);
  const lower = raw.map(w => w.toLowerCase().replace(/[.,;:!?]+$/, ''));
  const chunks = [];
  for (let i = 0; i < raw.length;) {
    const hit = ENTRIES.find(e => e.words.every((w, k) => lower[i + k] === w));
    if (hit) {
      chunks.push({ source: raw.slice(i, i + hit.words.length).join(' '), en: hit.en, grocery: hit.grocery });
      i += hit.words.length;
    } else {
      chunks.push({ source: raw[i], en: raw[i], grocery: false });
      i++;
    }
  }
  return { text: chunks.map(c => c.en).join(' '), grocery: chunks.some(c => c.grocery), chunks };
}
