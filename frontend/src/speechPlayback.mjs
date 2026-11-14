import { speechBatches } from "./speech.mjs";

// Audio is one utterance. Seven-word batches are only a visual representation.
export function createSpeechPlayback({
  text,
  voice,
  rate = 1,
  synth,
  createUtterance,
  onStatus = () => {},
  onPosition = () => {},
  onRange = () => {},
  onTiming = () => {},
  onError = () => {},
  now = () => performance.now(),
  schedule = (callback) => setInterval(callback, 100),
  unschedule = (timer) => clearInterval(timer),
}) {
  const batches = speechBatches(text);
  const words = [...text.matchAll(/\S+/gu)];
  let status = "idle",
    timer = null,
    utterance = null;
  let cancelled = false,
    started = false,
    finished = false;
  let elapsed = 0,
    startedAt = null,
    anchorTime = 0,
    anchorWord = 0;
  let hasBoundary = false,
    lastPosition = -1,
    lastBatch = -1,
    timing = null;

  const activeTime = () =>
    elapsed + (startedAt === null ? 0 : now() - startedAt);

  function setStatus(value) {
    status = value;
    onStatus(value);
  }
  function setTiming(value) {
    if (timing !== value) {
      timing = value;
      onTiming(value);
    }
  }
  function clearTimer() {
    if (timer !== null) {
      unschedule(timer);
      timer = null;
    }
  }
  function report(position) {
    if (position !== lastPosition) {
      lastPosition = position;
      onPosition(position);
    }
    const index = findAtOrBefore(batches, position);
    if (index !== lastBatch) {
      lastBatch = index;
      const batch = batches[index];
      onRange(batch ? { start: batch.start, end: batch.end } : null);
    }
  }
  function tick() {
    if (cancelled || finished || !started || status !== "playing") return;
    const sinceAnchor = activeTime() - anchorTime;
    // Let real word boundaries lead. Estimate only when they are absent or stop.
    if (hasBoundary && sinceAnchor < 1000) return;
    const index = Math.min(
      words.length - 1,
      anchorWord + Math.floor((sinceAnchor * rate) / 400),
    );
    setTiming("estimated");
    report(words[Math.max(0, index)]?.index ?? 0);
  }

  function stop() {
    cancelled = true;
    clearTimer();
    synth.cancel();
    utterance = null;
    setStatus("idle");
    onPosition(0);
    onRange(null);
    setTiming(null);
  }

  function start() {
    if (cancelled || started || status !== "idle" || !words.length) return;
    synth.cancel();
    utterance = createUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = rate;
    utterance.onstart = () => {
      if (cancelled || finished) return;
      started = true;
      startedAt = status === "playing" ? now() : null;
      setTiming("estimated");
      report(words[0].index);
      timer = schedule(tick);
    };
    utterance.onboundary = (event) => {
      if (
        cancelled ||
        finished ||
        !started ||
        status !== "playing" ||
        event.name !== "word"
      )
        return;
      if (
        !Number.isInteger(event.charIndex) ||
        event.charIndex < 0 ||
        event.charIndex >= text.length
      )
        return;
      hasBoundary = true;
      anchorTime = activeTime();
      anchorWord = Math.max(0, findAtOrBefore(words, event.charIndex, "index"));
      setTiming("word");
      report(event.charIndex);
    };
    utterance.onend = () => {
      if (cancelled || finished) return;
      finished = true;
      clearTimer();
      utterance = null;
      setStatus("idle");
      onPosition(text.length);
      onRange(null);
      setTiming(null);
    };
    utterance.onerror = (event) => {
      if (cancelled || finished) return;
      stop();
      if (!["canceled", "interrupted"].includes(event.error)) {
        onError(
          "This voice couldn’t play. Try another Google voice or check your connection.",
        );
      }
    };
    setStatus("playing");
    try {
      synth.speak(utterance);
    } catch {
      stop();
      onError("This voice couldn’t start. Try another Google voice.");
    }
  }

  function pause() {
    if (status !== "playing" || cancelled || finished) return;
    elapsed = activeTime();
    startedAt = null;
    synth.pause();
    setStatus("paused");
  }
  function resume() {
    if (status !== "paused" || cancelled || finished) return;
    startedAt = started ? now() : null;
    synth.resume();
    setStatus("playing");
  }

  return {
    start,
    stop,
    pause,
    resume,
    get status() {
      return status;
    },
  };
}

function findAtOrBefore(items, position, key = "start") {
  let left = 0,
    right = items.length - 1,
    found = -1;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (items[middle][key] <= position) {
      found = middle;
      left = middle + 1;
    } else right = middle - 1;
  }
  return found;
}
