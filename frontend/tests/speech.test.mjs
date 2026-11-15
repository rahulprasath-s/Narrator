import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speechBatches,
  clock,
  readingMinutes,
  wordCount,
} from "../src/speech.mjs";

test("listening estimates account for speed and format minutes correctly", () => {
  const passage = Array(300).fill("word").join(" ");
  assert.equal(wordCount(" \n hello  world "), 2);
  assert.equal(wordCount(""), 0);
  assert.equal(readingMinutes(passage), 2);
  assert.equal(readingMinutes(passage, 2), 1);
  assert.equal(clock(125.9), "2:05");
});

test("highlight batches contain seven words and point to the original characters", () => {
  const text =
    "  Café ideas 🌟 feel clearer when spoken aloud at a comfortable pace.  ";
  const batches = speechBatches(text);
  assert.deepEqual(
    batches.map((batch) => wordCount(batch.text)),
    [7, 5],
  );
  for (const batch of batches) {
    assert.equal(batch.text, text.slice(batch.start, batch.end));
  }
  assert.deepEqual(
    batches.flatMap((batch) => batch.text.split(/\s+/u)),
    text.trim().split(/\s+/u),
  );
});

test("highlight batches preserve paragraph boundaries and allow six-word groups", () => {
  const text =
    "First short thought.\n\nSecond paragraph has enough words to form two batches.";
  const batches = speechBatches(text, 6);
  assert.deepEqual(
    batches.map((batch) => wordCount(batch.text)),
    [3, 6, 3],
  );
  assert.equal(text.slice(batches[0].end, batches[1].start), "\n\n");
  assert.ok(batches.every((batch) => !batch.text.includes("\n\n")));
});

test("empty passages and invalid batch sizes are handled safely", () => {
  assert.deepEqual(speechBatches(" \n\n "), []);
  assert.equal(speechBatches("one")[0].text, "one");
  for (const size of [0, -1, 1.5, NaN]) {
    assert.throws(() => speechBatches("one two", size), RangeError);
  }
});
