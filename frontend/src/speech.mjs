export const VOICE_OPTIONS = [
  {
    name: "Google US English",
    lang: "en-US",
    label: "Google US English — en-US (online)",
  },
  {
    name: "Google UK English Male",
    lang: "en-GB",
    label: "Google UK English Male — en-GB (online)",
  },
  {
    name: "Google UK English Female",
    lang: "en-GB",
    label: "Google UK English Female — en-GB (online)",
  },
];

export function googleVoices(voices) {
  return VOICE_OPTIONS.map((option) => {
    const voice = voices.find(
      (item) =>
        item.name === option.name &&
        item.lang.replace("_", "-").toLowerCase() ===
          option.lang.toLowerCase() &&
        item.localService === false,
    );
    return voice ? { ...option, voice } : null;
  }).filter(Boolean);
}

export function speechChunks(text, limit = 220) {
  const chunks = [];
  const words = [...text.matchAll(/\S+/gu)];
  let start = words[0]?.index ?? 0;
  let end = start;
  for (const word of words) {
    if (end > start && word.index + word[0].length - start > limit) {
      chunks.push({ text: text.slice(start, end), start, end });
      start = word.index;
    }
    end = word.index + word[0].length;
  }
  if (end > start) chunks.push({ text: text.slice(start, end), start, end });
  return chunks;
}

export function wordCount(text = "") {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
export function readingMinutes(text = "", rate = 1) {
  return Math.max(1, Math.ceil(wordCount(text) / (150 * rate)));
}
export function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
