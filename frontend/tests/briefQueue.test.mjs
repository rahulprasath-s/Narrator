import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentBriefStory, readyBriefStories } from "../src/briefQueue.mjs";
import {
  makeBriefProgress,
  readBriefProgress,
  resolveBriefProgress,
  writeBriefProgress,
} from "../src/briefProgress.mjs";

const first = {
  id: "first",
  rank: 1,
  summary_status: "Ready",
  summary: "Begin the daily brief.",
};
const last = {
  id: "last",
  rank: 4,
  summary_status: "Ready",
  summary: "Finish the daily brief.",
};

test("the queue follows rank and skips pending, failed, and empty summaries", () => {
  const queue = readyBriefStories([
    last,
    { ...first, id: "pending", rank: 2, summary_status: "Pending" },
    { ...first, id: "failed", rank: 3, summary_status: "Failed" },
    first,
    { ...first, id: "empty", rank: 5, summary: "\n " },
  ]);
  assert.deepEqual(queue, [first, last]);
  assert.equal(adjacentBriefStory(queue, first.id, 1), last);
  assert.equal(adjacentBriefStory(queue, last.id, -1), first);
  assert.equal(adjacentBriefStory(queue, last.id, 1), null);
  assert.equal(adjacentBriefStory(queue, "removed", 1), null);
});

test("a reload can restore a date's story and word without storing summary text", () => {
  const records = new Map();
  const storage = {
    setItem: (key, value) => records.set(key, value),
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => records.delete(key),
  };
  const day = "2026-11-22";
  writeBriefProgress(day, makeBriefProgress(last, 2), storage);
  const saved = readBriefProgress(day, storage);
  assert.deepEqual(resolveBriefProgress([first, last], saved), {
    story: last,
    wordIndex: 2,
  });
  assert.equal(readBriefProgress("2026-11-21", storage), null);
  assert.ok(![...records.values()][0].includes(last.summary));
  writeBriefProgress(day, null, storage);
  assert.equal(readBriefProgress(day, storage), null);
});

test("resume starts an edited story at word zero and ignores unavailable stories", () => {
  const saved = makeBriefProgress(last, 3);
  const edited = { ...last, summary: "A newer daily brief." };
  assert.deepEqual(resolveBriefProgress([first, edited], saved), {
    story: edited,
    wordIndex: 0,
  });
  assert.equal(resolveBriefProgress([first], saved), null);
  assert.equal(
    resolveBriefProgress([last], { ...saved, wordIndex: 999 }).wordIndex,
    3,
  );
  assert.equal(
    readBriefProgress("2026-11-22", { getItem: () => "broken JSON" }),
    null,
  );
});
