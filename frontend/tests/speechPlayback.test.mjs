import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeechPlayback } from "../src/speechPlayback.mjs";
import { speechBatches } from "../src/speech.mjs";

function fixture({
  text = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" "),
  rate = 1,
} = {}) {
  let time = 0,
    tick,
    cleared = 0;
  const utterances = [],
    positions = [],
    ranges = [],
    statuses = [],
    timings = [],
    errors = [];
  const synth = {
    cancellations: 0,
    pauses: 0,
    resumes: 0,
    cancel() {
      this.cancellations++;
    },
    speak(value) {
      utterances.push(value);
    },
    pause() {
      this.pauses++;
    },
    resume() {
      this.resumes++;
    },
  };
  const playback = createSpeechPlayback({
    text,
    rate,
    synth,
    voice: { name: "Google US English", lang: "en-US" },
    createUtterance: (text) => ({ text }),
    onPosition: (value) => positions.push(value),
    onRange: (value) => ranges.push(value),
    onStatus: (value) => statuses.push(value),
    onTiming: (value) => timings.push(value),
    onError: (value) => errors.push(value),
    now: () => time,
    schedule: (callback) => {
      tick = callback;
      return 1;
    },
    unschedule: () => {
      cleared++;
    },
  });
  return {
    text,
    playback,
    synth,
    utterances,
    positions,
    ranges,
    statuses,
    timings,
    errors,
    advance: (value) => {
      time = value;
      tick?.();
    },
    get cleared() {
      return cleared;
    },
  };
}

test("seven-word highlights never create separate audio requests", () => {
  const f = fixture();
  f.playback.start();
  assert.equal(f.utterances.length, 1);
  const speech = f.utterances[0];
  assert.equal(speech.text, f.text);
  speech.onstart();
  const batches = speechBatches(f.text);
  for (const batch of batches) {
    speech.onboundary({ name: "word", charIndex: batch.start });
    assert.deepEqual(f.ranges.at(-1), { start: batch.start, end: batch.end });
    assert.equal(f.utterances.length, 1);
  }
  assert.equal(f.synth.pauses, 0);
  assert.equal(f.synth.cancellations, 1);
  speech.onend();
  assert.equal(f.playback.status, "idle");
  assert.equal(f.ranges.at(-1), null);
  assert.equal(f.positions.at(-1), f.text.length);
  assert.equal(f.cleared, 1);
});

test("voices without boundaries get estimated highlights that freeze while paused", () => {
  const f = fixture();
  f.playback.start();
  f.utterances[0].onstart();
  f.advance(2800);
  const second = speechBatches(f.text)[1];
  assert.deepEqual(f.ranges.at(-1), { start: second.start, end: second.end });
  f.playback.pause();
  const position = f.positions.at(-1);
  f.advance(20000);
  assert.equal(f.positions.at(-1), position);
  f.playback.resume();
  f.advance(20400);
  assert.equal(f.positions.at(-1), f.text.indexOf("word8"));
  assert.equal(f.utterances.length, 1);
  assert.equal(f.synth.pauses, 1);
  assert.equal(f.synth.resumes, 1);
});

test("real word events correct estimates and take priority over the timer", () => {
  const f = fixture();
  f.playback.start();
  const speech = f.utterances[0];
  speech.onstart();
  f.advance(2800);
  speech.onboundary({ name: "word", charIndex: f.text.indexOf("word3") });
  assert.equal(f.positions.at(-1), f.text.indexOf("word3"));
  assert.equal(f.timings.at(-1), "word");
  f.advance(3000);
  assert.equal(f.positions.at(-1), f.text.indexOf("word3"));
  f.advance(4000);
  assert.equal(f.positions.at(-1), f.text.indexOf("word6"));
  assert.equal(f.timings.at(-1), "estimated");
});

test("stopping cancels timers and ignores stale engine events", () => {
  const f = fixture();
  f.playback.start();
  const speech = f.utterances[0];
  speech.onstart();
  f.playback.stop();
  const positionCount = f.positions.length;
  speech.onboundary({ name: "word", charIndex: 30 });
  speech.onend();
  speech.onstart();
  f.advance(5000);
  assert.equal(f.positions.length, positionCount);
  assert.equal(f.ranges.at(-1), null);
  assert.equal(f.playback.status, "idle");
  assert.equal(f.cleared, 1);
});

test("estimated timing respects speed and supports Unicode offsets", () => {
  const f = fixture({
    text: "  café 🌟 one two three four five six seven eight nine",
    rate: 2,
  });
  f.playback.start();
  f.utterances[0].onstart();
  f.advance(1400);
  const second = speechBatches(f.text)[1];
  assert.deepEqual(f.ranges.at(-1), { start: second.start, end: second.end });
  assert.equal(f.utterances[0].rate, 2);
});

test("voice failures clear highlighting and report an error", () => {
  const f = fixture();
  f.playback.start();
  f.utterances[0].onstart();
  f.utterances[0].onerror({ error: "network" });
  assert.equal(f.playback.status, "idle");
  assert.equal(f.ranges.at(-1), null);
  assert.equal(f.errors.length, 1);
  assert.equal(f.cleared, 1);
});
