'use client';

import { useRef, useState } from 'react';
import { extractInvoiceFieldsLocally } from '@/lib/localVoiceParser';
import type { ExtractedInvoiceFields } from '@/lib/types';

type VoiceState = 'idle' | 'listening' | 'processing' | 'error';

interface VoiceWidgetProps {
  onExtracted: (fields: ExtractedInvoiceFields, transcript: string) => void;
  onError: (message: string) => void;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const MAX_RECORDING_MS = 60_000;

export default function VoiceWidget({ onExtracted, onError }: VoiceWidgetProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreEndRef = useRef(false);

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimeoutRef.current) clearTimeout(maxTimeoutRef.current);
    timerRef.current = null;
    maxTimeoutRef.current = null;
  }

  function finishTranscript() {
    clearTimers();
    const transcript = transcriptRef.current.trim();
    recognitionRef.current = null;

    if (!transcript) {
      onError("Couldn't make out any speech. Try again and speak for a few seconds.");
      setState('error');
      return;
    }

    setState('processing');
    setLastTranscript(transcript);
    const fields = extractInvoiceFieldsLocally(transcript);
    onExtracted(fields, transcript);
    setState('idle');
  }

  function startListening() {
    if (state === 'listening' || state === 'processing') return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      onError('Speech recognition is not supported by this browser. Try Safari on iPhone or Chrome on Android.');
      setState('error');
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-CA';
      transcriptRef.current = '';
      ignoreEndRef.current = false;
      setLiveTranscript('');
      setSeconds(0);

      recognition.onstart = () => {
        setState('listening');
        timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
        maxTimeoutRef.current = setTimeout(() => recognition.stop(), MAX_RECORDING_MS);
      };
      recognition.onresult = (event: any) => {
        let complete = '';
        for (let index = 0; index < event.results.length; index += 1) {
          complete += `${event.results[index][0]?.transcript || ''} `;
        }
        transcriptRef.current = complete.trim();
        setLiveTranscript(transcriptRef.current);
      };
      recognition.onerror = (event: any) => {
        ignoreEndRef.current = true;
        clearTimers();
        recognitionRef.current = null;
        const messages: Record<string, string> = {
          'not-allowed': 'Microphone access was denied. Allow microphone permission and try again.',
          'audio-capture': 'No microphone was available on this device.',
          'no-speech': 'No speech was detected. Try again and speak clearly.',
          network: 'The browser speech recognizer could not connect. Check the device connection and try again.',
          'language-not-supported': 'Speech recognition is not available for this device language.',
        };
        onError(messages[event.error] || 'Speech recognition stopped unexpectedly. Please try again.');
        setState('error');
      };
      recognition.onend = () => {
        if (ignoreEndRef.current) return;
        finishTranscript();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      console.error('[voice] browser recognition error:', error);
      onError('Could not start speech recognition on this device. Please try again.');
      setState('error');
    }
  }

  function stopListening() {
    clearTimers();
    recognitionRef.current?.stop();
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
        aria-label={state === 'listening' ? 'Stop recording' : 'Start voice note'}
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
        <p className="font-display font-semibold text-[14.5px] leading-tight">Speak your invoice details</p>
        <p className="text-[12.5px] text-slate-ink mt-0.5 leading-snug">
          {state === 'idle' && 'Uses your browser speech recognizer — no paid API credits required.'}
          {state === 'listening' && (
            <span className="font-mono tabular text-danger">
              Listening · {mm}:{ss} — tap again to stop
            </span>
          )}
          {state === 'processing' && 'Reading invoice details locally…'}
          {state === 'error' && 'Tap the mic to try again.'}
        </p>
        {state === 'listening' && liveTranscript && (
          <p className="text-[11px] text-slate-ink mt-1 line-clamp-2">{liveTranscript}</p>
        )}
      </div>

      {lastTranscript && state === 'idle' && (
        <details className="no-print shrink-0 hidden sm:block max-w-[220px]">
          <summary className="font-mono text-[10px] uppercase tracking-wide text-slate-ink cursor-pointer">
            Last transcript
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
