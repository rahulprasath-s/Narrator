export function wordCount(text = "") {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
export function readingMinutes(text = "", rate = 1) {
  return Math.max(1, Math.ceil(wordCount(text) / (150 * rate)));
}
export function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function speechBatches(text, size = 7) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError("Batch size must be a positive integer.");
  }
  const words = [...text.matchAll(/\S+/gu)];
  const batches = [];

  for (let i = 0; i < words.length;) {
    let next = i + 1;

    while (next < words.length && next - i < size) {
      const previousEnd = words[next - 1].index + words[next - 1][0].length;
      const gap = text.slice(previousEnd, words[next].index);
      // Preserve a natural pause between paragraphs.
      if (/\n\s*\n/u.test(gap)) break;
      next++;
    }

    const start = words[i].index;
    const last = words[next - 1];
    const end = last.index + last[0].length;
    batches.push({ text: text.slice(start, end), start, end });
    i = next;
  }

  return batches;
}
