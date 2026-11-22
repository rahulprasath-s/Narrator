import { speechBatches } from "./speech.mjs";

function atOrBefore(items, value, key) {
  let left = 0,
    right = items.length - 1,
    found = -1;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    if (items[middle][key] <= value) {
      found = middle;
      left = middle + 1;
    } else right = middle - 1;
  }
  return found;
}

// The browser plays a rendered WAV; its audio clock drives highlights and seeking.
export function bindNativeAudio({
  audio,
  text,
  metadata,
  onStatus = () => {},
  onPosition = () => {},
  onWord = () => {},
  onRange = () => {},
  onEnded = () => {},
  schedule = (callback) => setInterval(callback, 70),
  unschedule = clearInterval,
}) {
  const words = [...text.matchAll(/\S+/gu)];
  const batches = speechBatches(text);
  let timer = null,
    stopped = true;
  function clear() {
    if (timer !== null) {
      unschedule(timer);
      timer = null;
    }
  }
  function sync() {
    const index = atOrBefore(metadata.words, audio.currentTime, "time");
    if (audio.ended) {
      onPosition(text.length);
      onWord(Math.max(0, words.length - 1));
      onRange(null);
      return;
    }
    if (stopped || index < 0) {
      onRange(null);
      return;
    }
    const position = metadata.words[index].start;
    onPosition(position);
    onWord(Math.max(0, atOrBefore(words, position, "index")));
    const batch = batches[Math.max(0, atOrBefore(batches, position, "start"))];
    onRange(batch ? { start: batch.start, end: batch.end } : null);
  }
  function playing() {
    stopped = false;
    clear();
    sync();
    onStatus("playing");
    timer = schedule(sync);
  }
  function pause() {
    clear();
    if (!stopped) {
      sync();
      onStatus(audio.ended ? "idle" : "paused");
    }
  }
  const events = {
    playing,
    pause,
    ended() {
      if (stopped) return;
      pause();
      stopped = true;
      onEnded();
    },
    timeupdate: sync,
    seeking: sync,
    seeked: sync,
    error: () => {
      clear();
      onRange(null);
      onStatus("idle");
    },
  };
  for (const [event, callback] of Object.entries(events))
    audio.addEventListener(event, callback);
  return {
    async play() {
      stopped = false;
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
    },
    pause() {
      audio.pause();
    },
    seek(index) {
      if (!words.length || !Number.isFinite(index)) return;
      const word =
        words[Math.max(0, Math.min(words.length - 1, Math.round(index)))];
      const marker =
        metadata.words.find((marker) => marker.end > word.index) ||
        metadata.words.at(-1);
      stopped = false;
      audio.currentTime = marker.time;
      sync();
    },
    setRate(rate) {
      audio.playbackRate = rate;
    },
    stop() {
      stopped = true;
      clear();
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* Metadata may still be loading. */
      }
      onStatus("idle");
      onPosition(0);
      onWord(0);
      onRange(null);
    },
    dispose() {
      clear();
      for (const [event, callback] of Object.entries(events))
        audio.removeEventListener(event, callback);
    },
  };
}
