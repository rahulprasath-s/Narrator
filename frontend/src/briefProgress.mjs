import { wordCount } from "./speech.mjs";

function storageKey(day) {
  return `narrator.brief-progress.v1.${day}`;
}

function summaryRevision(text) {
  // Track edits without storing Notion summary text in browser storage.
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return `${text.length}:${hash >>> 0}`;
}

export function makeBriefProgress(story, wordIndex) {
  return {
    storyId: story.id,
    revision: summaryRevision(story.summary),
    wordIndex,
  };
}

export function resolveBriefProgress(queue, progress) {
  const story = queue.find(({ id }) => id === progress?.storyId);
  if (!story) return null;
  const wordIndex =
    progress.revision === summaryRevision(story.summary) &&
    Number.isSafeInteger(progress.wordIndex)
      ? Math.max(0, Math.min(progress.wordIndex, wordCount(story.summary) - 1))
      : 0;
  return { story, wordIndex };
}

export function readBriefProgress(day, storage) {
  try {
    return JSON.parse(
      (storage ?? globalThis.localStorage).getItem(storageKey(day)),
    );
  } catch {
    return null;
  }
}

export function writeBriefProgress(day, progress, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    if (progress) target.setItem(storageKey(day), JSON.stringify(progress));
    else target.removeItem(storageKey(day));
  } catch {
    // The brief can still play if browser storage is unavailable.
  }
}
