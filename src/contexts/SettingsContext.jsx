import { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export function useSettings() {
  return useContext(SettingsContext);
}

// Key để lưu vào localStorage
const STORAGE_KEY = 'money-tracker-settings';

// Default settings
const defaultSettings = {
  fontSize: 'normal', // 'normal' | 'large'
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    // Đọc từ localStorage khi khởi tạo
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Error reading settings:', e);
    }
    return defaultSettings;
  });

  // Lưu vào localStorage mỗi khi settings thay đổi
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  }, [settings]);

  // Apply font size class to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('font-size-normal', 'font-size-large');
    root.classList.add(`font-size-${settings.fontSize}`);
  }, [settings.fontSize]);

  const updateFontSize = (size) => {
    setSettings(prev => ({ ...prev, fontSize: size }));
  };

  const value = {
    settings,
    updateFontSize,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
