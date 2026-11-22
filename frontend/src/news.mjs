export function berlinToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((value) => value.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function summaryReady(story) {
  return story?.summary_status === "Ready" && Boolean(story.summary?.trim());
}

export function mergeReadingStatuses(brief, day, statuses) {
  if (!brief || brief.date !== day) return brief;

  let changed = false;
  const stories = brief.stories.map((story) => {
    if (!statuses.has(story.id) || statuses.get(story.id) === story.status)
      return story;
    changed = true;
    return { ...story, status: statuses.get(story.id) };
  });
  return changed ? { ...brief, stories } : brief;
}

export function articleUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function validateNewsBrief(data) {
  if (!Array.isArray(data?.stories)) {
    throw new Error(
      "The server returned an unreadable news brief. Try refreshing.",
    );
  }
  if (
    data.stories.some(
      (story) => !("summary" in story) || !("summary_status" in story),
    )
  ) {
    throw new Error(
      "The Python server is running an older version. Restart npm run dev, then refresh this brief.",
    );
  }
  return data;
}
