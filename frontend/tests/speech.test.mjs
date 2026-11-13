import { test } from "node:test";
import assert from "node:assert/strict";
import {
  googleVoices,
  speechChunks,
  speechBatches,
  clock,
  readingMinutes,
  wordCount,
} from "../src/speech.mjs";

test("only the three online Google voices are offered, with US English first", () => {
  const voices = [
    { name: "Google UK English Female", lang: "en-GB", localService: false },
    { name: "Samantha", lang: "en-US", localService: true },
    { name: "Google US English", lang: "en_US", localService: false },
    { name: "Google UK English Male", lang: "en-GB", localService: false },
    { name: "Google Deutsch", lang: "de-DE", localService: false },
  ];
  assert.deepEqual(
    googleVoices(voices).map((v) => v.name),
    ["Google US English", "Google UK English Male", "Google UK English Female"],
  );
  assert.equal(googleVoices([{ ...voices[2], localService: true }]).length, 0);
  assert.equal(googleVoices([{ ...voices[2], lang: "fr-FR" }]).length, 0);
  assert.deepEqual(googleVoices([]), []);
});

test("speech chunks preserve every word and map boundaries to the original text", () => {
  const text =
    "  Think of café conversations.\n\nKnowledge needs more than a lucky guess. ".repeat(
      20,
    );
  const chunks = speechChunks(text, 80);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(chunk.text, text.slice(chunk.start, chunk.end));
    assert.ok(chunk.text.length <= 80);
  }
  assert.deepEqual(
    chunks.flatMap((c) => c.text.split(/\s+/u)),
    text.trim().split(/\s+/u),
  );
  assert.deepEqual(speechChunks(" \n "), []);
  assert.equal(speechChunks("x".repeat(300))[0].text.length, 300);
});

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
