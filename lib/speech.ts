// Unified speech-recognition engine used by VoiceWidget.
//
// - On a native Capacitor shell (iOS/Android) we use
//   @capacitor-community/speech-recognition (SFSpeechRecognizer / Android
//   SpeechRecognizer), which requires real user permission and returns the
//   transcript through native events.
// - On the plain web we use the browser SpeechRecognition API as before.
//   iOS Safari does not expose that API, so the native path is the only way
//   the voice feature works on iPhones.
import { Capacitor } from '@capacitor/core';

export interface SpeechCallbacks {
  onStart: () => void;
  onPartial: (text: string) => void;
  onResult: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface SpeechEngine {
  readonly native: boolean;
  start(): void;
  stop(): void;
  abort(): void;
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
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

// ---------------------------------------------------------------------------
// Web engine (browser Web Speech API)
// ---------------------------------------------------------------------------
const WEB_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was denied. Allow microphone permission and try again.',
  'audio-capture': 'No microphone was available on this device.',
  'no-speech': 'No speech was detected. Try again and speak clearly.',
  network: 'The browser speech recognizer could not connect. Check the device connection and try again.',
  'language-not-supported': 'Speech recognition is not available for this device language.',
};

function createWebEngine(language: string, callbacks: SpeechCallbacks): SpeechEngine | null {
  if (typeof window === 'undefined') return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;

  let recognition: BrowserSpeechRecognition | null = null;
  let transcript = '';
  let ignoreEnd = false;

  return {
    native: false,
    start() {
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = language;
      transcript = '';
      ignoreEnd = false;

      recognition.onstart = () => callbacks.onStart();
      recognition.onresult = (event: any) => {
        let complete = '';
        for (let index = 0; index < event.results.length; index += 1) {
          complete += `${event.results[index][0]?.transcript || ''} `;
        }
        transcript = complete.trim();
        callbacks.onPartial(transcript);
      };
      recognition.onerror = (event: any) => {
        ignoreEnd = true;
        recognition = null;
        callbacks.onError(WEB_ERROR_MESSAGES[event.error] || 'Speech recognition stopped unexpectedly. Please try again.');
      };
      recognition.onend = () => {
        if (ignoreEnd) return;
        recognition = null;
        callbacks.onResult(transcript);
        callbacks.onEnd();
      };

      try {
        recognition.start();
      } catch (error) {
        recognition = null;
        callbacks.onError('Could not start speech recognition on this device. Please try again.');
      }
    },
    stop() {
      recognition?.stop();
    },
    abort() {
      recognition?.abort();
    },
  };
}

// ---------------------------------------------------------------------------
// Native engine (Capacitor plugin: SFSpeechRecognizer / Android SpeechRecognizer)
// ---------------------------------------------------------------------------
async function createNativeEngine(language: string, callbacks: SpeechCallbacks): Promise<SpeechEngine | null> {
  const { SpeechRecognition: NativeSpeech } = await import('@capacitor-community/speech-recognition');

  let lastPartial = '';

  return {
    native: true,
    async start() {
      try {
        const { available } = await NativeSpeech.available();
        if (!available) {
          throw new Error('Speech recognition is not available on this device.');
        }
        const permission = await NativeSpeech.checkPermissions();
        if (permission.speechRecognition !== 'granted') {
          const requested = await NativeSpeech.requestPermissions();
          if (requested.speechRecognition !== 'granted') {
            throw new Error('Microphone access was denied. Allow microphone permission and try again.');
          }
        }

        await NativeSpeech.removeAllListeners();
        lastPartial = '';

        await NativeSpeech.addListener('partialResults', (data: { matches: string[] }) => {
          const text = (data.matches || []).join(' ').trim();
          lastPartial = text;
          callbacks.onPartial(text);
        });
        await NativeSpeech.addListener('listeningState', (data: { status: string }) => {
          if (data.status === 'stopped') {
            callbacks.onResult(lastPartial);
            callbacks.onEnd();
          }
        });

        await NativeSpeech.start({ language, maxResults: 1, partialResults: true });
        callbacks.onStart();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not start speech recognition on this device. Please try again.';
        callbacks.onError(message);
      }
    },
    async stop() {
      try {
        await NativeSpeech.stop();
      } catch {
        // already stopped
      }
    },
    async abort() {
      try {
        await NativeSpeech.stop();
      } catch {
        // already stopped
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export async function createSpeechEngine(
  language: string,
  callbacks: SpeechCallbacks
): Promise<SpeechEngine | null> {
  if (isNativePlatform()) {
    return createNativeEngine(language, callbacks);
  }
  return createWebEngine(language, callbacks);
}