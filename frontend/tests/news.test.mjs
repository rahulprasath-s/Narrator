import { test } from "node:test";
import assert from "node:assert/strict";
import {
  berlinToday,
  mergeReadingStatuses,
  shiftDay,
  summaryReady,
  articleUrl,
  validateNewsBrief,
} from "../src/news.mjs";

test("incoming Notion statuses update only matching stories on the loaded date", () => {
  const story = {
    id: "a",
    summary: "Saved prose",
    summary_status: "Ready",
    status: "NOT YET",
  };
  const other = { id: "b", status: "In Progress" };
  const brief = { date: "2026-11-14", stories: [story, other] };
  const statuses = new Map([
    ["a", "READ"],
    ["unlisted", "NOT INTERESTED"],
  ]);
  const result = mergeReadingStatuses(brief, brief.date, statuses);

  assert.deepEqual(result.stories[0], { ...story, status: "READ" });
  assert.equal(result.stories[1], other);
  assert.equal(mergeReadingStatuses(result, brief.date, statuses), result);
  assert.equal(mergeReadingStatuses(brief, "2026-11-15", statuses), brief);
});

test("outdated API responses cannot masquerade as pending summaries", () => {
  assert.throws(
    () => validateNewsBrief({ stories: [{ id: "old-record" }] }),
    /older version/,
  );
  assert.throws(() => validateNewsBrief({}), /unreadable news brief/);
  const pending = { stories: [{ summary: "", summary_status: "Pending" }] };
  const ready = {
    stories: [{ summary: "Saved text.", summary_status: "Ready" }],
  };
  assert.equal(validateNewsBrief(pending), pending);
  assert.equal(validateNewsBrief(ready), ready);
  assert.deepEqual(validateNewsBrief({ stories: [] }), { stories: [] });
});

test("the default brief date follows Berlin rather than UTC", () => {
  assert.equal(berlinToday(new Date("2026-11-13T23:30:00Z")), "2026-11-14");
  assert.equal(berlinToday(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
});

test("calendar navigation handles month, year, leap day and DST boundaries", () => {
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDay("2026-03-29", 1), "2026-03-30");
});

test("only completed nonempty summaries can be played", () => {
  assert.equal(
    summaryReady({ summary_status: "Ready", summary: "Saved prose." }),
    true,
  );
  for (const status of ["Pending", "Failed", "Unavailable", undefined]) {
    assert.equal(
      summaryReady({ summary_status: status, summary: "Stale text." }),
      false,
    );
  }
  assert.equal(
    summaryReady({ summary_status: "Ready", summary: " \n " }),
    false,
  );
  assert.equal(summaryReady(null), false);
});

test("source links accept web URLs and reject executable or invalid schemes", () => {
  assert.equal(
    articleUrl("https://example.com/story"),
    "https://example.com/story",
  );
  assert.equal(
    articleUrl("http://example.com/story"),
    "http://example.com/story",
  );
  for (const url of [
    null,
    "",
    "javascript:alert(1)",
    "data:text/html,example",
    "file:///tmp/example",
    "not a URL",
  ]) {
    assert.equal(articleUrl(url), null);
  }
});
