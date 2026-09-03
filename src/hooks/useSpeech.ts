'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type SR = any;

interface SpeechState {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
}

/**
 * Wrapper push-to-talk sulla Web Speech API del browser (gratis, nessun backend).
 * start() apre il microfono, stop() lo chiude e restituisce il testo finale via onResult.
 */
export function useSpeech(onResult: (text: string) => void) {
  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    interim: '',
    error: null,
  });
  const recRef = useRef<SR | null>(null);
  const finalRef = useRef('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const Ctor =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!Ctor) {
      setState((s) => ({ ...s, supported: false }));
      return;
    }
    const rec: SR = new Ctor();
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      setState((s) => ({ ...s, interim }));
    };
    rec.onerror = (e: any) => {
      setState((s) => ({
        ...s,
        error:
          e.error === 'not-allowed'
            ? 'Microfono negato — abilita il permesso nel browser'
            : e.error === 'no-speech'
              ? 'Non ho sentito nulla'
              : String(e.error),
        listening: false,
      }));
    };
    rec.onend = () => {
      setState((s) => ({ ...s, listening: false, interim: '' }));
      const text = finalRef.current.trim();
      if (text) onResultRef.current(text);
    };

    recRef.current = rec;
    setState((s) => ({ ...s, supported: true }));
    return () => {
      try {
        rec.abort();
      } catch {}
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec || state.listening) return;
    finalRef.current = '';
    setState((s) => ({ ...s, error: null, interim: '', listening: true }));
    try {
      rec.start();
    } catch {
      // già avviato: ignora
    }
  }, [state.listening]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {}
  }, []);

  return { ...state, start, stop };
}
