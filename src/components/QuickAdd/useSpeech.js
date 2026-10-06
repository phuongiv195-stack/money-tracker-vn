import { useState, useRef, useEffect, useCallback } from 'react';

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const LANG_KEY = 'quickAddLang';

const readLang = () => {
  try {
    return localStorage.getItem(LANG_KEY) || 'vi';
  } catch {
    return 'vi';
  }
};

/**
 * Browser speech recognition (Chrome; needs HTTPS). Each session's words are
 * appended to the text already there, so a note can be said in several goes.
 * onText receives the whole text; onError a short error code.
 */
export default function useSpeech(onText, onError) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState(readLang);
  const recognitionRef = useRef(null);
  const callbacks = useRef({ onText, onError });
  callbacks.current = { onText, onError };

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const toggle = useCallback((textSoFar = '') => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      const said = Array.from(e.results).map(r => r[0].transcript).join(' ');
      callbacks.current.onText([textSoFar.trim(), said.trim()].filter(Boolean).join(' '));
    };
    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') callbacks.current.onError?.(e.error);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang, listening]);

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'vi' ? 'en' : 'vi';
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {
        // remembered for this session only
      }
      return next;
    });
  }, []);

  return { supported: Boolean(SpeechRecognition), listening, lang, toggle, toggleLang };
}
