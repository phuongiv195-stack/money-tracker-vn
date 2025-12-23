import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useUserId } from '../../contexts/AuthContext';
import useBackHandler from '../../hooks/useBackHandler';
import { useToast } from '../Toast/ToastProvider';

const EditGroupModal = ({ isOpen, onClose, onSave, groupName, groupType }) => {
  useBackHandler(isOpen, onClose);
  const toast = useToast();
  const userId = useUserId();
  
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync state khi groupName thay đổi
  useEffect(() => {
    if (groupName) {
      setNewName(groupName);
    }
  }, [groupName]);

  const handleRename = async () => {
    if (!newName.trim()) {
      toast.error("Please enter group name!");
      return;
    }

    if (newName.trim() === groupName) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      // Tìm tất cả categories trong group này
      const q = query(
        collection(db, 'categories'),
        where('userId', '==', userId),
        where('group', '==', groupName),
        where('type', '==', groupType)
      );
      const snapshot = await getDocs(q);

      // Update tất cả categories
      const promises = snapshot.docs.map(docSnap =>
        updateDoc(doc(db, 'categories', docSnap.id), { group: newName.trim() })
      );
      await Promise.all(promises);

      if (onSave) onSave();
      onClose();
    } catch (error) {
      toast.error("Error renaming: " + error.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    const confirmed = await toast.confirm({
      title: 'Delete Group',
      message: `Delete "${groupName}" and ALL categories inside?`,
      confirmText: 'Delete All',
      type: 'danger'
    });
    
    if (!confirmed) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, 'categories'),
        where('userId', '==', userId),
        where('group', '==', groupName),
        where('type', '==', groupType)
      );
      const snapshot = await getDocs(q);

      // Xóa tất cả categories trong group
      const promises = snapshot.docs.map(docSnap =>
        deleteDoc(doc(db, 'categories', docSnap.id))
      );
      await Promise.all(promises);

      if (onSave) onSave();
      onClose();
    } catch (error) {
      toast.error("Error deleting: " + error.message);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg text-center">Edit Group</h3>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold">Group Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full p-3 bg-gray-50 rounded-lg mt-1 focus:ring-2 focus:ring-emerald-500 outline-none"
              
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={loading}
              className="flex-1 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Rename'}
            </button>
          </div>

          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-full py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
          >
            🗑️ Delete Group & All Categories
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditGroupModal;