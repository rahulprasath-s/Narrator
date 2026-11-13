import { useCallback, useEffect, useRef, useState } from "react";
import { googleVoices, speechBatches } from "./speech.mjs";

export function useSpeech(text) {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceNameState] = useState("Google US English");
  const [rate, setRateState] = useState(1);
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(0);
  const [activeRange, setActiveRange] = useState(null);
  const [error, setError] = useState("");
  const run = useRef(0);
  const utterance = useRef(null);
  const running = useRef(false);
  const paused = useRef(false);
  const index = useRef(0);
  const next = useRef(null);
  const chosenByUser = useRef(false);

  const stop = useCallback(() => {
    run.current++;
    if (supported) window.speechSynthesis.cancel();
    running.current = false;
    paused.current = false;
    utterance.current = null;
    index.current = 0;
    setStatus("idle");
    setPosition(0);
    setActiveRange(null);
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    function refresh() {
      const available = googleVoices(synth.getVoices());
      setVoices(available);
      setVoiceNameState((previous) =>
        chosenByUser.current && available.some((v) => v.name === previous)
          ? previous
          : available[0]?.name || "Google US English",
      );
    }
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    window.addEventListener("pagehide", stop);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
      window.removeEventListener("pagehide", stop);
      run.current++;
      synth.cancel();
    };
  }, [supported, stop]);

  useEffect(() => {
    stop();
    setError("");
  }, [text, stop]);

  function start() {
    const selected = voices.find((v) => v.name === voiceName);
    if (!supported || !selected || !text.trim()) return;
    stop();
    setError("");
    const currentRun = run.current;
    const chunks = speechBatches(text);
    running.current = true;
    setStatus("playing");
    function readNext() {
      if (currentRun !== run.current) return;
      if (index.current >= chunks.length) {
        stop();
        setPosition(text.length);
        return;
      }
      const chunk = chunks[index.current];
      const speech = new SpeechSynthesisUtterance(chunk.text);
      utterance.current = speech;
      speech.voice = selected.voice;
      speech.lang = selected.voice.lang;
      speech.rate = rate;
      speech.onstart = () => {
        if (currentRun !== run.current) return;
        setPosition(chunk.start);
        setActiveRange({ start: chunk.start, end: chunk.end });
      };
      speech.onboundary = (event) => {
        if (currentRun === run.current)
          setPosition(chunk.start + event.charIndex);
      };
      speech.onend = () => {
        if (currentRun === run.current) {
          index.current++;
          readNext();
        }
      };
      speech.onerror = (event) => {
        if (currentRun !== run.current) return;
        stop();
        if (!["canceled", "interrupted"].includes(event.error))
          setError(
            "This voice couldn’t play. Try another Google voice or check your connection.",
          );
      };
      window.speechSynthesis.speak(speech);
    }
    next.current = readNext;
    readNext();
  }

  function toggle() {
    if (!running.current) {
      start();
      return;
    }
    if (paused.current) {
      window.speechSynthesis.resume();
      paused.current = false;
      setStatus("playing");
    } else {
      window.speechSynthesis.pause();
      paused.current = true;
      setStatus("paused");
    }
  }

  function setVoiceName(value) {
    stop();
    chosenByUser.current = true;
    setVoiceNameState(value);
    setError("");
  }
  function setRate(value) {
    stop();
    setRateState(value);
  }
  return {
    supported,
    voices,
    voiceName,
    setVoiceName,
    rate,
    setRate,
    status,
    position,
    activeRange,
    error,
    toggle,
    stop,
    restart: start,
  };
}
