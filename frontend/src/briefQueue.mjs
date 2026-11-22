import { summaryReady } from "./news.mjs";

export function readyBriefStories(stories) {
  return stories.filter(summaryReady).sort((a, b) => a.rank - b.rank);
}

export function adjacentBriefStory(queue, storyId, offset) {
  const index = queue.findIndex((story) => story.id === storyId);
  return index < 0 ? null : (queue[index + offset] ?? null);
}
