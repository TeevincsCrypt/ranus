"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal typings for the (webkit-prefixed) Web Speech recognition API. */
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Push-to-talk speech input + spoken replies, the "voice" half of the Alexa+-style client. */
export function useSpeech(onFinalTranscript: (text: string) => void) {
  const [supported, setSupported] = useState({ listen: false, speak: false });
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onFinalTranscript);
  callback.current = onFinalTranscript;

  useEffect(() => {
    setSupported({ listen: Boolean(getRecognitionCtor()), speak: typeof window !== "undefined" && "speechSynthesis" in window });
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || listening) return;
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else partial += r[0].transcript;
      }
      setInterim(finalText + partial);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      setInterim("");
      if (finalText.trim()) callback.current(finalText.trim());
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  }, [listening]);

  const stopListening = useCallback(() => recognition.current?.stop(), []);

  const speak = useCallback((text: string) => {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.03;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, speaking, interim, startListening, stopListening, speak, stopSpeaking };
}
