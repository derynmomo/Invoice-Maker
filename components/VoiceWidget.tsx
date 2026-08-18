'use client';

import { useRef, useState } from 'react';
import { createSpeechEngine, type SpeechEngine } from '@/lib/speech';
import { extractInvoiceFieldsLocally } from '@/lib/localVoiceParser';
import { extractInvoiceFieldsLocallyFr } from '@/lib/localVoiceParser.fr';
import { t } from '@/lib/i18n';
import { useLanguage } from './LanguageContext';
import type { ExtractedInvoiceFields } from '@/lib/types';

type VoiceState = 'idle' | 'listening' | 'processing' | 'error';

interface VoiceWidgetProps {
  onExtracted: (fields: ExtractedInvoiceFields, transcript: string) => void;
  onError: (message: string) => void;
}

const MAX_RECORDING_MS = 60_000;

export default function VoiceWidget({ onExtracted, onError }: VoiceWidgetProps) {
  const { language } = useLanguage();
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');

  const engineRef = useRef<SpeechEngine | null>(null);
  const transcriptRef = useRef('');
  const startingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimeoutRef.current) clearTimeout(maxTimeoutRef.current);
    timerRef.current = null;
    maxTimeoutRef.current = null;
  }

  function resetEngine() {
    engineRef.current = null;
    startingRef.current = false;
  }

  function finishTranscript() {
    clearTimers();
    const transcript = transcriptRef.current.trim();
    resetEngine();

    if (!transcript) {
      onError(t(language, 'noSpeech'));
      setState('error');
      return;
    }

    setState('processing');
    setLastTranscript(transcript);
    const fields =
      language === 'fr' ? extractInvoiceFieldsLocallyFr(transcript) : extractInvoiceFieldsLocally(transcript);
    onExtracted(fields, transcript);
    setState('idle');
  }

  async function startListening() {
    if (state === 'listening' || state === 'processing' || startingRef.current) return;

    startingRef.current = true;
    const locale = language === 'fr' ? 'fr-CA' : 'en-US';
    const engine = await createSpeechEngine(locale, {
      onStart: () => {
        setState('listening');
        setSeconds(0);
        timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
        maxTimeoutRef.current = setTimeout(() => engineRef.current?.stop(), MAX_RECORDING_MS);
      },
      onPartial: (text) => {
        transcriptRef.current = text;
        setLiveTranscript(text);
      },
      onResult: (text) => {
        transcriptRef.current = text;
      },
      onEnd: () => {
        finishTranscript();
      },
      onError: (message) => {
        clearTimers();
        resetEngine();
        onError(message);
        setState('error');
      },
    });

    if (!engine) {
      startingRef.current = false;
      onError(t(language, 'notSupported'));
      setState('error');
      return;
    }

    engineRef.current = engine;
    try {
      engine.start();
    } catch {
      clearTimers();
      resetEngine();
      onError(t(language, 'startError'));
      setState('error');
    }
  }

  function stopListening() {
    clearTimers();
    engineRef.current?.stop();
  }

  function handleMicClick() {
    if (state === 'listening') stopListening();
    else if (state === 'idle' || state === 'error') startListening();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="no-print rounded-[10px] border border-rule bg-white/70 px-5 py-4 mb-7 flex items-center gap-4">
      <button
        type="button"
        onClick={handleMicClick}
        disabled={state === 'processing'}
        aria-label={state === 'listening' ? t(language, 'micStopAria') : t(language, 'micStartAria')}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors
          ${state === 'listening' ? 'bg-danger' : state === 'processing' ? 'bg-slate-ink' : 'bg-ledger hover:bg-ledger-dark'}
          disabled:cursor-wait`}
      >
        {state === 'listening' && (
          <span className="absolute inset-0 rounded-full bg-danger animate-mic-pulse" aria-hidden="true" />
        )}
        <MicIcon state={state} />
      </button>

      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold text-[14.5px] leading-tight">{t(language, 'speakHeader')}</p>
        <p className="text-[12.5px] text-slate-ink mt-0.5 leading-snug">
          {state === 'idle' && t(language, 'offlineNote')}
          {state === 'listening' && (
            <span className="font-mono tabular text-danger">
              {t(language, 'listening', { time: `${mm}:${ss}` })}
            </span>
          )}
          {state === 'processing' && t(language, 'processing')}
          {state === 'error' && t(language, 'tapToRetry')}
        </p>
        {state === 'listening' && liveTranscript && (
          <p className="text-[11px] text-slate-ink mt-1 line-clamp-2">{liveTranscript}</p>
        )}
      </div>

      {lastTranscript && state === 'idle' && (
        <details className="no-print shrink-0 hidden sm:block max-w-[220px]">
          <summary className="font-mono text-[10px] uppercase tracking-wide text-slate-ink cursor-pointer">
            {t(language, 'lastTranscript')}
          </summary>
          <p className="text-[11px] text-slate-ink mt-1 leading-snug">{lastTranscript}</p>
        </details>
      )}
    </div>
  );
}

function MicIcon({ state }: { state: VoiceState }) {
  if (state === 'processing') {
    return (
      <svg className="w-5 h-5 text-paper animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'listening') {
    return (
      <svg className="w-4 h-4 text-paper relative z-10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-paper relative z-10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}