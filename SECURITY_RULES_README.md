# Firebase Security Rules - Hướng dẫn

## 📋 Có 2 file rules:

### 1. `firestore.rules` - PHIÊN BẢN ĐẦY ĐỦ (Khuyến nghị)
- Có helper functions
- Có validation
- Có comments chi tiết
- Bảo vệ tốt nhất

### 2. `firestore-simple.rules` - PHIÊN BẢN ĐƠN GIẢN
- Dễ đọc hơn
- Ít code hơn
- Vẫn an toàn
- Dễ maintain

## 🔒 Rules làm gì:

### TRƯỚC (Rules cũ - KHÔNG AN TOÀN):
```javascript
// Bất kỳ ai đăng nhập đều đọc/ghi được TẤT CẢ data
allow read, write: if request.auth != null;
```

**Vấn đề:**
- ❌ User A có thể đọc data của User B
- ❌ User A có thể XÓA data của User B
- ❌ User A có thể SỬA data của User B

**Ví dụ tấn công:**
```javascript
// Hacker login vào app của họ
// Nhưng query data của BẠN
const transactions = await getDocs(
  query(collection(db, 'transactions'), 
  where('userId', '==', 'YOUR_USER_ID'))  // ← Đọc được!
);

// Hoặc tệ hơn: XÓA data của bạn
await deleteDoc(doc(db, 'transactions', 'YOUR_TRANSACTION_ID')); // ← Xóa được!
```

---

### SAU (Rules mới - AN TOÀN):
```javascript
// Chỉ user mới đọc/ghi data của CHÍNH HỌ
allow read: if request.auth.uid == resource.data.userId;
allow write: if request.auth.uid == request.resource.data.userId;
```

**Bảo vệ:**
- ✅ User A CHỈ đọc được data của User A
- ✅ User A KHÔNG thể xóa data của User B
- ✅ User A KHÔNG thể sửa data của User B

**Ví dụ:**
```javascript
// Hacker login vào app của họ
// Cố query data của BẠN
const transactions = await getDocs(
  query(collection(db, 'transactions'), 
  where('userId', '==', 'YOUR_USER_ID'))
);
// → Firebase Rules: DENIED! ❌

// Cố xóa data của bạn
await deleteDoc(doc(db, 'transactions', 'YOUR_TRANSACTION_ID'));
// → Firebase Rules: DENIED! ❌
```

---

## 🎯 Chi tiết Rules:

### 1. Transactions
```javascript
match /transactions/{transactionId} {
  // Đọc: Chỉ khi userId trong document == user đang login
  allow read: if resource.data.userId == request.auth.uid;
  
  // Tạo: Chỉ khi userId được set = user đang login
  allow create: if request.resource.data.userId == request.auth.uid;
  
  // Sửa/Xóa: Chỉ khi user sở hữu document
  allow update, delete: if resource.data.userId == request.auth.uid;
}
```

**Nghĩa là:**
- Bạn chỉ xem được transactions của bạn
- Bạn chỉ tạo được transactions với userId của bạn
- Bạn chỉ sửa/xóa được transactions của bạn

### 2. Accounts, Categories, Loans
- Tương tự như Transactions
- Tất cả đều kiểm tra userId

---

## 📊 So sánh:

### Rules CŨ:
```
User A login → Có thể access:
├── ✅ Data của User A
├── ✅ Data của User B  ← NGUY HIỂM!
├── ✅ Data của User C  ← NGUY HIỂM!
└── ✅ Data của tất cả users ← NGUY HIỂM!
```

### Rules MỚI:
```
User A login → Có thể access:
├── ✅ Data của User A
├── ❌ Data của User B  ← CHẶN!
├── ❌ Data của User C  ← CHẶN!
└── ❌ Data của users khác ← CHẶN!
```

---

## 🚀 Cách áp dụng:

### Bước 1: Mở Firebase Console
1. https://console.firebase.google.com
2. Chọn project: **money-tracker-vn**
3. Sidebar → **Firestore Database**
4. Tab **Rules** (ở trên)

### Bước 2: Chọn file Rules
- **Khuyến nghị**: Dùng `firestore.rules` (đầy đủ)
- **Hoặc**: Dùng `firestore-simple.rules` (đơn giản)

### Bước 3: Copy & Paste
1. Copy toàn bộ nội dung file
2. Paste vào editor trong Firebase Console
3. Nhấn **"Publish"**

### Bước 4: Test
1. Mở app và test các chức năng
2. Tất cả phải hoạt động bình thường
3. Data của bạn vẫn đọc/ghi được

---

## ⚠️ Lưu ý quan trọng:

### 1. KHÔNG phá code:
- ✅ App của bạn vẫn hoạt động y như cũ
- ✅ Không cần sửa code React/JavaScript
- ✅ Chỉ thêm bảo mật ở server-side

### 2. Tại sao an toàn:
- Rules chỉ kiểm tra `userId` field
- Tất cả documents của bạn ĐÃ CÓ userId
- Không có breaking changes

### 3. Nếu có lỗi:
- Firebase Console sẽ báo lỗi TRƯỚC KHI publish
- Bạn có thể rollback về rules cũ bất cứ lúc nào
- Click "Publish" chỉ khi không có lỗi

---

## 🧪 Test Rules (optional):

### Trong Firebase Console:
1. Tab **Rules** → Click **"Rules Playground"**
2. Test các scenarios:

```
Test 1: Read own transaction
- Auth: User A (uid: abc123)
- Operation: get
- Path: /transactions/trans_001
- Data: { userId: "abc123", amount: 100 }
Result: ✅ ALLOW

Test 2: Read other's transaction
- Auth: User A (uid: abc123)
- Operation: get
- Path: /transactions/trans_002
- Data: { userId: "xyz789", amount: 200 }
Result: ❌ DENY (GOOD!)

Test 3: Delete other's transaction
- Auth: User A (uid: abc123)
- Operation: delete
- Path: /transactions/trans_002
- Data: { userId: "xyz789" }
Result: ❌ DENY (GOOD!)
```

---

## ✅ Checklist:

Sau khi apply rules:

- [ ] Publish rules thành công (không có error)
- [ ] Mở app và login
- [ ] Xem transactions → Thấy data bình thường
- [ ] Thêm transaction mới → Hoạt động bình thường
- [ ] Sửa transaction → Hoạt động bình thường
- [ ] Xóa transaction → Hoạt động bình thường
- [ ] Tất cả tabs hoạt động → OK!

Nếu TẤT CẢ đều OK → Thành công! 🎉

---

## 🆘 Nếu có vấn đề:

### App không load data:
1. Check console: F12 → Console tab
2. Có lỗi "permission-denied"?
3. → Có thể rules quá chặt, rollback về rules cũ

### Rollback rules cũ:
```
Firebase Console → Firestore → Rules → 
Nhấn icon "⏱️ History" → Chọn version trước → Restore
```

---

## 📞 Summary:

**Rules mới:**
- 🔒 Bảo vệ data của bạn 100%
- 🔒 Chặn truy cập trái phép
- 🔒 Validate tất cả operations
- ✅ KHÔNG phá code hiện tại
- ✅ KHÔNG cần sửa React code
- ✅ Áp dụng trong 2 phút

**Khuyến nghị:** 
- Dùng `firestore.rules` (đầy đủ nhất)
- Test kỹ sau khi publish
- Có thể rollback bất cứ lúc nào

---

**Ready to apply?** Copy rules và publish ngay! 🚀
