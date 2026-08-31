'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isLanguage, type Language } from '@/lib/i18n';

const STORAGE_KEY = 'ledger.language';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage can be unavailable (private mode / storage denied).
    }
    if (isLanguage(stored)) {
      setLanguageState(stored);
    } else if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr')) {
      setLanguageState('fr');
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore persistence failures — the toggle still works for the session.
    }
  }, []);

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}