import { useCallback, useEffect, useRef, useState } from "react";
import { googleVoices } from "./speech.mjs";
import { createSpeechPlayback } from "./speechPlayback.mjs";

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
  const [timingMode, setTimingMode] = useState(null);
  const playback = useRef(null);
  const chosenByUser = useRef(false);

  const stop = useCallback(() => {
    if (playback.current) playback.current.stop();
    else if (supported) window.speechSynthesis.cancel();
    playback.current = null;
    setStatus("idle");
    setPosition(0);
    setActiveRange(null);
    setTimingMode(null);
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
      if (playback.current) playback.current.stop();
      else synth.cancel();
      playback.current = null;
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
    playback.current = createSpeechPlayback({
      text,
      voice: selected.voice,
      rate,
      synth: window.speechSynthesis,
      createUtterance: (value) => new SpeechSynthesisUtterance(value),
      onStatus: setStatus,
      onPosition: setPosition,
      onRange: setActiveRange,
      onTiming: setTimingMode,
      onError: setError,
    });
    playback.current.start();
  }

  function toggle() {
    if (playback.current?.status === "playing") playback.current.pause();
    else if (playback.current?.status === "paused") playback.current.resume();
    else start();
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
    timingMode,
    error,
    toggle,
    stop,
    restart: start,
  };
}
