import React, { useState } from "react";
import {
  Pause,
  Play,
  Settings2,
  Square,
  RotateCcw,
  RotateCw,
} from "lucide-react";

export default function Player({ text, speech }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrubWord, setScrubWord] = useState(null);
  const hasVoice = speech.voices.length > 0 && speech.supported;
  const loading = speech.status === "loading";
  const total = speech.totalWords;
  const shownWord = scrubWord ?? speech.wordIndex;
  const canSeek = hasVoice && total > 0;
  function commitSeek(value) {
    speech.seek(Number(value));
    setScrubWord(null);
  }
  return (
    <div className="audio-player">
      <div className="player-main">
        <button
          className={`listen-button ${speech.status === "playing" ? "is-playing" : ""}`}
          onClick={speech.toggle}
          disabled={!hasVoice || !text.trim() || loading}
        >
          {speech.status === "playing" ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          {loading
            ? "Preparing…"
            : speech.status === "playing"
              ? "Pause"
              : speech.status === "paused"
                ? "Resume"
                : "Listen"}
        </button>
        <div className="playback-track">
          <input
            className="audio-seek"
            type="range"
            min="0"
            max={Math.max(0, total - 1)}
            step="1"
            value={Math.min(Math.max(0, total - 1), shownWord)}
            disabled={!canSeek}
            aria-label="Seek to word"
            aria-valuetext={`Word ${total ? shownWord + 1 : 0} of ${total}`}
            onChange={(event) => setScrubWord(Number(event.target.value))}
            onPointerUp={(event) => commitSeek(event.currentTarget.value)}
            onPointerCancel={() => setScrubWord(null)}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(event.key)
              )
                commitSeek(event.currentTarget.value);
            }}
            onBlur={(event) => {
              if (scrubWord !== null) commitSeek(event.currentTarget.value);
            }}
          />
          <div className="track-times">
            <span>Word {total ? shownWord + 1 : 0}</span>
            <span>{total} words</span>
          </div>
        </div>
        <button
          className="icon-button"
          disabled={!canSeek}
          onClick={() => speech.seek(speech.wordIndex - 7)}
          aria-label="Back seven words"
          title="Back 7 words"
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="icon-button"
          disabled={!canSeek}
          onClick={() => speech.seek(speech.wordIndex + 7)}
          aria-label="Forward seven words"
          title="Forward 7 words"
        >
          <RotateCw size={16} />
        </button>
        <button
          className="icon-button"
          disabled={speech.status === "idle" && speech.wordIndex === 0}
          onClick={speech.stop}
          aria-label="Stop playback"
          title="Stop"
        >
          <Square size={14} />
        </button>
        <button
          className={`speed-button ${settingsOpen ? "selected" : ""}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-expanded={settingsOpen}
          aria-label="Voice and speed settings"
        >
          {speech.rate.toFixed(1)}× <Settings2 size={14} />
        </button>
      </div>
      <div
        className="voice-choices"
        role="group"
        aria-label="Voice selection and previews"
      >
        {["Rishi", "Samantha"].map((label) => {
          const voice = speech.voices.find((item) => item.label === label);
          const selected = voice && speech.voiceName === voice.name;
          const previewing = voice && speech.previewingVoice === voice.name;
          return (
            <div
              className={`voice-choice ${selected ? "selected" : ""}`}
              key={label}
            >
              <button
                className="voice-choice-name"
                disabled={!voice}
                aria-pressed={Boolean(selected)}
                onClick={() => speech.setVoiceName(voice.name)}
                aria-label={`Use ${label}`}
              >
                {label}
                <span>
                  {!voice ? "Unavailable" : selected ? "Selected" : "Choose"}
                </span>
              </button>
              <button
                className="voice-preview"
                disabled={!voice}
                onClick={() => speech.previewVoice(voice.name)}
                aria-label={
                  previewing
                    ? `Stop ${label} preview`
                    : `Preview ${label} voice`
                }
              >
                {previewing ? <Square size={11} /> : <Play size={11} />}{" "}
                {previewing ? "Stop" : "Preview"}
              </button>
            </div>
          );
        })}
      </div>
      {speech.previewingVoice && (
        <p className="voice-notice" role="status">
          Preparing or playing a voice sample. Your reading position is kept;
          press Listen or Resume to continue.
        </p>
      )}
      {settingsOpen && (
        <div className="voice-settings">
          <label className="speed-setting">
            Speed <output>{speech.rate.toFixed(1)}×</output>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speech.rate}
              onChange={(event) => speech.setRate(Number(event.target.value))}
            />
          </label>
          <p>
            Speed changes apply immediately. Switching voice keeps your word
            position. Audio is rendered by macOS, not Chrome.
          </p>
        </div>
      )}
      {!hasVoice && (
        <p className="voice-notice">
          {speech.supported
            ? "The native Mac voices are not available yet. Keep Narrator’s Python server running on this Mac."
            : "This browser doesn’t support speech playback."}
        </p>
      )}
      {speech.timingMode === "unavailable" && (
        <p className="voice-notice" role="status">
          This voice isn’t reporting word positions. Try another built-in voice
          for synchronized highlighting. No estimated highlight is being shown.
        </p>
      )}
      {speech.error && (
        <p className="voice-notice error-text" role="alert">
          {speech.error}
        </p>
      )}
      <p className="audio-playback-note">
        Free Mac speech, played as audio. Drag to seek to a word; highlighting
        follows native word timestamps.
      </p>
    </div>
  );
}
