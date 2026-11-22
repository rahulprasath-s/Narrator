import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Newspaper,
} from "lucide-react";
import { api } from "./api.mjs";
import {
  articleUrl,
  berlinToday,
  mergeReadingStatuses,
  shiftDay,
  summaryReady,
  validateNewsBrief,
} from "./news.mjs";
import { useSpeech } from "./useSpeech.js";
import { wordCount } from "./speech.mjs";
import Player from "./Player.jsx";
import HighlightedScript from "./HighlightedScript.jsx";
import { adjacentBriefStory, readyBriefStories } from "./briefQueue.mjs";
import { BriefQueueControls, BriefQueueStart } from "./BriefQueueControls.jsx";
import {
  makeBriefProgress,
  readBriefProgress,
  resolveBriefProgress,
  writeBriefProgress,
} from "./briefProgress.mjs";

function SummaryStatus({ value }) {
  const tone =
    {
      Ready: "ready",
      Pending: "pending",
      Failed: "failed",
      Unavailable: "unavailable",
    }[value] || "unavailable";
  return <span className={`news-status ${tone}`}>{value || "Pending"}</span>;
}

const READING_STATUS_OPTIONS = [
  { value: "READ", label: "Read" },
  { value: "NOT YET", label: "Not yet" },
  { value: "NOT INTERESTED", label: "Not interested" },
  { value: "In Progress", label: "In progress" },
];

export default function NewsView() {
  const [day, setDay] = useState(berlinToday);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [savingStatusId, setSavingStatusId] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const statusSave = useRef({ inFlight: false, revision: 0 });
  const [playRequest, setPlayRequest] = useState(null);
  const [briefFinished, setBriefFinished] = useState(false);
  const [checkpoint, setCheckpoint] = useState(() => readBriefProgress(day));
  const lastSavedWord = useRef(null);
  const readerRef = useRef(null);
  const loadedDay = result?.date;
  // Never show the previous date's stories while a different date loads.
  const stories = result?.date === day ? result.stories : [];
  const queue = readyBriefStories(stories);
  const queueIndex = queue.findIndex(({ id }) => id === playRequest?.storyId);
  const resume = playRequest ? null : resolveBriefProgress(queue, checkpoint);
  const selected =
    stories.find((story) => story.id === selectedId) ||
    stories.find(summaryReady) ||
    stories[0];
  const playable = !loading && !failure && summaryReady(selected);
  const text = playable ? selected.summary : "";
  const speech = useSpeech(text, {
    storyId: selected?.id,
    playRequest,
    onEnded: advanceBrief,
    onProgress: saveWord,
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure("");
    setResult(null);
    setSelectedId(null);
    api(`/news/${day}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult(validateNewsBrief(data));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFailure(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, reload]);

  useEffect(() => {
    if (loading || failure || loadedDay !== day || savingStatusId) return;

    const controller = new AbortController();
    let checking = false;

    async function syncReadingStatuses() {
      if (checking || document.hidden || statusSave.current.inFlight) return;
      checking = true;
      const revision = statusSave.current.revision;
      try {
        const latest = validateNewsBrief(
          await api(`/news/${day}`, { signal: controller.signal }),
        );
        if (
          controller.signal.aborted ||
          latest.date !== day ||
          revision !== statusSave.current.revision
        )
          return;
        const statuses = new Map(
          latest.stories.map(({ id, status }) => [id, status]),
        );
        setResult((current) => mergeReadingStatuses(current, day, statuses));
      } catch {
        // Keep the displayed statuses and retry on the next check.
      } finally {
        checking = false;
      }
    }

    const timer = window.setInterval(syncReadingStatuses, 30_000);
    window.addEventListener("focus", syncReadingStatuses);
    document.addEventListener("visibilitychange", syncReadingStatuses);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", syncReadingStatuses);
      document.removeEventListener("visibilitychange", syncReadingStatuses);
    };
  }, [day, loadedDay, loading, failure, savingStatusId]);

  async function saveReadingStatus(story, status) {
    if (statusSave.current.inFlight || status === story.status) return;

    statusSave.current.inFlight = true;
    statusSave.current.revision++;
    setSavingStatusId(story.id);
    setStatusError(null);
    try {
      const saved = await api(`/news/${day}/${story.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setResult((current) =>
        mergeReadingStatuses(current, day, new Map([[saved.id, saved.status]])),
      );
    } catch (error) {
      setStatusError({ day, message: error.message });
    } finally {
      statusSave.current.inFlight = false;
      setSavingStatusId(null);
    }
  }

  function stopBrief() {
    speech.stop();
    setPlayRequest(null);
    setBriefFinished(false);
  }

  function changeDay(nextDay) {
    if (nextDay === day) return;
    stopBrief();
    setCheckpoint(readBriefProgress(nextDay));
    setDay(nextDay);
  }

  function saveCheckpoint(progress) {
    writeBriefProgress(day, progress);
    setCheckpoint(progress);
  }

  function saveWord(storyId, wordIndex) {
    if (
      playRequest?.storyId !== storyId ||
      selected?.id !== storyId ||
      lastSavedWord.current === wordIndex
    )
      return;
    lastSavedWord.current = wordIndex;
    saveCheckpoint(makeBriefProgress(selected, wordIndex));
  }

  function queueStory(story, wordIndex = 0) {
    speech.stop();
    setBriefFinished(false);
    setSelectedId(story.id);
    setPlayRequest({ storyId: story.id, wordIndex });
    lastSavedWord.current = wordIndex;
    saveCheckpoint(makeBriefProgress(story, wordIndex));
  }

  function moveBrief(offset) {
    const story = adjacentBriefStory(queue, playRequest?.storyId, offset);
    if (story) queueStory(story);
  }

  function advanceBrief(storyId) {
    if (!playRequest || playRequest.storyId !== storyId) return;
    const next = adjacentBriefStory(queue, storyId, 1);
    if (next) queueStory(next);
    else {
      setPlayRequest(null);
      setBriefFinished(true);
      saveCheckpoint(null);
    }
  }

  function refresh() {
    stopBrief();
    setStatusError(null);
    setResult(null);
    setReload((value) => value + 1);
  }

  function selectStory(id) {
    stopBrief();
    setSelectedId(id);
    scrollToReader();
  }

  function scrollToReader() {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    readerRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  const updated = selected?.summarized_at
    ? new Date(selected.summarized_at)
    : null;
  const updatedLabel =
    updated && !Number.isNaN(updated.getTime())
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Berlin",
        }).format(updated)
      : null;

  return (
    <section className="news-view">
      <div className="news-heading">
        <div>
          <h1>AI Brief</h1>
          <p>Your daily news and saved summaries, from Notion.</p>
        </div>
        <button
          className="new-button"
          onClick={refresh}
          disabled={loading || Boolean(savingStatusId)}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="news-date-bar">
        <div className="news-date-controls">
          <button
            className="icon-button"
            disabled={day === "0001-01-01"}
            onClick={() => changeDay(shiftDay(day, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft size={18} />
          </button>
          <label htmlFor="brief-date" className="sr-only">
            Brief date
          </label>
          <input
            id="brief-date"
            type="date"
            value={day}
            min="0001-01-01"
            max="9999-12-31"
            onChange={(event) => {
              if (event.target.value) changeDay(event.target.value);
            }}
          />
          <button
            className="icon-button"
            disabled={day === "9999-12-31"}
            onClick={() => changeDay(shiftDay(day, 1))}
            aria-label="Next day"
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="news-today"
            onClick={() => changeDay(berlinToday())}
          >
            Today
          </button>
        </div>
        <span aria-live="polite">
          {loading
            ? "Loading brief…"
            : failure
              ? "Couldn’t load brief"
              : `${stories.length} stories · ${stories.filter(summaryReady).length} summaries ready`}
        </span>
      </div>

      {failure && (
        <div className="error-banner" role="alert">
          <span>{failure}</span>
          <button className="new-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {loading && (
        <div className="news-empty card" role="status">
          Reading your Notion brief…
        </div>
      )}
      {!loading && !failure && !stories.length && (
        <div className="news-empty card">
          <Newspaper size={28} />
          <h2>No news for this date</h2>
          <p>
            Choose another day, or refresh after the daily brief has been
            published.
          </p>
        </div>
      )}

      {!loading && !failure && stories.length > 0 && (
        <>
          {statusError?.day === day && (
            <p className="error-banner" role="alert">
              {statusError.message}
            </p>
          )}
          <BriefQueueStart
            label={
              day === berlinToday() ? "Play Today’s Brief" : "Play this brief"
            }
            disabled={
              !queue.length || !speech.supported || !speech.voices.length
            }
            onStart={() => {
              queueStory(queue[0]);
              scrollToReader();
            }}
            onResume={
              resume
                ? () => {
                    queueStory(resume.story, resume.wordIndex);
                    scrollToReader();
                  }
                : undefined
            }
          />
          <div
            className="news-table-wrap card"
            role="region"
            aria-label="Daily news stories"
            tabIndex={0}
          >
            <table className="news-table">
              <caption className="sr-only">
                News for {day}. Select a title to read its saved summary.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Title</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Summary status</th>
                  <th scope="col">Source</th>
                  <th scope="col">Reading status</th>
                  <th scope="col">Link</th>
                </tr>
              </thead>
              <tbody>
                {stories.map((story) => {
                  const url = articleUrl(story.url);
                  return (
                    <tr
                      key={story.id}
                      className={selected?.id === story.id ? "selected" : ""}
                    >
                      <td className="news-rank">
                        {story.rank === 999 ? "—" : story.rank}
                      </td>
                      <td>
                        <button
                          className="news-title"
                          aria-pressed={selected?.id === story.id}
                          onClick={() => selectStory(story.id)}
                        >
                          {story.title}
                        </button>
                      </td>
                      <td>
                        <span className="news-preview">
                          {story.summary || "No saved summary yet."}
                        </span>
                      </td>
                      <td>
                        <SummaryStatus value={story.summary_status} />
                      </td>
                      <td>{story.source || "—"}</td>
                      <td>
                        <select
                          className="news-reading-status"
                          aria-label={`Reading status for ${story.title}`}
                          value={story.status || ""}
                          disabled={Boolean(savingStatusId)}
                          onChange={(event) =>
                            saveReadingStatus(story, event.target.value)
                          }
                        >
                          {!READING_STATUS_OPTIONS.some(
                            ({ value }) => value === story.status,
                          ) && (
                            <option value={story.status || ""} disabled>
                              {story.status || "Choose status"}
                            </option>
                          )}
                          {READING_STATUS_OPTIONS.map(({ value, label }) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {savingStatusId === story.id && (
                          <span role="status"> Saving…</span>
                        )}
                      </td>
                      <td>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open original: ${story.title}`}
                          >
                            <ArrowUpRight size={16} />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selected && (
            <section
              ref={readerRef}
              className="news-reader card"
              aria-label="Selected news summary"
            >
              <div className="news-reader-heading">
                <div>
                  <span className="news-reader-label">
                    SAVED SUMMARY · {selected.source || "Notion"}
                  </span>
                  <h2>{selected.title}</h2>
                </div>
                <SummaryStatus value={selected.summary_status} />
              </div>
              {updatedLabel && (
                <p className="news-updated">
                  Summarized {updatedLabel} · Berlin time
                </p>
              )}
              {playable ? (
                <>
                  <HighlightedScript
                    key={selected.id}
                    text={text}
                    activeRange={speech.activeRange}
                  />
                  <div className="news-reader-player">
                    {queueIndex >= 0 && (
                      <BriefQueueControls
                        index={queueIndex}
                        total={queue.length}
                        onPrevious={() => moveBrief(-1)}
                        onNext={() => moveBrief(1)}
                        onStop={stopBrief}
                      />
                    )}
                    {briefFinished && <p role="status">Brief complete.</p>}
                    <p>
                      {wordCount(text).toLocaleString()} words · Saved in
                      Notion. No new generation.
                    </p>
                    <Player
                      key={selected.id}
                      text={text}
                      speech={{ ...speech, stop: stopBrief }}
                    />
                  </div>
                </>
              ) : (
                <div className="news-summary-unavailable">
                  <p>
                    {selected.summary_status === "Failed"
                      ? "Summary generation failed for this story. Retry it in AI-Daily-Brief, then refresh here."
                      : selected.summary_status === "Unavailable"
                        ? "The article content could not be summarized. You can still open the original source."
                        : selected.summary_status === "Ready"
                          ? "This story is marked Ready, but its saved summary is empty. Check the record in Notion."
                          : "The summary isn’t ready yet. Refresh after AI-Daily-Brief finishes processing."}
                  </p>
                  {selected.summary?.trim() && (
                    <>
                      <h3>Saved text · not marked ready</h3>
                      <p className="news-incomplete-summary">
                        {selected.summary}
                      </p>
                    </>
                  )}
                </div>
              )}
            </section>
          )}
          <p className="news-footnote">
            Select a story title to read and listen. News and summaries are read
            from Notion. Use the Reading status dropdown to update a story in
            Notion.
          </p>
        </>
      )}
    </section>
  );
}
