import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

export const fixOldReconciledTransactions = async () => {
  try {
    // Lấy tất cả transactions đang reconciled
    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', 'test-user'),
      where('clearStatus', '==', 'reconciled')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      alert('No reconciled transactions found.');
      return;
    }

    // Đổi tất cả về cleared
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
      batch.update(doc(db, 'transactions', docSnap.id), {
        clearStatus: 'cleared',
        reconciledAt: null
      });
    });

    await batch.commit();
    
    alert(`✅ Fixed! ${snapshot.docs.length} transactions unlocked.\n\nNow you can reconcile again with the new system.`);
  } catch (error) {
    alert('Error: ' + error.message);
  }
};