import { useCallback, useEffect, useRef, useState } from "react";
import { wordCount } from "./speech.mjs";
import { api, apiAudio } from "./api.mjs";
import { bindNativeAudio } from "./nativeAudioPlayback.mjs";

const SAMPLE =
  "Hello. This is a short preview of my voice. Choose the voice you find most comfortable to listen to.";
export function useSpeech(text) {
  const supported =
    typeof window !== "undefined" && typeof Audio !== "undefined";
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceNameState] = useState("Samantha");
  const [rate, setRateState] = useState(1);
  const [status, setStatus] = useState("idle");
  const [position, setPosition] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [activeRange, setActiveRange] = useState(null);
  const [error, setError] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const media = useRef(null),
    control = useRef(null),
    preview = useRef(null);
  const cache = useRef(new Map()),
    abort = useRef(null),
    generation = useRef(0);
  const wordRef = useRef(0),
    voiceRef = useRef("Samantha"),
    rateRef = useRef(1);
  function reportWord(value) {
    wordRef.current = value;
    setWordIndex(value);
  }

  const stop = useCallback(() => {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    preview.current?.pause();
    preview.current = null;
    setPreviewingVoice(null);
    control.current?.stop();
    wordRef.current = 0;
    setWordIndex(0);
    setPosition(0);
    setActiveRange(null);
    setStatus("idle");
  }, []);
  const dispose = useCallback(() => {
    stop();
    control.current?.dispose();
    control.current = null;
    if (media.current) {
      media.current.removeAttribute("src");
      media.current.load();
      media.current = null;
    }
    for (const entry of cache.current.values()) URL.revokeObjectURL(entry.url);
    cache.current.clear();
  }, [stop]);

  useEffect(() => {
    const controller = new AbortController();
    api("/speech/voices", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const available = data.voices.map((voice) => ({
          name: voice.name,
          label: voice.name,
        }));
        setVoices(available);
        if (!available.some((voice) => voice.name === voiceRef.current)) {
          voiceRef.current = available[0]?.name || "";
          setVoiceNameState(voiceRef.current);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    dispose();
    return dispose;
  }, [text, dispose]);
  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, [stop]);

  async function recording(content, voice, signal) {
    const key = JSON.stringify([content, voice]);
    if (cache.current.has(key)) return cache.current.get(key);
    let job = await api("/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: content, voice }),
      signal,
    });
    while (["queued", "rendering"].includes(job.state)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      job = await api(`/speech/${job.id}`, { signal });
    }
    if (job.state !== "ready")
      throw new Error(job.error || "The Mac voice could not be rendered.");
    const blob = await apiAudio(`/speech/${job.id}/file`, { signal });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const result = { url: URL.createObjectURL(blob), metadata: job.metadata };
    cache.current.set(key, result);
    return result;
  }
  async function playCurrent() {
    const audio = media.current;
    if (!audio) return;
    try {
      await control.current.play();
    } catch {
      if (media.current === audio) {
        setStatus("paused");
        setError(
          "Your recording is ready. Press Listen again to allow playback in this browser.",
        );
      }
    }
  }
  async function start() {
    if (!supported || !voices.length || !text.trim()) return;
    setError("");
    if (preview.current) {
      preview.current.pause();
      preview.current = null;
      setPreviewingVoice(null);
    }
    if (control.current) {
      await playCurrent();
      return;
    }
    generation.current++;
    const token = generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus("loading");
    try {
      const result = await recording(text, voiceRef.current, controller.signal);
      if (token !== generation.current || controller.signal.aborted) return;
      const audio = new Audio(result.url);
      media.current = audio;
      audio.playbackRate = rateRef.current;
      audio.preservesPitch = true;
      audio.onerror = () => {
        if (media.current === audio) {
          setError("This recording couldn’t play. Try refreshing the page.");
          setStatus("idle");
        }
      };
      control.current = bindNativeAudio({
        audio,
        text,
        metadata: result.metadata,
        onStatus: setStatus,
        onPosition: setPosition,
        onWord: reportWord,
        onRange: setActiveRange,
      });
      if (wordRef.current > 0) control.current.seek(wordRef.current);
      await playCurrent();
    } catch (failure) {
      if (token === generation.current && !controller.signal.aborted) {
        setError(failure.message);
        setStatus("idle");
      }
    }
  }
  function toggle() {
    if (status === "loading") return;
    if (media.current && !media.current.paused) control.current.pause();
    else start();
  }
  function seek(index) {
    if (!Number.isFinite(index)) return;
    preview.current?.pause();
    preview.current = null;
    setPreviewingVoice(null);
    const bounded = Math.max(
      0,
      Math.min(wordCount(text) - 1, Math.round(index)),
    );
    if (control.current) control.current.seek(bounded);
    else {
      reportWord(bounded);
      const words = [...text.matchAll(/\S+/gu)];
      setPosition(words[bounded]?.index || 0);
    }
  }
  function setRate(value) {
    setRateState(value);
    rateRef.current = value;
    control.current?.setRate(value);
  }
  function setVoiceName(value) {
    if (
      !voices.some((voice) => voice.name === value) ||
      voiceRef.current === value
    )
      return;
    const playing = media.current && !media.current.paused;
    generation.current++;
    abort.current?.abort();
    preview.current?.pause();
    preview.current = null;
    setPreviewingVoice(null);
    media.current?.pause();
    control.current?.dispose();
    control.current = null;
    media.current = null;
    voiceRef.current = value;
    setVoiceNameState(value);
    setError("");
    setStatus(playing ? "loading" : "paused");
    if (playing) start();
  }
  async function previewVoice(value) {
    if (!voices.some((voice) => voice.name === value)) return;
    const same = previewingVoice === value;
    generation.current++;
    const token = generation.current;
    abort.current?.abort();
    preview.current?.pause();
    preview.current = null;
    setPreviewingVoice(null);
    if (media.current && !media.current.paused) control.current.pause();
    if (status === "loading") setStatus("idle");
    if (same) return;
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setPreviewingVoice(value);
    try {
      const result = await recording(SAMPLE, value, controller.signal);
      if (token !== generation.current || controller.signal.aborted) return;
      const audio = new Audio(result.url);
      preview.current = audio;
      audio.playbackRate = rateRef.current;
      audio.onended = () => {
        if (preview.current === audio) {
          preview.current = null;
          setPreviewingVoice(null);
        }
      };
      audio.onerror = () => {
        if (preview.current === audio) {
          preview.current = null;
          setPreviewingVoice(null);
          setError("This preview could not play.");
        }
      };
      await audio.play();
    } catch (failure) {
      if (token === generation.current && !controller.signal.aborted) {
        setPreviewingVoice(null);
        setError(failure.message);
      }
    }
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
    wordIndex,
    totalWords: wordCount(text),
    activeRange,
    timingMode: "native",
    error,
    toggle,
    stop,
    seek,
    previewVoice,
    previewingVoice,
  };
}
