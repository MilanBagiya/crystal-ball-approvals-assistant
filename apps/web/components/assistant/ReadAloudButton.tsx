'use client';

import { Square, Volume2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { operatorLanguage } from '@/store/assistantStore';

/** True when the browser has the Web Speech API (checked at runtime, so server rendering stays safe). */
function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Reads text out loud with the browser's own speech engine: no extra dependency and no API call.
 * Hidden when the browser can't speak.
 */
const noSubscription = () => () => undefined;

export function ReadAloudButton({ text }: { text: string }) {
  // Read once on the client; on the server (no window) the button simply isn't rendered.
  const supported = useSyncExternalStore(noSubscription, canSpeak, () => false);
  const [speaking, setSpeaking] = useState(false);

  // Stop talking if the view closes mid-sentence.
  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!supported) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = operatorLanguage();
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.cancel(); // never queue on top of an earlier reading
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const Icon = speaking ? Square : Volume2;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-violet-500"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {speaking ? 'Stop reading' : 'Read aloud'}
    </button>
  );
}
