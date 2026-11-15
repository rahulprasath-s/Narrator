import { test } from "node:test";
import assert from "node:assert/strict";
import { bindNativeAudio } from "../src/nativeAudioPlayback.mjs";

function fixture() {
  const text = "one two three four five six seven eight nine";
  const words = [...text.matchAll(/\S+/g)].map((word, i) => ({
    start: word.index,
    end: word.index + word[0].length,
    time: i * 0.4,
  }));
  const events = new Map(),
    ranges = [],
    indices = [],
    statuses = [];
  let tick;
  const audio = {
    currentTime: 0,
    ended: false,
    paused: true,
    playbackRate: 1,
    addEventListener: (event, cb) => events.set(event, cb),
    removeEventListener: (event) => events.delete(event),
    async play() {
      this.paused = false;
      events.get("playing")();
    },
    pause() {
      this.paused = true;
      events.get("pause")?.();
    },
  };
  const control = bindNativeAudio({
    audio,
    text,
    metadata: { words },
    onWord: (i) => indices.push(i),
    onRange: (value) => ranges.push(value),
    onStatus: (value) => statuses.push(value),
    schedule: (cb) => {
      tick = cb;
      return 1;
    },
    unschedule: () => {
      tick = null;
    },
  });
  return {
    audio,
    control,
    ranges,
    indices,
    statuses,
    events,
    tick: () => tick?.(),
  };
}

test("native audio highlights follow the actual recording clock", async () => {
  const f = fixture();
  await f.control.play();
  f.audio.currentTime = 3;
  f.tick();
  assert.equal(f.indices.at(-1), 7);
  assert.deepEqual(f.ranges.at(-1), { start: 34, end: 44 });
  f.tick();
  assert.equal(f.indices.at(-1), 7);
});

test("word seeking moves the recording, keeps pause state, and speed needs no rerender", async () => {
  const f = fixture();
  await f.control.play();
  f.control.pause();
  f.control.seek(7);
  assert.ok(Math.abs(f.audio.currentTime - 2.8) < 1e-9);
  assert.equal(f.audio.paused, true);
  assert.equal(f.indices.at(-1), 7);
  f.control.seek(1);
  assert.equal(f.audio.currentTime, 0.4);
  f.control.seek(-10);
  assert.equal(f.audio.currentTime, 0);
  f.control.seek(500);
  assert.equal(f.indices.at(-1), 8);
  f.control.setRate(1.5);
  assert.equal(f.audio.playbackRate, 1.5);
});

test("stopping and disposing clears highlights, listeners, and playback", async () => {
  const f = fixture();
  await f.control.play();
  f.control.stop();
  assert.equal(f.audio.currentTime, 0);
  assert.equal(f.statuses.at(-1), "idle");
  assert.equal(f.ranges.at(-1), null);
  f.events.get("seeked")();
  assert.equal(f.ranges.at(-1), null);
  await f.control.play();
  f.audio.ended = true;
  f.events.get("ended")();
  assert.equal(f.ranges.at(-1), null);
  assert.equal(f.indices.at(-1), 8);
  f.control.dispose();
  assert.equal(f.events.size, 0);
});
