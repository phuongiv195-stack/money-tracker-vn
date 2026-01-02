import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { collection, query, where, getDocs, writeBatch, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import { useToast } from '../Toast/ToastProvider';

export default function SettingsTab() {
  const { settings, updateFontSize } = useSettings();
  const { currentUser, logout } = useAuth();
  const { 
    tagSuggestions, 
    addUserTag, 
    removeUserTag, 
    renameUserTag,
    transactions,
    accounts,
    categories,
    loadAllTransactions,
    hasMoreTransactions,
    transactionCount
  } = useData();
  const userId = useUserId();
  const toast = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const fileInputRef = useRef(null);
  
  // Manage Tags state
  const [editingTag, setEditingTag] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [tagLoading, setTagLoading] = useState(false);
  const [newTagInput, setNewTagInput] = useState(''); // For adding new tag

  // Export/Import state
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importData, setImportData] = useState(null);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fontSizeOptions = [
    { value: 'normal', label: 'Normal', description: 'Default size (15px)' },
    { value: 'large', label: 'Large', description: 'Bigger text (17px)' },
  ];

  const handleBack = () => {
    window.dispatchEvent(new CustomEvent('closeSettings'));
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Rename tag across all transactions
  // Add new tag
  const handleAddNewTag = async () => {
    if (!newTagInput.trim()) return;
    const trimmed = newTagInput.trim();
    if (tagSuggestions.includes(trimmed)) {
      toast.warning('Tag already exists');
      return;
    }
    await addUserTag(trimmed);
    setNewTagInput('');
    toast.success(`Added tag "${trimmed}"`);
  };

  const handleRenameTag = async () => {
    if (!newTagName.trim()) {
      toast.error('Please enter new tag name');
      return;
    }
    if (newTagName.trim() === editingTag) {
      setEditingTag(null);
      setNewTagName('');
      return;
    }

    setTagLoading(true);
    try {
      const trimmedNewName = newTagName.trim();
      let updatedCount = 0;
      
      // Get ALL transactions for this user to check both 'tag' and 'tags' fields
      const allTransQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', userId)
      );
      const allSnapshot = await getDocs(allTransQuery);
      
      const batch = writeBatch(db);
      
      allSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        let needsUpdate = false;
        const updates = {};
        
        // Check single 'tag' field
        if (data.tag === editingTag) {
          updates.tag = trimmedNewName;
          needsUpdate = true;
        }
        
        // Check 'tags' array field
        if (data.tags && Array.isArray(data.tags) && data.tags.includes(editingTag)) {
          updates.tags = data.tags.map(t => t === editingTag ? trimmedNewName : t);
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          batch.update(doc(db, 'transactions', docSnap.id), updates);
          updatedCount++;
        }
      });
      
      await batch.commit();
      
      // Also update userTags collection
      await renameUserTag(editingTag, trimmedNewName);
      
      toast.success(`Renamed "${editingTag}" → "${trimmedNewName}" (${updatedCount} transactions)`);
      setEditingTag(null);
      setNewTagName('');
    } catch (error) {
      toast.error('Error: ' + error.message);
    }
    setTagLoading(false);
  };

  // Delete tag from all transactions
  const handleDeleteTag = async (tagName) => {
    const confirmed = await toast.confirm({
      title: 'Delete Tag',
      message: `Remove tag "${tagName}" from all transactions? This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger'
    });
    
    if (!confirmed) return;

    setTagLoading(true);
    try {
      let updatedCount = 0;
      
      // Get ALL transactions for this user to check both 'tag' and 'tags' fields
      const allTransQuery = query(
        collection(db, 'transactions'),
        where('userId', '==', userId)
      );
      const allSnapshot = await getDocs(allTransQuery);
      
      const batch = writeBatch(db);
      
      allSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        let needsUpdate = false;
        const updates = {};
        
        // Check single 'tag' field
        if (data.tag === tagName) {
          updates.tag = null;
          needsUpdate = true;
        }
        
        // Check 'tags' array field
        if (data.tags && Array.isArray(data.tags) && data.tags.includes(tagName)) {
          updates.tags = data.tags.filter(t => t !== tagName);
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          batch.update(doc(db, 'transactions', docSnap.id), updates);
          updatedCount++;
        }
      });
      
      await batch.commit();
      
      // Also remove from userTags collection
      await removeUserTag(tagName);
      
      toast.success(`Deleted tag "${tagName}" from ${updatedCount} transactions`);
    } catch (error) {
      toast.error('Error: ' + error.message);
    }
    setTagLoading(false);
  };

  // ============================================
  // EXPORT DATA
  // ============================================
  const handleExport = async () => {
    setExporting(true);
    
    try {
      // Load all transactions first if there are more
      if (hasMoreTransactions) {
        toast.info('Loading all transactions...');
        await loadAllTransactions();
      }

      // Fetch all data directly from Firebase to ensure completeness
      const [transSnap, accSnap, catSnap] = await Promise.all([
        getDocs(query(collection(db, 'transactions'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'accounts'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'categories'), where('userId', '==', userId)))
      ]);

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        userId: userId,
        data: {
          transactions: transSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          accounts: accSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          categories: catSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          tags: tagSuggestions
        },
        summary: {
          transactions: transSnap.size,
          accounts: accSnap.size,
          categories: catSnap.size,
          tags: tagSuggestions.length
        }
      };

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `money-tracker-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${exportData.summary.transactions} transactions, ${exportData.summary.accounts} accounts, ${exportData.summary.categories} categories`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed: ' + error.message);
    }
    
    setExporting(false);
  };

  // ============================================
  // IMPORT DATA
  // ============================================
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        // Validate file structure
        if (!data.version || !data.data) {
          toast.error('Invalid backup file format');
          return;
        }

        setImportData(data);
        setShowImportConfirm(true);
      } catch (error) {
        toast.error('Cannot read file: ' + error.message);
      }
    };
    reader.readAsText(file);
    
    // Reset input
    e.target.value = '';
  };

  const handleImportConfirm = async (mode) => {
    // mode: 'merge' or 'replace'
    setShowImportConfirm(false);
    setImporting(true);

    try {
      const { transactions: importTrans, accounts: importAcc, categories: importCat } = importData.data;

      // If replace mode, delete existing data first
      if (mode === 'replace') {
        toast.info('Deleting existing data...');
        
        const [existingTrans, existingAcc, existingCat] = await Promise.all([
          getDocs(query(collection(db, 'transactions'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'accounts'), where('userId', '==', userId))),
          getDocs(query(collection(db, 'categories'), where('userId', '==', userId)))
        ]);

        // Delete in batches (max 500 per batch)
        const deleteInBatches = async (docs) => {
          const batchSize = 450;
          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = writeBatch(db);
            docs.slice(i, i + batchSize).forEach(d => {
              batch.delete(doc(db, d.ref.path));
            });
            await batch.commit();
          }
        };

        await deleteInBatches(existingTrans.docs);
        await deleteInBatches(existingAcc.docs);
        await deleteInBatches(existingCat.docs);
      }

      // Import new data
      toast.info('Importing data...');

      // Import accounts first (needed for transactions)
      let accCount = 0;
      for (const acc of importAcc) {
        const { id, ...accData } = acc;
        accData.userId = userId; // Ensure correct userId
        await addDoc(collection(db, 'accounts'), accData);
        accCount++;
      }

      // Import categories
      let catCount = 0;
      for (const cat of importCat) {
        const { id, ...catData } = cat;
        catData.userId = userId;
        await addDoc(collection(db, 'categories'), catData);
        catCount++;
      }

      // Import transactions in batches
      let transCount = 0;
      const transBatchSize = 450;
      for (let i = 0; i < importTrans.length; i += transBatchSize) {
        const batch = writeBatch(db);
        importTrans.slice(i, i + transBatchSize).forEach(trans => {
          const { id, ...transData } = trans;
          transData.userId = userId;
          const newRef = doc(collection(db, 'transactions'));
          batch.set(newRef, transData);
          transCount++;
        });
        await batch.commit();
      }

      toast.success(`Imported ${transCount} transactions, ${accCount} accounts, ${catCount} categories`);
      setImportData(null);
      
      // Reload page to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error) {
      console.error('Import error:', error);
      toast.error('Import failed: ' + error.message);
    }

    setImporting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-emerald-500 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleBack}
            className="p-1 hover:bg-emerald-600 rounded transition-colors"
          >
            ← 
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        {/* Online/Offline indicator */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
          isOnline ? 'bg-emerald-600' : 'bg-orange-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-300' : 'bg-orange-300'} animate-pulse`}></div>
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Settings List */}
      <div className="p-4">
        {/* Account Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">Account</h2>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-800">{currentUser?.email}</div>
                <div className="text-sm text-gray-500">Logged in</div>
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Font Size Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">Font Size</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Saved on this device only
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {fontSizeOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{option.label}</div>
                  <div className="text-sm text-gray-500">{option.description}</div>
                </div>
                <div className="ml-3">
                  <input
                    type="radio"
                    name="fontSize"
                    value={option.value}
                    checked={settings.fontSize === option.value}
                    onChange={() => updateFontSize(option.value)}
                    className="w-5 h-5 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                  />
                </div>
              </label>
            ))}
          </div>

          {/* Preview - inside Font Size card */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-500 mb-2">Preview</div>
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-gray-800">🛒 Groceries</span>
                <span className="text-red-500 font-medium">-500,000</span>
              </div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-gray-800">💰 Salary</span>
                <span className="text-emerald-500 font-medium">+15,000,000</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-800">☕ Coffee</span>
                <span className="text-red-500 font-medium">-45,000</span>
              </div>
            </div>
          </div>
        </div>

        {/* Manage Tags Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">🏷️ Manage Tags</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Add, rename or delete tags
            </p>
          </div>

          {/* Add New Tag */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="New tag name..."
                className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:border-emerald-500 bg-white"
                onKeyDown={(e) => e.key === 'Enter' && handleAddNewTag()}
              />
              <button
                onClick={handleAddNewTag}
                disabled={!newTagInput.trim()}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>
          </div>

          {tagSuggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400">
              <div className="text-2xl mb-2">🏷️</div>
              <p className="text-sm">No tags yet</p>
              <p className="text-xs mt-1">Add a tag above or create when adding transactions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tagSuggestions.map(tag => (
                <div key={tag} className="px-4 py-3">
                  {editingTag === tag ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
                        placeholder="New tag name"
                        autoFocus
                      />
                      <button
                        onClick={handleRenameTag}
                        disabled={tagLoading}
                        className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {tagLoading ? '...' : '✓'}
                      </button>
                      <button
                        onClick={() => { setEditingTag(null); setNewTagName(''); }}
                        className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">🏷️</span>
                        <span className="text-gray-800">{tag}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingTag(tag); setNewTagName(tag); }}
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Rename"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag)}
                          disabled={tagLoading}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Backup & Restore Section */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">💾 Backup & Restore</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Export or import your data
            </p>
          </div>

          {/* Data Summary */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{transactionCount}</div>
                <div className="text-xs text-gray-500">Transactions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{accounts.length}</div>
                <div className="text-xs text-gray-500">Accounts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{categories.length}</div>
                <div className="text-xs text-gray-500">Categories</div>
              </div>
            </div>
            {hasMoreTransactions && (
              <p className="text-xs text-amber-600 text-center mt-2">
                ⚠️ Not all transactions loaded yet. Export will load all.
              </p>
            )}
          </div>

          <div className="p-4 space-y-3">
            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={exporting || importing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {exporting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Exporting...
                </>
              ) : (
                <>
                  <span>📤</span>
                  Export Backup (JSON)
                </>
              )}
            </button>

            {/* Import Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || importing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {importing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Importing...
                </>
              ) : (
                <>
                  <span>📥</span>
                  Import from Backup
                </>
              )}
            </button>

            <p className="text-xs text-gray-400 text-center">
              💡 Backup regularly to protect your data
            </p>
          </div>
        </div>

        {/* Info */}
        <p className="text-center text-gray-400 text-sm mt-6">
          Money Tracker v1.4.0
        </p>
      </div>

      {/* Import Confirmation Modal */}
      {showImportConfirm && importData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl overflow-hidden">
            <div className="bg-blue-500 p-4 text-white text-center">
              <div className="text-3xl mb-1">📥</div>
              <div className="font-bold">Import Backup</div>
            </div>
            
            <div className="p-4 space-y-4">
              {/* File Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">Backup file contains:</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-bold text-emerald-600">{importData.summary?.transactions || 0}</div>
                    <div className="text-xs text-gray-500">Trans.</div>
                  </div>
                  <div>
                    <div className="font-bold text-blue-600">{importData.summary?.accounts || 0}</div>
                    <div className="text-xs text-gray-500">Accounts</div>
                  </div>
                  <div>
                    <div className="font-bold text-purple-600">{importData.summary?.categories || 0}</div>
                    <div className="text-xs text-gray-500">Categories</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 text-center mt-2">
                  Exported: {new Date(importData.exportedAt).toLocaleString()}
                </div>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <span className="text-amber-500">⚠️</span>
                  <div className="text-sm text-amber-700">
                    <strong>Choose carefully:</strong>
                    <ul className="list-disc list-inside mt-1 text-xs">
                      <li><strong>Merge:</strong> Add backup data to existing data</li>
                      <li><strong>Replace:</strong> Delete ALL current data first</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => handleImportConfirm('merge')}
                  className="w-full py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
                >
                  🔀 Merge with Existing Data
                </button>
                <button
                  onClick={() => handleImportConfirm('replace')}
                  className="w-full py-3 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
                >
                  🔄 Replace All Data
                </button>
                <button
                  onClick={() => { setShowImportConfirm(false); setImportData(null); }}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
